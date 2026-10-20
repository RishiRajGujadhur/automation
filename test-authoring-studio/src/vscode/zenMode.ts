import { defineSetting, onSettingsChanged } from './settings';
import { layoutState, toggleMode, exitMode, onLayoutChanged } from '../rider/layoutModes';
import { featureOn } from '../features';

/** Zen Mode (VS Code, Ctrl+K Z): only the editor, with VS Code's zenMode.* settings; Escape twice leaves it. */
const C = 'Workbench ▸ Zen Mode';
export const zen = {
  fullScreen: defineSetting<boolean>({ key: 'zenMode.fullScreen', category: C, title: 'Full Screen', type: 'boolean', default: true, description: 'Controls whether turning on Zen Mode also puts the workbench into full screen mode.' }),
  centerLayout: defineSetting<boolean>({ key: 'zenMode.centerLayout', category: C, title: 'Center Layout', type: 'boolean', default: true, description: 'Controls whether turning on Zen Mode also centers the layout.' }),
  hideLineNumbers: defineSetting<boolean>({ key: 'zenMode.hideLineNumbers', category: C, title: 'Hide Line Numbers', type: 'boolean', default: true, description: 'Controls whether turning on Zen Mode also hides the editor line numbers.' }),
  hideStatusBar: defineSetting<boolean>({ key: 'zenMode.hideStatusBar', category: C, title: 'Hide Status Bar', type: 'boolean', default: true, description: 'Controls whether turning on Zen Mode also hides the status bar at the bottom of the workbench.' }),
  showTabs: defineSetting<'multiple' | 'single' | 'none'>({
    key: 'zenMode.showTabs', category: C, title: 'Show Tabs', type: 'enum', default: 'multiple', description: 'Controls whether turning on Zen Mode should show multiple editor tabs, a single editor tab, or hide the editor title area completely.',
    options: [{ value: 'multiple', description: 'Each editor is displayed as a tab in the editor title area.' }, { value: 'single', description: 'The active editor is displayed as a single large tab in the editor title area.' }, { value: 'none', description: 'The editor title area is not displayed.' }],
  }),
  silentNotifications: defineSetting<boolean>({ key: 'zenMode.silentNotifications', category: C, title: 'Silent Notifications', type: 'boolean', default: true, description: 'Controls whether notifications do not disturb mode should be enabled while in Zen Mode.' }),
};
/** The zen* attributes on <html> the CSS reads. */
function apply() {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (layoutState().mode !== 'vszen') { for (const k of ['zenTabs', 'zenStatus', 'zenLines', 'zenCenter', 'zenSilent']) delete html.dataset[k]; return; }
  html.dataset.zenTabs = zen.showTabs();
  html.dataset.zenStatus = zen.hideStatusBar() ? 'hidden' : 'shown';
  html.dataset.zenLines = zen.hideLineNumbers() ? 'hidden' : 'shown';
  html.dataset.zenCenter = String(zen.centerLayout());
  html.dataset.zenSilent = String(zen.silentNotifications());
}
/** Notifications are quiet while in Zen Mode (zenMode.silentNotifications). */
export const zenSilent = () => layoutState().mode === 'vszen' && zen.silentNotifications();
export function toggleZen() {
  const entering = layoutState().mode !== 'vszen';
  toggleMode('vszen');
  if (entering && zen.fullScreen()) void document.documentElement.requestFullscreen?.().catch(() => {});
  if (!entering && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  apply();
}
if (typeof window !== 'undefined') {
  onSettingsChanged(apply);
  onLayoutChanged(apply);
  apply();
  // Ctrl+K Z enters or leaves it; Escape twice leaves it.
  let chord = 0, esc = 0;
  window.addEventListener('keydown', (e) => {
    if (!featureOn('vs-zen-mode')) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { chord = Date.now(); return; }
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'z' && Date.now() - chord < 1500) { chord = 0; e.preventDefault(); e.stopPropagation(); toggleZen(); return; }
    if (e.key === 'Escape' && layoutState().mode === 'vszen') {
      if (Date.now() - esc < 700) { esc = 0; exitMode(); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); apply(); } else esc = Date.now();
    }
    if (e.key !== 'Control' && e.key !== 'Meta') chord = 0;
  }, true);
}
