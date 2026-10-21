import { desktop } from '../desktop';
import { defineSetting, onSettingsChanged } from './settings';

/**
 * window.menuBarVisibility (VSCODE-250.md W44): the menu bar classic, compact (a ☰ button that shows it), toggle
 * (hidden until Alt is pressed and released) or hidden. The desktop app applies it to its native menu bar.
 */
export const menuBarVisibility = defineSetting<'classic' | 'compact' | 'toggle' | 'hidden'>({
  key: 'window.menuBarVisibility', category: 'Window', title: 'Menu Bar Visibility', type: 'enum', default: 'classic', description: 'Control the visibility of the menu bar. A setting of \'toggle\' means that the menu bar is hidden and a single press of the Alt key will show it. A setting of \'compact\' will move the menu into the side bar.',
  options: [
    { value: 'classic', description: 'Menu is displayed at the top of the window and only hidden in full screen mode.' },
    { value: 'compact', description: 'Menu is displayed as a compact button.' },
    { value: 'toggle', description: 'Menu is hidden but can be displayed at the top of the window by executing the Focus Application Menu command (Alt).' },
    { value: 'hidden', description: 'Menu is always hidden.' },
  ],
});

const root = () => document.documentElement;
/** Shows the hidden menu bar until a menu is used, focus leaves it or Escape (toggle / compact). */
export function revealMenuBar(on = true) { if (on) root().dataset.menubarShown = ''; else delete root().dataset.menubarShown; }
function apply() {
  const mode = menuBarVisibility();
  root().dataset.menubar = mode;
  revealMenuBar(false);
  desktop?.setMenuBarVisibility?.(mode);
}
if (typeof window !== 'undefined') {
  onSettingsChanged(apply);
  apply();
  // Alt pressed and released alone toggles the menu bar in toggle mode (as VS Code's Focus Application Menu).
  let alone = false;
  window.addEventListener('keydown', (e) => { alone = e.key === 'Alt' && !e.ctrlKey && !e.shiftKey && !e.metaKey; }, true);
  window.addEventListener('keyup', (e) => {
    if (e.key !== 'Alt' || !alone || menuBarVisibility() !== 'toggle') return;
    alone = false;
    const shown = 'menubarShown' in root().dataset;
    revealMenuBar(!shown);
    if (!shown) setTimeout(() => document.querySelector<HTMLElement>('.app-header .menubar-item')?.focus(), 0);
  }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && 'menubarShown' in root().dataset && !document.querySelector('[role="menu"]')) revealMenuBar(false); });
  // A menu command used: the menu bar goes away again.
  window.addEventListener('click', (e) => { if ('menubarShown' in root().dataset && (e.target as HTMLElement).closest?.('[role="menuitem"]')) setTimeout(() => revealMenuBar(false), 0); }, true);
  // A click outside the menu bar and its menus hides it again.
  window.addEventListener('mousedown', (e) => {
    const t = e.target as HTMLElement;
    if ('menubarShown' in root().dataset && !t.closest('.app-header .menubar-item, [role="menu"], .menubar-toggle')) revealMenuBar(false);
  }, true);
}
