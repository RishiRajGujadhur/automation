import { EditorSelection, type ChangeSpec, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { alignTable, block, cellAt, cellStart, splitRow } from './gherkinTables';

/** Gherkin editing tools (IDE-FEATURES.md): step keywords, scenario outlines, table rows / columns, test filters. */
const KEYWORDS = ['Given', 'When', 'Then', 'And', 'But'];
const STEP = /^(\s*)(Given|When|Then|And|But)(?=\s)/;

/** Cycle Step Keyword: Given → When → Then → And → But → Given on the caret's (or every selected) step line. */
export function cycleStepKeyword(view: EditorView) {
  const { state } = view;
  const changes: ChangeSpec[] = [];
  const seen = new Set<number>();
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const line = state.doc.line(n);
      const m = STEP.exec(line.text);
      if (!m) continue;
      const next = KEYWORDS[(KEYWORDS.indexOf(m[2]) + 1) % KEYWORDS.length];
      changes.push({ from: line.from + m[1].length, to: line.from + m[1].length + m[2].length, insert: next });
    }
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}

const SCENARIO = /^\s*(Scenario|Scenario Outline|Scenario Template|Example):/;
const BLOCK_START = /^\s*(@|(Scenario|Scenario Outline|Scenario Template|Example|Background|Rule|Feature):)/;
/** The scenario around a line: its keyword line and its last non-blank line (Examples included). */
export function scenarioBlock(state: EditorState, lineNo: number) {
  const doc = state.doc;
  let n = lineNo;
  for (; n >= 1; n--) {
    const t = doc.line(n).text;
    if (SCENARIO.test(t)) break;
    if (/^\s*(Background|Rule|Feature):/.test(t)) return undefined;
  }
  if (n < 1) return undefined;
  let end = n;
  for (let k = n + 1; k <= doc.lines && !BLOCK_START.test(doc.line(k).text); k++) end = k;
  while (end > n && !doc.line(end).text.trim()) end--;
  let first = n;
  while (first > 1 && /^\s*@/.test(doc.line(first - 1).text)) first--;
  return { head: n, first, end };
}

/**
 * Convert Scenario to Outline (Rider's Gherkin intention): the quoted values of the steps become <p1>, <p2>… and an
 * Examples table keeps them. Repeated values share a parameter.
 */
export function scenarioToOutline(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  const b = scenarioBlock(state, doc.lineAt(state.selection.main.head).number);
  if (!b || !/^\s*(Scenario|Example):/.test(doc.line(b.head).text)) return false;
  const values: string[] = [];
  const lines: string[] = [];
  for (let k = b.head + 1; k <= b.end; k++) {
    const t = doc.line(k).text;
    lines.push(STEP.test(t) ? t.replace(/"([^"]*)"/g, (_, v: string) => { if (!values.includes(v)) values.push(v); return `"<p${values.indexOf(v) + 1}>"`; }) : t);
  }
  if (!values.length) return false;
  const head = doc.line(b.head);
  const stepIndent = lines.find((l) => STEP.test(l))?.match(/^\s*/)![0] ?? `${/^\s*/.exec(head.text)![0]}  `;
  const table = alignTable([`${stepIndent}  | ${values.map((_, i) => `p${i + 1}`).join(' | ')} |`, `${stepIndent}  | ${values.map((v) => v.replace(/\|/g, '\\|')).join(' | ')} |`]);
  const text = [head.text.replace(/(Scenario|Example):/, 'Scenario Outline:'), ...lines, '', `${stepIndent}Examples:`, ...table].join(state.lineBreak);
  view.dispatch({ changes: { from: head.from, to: doc.line(b.end).to, insert: text }, selection: EditorSelection.cursor(head.from + /^\s*/.exec(head.text)![0].length), userEvent: 'input' });
  return true;
}
