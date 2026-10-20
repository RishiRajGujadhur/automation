import { getSearchQuery, searchPanelOpen } from '@codemirror/search';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/** Find: "3 of 12" next to the search field (VS Code's match counter); at most 9,999 are counted. */
export const searchCount = [
  ViewPlugin.fromClass(class {
    constructor(readonly view: EditorView) { this.draw(); }
    update(u: ViewUpdate) { if (u.docChanged || u.selectionSet || u.transactions.some((t) => t.effects.length) || u.focusChanged) this.draw(); }
    draw() {
      const { view } = this;
      const panel = view.dom.querySelector<HTMLElement>('.cm-search');
      if (!panel || !searchPanelOpen(view.state)) return;
      let el = panel.querySelector<HTMLElement>('.cm-search-count');
      if (!el) { el = document.createElement('span'); el.className = 'cm-search-count'; el.setAttribute('aria-live', 'polite'); el.setAttribute('aria-label', 'Matches'); panel.querySelector('input')?.after(el); }
      const q = getSearchQuery(view.state);
      if (!q.search || !q.valid) { el.textContent = ''; return; }
      const sel = view.state.selection.main;
      let n = 0, at = 0;
      const cur = q.getCursor(view.state);
      for (let r = cur.next(); !r.done && n < 9999; r = cur.next()) { n++; if (!at && r.value.from === sel.from && r.value.to === sel.to) at = n; }
      el.textContent = n ? (at ? `${at} of ${n}` : `${n} match${n === 1 ? '' : 'es'}`) : 'No results';
    }
  }),
  EditorView.baseTheme({ '.cm-search-count': { margin: '0 6px', fontSize: '11px', opacity: '0.8', whiteSpace: 'nowrap' } }),
];
