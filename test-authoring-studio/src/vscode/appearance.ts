import { registerRider } from '../rider/commands';
import { defineSetting, setSetting, setting } from './settings';

/** editor.stickyScroll.enabled: the pinned block lines can be turned off (VSCODE-250.md W87). */
export const stickyEnabled = defineSetting<boolean>({ key: 'editor.stickyScroll.enabled', category: 'Text Editor ▸ Sticky Scroll', title: 'Enabled', type: 'boolean', default: true, description: 'Shows the nested current scopes during the scroll at the top of the editor.' });

const toggle = (key: string, on: unknown, off: unknown) => setSetting(key, setting(key) === on ? off : on);
/** VS Code's View ▸ Appearance toggles (W87): Word Wrap (Alt+Z), Minimap, Render Whitespace, Sticky Scroll. */
registerRider([
  { id: 'toggle-word-wrap', label: 'View: Toggle Word Wrap', menu: 'View', submenu: 'Appearance', group: true, shortcut: 'Alt+Z', checked: () => setting('editor.wordWrap') !== 'off', run: () => toggle('editor.wordWrap', 'off', 'on') },
  { id: 'toggle-minimap', label: 'View: Toggle Minimap', menu: 'View', submenu: 'Appearance', checked: () => !!setting('editor.minimap.enabled'), run: () => setSetting('editor.minimap.enabled', !setting('editor.minimap.enabled')) },
  { id: 'toggle-render-whitespace', label: 'View: Toggle Render Whitespace', menu: 'View', submenu: 'Appearance', checked: () => setting('editor.renderWhitespace') !== 'none', run: () => setSetting('editor.renderWhitespace', setting('editor.renderWhitespace') === 'none' ? 'selection' : 'none') },
  { id: 'toggle-sticky-scroll', label: 'View: Toggle Sticky Scroll', menu: 'View', submenu: 'Appearance', checked: () => stickyEnabled(), run: () => setSetting('editor.stickyScroll.enabled', !stickyEnabled()) },
]);
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.code !== 'KeyZ') return;
  e.preventDefault();
  e.stopPropagation();
  toggle('editor.wordWrap', 'off', 'on');
}, true);
