import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { registerAdvanced } from '../editor/advanced';
import { registerRider } from '../rider/commands';
import { getTabs, keepTab } from './tabs';

/** W64 View: Keep Editor (Ctrl+K Enter): the active preview tab (italic) becomes a normal one. */
export function keepActiveEditor() {
  const { active, tabs } = getTabs();
  if (active && tabs.some((t) => t.file === active && t.preview)) keepTab(active);
}
registerRider([{ id: 'keep-editor', label: 'View: Keep Editor', menu: 'View', shortcut: 'Ctrl+K Enter', run: keepActiveEditor }]);
// In an editor the chord comes through CodeMirror (its Enter would otherwise insert a line).
registerAdvanced(() => Prec.high(keymap.of([{ key: 'Mod-k Enter', preventDefault: true, run: () => { keepActiveEditor(); return true; } }])));
// Elsewhere (a tab, the Explorer): Ctrl+K then Enter.
let chord = 0;
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement | null)?.closest?.('.cm-editor')) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') { chord = Date.now(); return; }
  if (e.key === 'Enter' && Date.now() - chord < 1500) { chord = 0; e.preventDefault(); keepActiveEditor(); }
}, true);
