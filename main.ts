import {
	Editor,
	MarkdownView,
	Plugin,
	renderMath,
	finishRenderMath,
	loadMathJax,
} from "obsidian";
import { Logger } from "./src/logger";
import {
	ViewPlugin,
	PluginValue,
	PluginSpec,
	Decoration,
	EditorView,
	WidgetType,
	DecorationSet,
	ViewUpdate,
} from "@codemirror/view";
import { SelectionRange, Range, EditorState } from "@codemirror/state";

export default class Underliner extends Plugin {
	private logger: Logger = new Logger("Underliner");

	async onload() {
		console.clear();
		await loadMathJax();
		//this.logger.log("loading...");

		// ctrl+u underline command
		this.addCommand({
			id: "underline",
			name: "Underline text",
			hotkeys: [{ modifiers: ["Mod"], key: "u" }],
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selections = editor.listSelections();
				for (const s of selections) {
					const from = s.anchor < s.head ? s.anchor : s.head;
					const to = s.anchor < s.head ? s.head : s.anchor;
					const range = editor.getRange(from, to);
					const underlined = "-" + range + "-";
					editor.replaceRange(underlined, from, to);
					// if empty range, move cursor to middle
					if (range.length === 0) {
						const cursor = editor.getCursor();
						cursor.ch += "-".length;
						editor.setCursor(cursor);
					}
				}
			},
		});

		// change reading view
		this.registerMarkdownPostProcessor((element, context) => {
			this.expandDash(element);
		});

		this.registerEditorExtension(
			ViewPlugin.define(() => {
				return new DashExpansionPlugin(this.logger);
			}, DashExpansionPlugin.spec),
		);
	}

	expandDash = (element: HTMLElement) => {
		if (element) {
			element.innerHTML = element.innerHTML.replaceAll("--", "&mdash;");
		}
	};

	onunload() {
		//this.logger.log("unloading...")
	}
}

class LatexWidget extends WidgetType {
	private content: string;

	constructor(content: string) {
		super();
		this.content = content;
	}

	override toDOM(view: EditorView): HTMLElement {
		const el = renderMath(this.content, false);
		finishRenderMath();
		return el;
	}
}

interface PatternMatcher {
	getDecorator(
		state: EditorState,
		doc: string,
		index: number,
	): Range<Decoration> | undefined;
}

class HTMLWidget extends WidgetType {
	content: string;
	elem: string;

	constructor(content: string, elem: string) {
		super();
		this.elem = elem;
		this.content = content;
	}

	override toDOM(view: EditorView): HTMLElement {
		const el = document.createElement(this.elem);
		el.innerHTML = this.content;
		return el;
	}
}

class UnderlinePattern implements PatternMatcher {
	getDecorator(
		state: EditorState,
		doc: string,
		index: number,
	): Range<Decoration> | undefined {
		// look for this pattern: -blah-
		if (doc[index] !== "-") return undefined;
		if (index > 0 && !isWhitespace(doc[index - 1])) return undefined;
		const left = index;
		let right = index + 1;
		if (right >= doc.length || !isLetter(doc[right])) return undefined;
		while (right < doc.length && doc[right] != "\n" && doc[right] != "-")
			right++;
		if (doc[right] !== "-") return undefined;
		if (!isLetter(doc[right - 1])) return undefined;
		if (right + 1 < doc.length && !isWhitespace(doc[right + 1]))
			return undefined;
		if (!outsideSelections(state.selection.ranges, left, right + 1))
			return undefined;
		const contents = doc.substring(left + 1, right);
		const widget = new HTMLWidget(contents, "u");
		return Decoration.replace({ widget: widget }).range(left, right + 1);
	}
}

class Formatter implements PatternMatcher {
	pattern: RegExp;
	attributes: { [key: string]: string };
	element: string | undefined;

	constructor(
		pattern: RegExp | string,
		attributes: { [key: string]: string },
		element: string | undefined = undefined,
	) {
		switch (pattern.constructor) {
			case RegExp:
				this.pattern = pattern as RegExp;
				break;
			case String:
				this.pattern = new RegExp(pattern);
				break;
		}
		if (!this.pattern.source.startsWith("^")) {
			this.pattern = new RegExp("^" + this.pattern.source);
		}
		this.attributes = attributes;
		this.element = element;
	}

	getDecorator(
		state: EditorState,
		doc: string,
		index: number,
	): Range<Decoration> | undefined {
		const results = this.pattern.exec(doc.substring(index));
		if (results === null) return undefined;
		const match = results[0];
		if (this.element == undefined)
			return Decoration.mark({ attributes: this.attributes }).range(
				index,
				index + match.length,
			);
		// wrap this in html element
		const widget = new HTMLWidget(match, this.element);
		return Decoration.replace({ widget: widget }).range(
			index,
			index + match.length,
		);
	}
}

