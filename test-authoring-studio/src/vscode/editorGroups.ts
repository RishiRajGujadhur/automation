import { useSyncExternalStore } from 'react';
import { defineSetting, setSetting } from './settings';

/** Split editor direction (VS Code's workbench.editor.openSideBySideDirection) and Maximize Editor Group. */
export const sideBySide = defineSetting<'right' | 'down'>({
  key: 'workbench.editor.openSideBySideDirection', category: 'Workbench ▸ Editor Management', title: 'Open Side By Side Direction', type: 'enum', default: 'right',
  description: 'Controls the default direction of editors that are opened side by side (for example, from the Explorer, or Split Editor). By default, editors will open on the right hand side of the currently active one. If changed to down, the editors will open below the currently active one.',
  options: [{ value: 'right' }, { value: 'down' }],
});
/** Split Editor Right / Down: the direction, then the split itself (the App opens the active file beside it). */
export function splitEditor(direction: 'right' | 'down') {
  setSetting('workbench.editor.openSideBySideDirection', direction);
  window.dispatchEvent(new Event('tas:split-active'));
}
// Maximize Editor Group (Ctrl+K Ctrl+M): the group with focus fills the editor area.
let maximized: 'main' | 'split' | null = null;
const listeners = new Set<() => void>();
export function toggleMaximizeGroup() {
  if (maximized) maximized = null;
  else maximized = document.activeElement?.closest('.split-pane') ? 'split' : 'main';
  for (const l of listeners) l();
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
export const useMaximizedGroup = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => maximized);
if (typeof window !== 'undefined') {
  // Ctrl+K Ctrl+M (VS Code's Toggle Maximize Editor Group).
  let chord = 0;
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) { if (e.key !== 'Control' && e.key !== 'Meta') chord = 0; return; }
    const k = e.key.toLowerCase();
    if (k === 'k') { chord = Date.now(); return; }
    if (k === 'm' && Date.now() - chord < 1500) { chord = 0; e.preventDefault(); e.stopPropagation(); toggleMaximizeGroup(); return; }
    if (k !== 'control' && k !== 'meta') chord = 0;
  }, true);
}
