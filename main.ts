import { Editor, MarkdownView, Plugin, loadMathJax } from "obsidian";
import { Logger } from "./src/logger";
import {
	ViewPlugin,
	PluginValue,
	PluginSpec,
	Decoration,
	DecorationSet,
	ViewUpdate,
} from "@codemirror/view";
import { Range } from "@codemirror/state";
import {
	PatternMatcher,
	UnderlinePattern,
	Formatter,
	ReplacementPattern,
	MathVariables,
	LatexEscapes,
	ColourPattern,
} from "./src/patterns";

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

class DashExpansionPlugin implements PluginValue {
	static replacements: PatternMatcher[] = [
		new ReplacementPattern("--", "&mdash;"),
		new MathVariables(),
		new LatexEscapes(),
		new UnderlinePattern(),
		new Formatter(/TODO/, { style: "color: red;" }),
		new Formatter(/&\w+;/, {}, "span"),
		new ColourPattern(),
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
