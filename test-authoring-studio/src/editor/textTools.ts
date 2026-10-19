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
