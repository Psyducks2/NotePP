import type { EditorView } from "@codemirror/view";

let activeView: EditorView | null = null;

export function registerEditorView(view: EditorView | null): void {
  activeView = view;
}

export function insertAtCursor(text: string): void {
  if (!activeView || !text) return;
  const sel = activeView.state.selection.main;
  activeView.dispatch({
    changes: { from: sel.from, to: sel.to, insert: text },
    selection: { anchor: sel.from + text.length },
    scrollIntoView: true,
  });
  activeView.focus();
}
