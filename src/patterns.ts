export type { PatternMatcher };
export {
	UnderlinePattern,
	Formatter,
	ReplacementPattern,
	MathVariables,
	LatexEscapes,
};

import { Decoration, WidgetType } from "@codemirror/view";
import { SelectionRange, Range, EditorState } from "@codemirror/state";
import { HTMLWidget, LatexWidget } from "./widgets";

interface PatternMatcher {
	getDecorator(
		state: EditorState,
		doc: string,
		index: number,
	): Range<Decoration> | undefined;
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
		if (left + 1 >= right) return undefined;
		if (isWhitespace(doc[right - 1])) return undefined;
		if (
			right + 1 < doc.length &&
			!isWhitespace(doc[right + 1]) &&
			!isPunctuation(doc[right + 1])
		)
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

// free functions

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

function isPunctuation(str: string): boolean {
	return str.length === 1 && '.,()-"!?'.contains(str);
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
