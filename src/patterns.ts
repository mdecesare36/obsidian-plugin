export type { PatternMatcher };
export {
	GeneralPatternMatcher,
	Formatter,
	ReplacementPattern,
	ColourPattern,
	Texify,
};

import { Decoration, WidgetType } from "@codemirror/view";
import { SelectionRange, Range, EditorState } from "@codemirror/state";
import { HTMLWidget, LatexWidget } from "./widgets";
import { EditorSuggestTriggerInfo } from "obsidian";
import { setMaxIdleHTTPParsers } from "http";

interface PatternMatcher {
	getDecorators(
		state: EditorState,
		doc: string,
		range: { from: number; to: number },
	): Range<Decoration>[];

	modifyHtmlElem(elem: HTMLElement): void;
}

type EdgeInserter = {
	txt: string;
	rmv: number;
};

class GeneralPatternMatcher implements PatternMatcher {
	match: RegExp;
	attributes: { [key: string]: string } | undefined;
	elem: string;
	left: EdgeInserter;
	right: EdgeInserter;
	keepMatch: boolean;

	constructor(
		match: RegExp,
		attributes: { [key: string]: string } | undefined,
		elem: string,
		left: EdgeInserter | undefined,
		right: EdgeInserter | undefined,
		keepMatch: boolean,
	) {
		this.match = match;
		this.attributes = attributes;
		this.left = left || { txt: "", rmv: 0 };
		this.right = right || { txt: "", rmv: 0 };
		this.keepMatch = keepMatch;
		this.elem = elem;
	}

	getReplacement(match: string): string {
		let middleText = "";
		if (this.keepMatch) {
			middleText = match;
			middleText = middleText.substring(
				this.left.rmv,
				middleText.length - this.right.rmv,
			);
		}

		const replacement_text = this.left.txt + middleText + this.right.txt;
		return replacement_text;
	}

	getWidget(replacement_text: string): HTMLWidget {
		const element = this.elem || "span";
		const attrs = this.attributes
			? Object.entries(this.attributes)
			: undefined;
		const widget = attrs
			? new HTMLWidget(replacement_text, element, attrs)
			: new HTMLWidget(replacement_text, element);
		return widget;
	}

	getDecorators(
		state: EditorState,
		doc: string,
		range: { from: number; to: number },
	): Range<Decoration>[] {
		// Ensure we use the provided state to avoid unused-variable diagnostics
		const selections = state.selection.ranges;

		// Create a global regexp based on the pattern's source to ensure we use the 'g' flag
		const globalMatch = new RegExp(this.match.source, "g");
		const searchString = doc.substring(range.from, range.to);
		const results: Range<Decoration>[] = [];

		let result: RegExpExecArray | null = globalMatch.exec(searchString);
		while (result !== null) {
			const left = result.index + range.from;
			const right = left + result[0].length;

			// Skip matches that overlap current selections
			if (!outsideSelections(selections, left, right)) {
				result = globalMatch.exec(searchString);
				continue;
			}

			const replacement_text = this.getReplacement(result[0]);
			const widget = this.getWidget(replacement_text);

			results.push(Decoration.replace({ widget }).range(left, right));

			result = globalMatch.exec(searchString);
		}

		return results;
	}

	modifyHtmlElem(elem: HTMLElement): void {
		const global_matcher = new RegExp(this.match, "g");
		elem.innerHTML = elem.innerHTML.replaceAll(
			global_matcher,
			(match: string) => {
				const replacement = this.getReplacement(match);
				const widget = this.getWidget(replacement);
				const text = widget.toDOM(null).outerHTML;
				return text;
			},
		);
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
		this.attributes = attributes;
		this.element = element;
	}

	getDecorators(
		state: EditorState,
		doc: string,
		range: { from: number; to: number },
	): Range<Decoration>[] {
		return [];
		const pattern_start = new RegExp("^" + this.pattern.source);
		const results = pattern_start.exec(doc.substring(index));
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

	modifyHtmlElem(elem: HTMLElement): void {
		let target_elem = this.element;
		if (!target_elem) target_elem = "span";
		const replacement = document.createElement(target_elem);
		let t: keyof typeof this.attributes;
		for (t in this.attributes) {
			replacement.setAttr(t, this.attributes[t]);
		}

		const global_pattern = new RegExp(this.pattern.source, "g");
		elem.innerHTML = elem.innerHTML.replaceAll(
			global_pattern,
			(match: string) => {
				replacement.innerText = match;
				return replacement.outerHTML;
			},
		);
	}
}

class ReplacementPattern implements PatternMatcher {
	from: RegExp;
	to: string;
	widget: WidgetType;

