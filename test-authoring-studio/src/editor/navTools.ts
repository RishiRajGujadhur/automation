import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { forEachDiagnostic } from '@codemirror/lint';

/** Offsets of TODO-style keywords inside comments (//, #, <!--, /*, * continuation lines). Pure, for the unit tests. */
export function todoPositions(text: string, tokens: string[]) {
  if (!tokens.length) return [];
  const words = tokens.map((t) => t.replace(/\W/g, '')).filter(Boolean).join('|');
  const re = new RegExp(String.raw`(\/\/+|#|<!--|\/\*+|^\s*\*)[^\n]*?\b(` + words + String.raw`)\b`, 'gm');
  const out: number[] = [];
  for (const m of text.matchAll(re)) out.push(m.index! + m[0].length - m[2].length);
  return out;
}
/** The next (dir 1) or previous (dir -1) offset after / before `pos`, wrapping around; -1 when there is none. */
export function stepTo(list: number[], pos: number, dir: 1 | -1) {
  if (!list.length) return -1;
  const sorted = [...list].sort((a, b) => a - b);
  return dir > 0 ? sorted.find((x) => x > pos) ?? sorted[0] : [...sorted].reverse().find((x) => x < pos) ?? sorted[sorted.length - 1];
}
const go = (v: EditorView, at: number) => { v.dispatch({ selection: EditorSelection.cursor(at), effects: EditorView.scrollIntoView(at, { y: 'center' }) }); return true; };
/** Next / Previous TODO comment in the file. */
export const gotoTodo = (tokens: string[], dir: 1 | -1) => (v: EditorView) => { const at = stepTo(todoPositions(v.state.doc.toString(), tokens), v.state.selection.main.head, dir); return at >= 0 && go(v, at); };
/** Next / Previous diagnostic of a severity in the file (compiler warnings: Rider's Next Warning). */
export const gotoDiagnostic = (severity: 'warning' | 'error' | 'info', dir: 1 | -1) => (v: EditorView) => {
  const list: number[] = [];
  forEachDiagnostic(v.state, (d, from) => { if (d.severity === severity) list.push(from); });
  const at = stepTo([...new Set(list)], v.state.selection.main.head, dir);
  return at >= 0 && go(v, at);
};
