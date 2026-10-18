import { EditorSelection, Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { noteUsage } from '../rider/commands';

type Span = { from: number; to: number };
const OPEN = '([{', CLOSE = ')]}';
const LIMIT = 200_000;

/** Every bracket pair enclosing [from, to], innermost first (strings and comments are not special-cased). */
function enclosingBrackets(text: string, from: number, to: number): Span[] {
  const out: Span[] = [];
  let at = from;
  for (let level = 0; level < 40; level++) {
    let depth = 0, open = -1;
    for (let i = at - 1; i >= Math.max(0, from - LIMIT); i--) {
      const c = text[i];
      if (CLOSE.includes(c)) depth++;
      else if (OPEN.includes(c)) { if (depth === 0) { open = i; break; } depth--; }
    }
    if (open < 0) break;
    const want = CLOSE[OPEN.indexOf(text[open])];
    let close = -1;
    depth = 0;
    for (let i = open + 1; i < Math.min(text.length, open + LIMIT); i++) {
      const c = text[i];
      if (OPEN.includes(c)) depth++;
      else if (CLOSE.includes(c)) { if (depth === 0) { close = c === want ? i : -1; break; } depth--; }
    }
    if (close >= to) out.push({ from: open, to: close + 1 });
    at = open;
  }
  return out;
}

/** The string literal ("…" or '…') on the line around [from, to]. */
function enclosingString(state: EditorState, from: number, to: number): Span | null {
  const line = state.doc.lineAt(from);
  if (state.doc.lineAt(to).number !== line.number) return null;
  const t = line.text;
  for (const q of ['"', "'"]) {
    let start = -1;
    for (let i = 0; i < t.length; i++) {
      if (t[i] !== q || (i > 0 && t[i - 1] === '\\')) continue;
      if (start < 0) { start = i; continue; }
      if (line.from + start < from + 1 && line.from + i >= to) return { from: line.from + start, to: line.from + i + 1 };
      start = -1;
    }
  }
  return null;
}

/** The indentation block of lines around [from, to] (Gherkin scenarios, C# bodies), then its parents. */
function indentBlocks(state: EditorState, from: number, to: number): Span[] {
  const doc = state.doc;
  const indent = (n: number) => { const t = doc.line(n).text; return t.trim() ? /^\s*/.exec(t)![0].length : -1; };
  const out: Span[] = [];
  let first = doc.lineAt(from).number, last = doc.lineAt(to).number;
  let base = Math.min(...[first, last].map(indent).filter((x) => x >= 0), Infinity);
  if (base === Infinity) return out;
  for (let level = 0; level < 20; level++) {
    let a = first, b = last;
    while (a > 1 && (indent(a - 1) >= base || indent(a - 1) < 0)) a--;
    while (b < doc.lines && (indent(b + 1) >= base || indent(b + 1) < 0)) b++;
    while (a < first && indent(a) < 0) a++;
    while (b > last && indent(b) < 0) b--;
    out.push({ from: doc.line(a).from + Math.max(0, indent(a)), to: doc.line(b).to });
    // The parent block: the header line above (less indented) and everything under it.
    if (a <= 1) break;
    const header = indent(a - 1);
    if (header < 0 || header >= base) break;
    first = a - 1; last = b; base = header;
    out.push({ from: doc.line(first).from + header, to: doc.line(b).to });
  }
  return out;
}

/** The next larger selection: word, string contents, string, bracket contents, brackets, line, indentation block, document. */
export function extendSpan(state: EditorState, from: number, to: number): Span | null {
  const text = state.doc.toString();
  const cands: Span[] = [];
  const word = state.wordAt(from);
  if (word) cands.push(word);
  const s = enclosingString(state, from, to);
  if (s) cands.push({ from: s.from + 1, to: s.to - 1 }, s);
  for (const b of enclosingBrackets(text, from, to)) {
    // Contents trimmed of surrounding whitespace / new lines, then the contents, then with the brackets.
    const inner = { from: b.from + 1, to: b.to - 1 };
    const raw = text.slice(inner.from, inner.to);
    const lead = raw.length - raw.trimStart().length, trail = raw.length - raw.trimEnd().length;
    cands.push({ from: inner.from + lead, to: inner.to - trail }, inner, b);
  }
  const l1 = state.doc.lineAt(from), l2 = state.doc.lineAt(to);
  // Lines without their indentation (a selection that keeps growing, as in Rider).
  cands.push({ from: l1.from + (/^\s*/.exec(l1.text)![0].length), to: l2.to });
  cands.push(...indentBlocks(state, from, to));
  cands.push({ from: 0, to: state.doc.length });
  const bigger = cands.filter((c) => c.from <= from && c.to >= to && c.to - c.from > to - from);
  bigger.sort((a, b) => (a.to - a.from) - (b.to - b.from));
  return bigger[0] ?? null;
}

// Shrink Selection goes back through the selections Extend Selection made.
const pushSel = StateEffect.define<EditorSelection | null>();
const selStack = StateField.define<EditorSelection[]>({
  create: () => [],
  update(stack, tr) {
    for (const e of tr.effects) if (e.is(pushSel)) return e.value ? [...stack, e.value] : stack.slice(0, -1);
    // Any other selection change or edit starts over.
    return tr.docChanged || (tr.selection && !tr.effects.some((e) => e.is(pushSel))) ? [] : stack;
  },
});

export function extendSelection(view: EditorView) {
  const st = view.state;
  const ranges = st.selection.ranges.map((r) => { const n = extendSpan(st, r.from, r.to); return n ? EditorSelection.range(n.from, n.to) : r; });
  view.dispatch({ selection: EditorSelection.create(ranges, st.selection.mainIndex), effects: pushSel.of(st.selection), scrollIntoView: true, userEvent: 'select.extend' });
  return true;
}
export function shrinkSelection(view: EditorView) {
  const stack = view.state.field(selStack, false) ?? [];
  if (!stack.length) return true;
  view.dispatch({ selection: stack.at(-1)!, effects: pushSel.of(null), scrollIntoView: true, userEvent: 'select.shrink' });
  return true;
}

const keyed = (key: string, id: string, run: (v: EditorView) => boolean) => ({ key, preventDefault: true, run: (v: EditorView) => { noteUsage(id, 'key'); return run(v); } });

/** Rider editing actions shared by the code and Gherkin editors. */
export function riderKeys(): Extension {
  return [selStack, Prec.high(keymap.of([
    keyed('Shift-Alt-ArrowRight', 'extend-selection', extendSelection),
    keyed('Shift-Alt-ArrowLeft', 'shrink-selection', shrinkSelection),
  ]))];
}
