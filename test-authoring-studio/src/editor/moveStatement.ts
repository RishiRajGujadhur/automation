import { EditorSelection, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Move Statement Up / Down (Rider, Ctrl+Shift+Alt+↑/↓): moves the statement at the caret past its neighbour. A
 * statement is a line with everything indented under it and its { } block (C# blocks, Gherkin scenarios with their
 * steps, a step with its table). It never leaves its parent block.
 */
const indentOf = (t: string) => (t.trim() ? /^\s*/.exec(t)![0].replace(/\t/g, '    ').length : -1);
const braces = (t: string) => { const s = t.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\/\/.*$/g, ''); return (s.match(/\{/g)?.length ?? 0) - (s.match(/\}/g)?.length ?? 0); };

/** Last line of the statement starting at `start` (1-based line numbers). */
export function statementEnd(state: EditorState, start: number) {
  const doc = state.doc;
  const text = (n: number) => doc.line(n).text;
  if (!text(start).trim()) return start;
  const base = indentOf(text(start));
  let depth = braces(text(start));
  let end = start;
  for (let n = start + 1; n <= doc.lines; n++) {
    const t = text(n);
    const ind = indentOf(t);
    const opensBlock = ind === base && t.trim().startsWith('{') && depth === 0 && !/[;}]\s*$/.test(text(end).trim());
    if (depth > 0 || ind > base || opensBlock || (ind < 0 && n < doc.lines && (depth > 0 || indentOf(text(n + 1)) > base))) {
      end = n;
      depth += braces(t);
      continue;
    }
    break;
  }
  return end;
}
/** First line of the statement that ends at `end`, or null when the line above belongs to the parent. */
function statementStartEndingAt(state: EditorState, end: number, base: number) {
  const doc = state.doc;
  if (!doc.line(end).text.trim()) return end;
  for (let s = end; s >= Math.max(1, end - 2000); s--) {
    const ind = indentOf(doc.line(s).text);
    if (ind >= 0 && ind < base) return null;
    if (ind === base && !doc.line(s).text.trim().startsWith('{') && !doc.line(s).text.trim().startsWith('}') && statementEnd(state, s) === end) return s;
  }
  return null;
}

export function moveStatement(dir: 1 | -1) {
  return (view: EditorView) => {
    const st = view.state;
    const doc = st.doc;
    const head = st.selection.main.head;
    // The statement around the caret: from the first line of the caret's statement.
    let start = doc.lineAt(head).number;
    while (start > 1 && !doc.line(start).text.trim()) start--;
    // From a { or } line, the statement is the one that owns the block.
    const t0 = doc.line(start).text.trim();
    if (t0.startsWith('{') || t0.startsWith('}')) {
      for (let s = start - 1; s >= 1; s--) if (indentOf(doc.line(s).text) === indentOf(doc.line(start).text) && !/^[{}]/.test(doc.line(s).text.trim()) && statementEnd(st, s) >= start) { start = s; break; }
    }
    const base = indentOf(doc.line(start).text);
    const end = statementEnd(st, start);
    let a: number, b: number, c: number, d: number; // the two statements [a..b] [c..d] to swap
    if (dir < 0) {
      if (start <= 1) return true;
      const prevStart = statementStartEndingAt(st, start - 1, base);
      if (prevStart === null) return true;
      [a, b, c, d] = [prevStart, start - 1, start, end];
    } else {
      if (end >= doc.lines) return true;
      const next = end + 1;
      const ni = indentOf(doc.line(next).text);
      if (ni >= 0 && ni < base) return true;
      if (doc.line(next).text.trim().startsWith('}')) return true;
      [a, b, c, d] = [start, end, next, statementEnd(st, next)];
    }
    const from = doc.line(a).from, to = doc.line(d).to;
    const first = st.sliceDoc(doc.line(a).from, doc.line(b).to);
    const second = st.sliceDoc(doc.line(c).from, doc.line(d).to);
    const nl = st.lineBreak;
    const moved = dir < 0 ? second : first;
    const insert = second + nl + first;
    // The caret stays at the same place in the statement it moved with.
    const offsetInMoved = head - doc.line(dir < 0 ? c : a).from;
    const movedStart = dir < 0 ? from : from + second.length + nl.length;
    view.dispatch({ changes: { from, to, insert }, selection: EditorSelection.cursor(movedStart + Math.min(offsetInMoved, moved.length)), scrollIntoView: true, userEvent: 'move.line' });
    return true;
  };
}
