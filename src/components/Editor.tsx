import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { useSettingsStore } from "../store/settingsStore";
import { useTabsStore } from "../store/tabsStore";
import { scheduleAutosave } from "../lib/autosave";
import { registerEditorView } from "../lib/editorBridge";

type EditorProps = {
  findQuery: string;
  findNonce: number;
  replaceQuery: string;
  replaceNonce: number;
  replaceAllNonce: number;
};

function findMatch(
  state: EditorState,
  query: string,
  from: number,
): { from: number; to: number } | null {
  const lower = state.doc.toString().toLowerCase();
  const q = query.toLowerCase();
  let idx = lower.indexOf(q, from);
  if (idx < 0) idx = lower.indexOf(q, 0);
  if (idx < 0) return null;
  return { from: idx, to: idx + query.length };
}

export function Editor({
  findQuery,
  findNonce,
  replaceQuery,
  replaceNonce,
  replaceAllNonce,
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const activeId = useTabsStore((s) => s.activeId);
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeId));
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const fontSize = useSettingsStore((s) => s.fontSize);

  useEffect(() => {
    if (!hostRef.current || !tab) return;

    const reportCursor = (state: EditorState) => {
      const head = state.selection.main.head;
      const line = state.doc.lineAt(head);
      useTabsStore
        .getState()
        .updateCursor(tab.id, head, line.number, head - line.from + 1);
    };

    const updateListener = EditorView.updateListener.of((update) => {
      if (!update.docChanged) {
        if (update.selectionSet) {
          reportCursor(update.state);
        }
        return;
      }
      const content = update.state.doc.toString();
      useTabsStore.getState().updateContent(tab.id, content);
      scheduleAutosave(tab.id);
      reportCursor(update.state);
    });

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      drawSelection(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      updateListener,
      EditorView.contentAttributes.of({ "aria-label": "Área de texto" }),
      EditorView.theme({
        "&": {
          height: "100%",
          fontSize: `${fontSize}px`,
          lineHeight: "1.55",
          fontFamily: '"JetBrains Mono", "Source Code Pro", ui-monospace, monospace',
          backgroundColor: "var(--paper)",
          color: "var(--ink-text)",
        },
        ".cm-scroller": { overflow: "auto", fontFamily: "inherit" },
        ".cm-content": {
          caretColor: "var(--pen)",
          padding: "0.85rem 1.1rem",
          lineHeight: "1.55",
        },
        ".cm-selectionBackground": { backgroundColor: "var(--pen-soft) !important" },
        "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--pen-soft) !important" },
      }),
      ...(wordWrap ? [EditorView.lineWrapping] : []),
    ];

    const state = EditorState.create({
      doc: tab.content,
      selection: {
        anchor: Math.min(tab.cursor, tab.content.length),
      },
      extensions,
    });

    const view = new EditorView({
      state,
      parent: hostRef.current,
    });
    viewRef.current = view;
    registerEditorView(view);
    reportCursor(view.state);

    return () => {
      registerEditorView(null);
      view.destroy();
      viewRef.current = null;
    };
    // Recreate editor when switching tabs or wrap/font settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, wordWrap, fontSize]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !findQuery || findNonce === 0) return;
    const match = findMatch(view.state, findQuery, view.state.selection.main.head);
    if (!match) return;
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      scrollIntoView: true,
    });
  }, [findQuery, findNonce]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !findQuery || replaceNonce === 0) return;
    const sel = view.state.selection.main;
    const selected = view.state.sliceDoc(sel.from, sel.to);
    let searchFrom = sel.from;
    if (sel.from !== sel.to && selected.toLowerCase() === findQuery.toLowerCase()) {
      view.dispatch({ changes: { from: sel.from, to: sel.to, insert: replaceQuery } });
      searchFrom = sel.from + replaceQuery.length;
    }
    const match = findMatch(view.state, findQuery, searchFrom);
    if (match) {
      view.dispatch({
        selection: { anchor: match.from, head: match.to },
        scrollIntoView: true,
      });
    }
  }, [replaceNonce]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !findQuery || replaceAllNonce === 0) return;
    const lower = view.state.doc.toString().toLowerCase();
    const q = findQuery.toLowerCase();
    const changes: { from: number; to: number; insert: string }[] = [];
    let idx = lower.indexOf(q);
    while (idx >= 0) {
      changes.push({ from: idx, to: idx + findQuery.length, insert: replaceQuery });
      idx = lower.indexOf(q, idx + q.length);
    }
    if (changes.length) view.dispatch({ changes });
  }, [replaceAllNonce]);

  return <div className="editor-host" ref={hostRef} />;
}
