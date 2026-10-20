import { SearchQuery, getSearchQuery, openSearchPanel, searchPanelOpen, setSearchQuery } from '@codemirror/search';
import { EditorSelection, StateEffect, StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, keymap, type ViewUpdate } from '@codemirror/view';
import { featureOn } from '../features';

/**
 * Find in Selection (VS Code's Alt+L in the find widget): matches are only looked for in the text that was selected.
 * Enter / Shift+Enter, Select All (Alt+Enter) and Replace All stay inside it; a toggle in the find panel turns it off.
 */
const setScope = StateEffect.define<{ from: number; to: number } | null>();
export const findScope = StateField.define<{ from: number; to: number } | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setScope)) return e.value;
    if (v && tr.docChanged) v = { from: tr.changes.mapPos(v.from, -1), to: tr.changes.mapPos(v.to, 1) };
    return v && !searchPanelOpen(tr.state) ? null : v;
  },
  provide: (f) => EditorView.decorations.from(f, (v) => (v && v.to > v.from ? Decoration.set([Decoration.mark({ class: 'cm-find-scope' }).range(v.from, v.to)]) : Decoration.none)),
});
/** Matches of the find query inside [from, to). Pure over the state, for the unit tests. */
export function scopedMatches(state: EditorState, from: number, to: number) {
  const q = getSearchQuery(state);
  if (!q.search || !q.valid) return [];
  const out: { from: number; to: number }[] = [];
  const cur = q.getCursor(state, from, to);
  for (let r = cur.next(); !r.done && out.length < 10000; r = cur.next()) out.push(r.value);
  return out;
}
/** The find panel's fields as the query (CodeMirror commits them on keyup / change, after our capture handler). */
function commit(view: EditorView) {
  const panel = view.dom.querySelector<HTMLElement>('.cm-search');
  if (!panel) return;
  const val = (n: string) => panel.querySelector<HTMLInputElement>(`[name="${n}"]`);
  const q = new SearchQuery({ search: val('search')?.value ?? '', replace: val('replace')?.value ?? '', caseSensitive: !!val('case')?.checked, regexp: !!val('re')?.checked, wholeWord: !!val('word')?.checked });
  if (!q.eq(getSearchQuery(view.state))) view.dispatch({ effects: setSearchQuery.of(q) });
}
const step = (view: EditorView, dir: 1 | -1) => {
  commit(view);
  const scope = view.state.field(findScope, false);
  if (!scope) return false;
  const all = scopedMatches(view.state, scope.from, scope.to);
  if (!all.length) return true;
  const at = view.state.selection.main;
  const next = dir > 0 ? all.find((m) => m.from > at.from || (m.from === at.from && at.empty)) ?? all[0] : [...all].reverse().find((m) => m.from < at.from) ?? all[all.length - 1];
  view.dispatch({ selection: EditorSelection.range(next.from, next.to), effects: setScope.of(scope), scrollIntoView: true });
  return true;
};
const selectAll = (view: EditorView) => {
  commit(view);
  const scope = view.state.field(findScope, false);
  if (!scope) return false;
  const all = scopedMatches(view.state, scope.from, scope.to);
  if (all.length) view.dispatch({ selection: EditorSelection.create(all.map((m) => EditorSelection.range(m.from, m.to))), effects: setScope.of(null), userEvent: 'select.search.matches' });
  return true;
};
const replaceAll = (view: EditorView) => {
  commit(view);
  const scope = view.state.field(findScope, false);
  if (!scope) return false;
  const q = getSearchQuery(view.state);
  const changes = scopedMatches(view.state, scope.from, scope.to).map((m) => ({ from: m.from, to: m.to, insert: q.regexp ? view.state.sliceDoc(m.from, m.to).replace(new RegExp(q.search, q.caseSensitive ? '' : 'i'), q.replace) : q.replace }));
  if (changes.length) view.dispatch({ changes, userEvent: 'input.replace.all' });
  return true;
};
/** Edit ▸ Find in Selection: the selection becomes the find scope and the find panel opens. */
export function findInSelection(view: EditorView) {
  const r = view.state.selection.main;
  const scope = r.empty ? null : { from: r.from, to: r.to };
  if (!scope) return false;
  openSearchPanel(view);
  view.dispatch({ effects: setScope.of(scope), selection: EditorSelection.cursor(r.from) });
  return true;
}
const toggle = (view: EditorView) => {
  if (view.state.field(findScope, false)) { view.dispatch({ effects: setScope.of(null) }); return true; }
  return findInSelection(view);
};
export const findInSelectionExtension = [
  findScope,
  keymap.of([{ key: 'Alt-l', run: (v) => featureOn('find-in-selection') && searchPanelOpen(v.state) && toggle(v) }]),
  // The panel's own Enter / Shift+Enter / Alt+Enter / Replace All run first in the capture phase when there is a scope.
  ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) { view.dom.addEventListener('keydown', this.key, true); view.dom.addEventListener('click', this.click, true); }
    key = (e: KeyboardEvent) => {
      if (!(e.target as HTMLElement).closest?.('.cm-search') || !this.view.state.field(findScope, false)) return;
      const done = e.key === 'Enter' && !e.ctrlKey && (e.altKey ? selectAll(this.view) : (e.target as HTMLElement).getAttribute('name') === 'replace' ? false : step(this.view, e.shiftKey ? -1 : 1));
      if (done) { e.preventDefault(); e.stopPropagation(); }
    };
    click = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest?.('button[name]') as HTMLButtonElement | null;
      if (!b || !b.closest('.cm-search') || !this.view.state.field(findScope, false)) return;
      const done = b.name === 'next' ? step(this.view, 1) : b.name === 'prev' ? step(this.view, -1) : b.name === 'select' ? selectAll(this.view) : b.name === 'replaceAll' ? replaceAll(this.view) : false;
      if (done) { e.preventDefault(); e.stopPropagation(); }
    };
    // The toggle in the find panel.
    update(u: ViewUpdate) {
      const panel = u.view.dom.querySelector<HTMLElement>('.cm-search');
      if (!panel || !featureOn('find-in-selection')) return;
      let b = panel.querySelector<HTMLButtonElement>('.cm-find-in-selection');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'cm-button cm-find-in-selection';
        b.textContent = 'in selection';
        b.title = 'Find in Selection (Alt+L)';
        b.setAttribute('aria-label', 'Find in Selection');
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', () => toggle(this.view));
        panel.querySelector('button[name="select"]')?.after(b);
      }
      b.setAttribute('aria-pressed', String(!!u.state.field(findScope, false)));
    }
    destroy() { this.view.dom.removeEventListener('keydown', this.key, true); this.view.dom.removeEventListener('click', this.click, true); }
  }),
  EditorView.baseTheme({ '.cm-find-scope': { background: 'rgba(120, 160, 255, 0.12)' }, '.cm-find-in-selection[aria-pressed="true"]': { background: 'rgba(120, 160, 255, 0.35)' } }),
];
