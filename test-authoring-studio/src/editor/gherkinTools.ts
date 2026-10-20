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

/**
 * Extract Background: the Given steps every scenario starts with move into the Background (created when there is
 * none). A scenario left starting with And / But gets Given.
 */
export function extractBackground(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  const heads: number[] = [];
  for (let n = 1; n <= doc.lines; n++) if (SCENARIO.test(doc.line(n).text)) heads.push(n);
  if (heads.length < 2) return false;
  const stepsOf = (head: number) => { const out: number[] = []; for (let k = head + 1; k <= doc.lines; k++) { const t = doc.line(k).text; if (!t.trim()) continue; if (!STEP.test(t)) break; out.push(k); } return out; };
  const lists = heads.map(stepsOf);
  const text = (n: number) => doc.line(n).text.trim();
  let n = 0;
  for (;;) {
    if (!lists.every((l) => l.length > n && text(l[n]) === text(lists[0][n]))) break;
    const kw = STEP.exec(doc.line(lists[0][n]).text)![2];
    if (n === 0 ? kw !== 'Given' : !['Given', 'And', 'But'].includes(kw)) break;
    n++;
  }
  if (!n) return false;
  const changes: ChangeSpec[] = [];
  for (const l of lists) {
    for (const k of l.slice(0, n)) changes.push({ from: doc.line(k).from, to: Math.min(doc.length, doc.line(k).to + state.lineBreak.length) });
    const next = l[n];
    if (next !== undefined) { const m = /^(\s*)(And|But)(?=\s)/.exec(doc.line(next).text); if (m) changes.push({ from: doc.line(next).from + m[1].length, to: doc.line(next).from + m[0].length, insert: 'Given' }); }
  }
  const moved = lists[0].slice(0, n).map((k) => doc.line(k).text);
  let bg = 0;
  for (let k = 1; k < heads[0]; k++) if (/^\s*Background:/.test(doc.line(k).text)) bg = k;
  if (bg) {
    const own = stepsOf(bg);
    const last = own.length ? own[own.length - 1] : bg;
    if (own.length) moved[0] = moved[0].replace(/^(\s*)Given/, '$1And');
    changes.push({ from: doc.line(last).to, insert: state.lineBreak + moved.join(state.lineBreak) });
  } else {
    const first = scenarioBlock(state, heads[0])!.first;
    const indent = /^\s*/.exec(doc.line(heads[0]).text)![0];
    changes.push({ from: doc.line(first).from, insert: `${indent}Background:${state.lineBreak}${moved.join(state.lineBreak)}${state.lineBreak}${state.lineBreak}` });
  }
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}

/** Add Examples Table: a Scenario Outline without Examples gets one with a column per <parameter> and an empty row. */
export function addExamplesTable(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  const b = scenarioBlock(state, doc.lineAt(state.selection.main.head).number);
  if (!b || !/^\s*Scenario (Outline|Template):/.test(doc.line(b.head).text) || examplesTables(state, b).length) return false;
  const params: string[] = [];
  for (let n = b.head; n <= b.end; n++) for (const m of doc.line(n).text.matchAll(/<([^<>\s][^<>]*)>/g)) if (!params.includes(m[1])) params.push(m[1]);
  if (!params.length) return false;
  const stepLine = Array.from({ length: b.end - b.head }, (_, i) => doc.line(b.head + 1 + i).text).find((t) => STEP.test(t));
  const indent = stepLine ? /^\s*/.exec(stepLine)![0] : `${/^\s*/.exec(doc.line(b.head).text)![0]}  `;
  const rows = alignTable([`${indent}  | ${params.join(' | ')} |`, `${indent}  | ${params.map(() => '').join(' | ')} |`]);
  const insert = `${state.lineBreak}${state.lineBreak}${indent}Examples:${state.lineBreak}${rows.join(state.lineBreak)}`;
  const at = doc.line(b.end).to;
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + insert.length - rows[1].length + cellStart(rows[1], 1) }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

