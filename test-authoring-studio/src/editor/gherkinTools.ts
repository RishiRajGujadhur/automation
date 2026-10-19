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

/** The table around the caret: its line range, the caret's row and column, and the cells. */
function tableAt(state: EditorState) {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  if (!line.text.trim().startsWith('|')) return undefined;
  const { from, to } = block(state, line.number);
  const rows: string[][] = [];
  for (let n = from; n <= to; n++) rows.push(splitRow(state.doc.line(n).text));
  return { from, to, row: line.number - from, col: Math.max(0, cellAt(line.text, head - line.from) - 1), cols: Math.max(...rows.map((r) => r.length)), indent: /^\s*/.exec(state.doc.line(from).text)![0], rows };
}
type Table = NonNullable<ReturnType<typeof tableAt>>;
/** Writes the rows back aligned, with the caret at the start of cell (row, col). */
function writeTable(view: EditorView, t: Table, rows: string[][], row: number, col: number) {
  const { state } = view;
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const aligned = alignTable(rows.map((r) => `${t.indent}| ${Array.from({ length: cols }, (_, k) => r[k] ?? '').join(' | ')} |`));
  const start = state.doc.line(t.from).from;
  const rowStart = start + aligned.slice(0, row).reduce((n, r) => n + r.length + state.lineBreak.length, 0);
  view.dispatch({ changes: { from: start, to: state.doc.line(t.to).to, insert: aligned.join(state.lineBreak) }, selection: EditorSelection.cursor(rowStart + cellStart(aligned[row], col + 1)), userEvent: 'input.format' });
  return true;
}

/** Table ▸ Insert Row: an empty row below the caret's row, the caret in its first cell. */
export function tableInsertRow(view: EditorView) {
  const t = tableAt(view.state);
  if (!t) return false;
  const rows = [...t.rows];
  rows.splice(t.row + 1, 0, Array<string>(t.cols).fill(''));
  return writeTable(view, t, rows, t.row + 1, 0);
}

/** Table ▸ Add Column: an empty column after the caret's column, the caret in its header cell. */
export function tableAddColumn(view: EditorView) {
  const t = tableAt(view.state);
  if (!t) return false;
  const rows = t.rows.map((r) => { const c = [...r, ...Array<string>(Math.max(0, t.cols - r.length)).fill('')]; c.splice(t.col + 1, 0, ''); return c; });
  return writeTable(view, t, rows, 0, t.col + 1);
}

