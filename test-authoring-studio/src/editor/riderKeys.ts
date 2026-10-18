import { EditorSelection, Prec, StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { insertNewlineAndIndent } from '@codemirror/commands';
import { selectNextOccurrence, SearchCursor } from '@codemirror/search';
import { noteUsage, runRider } from '../rider/commands';
import { pushClipboard } from '../rider/clipboardRing';

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

/** Toggle Case (Ctrl+Shift+U): the selection (or the word at the caret) to upper case, or to lower case when it has no lower-case letters. */
export function toggleCase(view: EditorView) {
  const st = view.state;
  const spans = st.selection.ranges.map((r) => (r.empty ? st.wordAt(r.head) ?? r : r)).filter((r) => r.to > r.from);
  if (!spans.length) return true;
  const all = spans.map((r) => st.sliceDoc(r.from, r.to)).join('');
  const upper = all !== all.toUpperCase();
  view.dispatch({ changes: spans.map((r) => ({ from: r.from, to: r.to, insert: upper ? st.sliceDoc(r.from, r.to).toUpperCase() : st.sliceDoc(r.from, r.to).toLowerCase() })), selection: EditorSelection.create(spans.map((r) => EditorSelection.range(r.from, r.to))), userEvent: 'input.case' });
  return true;
}

/** Join Lines (Ctrl+Shift+J): the selected lines (or this line and the next) become one, separated by one space. */
export function joinLines(view: EditorView) {
  const doc = view.state.doc;
  const changes: { from: number; to: number; insert: string }[] = [];
  let last = 0;
  for (const r of view.state.selection.ranges) {
    const a = doc.lineAt(r.from).number;
    const b = Math.max(a + 1, doc.lineAt(r.to).number);
    for (let n = Math.max(a, last + 1); n < b && n < doc.lines; n++) {
      const end = doc.line(n).to, next = doc.line(n + 1);
      const trailing = /\s*$/.exec(doc.line(n).text)![0].length;
      const lead = /^\s*/.exec(next.text)![0].length;
      changes.push({ from: end - trailing, to: next.from + lead, insert: next.text.trim() && doc.line(n).text.trim() ? ' ' : '' });
      last = n;
    }
  }
  if (changes.length) view.dispatch({ changes, userEvent: 'delete.join' });
  return true;
}

/** Unselect Occurrence (Alt+Shift+J): drops the occurrence added last (the main selection). */
export function unselectOccurrence(view: EditorView) {
  const sel = view.state.selection;
  if (sel.ranges.length < 2) return true;
  const removed = sel.main;
  const rest = sel.ranges.filter((_, i) => i !== sel.mainIndex);
  const before = rest.filter((r) => r.from < removed.from);
  const main = before.length ? rest.indexOf(before.at(-1)!) : rest.length - 1;
  view.dispatch({ selection: EditorSelection.create(rest, main), scrollIntoView: true, userEvent: 'select' });
  return true;
}
/** Select All Occurrences (Ctrl+Alt+Shift+J): every match of the main selection (or of the word at the caret, whole words). */
export function selectAllOccurrences(view: EditorView) {
  const st = view.state;
  const word = st.selection.main.empty ? st.wordAt(st.selection.main.head) : null;
  const main = word ?? st.selection.main;
  if (main.empty) return true;
  const text = st.sliceDoc(main.from, main.to);
  const bounded = (a: number, b: number) => (!/\w/.test(st.sliceDoc(a - 1, a)) && !/\w/.test(st.sliceDoc(b, b + 1)));
  // A whole word (from the caret, or a selection that is one) matches whole words only, as in Rider.
  const wholeWords = !!word || (/^\w+$/.test(text) && bounded(main.from, main.to));
  const isWord = (a: number, b: number) => !wholeWords || bounded(a, b);
  const ranges: ReturnType<typeof EditorSelection.range>[] = [];
  let mainIndex = 0;
  for (const cur = new SearchCursor(st.doc, text); !cur.next().done && ranges.length < 1000;) {
    if (!isWord(cur.value.from, cur.value.to)) continue;
    if (cur.value.from === main.from) mainIndex = ranges.length;
    ranges.push(EditorSelection.range(cur.value.from, cur.value.to));
  }
  if (ranges.length) view.dispatch({ selection: EditorSelection.create(ranges, mainIndex), userEvent: 'select' });
  return true;
}
export { selectNextOccurrence };

/** Start New Line (Shift+Enter): a new line after the current one, wherever the caret is in it. */
export function startNewLine(view: EditorView) {
  view.dispatch({ selection: EditorSelection.create(view.state.selection.ranges.map((r) => EditorSelection.cursor(view.state.doc.lineAt(r.head).to))) });
  return insertNewlineAndIndent(view);
}
/** Start New Line Before Current (Ctrl+Alt+Enter): a new line above, with the current line's indentation. */
export function startNewLineBefore(view: EditorView) {
  const st = view.state;
  const lines = [...new Set(st.selection.ranges.map((r) => st.doc.lineAt(r.head).number))];
  let shift = 0;
  const cursors: number[] = [];
  const changes = lines.map((n) => {
    const l = st.doc.line(n);
    const indent = /^\s*/.exec(l.text)![0];
    cursors.push(l.from + shift + indent.length);
    shift += indent.length + 1;
    return { from: l.from, insert: indent + st.lineBreak };
  });
  view.dispatch({ changes, selection: EditorSelection.create(cursors.map((c) => EditorSelection.cursor(c))), scrollIntoView: true, userEvent: 'input' });
  return true;
}

/** Add Carets to Ends of Selected Lines (Alt+Shift+G): one caret at the end of every line the selection touches. */
export function caretsAtLineEnds(view: EditorView) {
  const doc = view.state.doc;
  const ends = new Set<number>();
  for (const r of view.state.selection.ranges) {
    const last = doc.lineAt(r.to > r.from && doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to).number;
    for (let n = doc.lineAt(r.from).number; n <= last; n++) ends.add(doc.line(n).to);
  }
  if (ends.size < 2) return true;
  view.dispatch({ selection: EditorSelection.create([...ends].sort((a, b) => a - b).map((e) => EditorSelection.cursor(e))), userEvent: 'select' });
  return true;
}

/** Copied and cut text goes to the clipboard history (Paste from History). */
const recordCopies = EditorView.domEventHandlers({
  copy: (_e, view) => { pushClipboard(selectedText(view)); return false; },
  cut: (_e, view) => { pushClipboard(selectedText(view)); return false; },
});
function selectedText(view: EditorView) {
  const st = view.state;
  const ranges = st.selection.ranges.filter((r) => !r.empty);
  // An empty selection copies the line (CodeMirror's line-wise copy).
  if (!ranges.length) return st.selection.ranges.map((r) => st.doc.lineAt(r.head).text).join(st.lineBreak) + st.lineBreak;
  return ranges.map((r) => st.sliceDoc(r.from, r.to)).join(st.lineBreak);
}
/** A key that opens a Rider popup (handled by RiderHost). */
const opens = (key: string, id: string) => ({ key, preventDefault: true, run: () => runRider(id, 'key') });

const keyed = (key: string, id: string, run: (v: EditorView) => boolean) => ({ key, preventDefault: true, run: (v: EditorView) => { noteUsage(id, 'key'); return run(v); } });

/** Rider editing actions shared by the code and Gherkin editors. */
export function riderKeys(): Extension {
  // Ctrl+Alt chords: CodeMirror reads Ctrl+Alt as AltGr on Windows, so these match on the physical key.
  const chords: [code: string, shift: boolean, id: string, run: (v: EditorView) => boolean][] = [
    ['KeyJ', true, 'all-occurrences', selectAllOccurrences],
    ['Enter', false, 'new-line-before', startNewLineBefore],
    ['KeyJ', false, 'surround-with', () => runRider('surround-with', 'key')],
  ];
  const ctrlAlt = EditorView.domEventHandlers({
    keydown(e, view) {
      if (!(e.ctrlKey || e.metaKey) || !e.altKey) return false;
      const c = chords.find(([code, shift]) => code === e.code && shift === e.shiftKey);
      if (!c) return false;
      e.preventDefault();
      noteUsage(c[2], 'key');
      return c[3](view);
    },
  });
  return [selStack, recordCopies, Prec.highest(ctrlAlt), Prec.high(keymap.of([
    opens('Mod-Shift-v', 'paste-history'),
    opens('Mod-j', 'live-template'),
    keyed('Shift-Alt-ArrowRight', 'extend-selection', extendSelection),
    keyed('Shift-Alt-ArrowLeft', 'shrink-selection', shrinkSelection),
    keyed('Mod-Shift-u', 'toggle-case', toggleCase),
    keyed('Mod-Shift-j', 'join-lines', joinLines),
    keyed('Alt-j', 'next-occurrence', selectNextOccurrence),
    keyed('Alt-Shift-j', 'unselect-occurrence', unselectOccurrence),
    keyed('Shift-Enter', 'new-line', startNewLine),
    keyed('Alt-Shift-g', 'carets-line-ends', caretsAtLineEnds),
  ]))];
}
