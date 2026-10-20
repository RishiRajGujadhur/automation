import { EditorSelection } from '@codemirror/state';
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
