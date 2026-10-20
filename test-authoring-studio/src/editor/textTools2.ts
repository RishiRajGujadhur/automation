import { EditorSelection, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { mapLines } from './textTools';

/**
 * Fourth batch of text tools (IDE-FEATURES-4.md): JetBrains Rider's String Manipulation actions and Visual Studio 2026
 * editor commands. Each rewrites the selection (or the word / line at the caret) and returns false when it has nothing to do.
 */

/** Replaces each selection (or, with none, the word or line at the caret) with `fn(text)`. */
export function mapSelections(fn: (text: string) => string | null, empty: 'word' | 'line' | 'doc' = 'word') {
  return (view: EditorView) => {
    const { state } = view;
    let changed = false;
    const tr = state.changeByRange((r) => {
      let { from, to } = r;
      if (r.empty) {
        if (empty === 'doc') { from = 0; to = state.doc.length; }
        else if (empty === 'line') { const l = state.doc.lineAt(r.head); from = l.from; to = l.to; }
        else { const w = state.wordAt(r.head); if (w) { from = w.from; to = w.to; } }
      }
      const text = state.sliceDoc(from, to);
      const next = from === to ? null : fn(text);
      if (next === null || next === text) return { range: r };
      changed = true;
      return { changes: { from, to, insert: next }, range: EditorSelection.range(from, from + next.length) };
    });
    if (!changed) return false;
    view.dispatch({ ...tr, userEvent: 'input.convert' });
    return true;
  };
}
export { mapLines };

/** URL Encode / Decode (Rider String Manipulation): percent-encoding of the selection. */
export const urlEncode = mapSelections((t) => encodeURIComponent(t), 'line');
export const urlDecode = mapSelections((t) => { try { return decodeURIComponent(t.replace(/\+/g, ' ')); } catch { return null; } }, 'line');

/** Base64 Encode / Decode (Rider String Manipulation), UTF-8. */
export const base64Encode = mapSelections((t) => btoa(String.fromCharCode(...new TextEncoder().encode(t))), 'line');
export const base64Decode = mapSelections((t) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(t.trim()), (c) => c.charCodeAt(0))); } catch { return null; } }, 'line');

/** Escape / Unescape C# String (Rider): backslashes, quotes and control characters. */
const ESC: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\0': '\\0' };
export const escapeString = mapSelections((t) => t.replace(/[\\"\n\r\t\0]/g, (c) => ESC[c]), 'line');
export const unescapeString = mapSelections((t) => t.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => (c.length > 1 ? String.fromCharCode(parseInt(c.slice(1), 16)) : ({ n: '\n', r: '\r', t: '\t', '0': '\0' } as Record<string, string>)[c] ?? c)), 'line');

/** HTML Encode / Decode (Rider String Manipulation): the five XML entities, and numeric ones when decoding. */
const HTML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const htmlEncode = mapSelections((t) => t.replace(/[&<>"']/g, (c) => HTML[c]), 'line');
export const htmlDecode = mapSelections((t) => t.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e])), 'line');

/** Increment / Decrement Number (Rider String Manipulation): the number at each caret, keeping zero padding. */
export function stepNumber(by: number) {
  return (view: EditorView) => {
    const { state } = view;
    let changed = false;
    const tr = state.changeByRange((r) => {
      const line = state.doc.lineAt(r.head);
      for (const m of line.text.matchAll(/-?\d+/g)) {
        const from = line.from + m.index!, to = from + m[0].length;
        if (r.head < from || r.head > to) continue;
        const neg = m[0].startsWith('-');
        const digits = neg ? m[0].slice(1) : m[0];
        const n = BigInt(m[0]) + BigInt(by);
        const abs = (n < 0n ? -n : n).toString().padStart(digits.length, '0');
        const next = (n < 0n ? '-' : '') + abs;
        changed = true;
        return { changes: { from, to, insert: next }, range: EditorSelection.cursor(Math.min(from + next.length, r.head + next.length - m[0].length)) };
      }
      return { range: r };
    });
    if (!changed) return false;
    view.dispatch({ ...tr, userEvent: 'input.convert' });
    return true;
  };
}

/** Insert Sequence (Rider "Increment Duplicates", VS multi-caret numbering): 1, 2, 3… at the carets, in document order,
 * starting from the first selection's number when it is one. */
export function insertSequence(view: EditorView) {
  const ranges = [...view.state.selection.ranges].sort((a, b) => a.from - b.from);
  if (ranges.length < 2) return false;
  const first = view.state.sliceDoc(ranges[0].from, ranges[0].to).trim();
  const start = /^-?\d+$/.test(first) ? Number(first) : 1;
  const order = new Map(ranges.map((r, i) => [r.from, i]));
  view.dispatch({ ...view.state.changeByRange((r) => { const text = String(start + order.get(r.from)!); return { changes: { from: r.from, to: r.to, insert: text }, range: EditorSelection.cursor(r.from + text.length) }; }), userEvent: 'input.convert' });
  return true;
}

/** Toggle Quotes (Rider): the string at the caret switches between "double" and 'single' quotes. */
export function toggleQuotes(view: EditorView) {
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  for (const m of line.text.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
    const from = line.from + m.index!, to = from + m[0].length;
    if (head < from || head > to) continue;
    const dq = m[1] !== undefined;
    const body = dq ? m[1].replace(/\\"/g, '"').replace(/'/g, "\\'") : m[2].replace(/\\'/g, "'").replace(/"/g, '\\"');
    const q = dq ? "'" : '"';
    view.dispatch({ changes: { from, to, insert: q + body + q }, selection: { anchor: Math.min(head, from + body.length + 1) }, userEvent: 'input.convert' });
    return true;
  }
  return false;
}

/** Join Lines with Separator (Rider String Manipulation): the selected lines, trimmed, joined by `sep`. */
export const joinWith = (sep: string) => (view: EditorView) => {
  if (view.state.selection.main.empty) return false;
  return mapLines((lines) => { const indent = /^\s*/.exec(lines[0])![0]; return [indent + lines.map((l) => l.trim()).filter(Boolean).join(sep)]; }, false)(view);
};

/** Split at Separator (Rider String Manipulation): the selection (or line) becomes one line per part, trimmed, indented like the line. */
export const splitAt = (sep: string) => (view: EditorView) => {
  if (!sep) return false;
  return mapLines((lines) => lines.flatMap((l) => { if (!l.includes(sep)) return [l]; const indent = /^\s*/.exec(l)![0]; return l.split(sep).map((p) => p.trim()).filter(Boolean).map((p) => indent + p); }), false)(view);
};

/** The first lone "=" of a line (not ==, =>, <=, >=, !=, +=…), or -1. */
const assignAt = (l: string) => { const m = /(?<![=<>!+\-*/%&|^?:])=(?![=>])/.exec(l); return m ? m.index : -1; };
/** Align Assignments (Visual Studio Productivity Power Tools, Ctrl+Alt+]): the "=" of the selected lines (or the block of
 * assignments around the caret) in one column. */
export function alignAssignments(view: EditorView) {
  const { state } = view;
  const r = state.selection.main;
  let first = state.doc.lineAt(r.from).number, last = state.doc.lineAt(r.to).number;
  if (r.empty) {
    if (assignAt(state.doc.line(first).text) < 0) return false;
    while (first > 1 && assignAt(state.doc.line(first - 1).text) >= 0) first--;
    while (last < state.doc.lines && assignAt(state.doc.line(last + 1).text) >= 0) last++;
  }
  const lines = Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i).text);
  const col = Math.max(...lines.map((l) => { const i = assignAt(l); return i < 0 ? -1 : l.slice(0, i).trimEnd().length; }));
  if (col < 0) return false;
  const next = lines.map((l) => { const i = assignAt(l); return i < 0 ? l : `${l.slice(0, i).trimEnd().padEnd(col)} = ${l.slice(i + 1).trimStart()}`; }).join('\n');
  const from = state.doc.line(first).from, to = state.doc.line(last).to;
  if (next === state.sliceDoc(from, to)) return true;
  view.dispatch({ changes: { from, to, insert: next }, userEvent: 'input.convert' });
  return true;
}