/** Toggle Tag: adds the tag to the scenario at the caret, or removes it when it is there. */
export function toggleTag(tag: string) {
  return (view: EditorView) => {
    const { state } = view;
    const doc = state.doc;
    const t = tag.startsWith('@') ? tag : `@${tag}`;
    if (!/^@[^\s@]+$/.test(t)) return false;
    const b = scenarioBlock(state, doc.lineAt(state.selection.main.head).number);
    if (!b) return false;
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (let n = b.first; n < b.head; n++) {
      const line = doc.line(n);
      const m = new RegExp(`(^|\\s)${esc}(?=\\s|$)`).exec(line.text);
      if (!m) continue;
      const rest = (line.text.slice(0, m.index) + line.text.slice(m.index + m[0].length)).trimEnd();
      view.dispatch(rest.trim() ? { changes: { from: line.from, to: line.to, insert: rest }, userEvent: 'delete' } : { changes: { from: line.from, to: Math.min(doc.length, line.to + state.lineBreak.length) }, userEvent: 'delete' });
      return true;
    }
    if (b.first < b.head) { const last = doc.line(b.head - 1); view.dispatch({ changes: { from: last.to, insert: ` ${t}` }, userEvent: 'input' }); }
    else { const head = doc.line(b.head); view.dispatch({ changes: { from: head.from, insert: `${/^\s*/.exec(head.text)![0]}${t}${state.lineBreak}` }, userEvent: 'input' }); }
    return true;
  };
}

