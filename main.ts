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
	ReplacementPattern,
	Texify,
	GeneralPatternMatcher,
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
			for (const pattern of DashExpansionPlugin.replacements) {
				pattern.modifyHtmlElem(element);
			}
		});

		this.registerEditorExtension(
			ViewPlugin.define(() => {
				return new DashExpansionPlugin(this.logger);
			}, DashExpansionPlugin.spec),
		);
	}

	onunload() {
		//this.logger.log("unloading...")
	}
}

class DashExpansionPlugin implements PluginValue {
	static replacements: PatternMatcher[] = [
		new GeneralPatternMatcher(
			/---/,
			undefined,
			"",
			{ txt: "&mdash;", rmv: 1 },
			undefined,
			false,
		),
		new GeneralPatternMatcher(
			/--/,
			undefined,
			"",
			{ txt: "&ndash;", rmv: 1 },
			undefined,
			false,
		),
		new Texify(/(?<= |^)([b-zB-HJ-Z])(?=[ ,.'\n])/), // variables
		new Texify(/\\[a-z]+?(?=[ \n\t])/), // escapes
		new Texify(/\\.+?{.+?}/),
		new GeneralPatternMatcher(
			/-[^\n]+?-/,
			undefined,
			"u",
			{ txt: "", rmv: 1 },
			{ txt: "", rmv: 1 },
			true,
		),
		new GeneralPatternMatcher(
			/TODO/,
			{ style: "color: red;" },
			"",
			undefined,
			undefined,
			true,
		),
		new GeneralPatternMatcher(
			/&\w+;/,
			undefined,
			"",
			undefined,
			undefined,
			true,
		),
		new GeneralPatternMatcher(
			/red\(.+?\)/,
			{ style: "color: red;" },
			"",
			{ txt: "", rmv: 4 },
			{ txt: "", rmv: 1 },
			true,
		),
		new GeneralPatternMatcher(
			/green\(.+?\)/,
			{ style: "color: green;" },
			"",
			{ txt: "", rmv: 6 },
			{ txt: "", rmv: 1 },
			true,
		),
		new GeneralPatternMatcher(
			/blue\(.+?\)/,
			{ style: "color: blue;" },
			"",
			{ txt: "", rmv: 5 },
			{ txt: "", rmv: 1 },
			true,
		),
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
			for (const rep of DashExpansionPlugin.replacements) {
				const decorators: Range<Decoration>[] = rep.getDecorators(
					update.state,
					doc,
					r,
				);
				ds.push(...decorators);
			}
		}
		this.decorations = Decoration.set(ds, true);
	};

	public static spec: PluginSpec<DashExpansionPlugin> = {
		decorations: (plugin) => plugin.decorations,
	};
}