function outsideSelections(
	sr: readonly SelectionRange[],
	left: number,
	right: number,
): boolean {
	for (const r of sr) {
		if (r.from >= left && r.to <= right) return false;
		if (r.to >= left && r.to <= right) return false;
	}
	return true;
}

class ReplacementPattern implements PatternMatcher {
	from: string;
	to: string;
	widget: WidgetType;

	constructor(from: string, to: string) {
		this.from = from;
		this.to = to;
		this.widget = new HTMLWidget(to, "span");
	}

	getDecorator(
		state: EditorState,
		doc: string,
		index: number,
	): Range<Decoration> | undefined {
		// does index start with the pattern
		if (!doc.substring(index).startsWith(this.from)) return undefined;
		// check this part isn't selected
		if (
			!outsideSelections(
				state.selection.ranges,
				index,
				index + this.from.length,
			)
		)
			return undefined;
		return Decoration.replace({ widget: this.widget }).range(
			index,
			index + this.from.length,
		);
	}

	matches(str: string, index: number): boolean {
		return str.substring(index).startsWith(this.from);
	}

	element(): WidgetType {
		return new HTMLWidget(this.to, "span");
	}
}

class MathVariables implements PatternMatcher {
	getDecorator(
		state: EditorState,
		doc: string,
		index: number,
	): Range<Decoration> | undefined {
		if (!isLetter(doc[index])) return undefined;
		// make sure it's not valid english
		if ("AI".contains(doc[index].toUpperCase())) return undefined; // only allow a single letter surrounded by any number of non-letter characters, surrounded by whitespace
		let left = index - 1;
		while (left >= 0 && !isLetter(doc[left]) && !isWhitespace(doc[left]))
			left--;
		if (left < 0) left = 0;
		else if (!isWhitespace(doc[left])) return undefined;
		else left++; // don't include the whitespace in latex

		let right = index + 1;
		while (
			right < doc.length &&
			!isLetter(doc[right]) &&
			!isWhitespace(doc[right])
		)
			right++;
		if (right >= doc.length) right = right = doc.length - 1;
		else if (!isWhitespace(doc[right])) return undefined;
		else right--; // don't include the whitespace in latex

		// make sure not selected
		if (!outsideSelections(state.selection.ranges, left, right + 1))
			return undefined;
		// doc[i] is a variable isLetter
		const widget = new LatexWidget(doc.substring(left, right + 1));
		return Decoration.replace({ widget: widget }).range(left, right + 1);
	}
}

class LatexEscapes implements PatternMatcher {
	getDecorator(
		state: EditorState,
		doc: string,
		index: number,
	): Range<Decoration> | undefined {
		if (doc[index] !== "\\") return undefined;
		// find the end of the control sequence
		let end = index + 1;
		while (end < doc.length && isLetter(doc[end])) end++;
		if (index + 1 >= end) return undefined;
		if (!outsideSelections(state.selection.ranges, index, end))
			return undefined;
		const escapeSequence = doc.substring(index, end);
		const widget = new LatexWidget(escapeSequence);
		return Decoration.replace({ widget: widget }).range(
			index,
			index + escapeSequence.length,
		);
	}
}

function isLetter(str: string): boolean {
	if (str.length !== 1) return false;
	const code = str.toUpperCase().charCodeAt(0);
	const A = "A".charCodeAt(0);
	const Z = "Z".charCodeAt(0);
	return code >= A && code <= Z;
}

function isWhitespace(str: string): boolean {
	return str.trim() === "";
}

class DashExpansionPlugin implements PluginValue {
	static replacements: PatternMatcher[] = [
		new ReplacementPattern("--", "&mdash;"),
		new MathVariables(),
		new LatexEscapes(),
		new UnderlinePattern(),
		new Formatter(/TODO/, { style: "color: red;" }),
		new Formatter(/&\w+;/, {}, "span"),
	];

	logger: Logger;
	decorations: DecorationSet = Decoration.none;

	constructor(logger: Logger) {
		this.logger = logger;
	}

	update = (update: ViewUpdate) => {
		const doc = update.state.doc.toString();
		const ds: Range<Decoration>[] = [];
		for (const r of update.view.visibleRanges) {
			for (let i = r.from; i < r.to; i++) {
				for (const r of DashExpansionPlugin.replacements) {
					const d = r.getDecorator(update.state, doc, i);
					if (d) {
						ds.push(d);
						// skip searching this range -- important
						i = d.to;
						break;
					}
				}
			}
		}
		this.decorations = Decoration.set(ds);
	};

	public static spec: PluginSpec<DashExpansionPlugin> = {
		decorations: (plugin) => plugin.decorations,
	};
}
