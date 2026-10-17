import { useSyncExternalStore } from 'react';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { visit, REVEAL_EVENT } from '../navHistory';

/** Where the cursor is in the focused editor (status bar: "Ln 12, Col 5", line endings). */
export type CursorInfo = { file: string; line: number; column: number; selected: number; eol: 'CRLF' | 'LF' } | null;
let info: CursorInfo = null;
const listeners = new Set<() => void>();
const set = (next: CursorInfo) => {
  if (info && next && info.file === next.file && info.line === next.line && info.column === next.column && info.selected === next.selected && info.eol === next.eol) return;
  info = next;
  for (const l of listeners) l();
};
export const useCursor = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => info);

/** Reports the cursor of an editor while it has focus (and keeps the last position after it loses it). */
export function cursorTracker(file: string, eol: () => 'CRLF' | 'LF') {
  return EditorView.updateListener.of((u) => {
    if (!u.view.hasFocus || (!u.selectionSet && !u.docChanged && !u.focusChanged)) return;
    const r = u.state.selection.main;
    const line = u.state.doc.lineAt(r.head);
    set({ file, line: line.number, column: r.head - line.from + 1, selected: Math.abs(r.to - r.from), eol: eol() });
    // Navigation history (Back / Forward, Recent Locations), with the line's code.
    if (u.selectionSet || u.focusChanged) visit({ file, line: line.number, column: r.head - line.from + 1, text: line.text.trim().slice(0, 120) });
  });
}

/** Reveal requests for this file (Back / Forward, Recent Locations, bookmarks): cursor on the line, scrolled into view. */
export function revealOn(file: string) {
  return ViewPlugin.fromClass(class {
    off: () => void;
    constructor(view: EditorView) {
      const h = (e: Event) => {
        const d = (e as CustomEvent<{ file: string; line: number; column: number }>).detail;
        if (d.file !== file) return;
        const doc = view.state.doc;
        const line = doc.line(Math.max(1, Math.min(d.line, doc.lines)));
        const at = Math.min(line.to, line.from + Math.max(0, d.column - 1));
        view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
        view.focus();
      };
      window.addEventListener(REVEAL_EVENT, h);
      this.off = () => window.removeEventListener(REVEAL_EVENT, h);
    }
    destroy() { this.off(); }
  });
}
