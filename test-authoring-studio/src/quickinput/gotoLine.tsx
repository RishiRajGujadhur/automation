import { EditorView } from '@codemirror/view';
import { activeEditor } from '../editor/activeEditor';
import { registerQuickAccess } from './store';

/** "12", "12:5", "12,5" or "-3" (from the end) as a line and column. */
function parse(filter: string, lines: number) {
  const m = /^\s*(-?\d+)?\s*(?:[:,#]\s*(\d+))?\s*$/.exec(filter);
  if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
  let line = m[1] === undefined ? 1 : Number(m[1]);
  if (line < 0) line = lines + line + 1;
  return { line: Math.min(Math.max(1, line), lines), column: m[2] ? Math.max(1, Number(m[2])) : undefined };
}
let saved: { view: EditorView; anchor: number; head: number; top: number } | undefined;
function reveal(view: EditorView, line: number, column?: number) {
  const l = view.state.doc.line(line);
  const pos = Math.min(l.to, l.from + (column ? column - 1 : 0));
  view.dispatch({ selection: { anchor: pos }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
}

/** W5 Go to Line / Column (Ctrl+G, `:`): the line is previewed while typing; Escape goes back. */
registerQuickAccess({
  prefix: ':',
  help: 'Go to Line/Column',
  noResults: 'Open a text editor first to go to a line.',
  message: (filter) => {
    const a = activeEditor();
    if (!a) return undefined;
    const doc = a.view.state.doc, head = a.view.state.selection.main.head, line = doc.lineAt(head);
    if (!saved || saved.view !== a.view) { const s = a.view.state.selection.main; saved = { view: a.view, anchor: s.anchor, head: s.head, top: a.view.scrollDOM.scrollTop }; }
    if (filter.trim() && !parse(filter, doc.lines)) return 'Please type a line number between 1 and ' + doc.lines + '.';
    if (filter.trim()) return undefined;
    const cur = saved.view.state.doc.lineAt(saved.head);
    void line;
    return `Current Line: ${cur.number}, Character: ${saved.head - cur.from + 1}. Type a line number between 1 and ${doc.lines} to navigate to.`;
  },
  provide: (filter) => {
    const a = activeEditor();
    if (!a) return [];
    const p = parse(filter, a.view.state.doc.lines);
    if (!p) return [];
    const view = a.view;
    return [{ id: `line:${p.line}:${p.column ?? ''}`, label: p.column ? `Go to line ${p.line} and character ${p.column}.` : `Go to line ${p.line}.`, accept: () => { saved = undefined; reveal(view, p.line, p.column); view.focus(); } }];
  },
  onActive: (item) => {
    const a = activeEditor();
    if (!item || !a) return;
    const [, line, column] = item.id.split(':');
    reveal(a.view, +line, column ? +column : undefined);
  },
  onCancel: () => {
    if (!saved) return;
    const { view, anchor, head, top } = saved;
    saved = undefined;
    view.dispatch({ selection: { anchor, head } });
    view.scrollDOM.scrollTop = top;
    view.focus();
  },
});
