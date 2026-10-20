import { EditorView, keymap } from '@codemirror/view';
import { Prec, type Extension } from '@codemirror/state';
import { indentService } from '@codemirror/language';
import { featureOn } from '../features';
import { alignTable, block } from './gherkinTables';
import { tableInsertRow } from './gherkinTools';

/** Quality-of-life behaviour of the Gherkin editor (QOL-50.md). */
/** Smart indent: a line after Feature / Rule / Background / Scenario / Examples, or after a step ending in ":" (its table), is indented one more. */
export const gherkinIndent = indentService.of((ctx, pos) => {
  let line = ctx.lineAt(pos, -1);
  while (!line.text.trim() && line.from > 0) line = ctx.lineAt(line.from, -1);
  const text = line.text;
  const ind = /^\s*/.exec(text)![0].replace(/\t/g, ' '.repeat(ctx.unit)).length;
  const t = text.trim();
  if (!featureOn('gherkin-indent')) return null;
  if (/^(Feature|Rule|Background|Scenario|Scenario Outline|Scenario Template|Example|Examples|Scenarios):/.test(t)) return ind + ctx.unit;
  if (/^(Given|When|Then|And|But)\b.*:$/.test(t)) return ind + ctx.unit;
  return ind;
});
/** Enter at the end of a table row adds an empty, aligned row (Shift+Enter: a plain new line). */
export const tableEnter = Prec.high(keymap.of([{
  key: 'Enter',
  run: (view) => {
    if (!featureOn('table-enter')) return false;
    const s = view.state.selection.main;
    if (!s.empty || view.state.selection.ranges.length > 1) return false;
    const line = view.state.doc.lineAt(s.head);
    if (!/^\s*\|.*\|\s*$/.test(line.text) || s.head < line.from + line.text.trimEnd().length) return false;
    return tableInsertRow(view);
  },
}]));
/** Pasted table rows are aligned with the table they land in. */
export const alignOnPaste = EditorView.updateListener.of((u) => {
  if (!featureOn('paste-align') || !u.docChanged || !u.transactions.some((t) => t.isUserEvent('input.paste'))) return;
  const lines = new Set<number>();
  u.changes.iterChangedRanges((_a, _b, from, to) => { for (let n = u.state.doc.lineAt(from).number; n <= u.state.doc.lineAt(to).number; n++) lines.add(n); });
  const view = u.view;
  setTimeout(() => {
    const st = view.state;
    const seen = new Set<number>();
    const changes: { from: number; to: number; insert: string }[] = [];
    for (const n of lines) {
      if (n > st.doc.lines || !st.doc.line(n).text.trim().startsWith('|')) continue;
      const b = block(st, n);
      if (seen.has(b.from)) continue;
      seen.add(b.from);
      const rows: string[] = [];
      for (let k = b.from; k <= b.to; k++) rows.push(st.doc.line(k).text);
      const text = alignTable(rows).join(st.lineBreak);
      const from = st.doc.line(b.from).from, to = st.doc.line(b.to).to;
      if (text !== st.sliceDoc(from, to)) changes.push({ from, to, insert: text });
    }
    if (changes.length) view.dispatch({ changes, userEvent: 'input.format' });
  });
});
// gherkin qol
export const gherkinQol: Extension[] = [alignOnPaste, tableEnter, gherkinIndent, ];
