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

/**
 * Copy XPath (Rider / IntelliJ): the path of the element at a position. An element with a name or id attribute is
 * identified by it ([@name='Login']), else by its position among same-named siblings when there are several.
 */
export function xpathAt(text: string, pos: number) {
  type El = { name: string; attr?: string; index: number; counts: Map<string, number> };
  const stack: El[] = [];
  const top = new Map<string, number>();
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  let found: El[] | undefined;
  while ((m = re.exec(text))) {
    if (m.index > pos) break;
    if (!m[2]) continue;
    const end = m.index + m[0].length;
    if (m[1]) { stack.pop(); continue; }
    const counts = stack.length ? stack[stack.length - 1].counts : top;
    const index = (counts.get(m[2]) ?? 0) + 1;
    counts.set(m[2], index);
    const a = /\b(name|id)\s*=\s*["']([^"']*)["']/.exec(m[3]);
    const el: El = { name: m[2], attr: a ? `[@${a[1]}='${a[2]}']` : undefined, index, counts: new Map() };
    if (m[4]) { if (pos <= end) found = [...stack, el]; continue; }
    stack.push(el);
  }
  const path = found ?? stack;
  if (!path.length) return undefined;
  return path.map((e) => `/${e.name}${e.attr ?? (e.index > 1 ? `[${e.index}]` : '')}`).join('');
}