	constructor(from: RegExp, to: string) {
		this.from = from;
		this.to = to;
		this.widget = new HTMLWidget(to, "span");
	}

	getDecorators(
		state: EditorState,
		doc: string,
		range: { from: number; to: number },
	): Range<Decoration>[] {
		const searchString = doc.substring(range.from, range.to);
		const regex = new RegExp(this.from, "g");

		let isOver = false;
		const results = [];
		while (!isOver) {
			const result = regex.exec(searchString);
			if (result === null) {
				isOver = true;
				break;
			}

			const left = result.index + range.from;
			const right = left + result[0].length;

			if (outsideSelections(state.selection.ranges, left, right)) {
				results.push(
					Decoration.replace({ widget: this.widget }).range(
						left,
						right,
					),
				);
			}
		}
		return results;
	}

	element(): WidgetType {
		return new HTMLWidget(this.to, "span");
	}

	modifyHtmlElem(elem: HTMLElement): void {
		const global_pattern = new RegExp(this.from.source, "g");
		const replacement = this.widget.toDOM(null);
		elem.innerHTML = elem.innerHTML.replaceAll(
			global_pattern,
			replacement.outerText,
		);
	}
}

class Texify implements PatternMatcher {
	match: RegExp;

	constructor(match: RegExp) {
		this.match = match;
	}

	getDecorators(
		state: EditorState,
		doc: string,
		range: { from: number; to: number },
	): Range<Decoration>[] {
		const searchString = doc.substring(range.from, range.to);
		const regexg = new RegExp(this.match, "g");

		const decs = [];
		let result = regexg.exec(searchString);
		while (result !== null) {
			const left = result.index + range.from;
			const right = left + result[0].length;
			if (outsideSelections(state.selection.ranges, left, right)) {
				// texify the match
				const widget = new LatexWidget(result[0]);
				decs.push(
					Decoration.replace({ widget: widget }).range(left, right),
				);
			}

			result = regexg.exec(searchString);
		}
		return decs;
	}

	modifyHtmlElem(elem: HTMLElement): void {
		const global_pattern = new RegExp(this.match.source, "g");
		elem.innerHTML = elem.innerHTML.replaceAll(
			global_pattern,
			(match: string) => {
				const widget = new LatexWidget(match);
				return widget.toDOM(null).outerHTML;
			},
		);
	}
}

// free functions

function isLetter(str: string): boolean {
	if (str.length !== 1) return false;
	const code = str.toUpperCase().charCodeAt(0);
	const A = "A".charCodeAt(0);
	const Z = "Z".charCodeAt(0);
	return code >= A && code <= Z;
}

class ColourPattern implements PatternMatcher {
	readonly COLOURS: string[] = ["red", "green", "blue"];

	getDecorators(
		state: EditorState,
		doc: string,
		range: { from: number; to: number },
	): Range<Decoration>[] {
		return [];
		for (const colour of this.COLOURS) {
			if (doc.substring(index).startsWith(colour)) {
				let right = index + colour.length;
				if (right >= doc.length || doc[right] != "(") return undefined;
				const left = right;
				// find the content between parentheses
				while (
					++right < doc.length &&
					doc[right] != ")" &&
					doc[right] != "\n"
				);
				if (doc[right] != ")") return undefined;
				if (left + 1 >= right - 1) return undefined;
				if (
					!outsideSelections(state.selection.ranges, index, right + 1)
				)
					return undefined;
				const content = doc.substring(left + 1, right);
				const widget = new HTMLWidget(content, "span", [
					["style", `color:${colour}`],
				]);
				return Decoration.replace({ widget: widget }).range(
					index,
					right + 1,
				);
			}
		}
		return undefined;
	}

	modifyHtmlElem(elem: HTMLElement): void {
		return;
	}
}

function isWhitespace(str: string): boolean {
	return str.trim() === "";
}

function isPunctuation(str: string): boolean {
	return str.length === 1 && ".,()-\"!?:`'".contains(str);
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