/** Table ▸ Delete Column: removes the caret's column from every row (not the last column). */
export function tableDeleteColumn(view: EditorView) {
  const t = tableAt(view.state);
  if (!t || t.cols < 2) return false;
  const rows = t.rows.map((r) => r.filter((_, k) => k !== t.col));
  return writeTable(view, t, rows, t.row, Math.min(t.col, t.cols - 2));
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/** Table ▸ Sort by Column: the rows under the header, by the caret's column (natural order); again for descending. */
export function tableSortByColumn(view: EditorView) {
  const t = tableAt(view.state);
  if (!t || t.rows.length < 3) return false;
  const body = t.rows.slice(1);
  const asc = [...body].sort((a, b) => collator.compare(a[t.col] ?? '', b[t.col] ?? ''));
  const sorted = asc.every((r, i) => r === body[i]) ? asc.reverse() : asc;
  return writeTable(view, t, [t.rows[0], ...sorted], 0, t.col);
}

/** SpecFlow / Reqnroll's generated identifiers: words in PascalCase, other characters dropped. */
export const toIdentifier = (title: string) => { const id = title.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(''); return /^\d/.test(id) ? `_${id}` : id; };
/** A `dotnet test --filter` for the scenario at a line (the feature's tests above the first scenario). */
export function testFilter(state: EditorState, lineNo: number) {
  const feature = /^\s*Feature:\s*(.*)$/m.exec(state.doc.toString())?.[1].trim();
  if (!feature) return undefined;
  const b = scenarioBlock(state, lineNo);
  const title = b && /:\s*(.*)$/.exec(state.doc.line(b.head).text)![1].trim();
  return `dotnet test --filter "FullyQualifiedName~${toIdentifier(feature)}Feature${title ? `.${toIdentifier(title)}` : ''}"`;
}

/** Select Scenario: its tags, keyword line, steps and Examples. */
export function selectScenario(view: EditorView) {
  const { state } = view;
  const b = scenarioBlock(state, state.doc.lineAt(state.selection.main.head).number);
  if (!b) return false;
  view.dispatch({ selection: EditorSelection.range(state.doc.line(b.first).from, state.doc.line(b.end).to), scrollIntoView: true });
  return true;
}

/** Rename Tag: the tag on tag lines only (descriptions and steps keep the text), line endings kept. */
export function renameTag(source: string, from: string, to: string) {
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(^|\\s)${esc}(?=\\s|$)`, 'g');
  return source.split(/(\r?\n)/).map((part) => (/^\s*@/.test(part) ? part.replace(re, `$1${to}`) : part)).join('');
}

/** The Examples tables of a scenario block: line numbers of each table's rows (header first). */
function examplesTables(state: EditorState, b: { head: number; end: number }) {
  const tables: number[][] = [];
  for (let n = b.head + 1; n <= b.end; n++) {
    if (!/^\s*(Examples|Scenarios):/.test(state.doc.line(n).text)) continue;
    const rows: number[] = [];
    let k = n + 1;
    while (k <= b.end && !state.doc.line(k).text.trim()) k++;
    for (; k <= b.end && state.doc.line(k).text.trim().startsWith('|'); k++) rows.push(k);
    if (rows.length) tables.push(rows);
  }
  return tables;
}
/**
 * Extract Examples Parameter: the selected text of a Scenario Outline step becomes <name>, and every Examples table
 * gets a `name` column holding that text.
 */
export function extractExamplesParameter(name: string) {
  return (view: EditorView) => {
    const { state } = view;
    const sel = state.selection.main;
    const line = state.doc.lineAt(sel.from);
    if (sel.empty || state.doc.lineAt(sel.to).number !== line.number || !STEP.test(line.text) || !/^[\w-]+$/.test(name)) return false;
    const b = scenarioBlock(state, line.number);
    if (!b || !/^\s*Scenario (Outline|Template):/.test(state.doc.line(b.head).text)) return false;
    const tables = examplesTables(state, b);
    if (!tables.length) return false;
    const value = state.sliceDoc(sel.from, sel.to).replace(/\|/g, '\\|');
    const changes: ChangeSpec[] = [{ from: sel.from, to: sel.to, insert: `<${name}>` }];
    for (const rows of tables) {
      const cells = rows.map((n, i) => [...splitRow(state.doc.line(n).text), i === 0 ? name : value]);
      const indent = /^\s*/.exec(state.doc.line(rows[0]).text)![0];
      const aligned = alignTable(cells.map((r) => `${indent}| ${r.join(' | ')} |`));
      changes.push({ from: state.doc.line(rows[0]).from, to: state.doc.line(rows[rows.length - 1]).to, insert: aligned.join(state.lineBreak) });
    }
    view.dispatch({ changes, selection: { anchor: sel.from + 1, head: sel.from + 1 + name.length }, userEvent: 'input' });
    return true;
  };
}

/** Convert Outline to Scenario: an outline with one Examples row becomes a plain Scenario with the values filled in. */
export function outlineToScenario(view: EditorView) {
  const { state } = view;
  const b = scenarioBlock(state, state.doc.lineAt(state.selection.main.head).number);
  if (!b || !/^\s*Scenario (Outline|Template):/.test(state.doc.line(b.head).text)) return false;
  const tables = examplesTables(state, b);
  if (tables.length !== 1 || tables[0].length !== 2) return false;
  const header = splitRow(state.doc.line(tables[0][0]).text), row = splitRow(state.doc.line(tables[0][1]).text);
  const fill = (t: string) => t.replace(/<([^<>]+)>/g, (m, k: string) => { const i = header.indexOf(k); return i >= 0 ? (row[i] ?? '').replace(/\\\|/g, '|') : m; });
  let last = b.end;
  const lines: string[] = [];
  for (let n = b.head; n <= b.end; n++) {
    const t = state.doc.line(n).text;
    if (/^\s*(Examples|Scenarios):/.test(t)) { last = n; break; }
    lines.push(n === b.head ? fill(t.replace(/Scenario (Outline|Template):/, 'Scenario:')) : fill(t));
  }
  while (lines.length > 1 && !lines[lines.length - 1].trim()) lines.pop();
  view.dispatch({ changes: { from: state.doc.line(b.head).from, to: state.doc.line(last === b.end ? b.end : b.end).to, insert: lines.join(state.lineBreak) }, userEvent: 'input' });
  return true;
}

/** Duplicate Scenario: a copy (tags, steps, Examples) below, titled "… (copy)", the caret on its title. */
export function duplicateScenario(view: EditorView) {
  const { state } = view;
  const b = scenarioBlock(state, state.doc.lineAt(state.selection.main.head).number);
  if (!b) return false;
  const lines: string[] = [];
  for (let n = b.first; n <= b.end; n++) lines.push(n === b.head ? state.doc.line(n).text.replace(/\s*$/, ' (copy)') : state.doc.line(n).text);
  const at = state.doc.line(b.end).to;
  const insert = state.lineBreak + state.lineBreak + lines.join(state.lineBreak);
  const title = at + state.lineBreak.length * 2 + lines.slice(0, b.head - b.first).reduce((n, l) => n + l.length + state.lineBreak.length, 0);
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: title + /^\s*/.exec(lines[b.head - b.first])![0].length }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

/** Move Scenario Up / Down (Rider's Move Statement for Gherkin): swaps the scenario (tags, Examples) with its neighbour. */
export function moveScenario(dir: 1 | -1) {
  return (view: EditorView) => {
    const { state } = view;
    const doc = state.doc;
    const head = state.selection.main.head;
    const cur = scenarioBlock(state, doc.lineAt(head).number);
    if (!cur) return false;
    let other: ReturnType<typeof scenarioBlock>;
    if (dir < 0) {
      let k = cur.first - 1;
      while (k >= 1 && !doc.line(k).text.trim()) k--;
      other = k >= 1 ? scenarioBlock(state, k) : undefined;
      if (!other || other.end >= cur.first) return false;
    } else {
      let k = cur.end + 1;
      while (k <= doc.lines && (!doc.line(k).text.trim() || /^\s*@/.test(doc.line(k).text))) k++;
      if (k > doc.lines || !SCENARIO.test(doc.line(k).text)) return false;
      other = scenarioBlock(state, k);
      if (!other) return false;
    }
    const [a, b] = dir < 0 ? [other, cur] : [cur, other];
    const from = doc.line(a.first).from, to = doc.line(b.end).to;
    const textA = doc.sliceString(from, doc.line(a.end).to);
    const gap = doc.sliceString(doc.line(a.end).to, doc.line(b.first).from);
    const textB = doc.sliceString(doc.line(b.first).from, to);
    const offset = head - doc.line(cur.first).from;
    const start = dir < 0 ? from : from + textB.length + gap.length;
    view.dispatch({ changes: { from, to, insert: textB + gap + textA }, selection: { anchor: start + offset }, scrollIntoView: true, userEvent: 'move.line' });
    return true;
  };
}