/** Comment / Uncomment Scenario: `# ` before every line of the scenario (tags and Examples too), or off again. */
export function toggleScenarioComment(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  const head = doc.lineAt(state.selection.main.head).number;
  // An already commented scenario: the commented lines around the caret.
  const commented = (n: number) => /^\s*#/.test(doc.line(n).text);
  if (commented(head)) {
    let a = head, b = head;
    while (a > 1 && commented(a - 1)) a--;
    while (b < doc.lines && commented(b + 1)) b++;
    const changes: ChangeSpec[] = [];
    for (let n = a; n <= b; n++) { const line = doc.line(n); const m = /^(\s*)# ?/.exec(line.text)!; changes.push({ from: line.from + m[1].length, to: line.from + m[0].length }); }
    view.dispatch({ changes, userEvent: 'input' });
    return true;
  }
  const blk = scenarioBlock(state, head);
  if (!blk) return false;
  const changes: ChangeSpec[] = [];
  for (let n = blk.first; n <= blk.end; n++) { const line = doc.line(n); if (!line.text.trim()) continue; changes.push({ from: line.from + /^\s*/.exec(line.text)![0].length, insert: '# ' }); }
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}

/** Cells of pasted spreadsheet text: tab-separated (Excel, Google Sheets), else CSV with "quoted" cells. */
export function parseDelimited(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
  if (lines.some((l) => l.includes('\t'))) return lines.map((l) => l.split('\t').map((c) => c.trim()));
  return lines.map((l) => {
    const cells: string[] = [];
    let cur = '', quoted = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (quoted) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c; }
      else if (c === '"' && !cur.trim()) quoted = true;
      else if (c === ',') { cells.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    cells.push(cur.trim());
    return cells;
  });
}
/** Paste as Gherkin Table: spreadsheet text becomes an aligned table on the caret's line (or below a step). */
export function pasteAsTable(text: string) {
  return (view: EditorView) => {
    const rows = parseDelimited(text).filter((r) => r.some((c) => c));
    if (!rows.length) return false;
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    const blank = !line.text.trim();
    const indent = blank ? /^\s*/.exec(line.text)![0] : `${/^\s*/.exec(line.text)![0]}  `;
    const table = alignTable(rows.map((r) => `${indent}| ${r.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`)).join(state.lineBreak);
    view.dispatch(blank ? { changes: { from: line.from, to: line.to, insert: table }, userEvent: 'input.paste' } : { changes: { from: line.to, insert: state.lineBreak + table }, userEvent: 'input.paste' });
    return true;
  };
}

/** Copy Table as CSV: the table at the caret, cells quoted when they need it. */
export function tableCsv(state: EditorState) {
  const t = tableAt(state);
  if (!t) return undefined;
  const cell = (c: string) => { const v = c.replace(/\\\|/g, '|'); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
  return t.rows.map((r) => r.map(cell).join(',')).join('\n');
}

/** Feature statistics (status bar): scenarios (an outline counts its example rows too) and steps. */
export function featureStats(text: string) {
  let scenarios = 0, steps = 0, examples = 0, inExamples = false, header = false;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (SCENARIO.test(line)) { scenarios++; inExamples = false; }
    else if (/^(Examples|Scenarios):/.test(t)) { inExamples = true; header = true; }
    else if (STEP.test(line)) steps++;
    else if (inExamples && t.startsWith('|')) { if (header) header = false; else examples++; }
    else if (t && !t.startsWith('#') && !t.startsWith('@')) inExamples = false;
  }
  return { scenarios, steps, examples };
}

/** The Examples parameter at a position: a <name> in a step or title, or a header cell of an Examples table. */
export function paramAt(state: EditorState, pos: number) {
  const line = state.doc.lineAt(pos);
  const col = pos - line.from;
  for (const m of line.text.matchAll(/<([^<>\s][^<>]*)>/g)) if (col >= m.index! && col <= m.index! + m[0].length) return m[1];
  const b = scenarioBlock(state, line.number);
  if (!b) return undefined;
  for (const rows of examplesTables(state, b)) if (rows[0] === line.number) return splitRow(line.text)[Math.max(0, cellAt(line.text, col) - 1)];
  return undefined;
}
/** Rename Examples Parameter (Rider's rename for Gherkin): <name> in the outline's steps and title, and the column header. */
export function renameExamplesParameter(to: string) {
  return (view: EditorView) => {
    const { state } = view;
    const doc = state.doc;
    const next = to.trim().replace(/^<|>$/g, '');
    if (!next || /[<>|]/.test(next)) return false;
    const head = state.selection.main.head;
    const name = paramAt(state, head);
    const b = scenarioBlock(state, doc.lineAt(head).number);
    if (!name || !b || !/^\s*Scenario (Outline|Template):/.test(doc.line(b.head).text) || name === next) return false;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tables = examplesTables(state, b);
    const inTable = new Set(tables.flat());
    const changes: ChangeSpec[] = [];
    for (let n = b.head; n <= b.end; n++) {
      if (inTable.has(n)) continue;
      const line = doc.line(n);
      const t = line.text.replace(new RegExp(`<${esc}>`, 'g'), `<${next}>`);
      if (t !== line.text) changes.push({ from: line.from, to: line.to, insert: t });
    }
    for (const rows of tables) {
      const cells = rows.map((n) => splitRow(doc.line(n).text));
      if (!cells[0].includes(name)) continue;
      cells[0] = cells[0].map((c) => (c === name ? next : c));
      const indent = /^\s*/.exec(doc.line(rows[0]).text)![0];
      changes.push({ from: doc.line(rows[0]).from, to: doc.line(rows[rows.length - 1]).to, insert: alignTable(cells.map((r) => `${indent}| ${r.join(' | ')} |`)).join(state.lineBreak) });
    }
    if (!changes.length) return false;
    view.dispatch({ changes, userEvent: 'input' });
    return true;
  };
}

/** Remove Unused Examples Columns: columns no <parameter> of the outline uses go from every Examples table. */
export function removeUnusedColumns(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  const b = scenarioBlock(state, doc.lineAt(state.selection.main.head).number);
  if (!b || !/^\s*Scenario (Outline|Template):/.test(doc.line(b.head).text)) return false;
  const tables = examplesTables(state, b);
  const inTable = new Set(tables.flat());
  const used = new Set<string>();
  for (let n = b.head; n <= b.end; n++) if (!inTable.has(n)) for (const m of doc.line(n).text.matchAll(/<([^<>\s][^<>]*)>/g)) used.add(m[1]);
  const changes: ChangeSpec[] = [];
  for (const rows of tables) {
    const cells = rows.map((n) => splitRow(doc.line(n).text));
    const keep = cells[0].map((c, k) => (used.has(c) ? k : -1)).filter((k) => k >= 0);
    if (keep.length === cells[0].length || !keep.length) continue;
    const indent = /^\s*/.exec(doc.line(rows[0]).text)![0];
    changes.push({ from: doc.line(rows[0]).from, to: doc.line(rows[rows.length - 1]).to, insert: alignTable(cells.map((r) => `${indent}| ${keep.map((k) => r[k] ?? '').join(' | ')} |`)).join(state.lineBreak) });
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: 'delete' });
  return true;
}

