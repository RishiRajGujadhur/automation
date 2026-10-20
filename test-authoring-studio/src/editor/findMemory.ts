import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { SearchQuery, getSearchQuery, openSearchPanel, searchPanelOpen, setSearchQuery } from '@codemirror/search';
import { featureOn } from '../features';

/** Find (Ctrl+F) starts with the last search of any editor when nothing is selected (VS Code's global find text). */
let last: SearchQuery | undefined;
export const findMemory = [
  EditorView.updateListener.of((u) => { if (searchPanelOpen(u.state)) { const q = getSearchQuery(u.state); if (q.search && q.valid) last = q; } }),
  Prec.highest(keymap.of([{ key: 'Mod-f', run: (view) => {
    if (!featureOn('find-memory') || !last || !view.state.selection.main.empty || searchPanelOpen(view.state)) return false;
    // Open first: an editor that never searched gets its search state only then.
    openSearchPanel(view);
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: last.search, caseSensitive: last.caseSensitive, regexp: last.regexp, wholeWord: last.wholeWord })) });
    return true;
  } }])),
];
