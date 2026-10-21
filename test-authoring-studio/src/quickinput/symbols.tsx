import { EditorView } from '@codemirror/view';
import { activeEditor } from '../editor/activeEditor';
import { fileOutline, type OutlineItem } from '../rider/outline';
import { createMatches, fuzzyScore } from './fuzzy';
import { registerQuickAccess, type QuickItem } from './store';

/** VS Code's symbol icons (codicons) and colours. */
const ICON: Record<string, string[]> = {
  class: ['symbol-class', '#ee9d28'], record: ['symbol-class', '#ee9d28'], struct: ['symbol-struct', '#ee9d28'], interface: ['symbol-interface', '#75beff'],
  enum: ['symbol-enum', '#ee9d28'], 'enum-member': ['symbol-enum-member', '#75beff'], type: ['symbol-class', '#ee9d28'], namespace: ['symbol-namespace', 'inherit'], module: ['symbol-module', 'inherit'],
  method: ['symbol-method', '#b180d7'], function: ['symbol-function', '#b180d7'], constructor: ['symbol-method', '#b180d7'], property: ['symbol-property', 'inherit'],
  field: ['symbol-field', '#75beff'], variable: ['symbol-variable', '#75beff'], constant: ['symbol-constant', 'inherit'], event: ['symbol-event', '#ee9d28'],
  feature: ['symbol-file', 'inherit'], rule: ['symbol-namespace', 'inherit'], background: ['symbol-misc', 'inherit'], scenario: ['symbol-method', '#b180d7'], 'scenario-outline': ['symbol-method', '#b180d7'], example: ['symbol-method', '#b180d7'], examples: ['symbol-array', 'inherit'], heading: ['symbol-string', 'inherit'],
};
const kindOf = (k: string) => k.toLowerCase().replace(/\s+/g, '-');
export const symbolIcon = (kind: string) => { const [icon, color] = ICON[kindOf(kind)] ?? ['symbol-misc', 'inherit']; return <span className={`codicon codicon-${icon}`} style={{ color }} aria-hidden="true" />; };
/** VS Code's group names for `@:` ("classes (2)", "methods (5)"). */
const GROUP: Record<string, string> = { class: 'classes', record: 'classes', struct: 'structs', interface: 'interfaces', enum: 'enumerations', 'enum-member': 'enumeration members', type: 'types', namespace: 'namespaces', module: 'modules', method: 'methods', function: 'functions', constructor: 'constructors', property: 'properties', field: 'fields', variable: 'variables', constant: 'constants', event: 'events', scenario: 'scenarios', 'scenario-outline': 'scenarios', example: 'scenarios', heading: 'headings' };
const groupOf = (k: string) => GROUP[kindOf(k)] ?? `${kindOf(k)}s`;

// The outline of the active editor's text, kept while the text is the same.
let cache: { file: string; text: string; items: Promise<OutlineItem[]> } | undefined;
const outline = (file: string, text: string) => { if (!cache || cache.file !== file || cache.text !== text) cache = { file, text, items: fileOutline(file, text).catch(() => []) }; return cache.items; };

// Preview: the highlighted symbol is shown and selected in the editor; Escape puts the editor back.
let saved: { view: EditorView; anchor: number; head: number; top: number } | undefined;
function reveal(view: EditorView, it: OutlineItem, select: boolean) {
  const doc = view.state.doc;
  const line = doc.line(Math.min(Math.max(1, it.line), doc.lines));
  const pos = Math.min(line.to, line.from + Math.max(0, it.column - 1));
  const end = select ? Math.min(line.to, pos + it.label.replace(/^[A-Za-z ]+: /, '').length) : pos;
  view.dispatch({ selection: { anchor: pos, head: Math.max(pos, end) }, effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
}

/** W3 Go to Symbol in Editor (Ctrl+Shift+O, `@`) and W4 symbols by category (`@:`). */
registerQuickAccess({
  prefix: '@',
  help: 'Go to Symbol in Editor',
  placeholder: 'Type the name of a symbol to go to.',
  noResults: 'No editor symbols',
  provide: async (filter) => {
    const a = activeEditor();
    if (!a) return [];
    if (!saved || saved.view !== a.view) { const s = a.view.state.selection.main; saved = { view: a.view, anchor: s.anchor, head: s.head, top: a.view.scrollDOM.scrollTop }; }
    const byKind = filter.startsWith(':');
    const q = (byKind ? filter.slice(1) : filter).trim();
    const symbols = await outline(a.file, a.view.state.doc.toString());
    const view = a.view;
    const rows: { it: OutlineItem; score: number; item: QuickItem }[] = [];
    for (const it of symbols) {
      const s = q ? fuzzyScore(q, it.label, true) : [0, 0];
      if (!s) continue;
      rows.push({ it, score: s[0], item: { id: `sym:${it.line}:${it.column}:${it.label}`, label: it.label, labelMatches: q ? createMatches(s) : [], icon: symbolIcon(it.kind), accept: () => { saved = undefined; reveal(view, it, false); view.focus(); } } });
    }
    if (q) rows.sort((a, b) => b.score - a.score || a.it.line - b.it.line);
    if (!byKind) {
      // VS Code: "symbols (n)" over the list.
      if (rows.length) rows[0].item.separator = `symbols (${rows.length})`;
      return rows.map((r) => r.item);
    }
    const groups = new Map<string, typeof rows>();
    for (const r of rows) { const g = groupOf(r.it.kind); if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(r); }
    return [...groups.entries()].flatMap(([g, list]) => list.map((r, i) => ({ ...r.item, separator: i === 0 ? `${g} (${list.length})` : undefined })));
  },
  onActive: (item) => {
    const a = activeEditor();
    if (!item || !a || !saved) return;
    const [, line, column] = item.id.split(':');
    reveal(a.view, { label: item.label, kind: '', line: +line, column: +column, depth: 0, start: 0, end: 0 }, true);
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
