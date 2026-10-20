import { EditorView, hoverTooltip, keymap } from '@codemirror/view';
import { api } from '../api';
import { EditorState, Prec, type Extension } from '@codemirror/state';
import { indentService } from '@codemirror/language';
import { featureOn } from '../features';
import { alignTable, block } from './gherkinTables';
import { tableInsertRow } from './gherkinTools';

/** Quality-of-life behaviour of the Gherkin editor (QOL-50.md). */
/** Smart indent: a line after Feature / Rule / Background / Scenario / Examples, or after a step ending in ":" (its table), is indented one more. */
export const gherkinIndent = indentService.of((ctx, pos) => {
  // The nearest non-blank line before this one (each step goes one line up, so this always ends).
  let line = ctx.lineAt(pos, -1);
  for (let guard = 0; !line.text.trim() && line.from > 0 && guard < 500; guard++) line = ctx.lineAt(line.from - 1, -1);
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
    // Only once the table has a data row: a header typed by hand ends with a plain new line.
    const b = block(view.state, line.number);
    if (b.to === b.from) return false;
    return tableInsertRow(view);
  },
}]));
/** Typing "|" in the first cell of an added empty row turns it back into a plain line (you are typing the row yourself). */
export const pipeInEmptyRow = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '|' || from !== to || !featureOn('table-enter')) return false;
  const line = view.state.doc.lineAt(from);
  if (!/^\s*\|[\s|]*\|\s*$/.test(line.text) || from - line.from !== line.text.indexOf('|') + 2) return false;
  const indent = /^\s*/.exec(line.text)![0];
  view.dispatch({ changes: { from: line.from, to: line.to, insert: `${indent}|` }, selection: { anchor: line.from + indent.length + 1 }, userEvent: 'input.type' });
  return true;
});
/** A lowercase keyword at the start of a line is capitalised as you finish it: "given " → "Given ", "scenario:" → "Scenario:" (QOL-50). */
const STEP_WORDS = /^(\s*)(given|when|then|and|but)$/;
const BLOCK_WORDS = /^(\s*)(feature|rule|background|scenario|scenario outline|scenario template|example|examples|scenarios)$/;
export const capitaliseKeywords = EditorView.inputHandler.of((view, from, to, text) => {
  if ((text !== ' ' && text !== ':') || from !== to || !featureOn('gherkin-capitalise')) return false;
  const line = view.state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);
  const m = (text === ' ' ? STEP_WORDS : BLOCK_WORDS).exec(before);
  if (!m) return false;
  const word = m[2][0].toUpperCase() + m[2].slice(1);
  view.dispatch({ changes: { from: line.from + m[1].length, to: from, insert: word + text }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
  return true;
});
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
/** Hovering a tag shows how many scenarios use it (Tags window data, fetched once a minute at most). */
let tagCache: { at: number; rows: Promise<{ tag: string; scenarios: unknown[] }[]> } | undefined;
const tagRows = () => { if (!tagCache || Date.now() - tagCache.at > 60_000) tagCache = { at: Date.now(), rows: api<{ tag: string; scenarios: unknown[] }[]>('/tags').catch(() => []) }; return tagCache.rows; };
export const tagHover = hoverTooltip(async (view, pos) => {
  if (!featureOn('tag-hover')) return null;
  const line = view.state.doc.lineAt(pos);
  if (!line.text.trim().startsWith('@')) return null;
  const col = pos - line.from;
  const m = [...line.text.matchAll(/@[^\s@]+/g)].find((x) => col >= x.index! && col <= x.index! + x[0].length);
  if (!m) return null;
  const row = (await tagRows()).find((r) => r.tag === m[0]);
  const n = row?.scenarios.length ?? 0;
  return { pos: line.from + m.index!, end: line.from + m.index! + m[0].length, above: true, create: () => { const dom = document.createElement('div'); dom.className = 'cm-tag-info'; dom.textContent = `${m[0]}: ${n} scenario${n === 1 ? '' : 's'} in the repository${row ? '' : ' (save to count this file)'}`; return { dom }; } };
});
// gherkin qol
/** "<" closes itself with ">" for Scenario Outline parameters (with the usual quotes and brackets) (QOL-50). */
const angleBrackets = Prec.high(EditorState.languageData.of(() => (featureOn('gherkin-angle') ? [{ closeBrackets: { brackets: ['(', '[', '{', '"', '<'] } }] : [])));
export const gherkinQol: Extension[] = [angleBrackets, tagHover, alignOnPaste, tableEnter, pipeInEmptyRow, gherkinIndent, capitaliseKeywords];
