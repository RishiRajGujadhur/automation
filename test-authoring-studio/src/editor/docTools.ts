import type { EditorView } from '@codemirror/view';

/** JSON / XML / Markdown document tools (IDE-FEATURES.md). */
const sortDeep = (v: unknown): unknown => (Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort((a, b) => a.localeCompare(b)).map((k) => [k, sortDeep((v as Record<string, unknown>)[k])])) : v);
/** Sort JSON Keys: every object's keys in alphabetical order (the selection, else the file); arrays keep their order. */
export function sortJsonKeys(view: EditorView) {
  const st = view.state;
  const r = st.selection.main;
  const from = r.empty ? 0 : r.from, to = r.empty ? st.doc.length : r.to;
  const text = st.sliceDoc(from, to);
  let next: string;
  try { next = JSON.stringify(sortDeep(JSON.parse(text)), null, 2); } catch { return false; }
  if (r.empty && text.endsWith('\n')) next += '\n';
  if (next !== text) view.dispatch({ changes: { from, to, insert: next }, userEvent: 'input.format' });
  return true;
}