/** Inline Background: its steps move to the start of every scenario (a scenario starting with Given then says And). */
export function inlineBackground(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  let bg = 0;
  for (let n = 1; n <= doc.lines; n++) { if (/^\s*Background:/.test(doc.line(n).text)) { bg = n; break; } if (SCENARIO.test(doc.line(n).text)) break; }
  if (!bg) return false;
  const steps: number[] = [];
  let k = bg + 1;
  for (; k <= doc.lines; k++) { const t = doc.line(k).text; if (!t.trim()) continue; if (!STEP.test(t)) break; steps.push(k); }
  const heads: number[] = [];
  for (let n = bg + 1; n <= doc.lines; n++) if (SCENARIO.test(doc.line(n).text)) heads.push(n);
  if (!steps.length || !heads.length) return false;
  const lines = steps.map((n) => doc.line(n).text);
  const changes: ChangeSpec[] = [];
  // The Background, its steps and the blank lines after them.
  let end = steps[steps.length - 1];
  while (end + 1 <= doc.lines && !doc.line(end + 1).text.trim()) end++;
  changes.push({ from: doc.line(bg).from, to: Math.min(doc.length, doc.line(end).to + state.lineBreak.length) });
  for (const h of heads) {
    changes.push({ from: doc.line(h).to, insert: state.lineBreak + lines.join(state.lineBreak) });
    for (let n = h + 1; n <= doc.lines; n++) {
      const t = doc.line(n).text;
      if (!t.trim()) continue;
      const m = /^(\s*)Given(?=\s)/.exec(t);
      if (m) changes.push({ from: doc.line(n).from + m[1].length, to: doc.line(n).from + m[0].length, insert: 'And' });
      break;
    }
  }
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}

/**
 * Normalize Step Keywords (the usual Gherkin style): a step repeating the keyword of the step before it says And, and
 * a scenario's first step never says And / But (it gets the keyword the steps it follows had, else Given).
 */
export function normalizeStepKeywords(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  const sel = state.selection.main;
  const first = sel.empty ? 1 : doc.lineAt(sel.from).number, last = sel.empty ? doc.lines : doc.lineAt(sel.to).number;
  const changes: ChangeSpec[] = [];
  let effective = '';
  for (let n = first; n <= last; n++) {
    const line = doc.line(n);
    if (SCENARIO.test(line.text) || /^\s*(Background|Rule|Feature|Examples|Scenarios):/.test(line.text)) { effective = ''; continue; }
    const m = STEP.exec(line.text);
    if (!m) continue;
    const kw = m[2];
    let next = kw;
    if (kw === 'And' || kw === 'But') { if (!effective) next = 'Given'; }
    else if (kw === effective) next = 'And';
    if (next !== 'And' && next !== 'But') effective = next;
    if (next !== kw) changes.push({ from: line.from + m[1].length, to: line.from + m[1].length + kw.length, insert: next });
  }
  if (!changes.length) return false;
  view.dispatch({ changes, userEvent: 'input' });
  return true;
}

/** Add Scenario: a new scenario after the one at the caret (else at the end), the caret on its title. */
export function addScenario(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  const b = scenarioBlock(state, doc.lineAt(state.selection.main.head).number);
  const at = b ? doc.line(b.end).to : doc.length;
  const indent = b ? /^\s*/.exec(doc.line(b.head).text)![0] : '  ';
  const lb = state.lineBreak;
  const before = at > 0 && doc.sliceString(at - 1, at) !== '\n' ? `${lb}${lb}` : at > 0 ? lb : '';
  const insert = `${before}${indent}Scenario: ${lb}${indent}  Given `;
  view.dispatch({ changes: { from: at, insert }, selection: { anchor: at + before.length + indent.length + 'Scenario: '.length }, scrollIntoView: true, userEvent: 'input' });
  return true;
}

