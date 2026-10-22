import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { registerAdvanced } from '../editor/advanced';
import { registerRider, runRider } from '../rider/commands';
import { unsavedFiles } from '../editor/autosave';
import { closeAll, closeSaved } from './tabs';

/** Closes the side editor group (the shell listens). */
export const CLOSE_SPLIT_EVENT = 'tas:close-split';

/**
 * VS Code's group close commands (VSCODE-250.md W81): Close Saved Editors in Group (Ctrl+K U), Close All Editors in
 * Group (Ctrl+K W), Close All Editor Groups (Ctrl+K Ctrl+Shift+W). Pinned and unsaved tabs stay, as in VS Code.
 */
registerRider([
  { id: 'close-saved-group', label: 'View: Close Saved Editors in Group', menu: 'View', group: true, shortcut: 'Ctrl+K U', run: () => closeSaved(unsavedFiles()) },
  { id: 'close-group', label: 'View: Close All Editors in Group', menu: 'View', shortcut: 'Ctrl+K W', run: () => closeAll() },
  { id: 'close-all-groups', label: 'View: Close All Editor Groups', menu: 'View', shortcut: 'Ctrl+K Ctrl+Shift+W', run: () => { closeAll(); window.dispatchEvent(new Event(CLOSE_SPLIT_EVENT)); } },
]);
const key = (id: string) => () => { runRider(id, 'key'); return true; };
registerAdvanced(() => Prec.high(keymap.of([
  { key: 'Mod-k u', preventDefault: true, run: key('close-saved-group') },
  { key: 'Mod-k w', preventDefault: true, run: key('close-group') },
  { key: 'Mod-k Mod-Shift-w', preventDefault: true, run: key('close-all-groups') },
])));
let chord = 0;
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement | null)?.closest?.('.cm-editor')) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { chord = Date.now(); return; }
  if (Date.now() - chord > 1500) return;
  const k = e.key.toLowerCase();
  const id = !e.ctrlKey && !e.altKey && k === 'u' ? 'close-saved-group' : !e.ctrlKey && !e.altKey && k === 'w' ? 'close-group' : e.ctrlKey && e.shiftKey && k === 'w' ? 'close-all-groups' : '';
  if (!id) return;
  chord = 0;
  e.preventDefault();
  e.stopPropagation();
  runRider(id, 'key');
}, true);
