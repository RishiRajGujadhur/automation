import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

/**
 * Surround With (Rider, Ctrl+Alt+J). Block templates wrap the selected lines (re-indented one level), inline ones the
 * selected text. `@` in a template marks the placeholder that is selected afterwards; `|` is where the code goes.
 */
type Template = { id: string; label: string; block: boolean; before: string; after: string };
const CS: Template[] = [
  { id: 'if', label: 'if', block: true, before: 'if (@condition)\n{', after: '}' },
  { id: 'ifelse', label: 'if … else', block: true, before: 'if (@condition)\n{', after: '}\nelse\n{\n}' },
  { id: 'while', label: 'while', block: true, before: 'while (@condition)\n{', after: '}' },
  { id: 'for', label: 'for', block: true, before: 'for (var i = 0; i < @count; i++)\n{', after: '}' },
  { id: 'foreach', label: 'foreach', block: true, before: 'foreach (var item in @items)\n{', after: '}' },
  { id: 'try', label: 'try … catch', block: true, before: 'try\n{', after: '}\ncatch (@Exception ex)\n{\n    throw;\n}' },
  { id: 'tryf', label: 'try … finally', block: true, before: 'try\n{', after: '}\nfinally\n{\n}' },
  { id: 'using', label: 'using', block: true, before: 'using (@resource)\n{', after: '}' },
  { id: 'lock', label: 'lock', block: true, before: 'lock (@this)\n{', after: '}' },
  { id: 'region', label: '#region', block: true, before: '#region @Region', after: '#endregion' },
  { id: 'braces', label: '{ }', block: true, before: '{', after: '}' },
  { id: 'parens', label: '( )', block: false, before: '(', after: ')' },
  { id: 'cast', label: '((Type)expr)', block: false, before: '((@Type)', after: ')' },
  { id: 'string', label: '"…"', block: false, before: '"', after: '"' },
];
const GHERKIN: Template[] = [
  { id: 'scenario', label: 'Scenario', block: true, before: 'Scenario: @name', after: '' },
  { id: 'outline', label: 'Scenario Outline', block: true, before: 'Scenario Outline: @name', after: '\nExamples:\n    | param |\n    | value |' },
  { id: 'rule', label: 'Rule', block: true, before: 'Rule: @rule', after: '' },
  { id: 'background', label: 'Background', block: true, before: 'Background:', after: '' },
  { id: 'docstring', label: 'Doc string ("""…""")', block: true, before: '"""', after: '"""' },
  { id: 'quotes', label: '"…" (step parameter)', block: false, before: '"', after: '"' },
  { id: 'angle', label: '<…> (outline parameter)', block: false, before: '<', after: '>' },
];
const GENERIC: Template[] = [
  { id: 'parens', label: '( )', block: false, before: '(', after: ')' },
  { id: 'string', label: '"…"', block: false, before: '"', after: '"' },
];

export const surroundTemplates = (file: string) => (file.endsWith('.cs') ? CS : file.endsWith('.feature') ? GHERKIN : GENERIC).map(({ id, label, block }) => ({ id, label, block }));

export function surroundWith(view: EditorView, file: string, id: string) {
  const list = file.endsWith('.cs') ? CS : file.endsWith('.feature') ? GHERKIN : GENERIC;
  const t = list.find((x) => x.id === id);
  if (!t) return;
  const st = view.state;
  const unit = file.endsWith('.feature') ? '  ' : '    ';
  const r = st.selection.main;
  const mark = (s: string) => ({ text: s.replace('@', ''), at: s.indexOf('@') });
  if (!t.block) {
    const span = r.empty ? (st.wordAt(r.head) ?? r) : r;
    const before = mark(t.before);
    const inner = st.sliceDoc(span.from, span.to);
    const insert = before.text + inner + t.after;
    const sel = before.at >= 0 ? EditorSelection.range(span.from + before.at, span.from + before.at + (/^\w+/.exec(before.text.slice(before.at))?.[0].length ?? 0)) : EditorSelection.cursor(span.from + insert.length);
    view.dispatch({ changes: { from: span.from, to: span.to, insert }, selection: sel, scrollIntoView: true, userEvent: 'input.surround' });
    return;
  }
  // Whole lines: from the first selected line to the last (a selection ending at a line start leaves that line out).
  const first = st.doc.lineAt(r.from);
  const last = st.doc.lineAt(r.to > r.from && st.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to);
  const lines = st.sliceDoc(first.from, last.to).split(/\r?\n/);
  const base = Math.min(...lines.filter((l) => l.trim()).map((l) => /^\s*/.exec(l)![0].length), Infinity);
  const pad = ' '.repeat(base === Infinity ? 0 : base);
  const nl = st.lineBreak;
  const head = mark(t.before);
  const headLines = head.text.split('\n').map((l) => pad + l);
  const body = lines.map((l) => (l.trim() ? unit + l : l));
  const tail = t.after ? t.after.split('\n').map((l) => (l ? pad + l : l)) : [];
  // Gherkin keeps the block's steps under the header; C# blocks close with their brace.
  const text = [...headLines, ...body, ...tail].join(nl);
  let sel = EditorSelection.cursor(first.from + text.length);
  if (head.at >= 0) {
    // The placeholder: its line in the header, its column there (after the block's indentation).
    const before = head.text.slice(0, head.at);
    const line = before.split('\n').length - 1;
    const column = head.at - (before.lastIndexOf('\n') + 1);
    const offset = headLines.slice(0, line).reduce((n, l) => n + l.length + nl.length, 0) + pad.length + column;
    const word = /^[\w.]+/.exec(head.text.slice(head.at))?.[0].length ?? 0;
    sel = EditorSelection.range(first.from + offset, first.from + offset + word);
  }
  view.dispatch({ changes: { from: first.from, to: last.to, insert: text }, selection: sel, scrollIntoView: true, userEvent: 'input.surround' });
}