/** Copy Scenario as Markdown (test reports, tickets): title, tags, steps as a list, tables as Markdown tables. */
export function scenarioMarkdown(state: EditorState, lineNo: number) {
  const b = scenarioBlock(state, lineNo);
  if (!b) return undefined;
  const doc = state.doc;
  const out: string[] = [];
  const tags = Array.from({ length: b.head - b.first }, (_, i) => doc.line(b.first + i).text.trim()).join(' ');
  out.push(`### ${doc.line(b.head).text.trim()}`);
  if (tags) out.push('', `_${tags}_`);
  out.push('');
  let table: string[][] = [];
  const flush = () => { if (!table.length) return; out.push('', `| ${table[0].join(' | ')} |`, `|${table[0].map(() => ' --- |').join('')}`, ...table.slice(1).map((r) => `| ${r.join(' | ')} |`), ''); table = []; };
  let fence = false;
  for (let n = b.head + 1; n <= b.end; n++) {
    const t = doc.line(n).text.trim();
    if (t.startsWith('\"\"\"') || t.startsWith('```')) { flush(); out.push('```'); fence = !fence; continue; }
    if (fence) { out.push(doc.line(n).text.replace(/^\s{0,6}/, '')); continue; }
    if (t.startsWith('|')) { table.push(splitRow(t)); continue; }
    flush();
    const m = /^(Given|When|Then|And|But)\s+(.*)$/.exec(t);
    if (m) out.push(`- **${m[1]}** ${m[2]}`);
    else if (/^(Examples|Scenarios):/.test(t)) out.push('', `#### ${t.replace(/:$/, '')}`);
    else if (t && !t.startsWith('#')) out.push(t);
  }
  flush();
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Table ▸ Duplicate Row: a copy of the caret's row below it. */
export function tableDuplicateRow(view: EditorView) {
  const t = tableAt(view.state);
  if (!t) return false;
  const rows = [...t.rows];
  rows.splice(t.row + 1, 0, [...t.rows[t.row]]);
  return writeTable(view, t, rows, t.row + 1, t.col);
}

/** Table ▸ Delete Row: removes the caret's row (not the table's only row). */
export function tableDeleteRow(view: EditorView) {
  const t = tableAt(view.state);
  if (!t || t.rows.length < 2) return false;
  const rows = t.rows.filter((_, i) => i !== t.row);
  return writeTable(view, t, rows, Math.min(t.row, rows.length - 1), t.col);
}

/** Table ▸ Move Column Left / Right: swaps the caret's column with its neighbour in every row. */
export function tableMoveColumn(dir: 1 | -1) {
  return (view: EditorView) => {
    const t = tableAt(view.state);
    if (!t) return false;
    const to = t.col + dir;
    if (to < 0 || to >= t.cols) return false;
    const rows = t.rows.map((r) => { const c = [...r, ...Array<string>(Math.max(0, t.cols - r.length)).fill('')]; [c[t.col], c[to]] = [c[to], c[t.col]]; return c; });
    return writeTable(view, t, rows, t.row, to);
  };
}

/** Table ▸ Select Column: every cell of the caret's column selected (multiple carets), to edit them together. */
export function tableSelectColumn(view: EditorView) {
  const t = tableAt(view.state);
  if (!t) return false;
  const ranges = [];
  for (let n = t.from; n <= t.to; n++) {
    const line = view.state.doc.line(n);
    const start = cellStart(line.text, t.col + 1);
    let end = start;
    for (; end < line.text.length && line.text[end] !== '|'; end++) if (line.text[end] === '\\') end++;
    while (end > start && line.text[end - 1] === ' ') end--;
    ranges.push(EditorSelection.range(line.from + start, line.from + end));
  }
  view.dispatch({ selection: EditorSelection.create(ranges, t.row) });
  return true;
}

/** Table ▸ Transpose: rows become columns (a horizontal table vertical, and back). */
export function tableTranspose(view: EditorView) {
  const t = tableAt(view.state);
  if (!t) return false;
  const rows = Array.from({ length: t.cols }, (_, c) => t.rows.map((r) => r[c] ?? ''));
  return writeTable(view, t, rows, Math.min(t.col, rows.length - 1), Math.min(t.row, t.rows.length - 1));
}

/** Table ▸ Fill Down: the caret's cell gets the value of the cell above (a selection over rows: all of them). */
export function tableFillDown(view: EditorView) {
  const t = tableAt(view.state);
  if (!t) return false;
  const sel = view.state.selection.main;
  const first = Math.max(t.from, view.state.doc.lineAt(sel.from).number) - t.from;
  const last = Math.min(t.to, view.state.doc.lineAt(sel.to).number) - t.from;
  if (first < 1) return false;
  const rows = t.rows.map((r) => [...r]);
  const value = rows[first - 1][t.col] ?? '';
  for (let r = first; r <= Math.max(first, last); r++) { while (rows[r].length <= t.col) rows[r].push(''); rows[r][t.col] = value; }
  return writeTable(view, t, rows, first, t.col);
}

/** Table ▸ Clear Column: empties the caret's column under the header. */
export function tableClearColumn(view: EditorView) {
  const t = tableAt(view.state);
  if (!t || t.rows.length < 2) return false;
  const rows = t.rows.map((r, i) => (i === 0 ? r : r.map((c, k) => (k === t.col ? '' : c))));
  return writeTable(view, t, rows, Math.max(1, t.row), t.col);
}

/** Sort Scenarios by Name: the scenarios (with their tags and Examples) in title order, the Background first. */
export function sortScenarios(view: EditorView) {
  const { state } = view;
  const doc = state.doc;
  if (/^\s*Rule:/m.test(doc.toString())) return false;
  const blocks: { first: number; end: number; title: string }[] = [];
  for (let n = 1; n <= doc.lines; n++) {
    if (!SCENARIO.test(doc.line(n).text)) continue;
    const b = scenarioBlock(state, n)!;
    blocks.push({ first: b.first, end: b.end, title: doc.line(b.head).text.replace(/^\s*[^:]*:\s*/, '') });
    n = b.end;
  }
  if (blocks.length < 2) return false;
  const c = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const sorted = [...blocks].sort((a, b) => c.compare(a.title, b.title));
  if (sorted.every((b, i) => b === blocks[i])) return false;
  const text = (b: { first: number; end: number }) => doc.sliceString(doc.line(b.first).from, doc.line(b.end).to);
  const from = doc.line(blocks[0].first).from, to = doc.line(blocks[blocks.length - 1].end).to;
  view.dispatch({ changes: { from, to, insert: sorted.map(text).join(state.lineBreak + state.lineBreak) }, userEvent: 'input' });
  return true;
}

/** Copy Feature Outline: the feature and its scenarios as a Markdown checklist (test plans, reviews). */
export function featureOutline(text: string) {
  const out: string[] = [];
  let tags = '';
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('@')) { tags = t; continue; }
    const f = /^Feature:\s*(.*)$/.exec(t);
    if (f) { out.push(`## ${f[1]}${tags ? ` _${tags}_` : ''}`, ''); tags = ''; continue; }
    const r = /^Rule:\s*(.*)$/.exec(t);
    if (r) { out.push('', `### ${r[1]}`, ''); tags = ''; continue; }
    if (SCENARIO.test(line)) { out.push(`- [ ] ${t.replace(/^[^:]*:\s*/, '')}${/Outline|Template/.test(t) ? ' (outline)' : ''}${tags ? ` _${tags}_` : ''}`); tags = ''; continue; }
    if (t && !t.startsWith('#')) tags = '';
  }
  return out.join('\n').trim();
}

/** Table ▸ Delete Empty Rows: data rows whose cells are all empty go (the header stays). */
export function tableDeleteEmptyRows(view: EditorView) {
  const t = tableAt(view.state);
  if (!t) return false;
  const rows = t.rows.filter((r, i) => i === 0 || r.some((c) => c.trim()));
  if (rows.length === t.rows.length) return false;
  return writeTable(view, t, rows, Math.min(t.row, rows.length - 1), t.col);
}
