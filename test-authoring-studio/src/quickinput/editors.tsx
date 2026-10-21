import { getTabs } from '../files/tabs';
import { recentFiles } from '../navHistory';
import { unsavedFiles } from '../editor/autosave';
import { fileType } from '../files/fileTypes';
import { createMatches, fuzzyScore } from './fuzzy';
import { openLocation } from './providers';
import { openQuickInput, registerQuickAccess } from './store';

/** Asks the shell to close an editor (with its save prompt). */
export const CLOSE_EDITOR_EVENT = 'tas:close-editor';

/** W9 Show All Editors by Most Recently Used (`edt `): the open editors, last used first, with a close button. */
registerQuickAccess({
  prefix: 'edt ',
  help: 'Show All Opened Editors By Most Recently Used',
  placeholder: 'Type the name of an open editor.',
  noResults: 'No matching editors',
  provide: (filter) => {
    const q = filter.trim();
    const mru = recentFiles();
    const dirty = new Set(unsavedFiles());
    const tabs = [...getTabs().tabs].sort((a, b) => { const i = mru.indexOf(a.file), j = mru.indexOf(b.file); return (i < 0 ? 1e6 : i) - (j < 0 ? 1e6 : j); });
    return tabs.flatMap((t) => {
      const name = t.file.split('/').pop()!;
      const s = q ? fuzzyScore(q, name, true) : [0, 0];
      if (!s) return [];
      const type = fileType(t.file);
      return [{
        id: `edt:${t.file}`, label: `${dirty.has(t.file) ? '● ' : ''}${name}`, labelMatches: q ? createMatches(s).map((m) => (dirty.has(t.file) ? { start: m.start + 2, end: m.end + 2 } : m)) : [],
        description: t.file.includes('/') ? t.file.slice(0, t.file.lastIndexOf('/')) : '', icon: <type.icon size={16} style={{ color: type.color }} aria-hidden="true" />,
        buttons: [{ icon: <span className="codicon codicon-close" />, title: 'Close Editor', run: () => { window.dispatchEvent(new CustomEvent(CLOSE_EDITOR_EVENT, { detail: t.file })); setTimeout(() => openQuickInput('edt ' + filter)); } }],
        accept: () => openLocation(t.file),
      }];
    });
  },
});
