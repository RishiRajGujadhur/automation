import { useSyncExternalStore } from 'react';
import { EditorView } from '@codemirror/view';

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
  });
}
