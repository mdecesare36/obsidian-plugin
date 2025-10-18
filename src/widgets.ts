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
