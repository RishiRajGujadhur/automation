import { EditorSelection, Prec, type EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

const isRow = (text: string) => text.trim().startsWith('|');

/** Cells of a table row; `\|` is an escaped pipe inside a cell. */
export function splitRow(text: string): string[] {
  const t = text.trim().replace(/^\|/, '');
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '\\' && i + 1 < t.length) { cur += t[i] + t[i + 1]; i++; continue; }
    if (t[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += t[i];
  }
  if (cur.trim()) cells.push(cur.trim());
  return cells;
}

/** Aligned rows for a block of table lines, keeping the first row's indentation. */
export function alignTable(rows: string[], partial = -1): string[] {
  const indent = /^\s*/.exec(rows[0])![0];
  const cells = rows.map(splitRow);
  const cols = Math.max(...cells.map((r) => r.length));
  const widths = Array.from({ length: cols }, (_, k) => Math.max(...cells.map((r) => (r[k] ?? '').length)));
  // The row being typed (`partial`) keeps its own cell count: no empty cells are added after the cursor.
  return cells.map((r, i) => `${indent}| ${widths.slice(0, i === partial ? Math.max(1, r.length) : cols).map((w, k) => (r[k] ?? '').padEnd(w)).join(' | ')} |`);
}

function block(state: EditorState, lineNo: number) {
  const doc = state.doc;
  let from = lineNo, to = lineNo;
  while (from > 1 && isRow(doc.line(from - 1).text)) from--;
  while (to < doc.lines && isRow(doc.line(to + 1).text)) to++;
  return { from, to };
}

/** Which cell the position is in: index of the pipe before it on its line, and the offset inside the cell text. */
function cellAt(text: string, col: number) {
  let pipes = 0;
  for (let i = 0; i < col && i < text.length; i++) { if (text[i] === '\\') { i++; continue; } if (text[i] === '|') pipes++; }
  return pipes;
}
/** Position just after the n-th pipe's following space (start of cell n), or the line end. */
function cellStart(text: string, n: number) {
  let pipes = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '|' && ++pipes === n) return Math.min(text.length, i + 2);
  }
  return text.length;
}

/** Re-aligns the table around the cursor, keeping the cursor in the same cell (after its text). */
function realign(view: EditorView, keepCell = true, typing = false) {
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  if (!isRow(line.text)) return false;
  const { from, to } = block(state, line.number);
  const rows: string[] = [];
  for (let n = from; n <= to; n++) rows.push(state.doc.line(n).text);
  const aligned = alignTable(rows, typing ? line.number - from : -1);
  const cell = cellAt(line.text, head - line.from);
  const inCell = line.text.slice(cellStart(line.text, cell), head - line.from).trim().length;
  const start = state.doc.line(from).from;
  const end = state.doc.line(to).to;
  const text = aligned.join(state.lineBreak);
  if (text === state.sliceDoc(start, end)) return false;
  const row = aligned[line.number - from];
  const rowStart = start + aligned.slice(0, line.number - from).reduce((n, r) => n + r.length + state.lineBreak.length, 0);
  const anchor = keepCell ? rowStart + Math.min(row.length, cellStart(row, cell) + inCell) : head;
  view.dispatch({ changes: { from: start, to: end, insert: text }, selection: EditorSelection.cursor(anchor), userEvent: 'input.format' });
  return true;
}

/** Tab / Shift+Tab: next or previous cell (aligning first); Tab in the last cell goes to the next row's first cell. */
function moveCell(dir: 1 | -1) {
  return (view: EditorView) => {
    const line0 = view.state.doc.lineAt(view.state.selection.main.head);
    if (!isRow(line0.text)) return false;
    realign(view);
    const { state } = view;
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    const cells = splitRow(line.text).length;
    let cell = cellAt(line.text, head - line.from) + dir;
    let target = line;
    if (cell > cells) { if (line.number < state.doc.lines && isRow(state.doc.line(line.number + 1).text)) { target = state.doc.line(line.number + 1); cell = 1; } else cell = cells; }
    if (cell < 1) { if (line.number > 1 && isRow(state.doc.line(line.number - 1).text)) { target = state.doc.line(line.number - 1); cell = splitRow(target.text).length; } else cell = 1; }
    // Select the cell's text (an empty cell puts the cursor at its start).
    const start = cellStart(target.text, cell);
    const value = splitRow(target.text)[cell - 1] ?? '';
    const s = target.from + start;
    view.dispatch({ selection: EditorSelection.range(s, s + value.length), scrollIntoView: true });
    return true;
  };
}

/** Gherkin table editing as in the SpecFlow / Reqnroll extensions: aligns when `|` is typed; Tab between cells. */
export function gherkinTables(): Extension {
  return [
    Prec.high(keymap.of([
      { key: 'Tab', run: moveCell(1) },
      { key: 'Shift-Tab', run: moveCell(-1) },
    ])),
    EditorView.updateListener.of((u) => {
      if (!u.docChanged || !u.transactions.some((t) => t.isUserEvent('input.type'))) return;
      let typedPipe = false;
      u.changes.iterChanges((_a, _b, _c, _d, ins) => { if (ins.toString() === '|') typedPipe = true; });
      if (!typedPipe) return;
      // Only when the pipe closes a cell at the end of the row (typing a new row is left alone until then).
      const head = u.state.selection.main.head;
      const line = u.state.doc.lineAt(head);
      if (line.text.slice(head - line.from).trim() || !splitRow(line.text).length) return;
      queueMicrotask(() => realign(u.view, true, true));
    }),
  ];
}
