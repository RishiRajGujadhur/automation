import { openQuickInput, quickProviders, registerQuickAccess } from './store';

/** VS Code's prefixes, shown as keys ("…" for the file picker). */
const label = (prefix: string) => (prefix === '' ? '…' : prefix.trim() ? prefix : prefix);

/** W7 Quick access help (`?`): every prefix and what it does; Enter switches to it. */
registerQuickAccess({
  prefix: '?',
  help: 'Help',
  noResults: 'No matching prefixes',
  provide: (filter) => {
    const q = filter.trim().toLowerCase();
    return quickProviders()
      .filter((p) => p.prefix !== '?')
      .map((p) => ({ p, text: `${label(p.prefix)} ${p.help}` }))
      .filter(({ text }) => !q || text.toLowerCase().includes(q))
      .sort((a, b) => (a.p.prefix === '' ? -1 : b.p.prefix === '' ? 1 : 0))
      .map(({ p }) => ({ id: `help:${p.prefix}`, label: label(p.prefix), description: p.help, accept: () => setTimeout(() => openQuickInput(p.prefix)) }));
  },
});

export type OpenView = { group: 'Side Bar' | 'Panel' | 'Page'; label: string; run: () => void; keybinding?: string };
let views: OpenView[] = [];
/** The views the shell can show (set on every render, with their show functions). */
export const setOpenViews = (list: OpenView[]) => { views = list; };

/** W8 Open View (`view `, Ctrl+Q): side bar views, panel views and pages, grouped as in VS Code. */
registerQuickAccess({
  prefix: 'view ',
  help: 'Open View',
  placeholder: 'Type the name of a view, output channel or terminal to open.',
  noResults: 'No matching views',
  provide: (filter) => {
    const q = filter.trim().toLowerCase();
    const out = views.filter((v) => !q || v.label.toLowerCase().includes(q));
    return out.map((v, i) => ({ id: `view:${v.group}:${v.label}`, label: v.label, keybinding: v.keybinding, separator: i === 0 || out[i - 1].group !== v.group ? v.group : undefined, accept: () => v.run() }));
  },
});
