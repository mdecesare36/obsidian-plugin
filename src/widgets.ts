export { LatexWidget, HTMLWidget };

import { renderMath, finishRenderMath } from "obsidian";
import { EditorView, WidgetType } from "@codemirror/view";

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

type Attributes = string[][];

class HTMLWidget extends WidgetType {
	content: string;
	elem: string;
	attrs: Attributes;

	constructor(content: string, elem: string, attrs: Attributes = []) {
		super();
		this.elem = elem;
		this.content = content;
		this.attrs = attrs;
	}

	override toDOM(view: EditorView): HTMLElement {
		const el = document.createElement(this.elem);
		el.innerHTML = this.content;
		for (const a of this.attrs) {
			el.setAttribute(a[0], a[1]);
		}
		return el;
	}
}
