import { EditorView, keymap } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { registerAdvanced } from '../editor/advanced';
import { OPEN_LOCATION_EVENT } from '../editor/links';
import { featureOn } from '../features';

/** The location a line of a .code-search document stands for: the file header above it and the line number. Pure. */
export function searchEditorLocation(lines: string[], index: number): { file: string; line: number } | null {
  const m = /^\s+(\d+): /.exec(lines[index] ?? '');
  if (!m) return null;
  for (let i = index - 1; i >= 0; i--) {
    const f = /^(\S.*):$/.exec(lines[i]);
    if (f && !lines[i].startsWith('#')) return { file: f[1], line: Number(m[1]) };
  }
  return null;
}
const openAt = (state: EditorState, pos: number) => {
  const doc = state.doc;
  const n = doc.lineAt(pos).number - 1;
  const lines: string[] = [];
  for (let i = 1; i <= n + 1; i++) lines.push(doc.line(i).text);
  const loc = searchEditorLocation(lines, n);
  if (!loc) return false;
  window.dispatchEvent(new CustomEvent(OPEN_LOCATION_EVENT, { detail: { ...loc, text: `${loc.file}:${loc.line}` } }));
  return true;
};
// Search editor (VS Code): double-click or F12 on a result line opens it.
registerAdvanced((file) => (!file.endsWith('.code-search') || !featureOn('search-editor') ? [] : [
  EditorView.domEventHandlers({ dblclick: (e, view) => { const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }); return pos != null && openAt(view.state, pos); } }),
  keymap.of([{ key: 'F12', run: (v) => openAt(v.state, v.state.selection.main.head) }, { key: 'Enter', run: (v) => openAt(v.state, v.state.selection.main.head) }]),
  EditorView.editorAttributes.of({ class: 'cm-search-editor' }),
]));
