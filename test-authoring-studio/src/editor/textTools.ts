import { EditorSelection, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Text tools (Visual Studio's Edit ▸ Advanced and JetBrains Rider's editor actions) that rewrite the selected lines or
 * text. Each works on the selection, or the whole document / the caret's line when nothing is selected.
 */

/** The full lines touched by the main selection (the whole document when the selection is empty). */
export function selectedLineRange(state: EditorState, wholeDocWhenEmpty = true) {
  const r = state.selection.main;
  if (r.empty && wholeDocWhenEmpty) return { from: 0, to: state.doc.length, lines: state.doc.toString().split('\n') };
  const first = state.doc.lineAt(r.from);
  const last = state.doc.lineAt(r.to > r.from && state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to);
  return { from: first.from, to: last.to, lines: state.sliceDoc(first.from, last.to).split('\n') };
}
/** Replaces the selected lines with `fn(lines)`, keeping them selected. */
export function mapLines(fn: (lines: string[]) => string[], wholeDocWhenEmpty = true) {
  return (view: EditorView) => {
    const { from, to, lines } = selectedLineRange(view.state, wholeDocWhenEmpty);
    const next = fn(lines).join('\n');
    if (next === lines.join('\n')) return true;
    view.dispatch({ changes: { from, to, insert: next }, selection: EditorSelection.range(from, from + next.length), userEvent: 'input.lines' });
    return true;
  };
}

/** Sort Lines (Rider): ascending, case-insensitive then by case, numbers in numeric order; blank lines kept last. */
export const sortLines = (desc = false) => mapLines((lines) => {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const blank = lines.filter((l) => !l.trim());
  const rest = lines.filter((l) => l.trim()).sort((a, b) => collator.compare(a.trim(), b.trim()) || a.localeCompare(b));
  return [...(desc ? rest.reverse() : rest), ...blank];
});

/** Reverse Lines (Rider): the selected lines (or the file) in reverse order. */
export const reverseLines = mapLines((lines) => [...lines].reverse());

/**
 * Delete Horizontal White Space (Visual Studio, Ctrl+K, Ctrl+\): in a selection, runs of spaces and tabs collapse to one
 * space (indentation stays); with no selection, the spaces and tabs around the caret go.
 */
export function deleteHorizontalWhiteSpace(view: EditorView) {
  const st = view.state;
  const changes: { from: number; to: number; insert: string }[] = [];
  for (const r of st.selection.ranges) {
    if (r.empty) {
      const line = st.doc.lineAt(r.head);
      const col = r.head - line.from;
      const before = /[ \t]*$/.exec(line.text.slice(0, col))![0].length, after = /^[ \t]*/.exec(line.text.slice(col))![0].length;
      if (before + after) changes.push({ from: r.head - before, to: r.head + after, insert: '' });
      continue;
    }
    const text = st.sliceDoc(r.from, r.to);
    const startsLine = st.doc.lineAt(r.from).from === r.from;
    const next = text.split('\n').map((l, i) => { const lead = i > 0 || startsLine ? /^[ \t]*/.exec(l)![0] : ''; return lead + l.slice(lead.length).replace(/[ \t]{2,}/g, ' '); }).join('\n');
    if (next !== text) changes.push({ from: r.from, to: r.to, insert: next });
  }
  if (changes.length) view.dispatch({ changes, userEvent: 'delete.whitespace' });
  return true;
}

/** Make Uppercase / Make Lowercase (Visual Studio, Edit ▸ Advanced): the selection, or the word at the caret. */
export function setCase(upper: boolean) {
  return (view: EditorView) => {
    const st = view.state;
    const spans = st.selection.ranges.map((r) => (r.empty ? st.wordAt(r.head) ?? r : r)).filter((r) => r.to > r.from);
    if (!spans.length) return true;
    view.dispatch({ changes: spans.map((r) => ({ from: r.from, to: r.to, insert: upper ? st.sliceDoc(r.from, r.to).toUpperCase() : st.sliceDoc(r.from, r.to).toLowerCase() })), userEvent: 'input.case' });
    return true;
  };
}

/** Transpose Line (Visual Studio, Shift+Alt+T): the caret's line swaps with the line below; the caret moves down with it. */
export function transposeLine(view: EditorView) {
  const st = view.state;
  const line = st.doc.lineAt(st.selection.main.head);
  if (line.number >= st.doc.lines) return true;
  const next = st.doc.line(line.number + 1);
  const col = st.selection.main.head - line.from;
  view.dispatch({ changes: { from: line.from, to: next.to, insert: `${next.text}\n${line.text}` }, selection: { anchor: line.from + next.text.length + 1 + col }, userEvent: 'move.line' });
  return true;
}
/** Transpose Characters (Visual Studio): the characters on either side of the caret swap. */
export function transposeChars(view: EditorView) {
  const st = view.state;
  const pos = st.selection.main.head;
  const line = st.doc.lineAt(pos);
  // At the end of a line, the last two characters swap.
  const at = pos >= line.to ? pos - 1 : pos;
  if (at <= line.from || at >= line.to) return true;
  const a = st.sliceDoc(at - 1, at), b = st.sliceDoc(at, at + 1);
  view.dispatch({ changes: { from: at - 1, to: at + 1, insert: b + a }, selection: { anchor: at + 1 }, userEvent: 'input.transpose' });
  return true;
}
/** Transpose Words (Visual Studio): the word at (or before) the caret swaps with the next word. */
export function transposeWords(view: EditorView) {
  const st = view.state;
  const line = st.doc.lineAt(st.selection.main.head);
  const col = st.selection.main.head - line.from;
  const words = [...line.text.matchAll(/\w+/g)].map((m) => ({ from: m.index!, to: m.index! + m[0].length, text: m[0] }));
  const i = words.findIndex((w) => col >= w.from && col <= w.to) >= 0 ? words.findIndex((w) => col >= w.from && col <= w.to) : words.findIndex((w) => w.from >= col) - 1;
  if (i < 0 || i + 1 >= words.length) return true;
  const a = words[i], b = words[i + 1];
  const between = line.text.slice(a.to, b.from);
  view.dispatch({ changes: { from: line.from + a.from, to: line.from + b.to, insert: b.text + between + a.text }, selection: { anchor: line.from + b.to }, userEvent: 'input.transpose' });
  return true;
}

export { cursorMatchingBracket, selectMatchingBracket } from '@codemirror/commands';
