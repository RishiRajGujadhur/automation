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

/**
 * The JSON Pointer (RFC 6901) of the value at a position (Rider's Copy JSON Pointer): the innermost value whose text
 * contains it, a key counting as its value.
 */
export function jsonPointerAt(text: string, pos: number) {
  let i = 0;
  let best: { path: string[]; size: number } | undefined;
  const note = (path: string[], from: number, to: number) => { if (pos >= from && pos <= to && (!best || to - from <= best.size)) best = { path, size: to - from }; };
  const ws = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const str = () => { const from = i; i++; while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1; i++; return JSON.parse(text.slice(from, i)) as string; };
  const value = (path: string[]): void => {
    ws();
    const from = i;
    if (text[i] === '{') {
      i++; ws();
      while (i < text.length && text[i] !== '}') {
        const kFrom = i; const key = str(); const kTo = i;
        ws(); i++; // :
        const sub = [...path, key];
        note(sub, kFrom, kTo);
        value(sub);
        ws(); if (text[i] === ',') { i++; ws(); }
      }
      i++;
    } else if (text[i] === '[') {
      i++; ws();
      let n = 0;
      while (i < text.length && text[i] !== ']') { value([...path, String(n++)]); ws(); if (text[i] === ',') { i++; ws(); } }
      i++;
    } else if (text[i] === '"') str();
    else { while (i < text.length && /[^\s,\]}]/.test(text[i])) i++; }
    note(path, from, i);
  };
  try { value([]); } catch { return undefined; }
  return best && best.path.map((p) => `/${p.replace(/~/g, '~0').replace(/\//g, '~1')}`).join('');
}
