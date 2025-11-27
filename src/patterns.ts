export type { PatternMatcher };
export { GeneralPatternMatcher, Texify };

import { Decoration } from "@codemirror/view";
import { SelectionRange, Range, EditorState } from "@codemirror/state";
import { HTMLWidget, LatexWidget } from "./widgets";

interface PatternMatcher {
	getDecorators(
		state: EditorState,
		doc: string,
		range: { from: number; to: number },
	): Range<Decoration>[];

	transform(txt: string): string;
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

	transform(txt: string): string {
		const global_matcher = new RegExp(this.match, "g");
		return txt.replaceAll(global_matcher, (match: string) => {
			const replacement = this.getReplacement(match);
			const widget = this.getWidget(replacement);
			const text = widget.toDOM(null).outerHTML;
			return text;
		});
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

	transform(txt: string): string {
		const global_pattern = new RegExp(this.match.source, "g");
		return txt.replaceAll(global_pattern, (match: string) => {
			const widget = new LatexWidget(match);
			return widget.toDOM(null).outerHTML;
		});
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