/** Swap Selections (Rider String Manipulation): the text of two selections changes places. */
export function swapSelections(view: EditorView) {
  const ranges = view.state.selection.ranges;
  if (ranges.length !== 2 || ranges.some((r) => r.empty)) return false;
  const [a, b] = [...ranges].sort((x, y) => x.from - y.from);
  const ta = view.state.sliceDoc(a.from, a.to), tb = view.state.sliceDoc(b.from, b.to);
  const shift = tb.length - ta.length;
  view.dispatch({ changes: [{ from: a.from, to: a.to, insert: tb }, { from: b.from, to: b.to, insert: ta }], selection: EditorSelection.create([EditorSelection.range(a.from, a.from + tb.length), EditorSelection.range(b.from + shift, b.to + shift)]), userEvent: 'input.convert' });
  return true;
}

/** Count Occurrences (Rider): how often the selection (or the word at the caret) appears in the file. */
export function countOccurrences(state: EditorState) {
  const r = state.selection.main;
  const w = r.empty ? state.wordAt(r.head) : r;
  if (!w || w.from === w.to) return null;
  const needle = state.sliceDoc(w.from, w.to);
  const doc = state.doc.toString();
  let n = 0;
  for (let i = doc.indexOf(needle); i >= 0; i = doc.indexOf(needle, i + needle.length)) n++;
  return { needle, count: n, lines: new Set(Array.from(doc.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')), (m) => state.doc.lineAt(m.index!).number)).size };
}

/** Trim Lines (Rider String Manipulation): leading and trailing white space of the selected lines (or the caret's line). */
export function trimLines(view: EditorView) {
  const { state } = view;
  const r = state.selection.main;
  const first = state.doc.lineAt(r.from), last = state.doc.lineAt(r.to);
  const text = state.sliceDoc(first.from, last.to);
  const next = text.split('\n').map((l) => l.trim()).join('\n');
  if (next === text) return false;
  view.dispatch({ changes: { from: first.from, to: last.to, insert: next }, userEvent: 'input.convert' });
  return true;
}

/** Insert Date and Time (Rider live template "date"): local ISO-like "yyyy-MM-dd HH:mm" at each caret. */
export const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const insertText = (text: () => string) => (view: EditorView) => {
  const t = text();
  view.dispatch({ ...view.state.changeByRange((r) => ({ changes: { from: r.from, to: r.to, insert: t }, range: EditorSelection.cursor(r.from + t.length) })), userEvent: 'input' });
  return true;
};
