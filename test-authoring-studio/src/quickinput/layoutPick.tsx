import { runRider, registerRider } from '../rider/commands';
import { setViewOptions, viewOptions } from '../editor/viewOptions';
import { resetSetting, setSetting } from '../vscode/settings';
import { quickOpen } from '../vscode/quickOpen';
import { menuBarVisibility } from '../vscode/menuBar';
import { panelAlignment, sideBarLocation } from '../vscode/workbenchLayout';
import { layoutState } from '../rider/layoutModes';
import { openQuickPick, type QuickItem } from './store';

/** What the shell shows and how to toggle it (set on every render). */
export type LayoutParts = { sidebar: boolean; panel: boolean; secondary: boolean; toggleSidebar: () => void; togglePanel: () => void; toggleSecondary: () => void; reset: () => void };
let parts: LayoutParts | undefined;
export const setLayoutParts = (p: LayoutParts) => { parts = p; };

/** Extra sections other features add (side bar position, panel alignment, menu bar…). */
export type LayoutSection = { title: string; items: () => { id: string; label: string; on: boolean; run: () => void; icon?: string }[] };
const sections: LayoutSection[] = [];
export const addLayoutSection = (s: LayoutSection, at = sections.length) => { sections.splice(at, 0, s); };
/** Settings the sections own, reset by Reset to Defaults. */
const owned: string[] = [];
export const ownLayoutSetting = (key: string) => { owned.push(key); };
export const resetLayoutSettings = () => ['workbench.sideBar.location', 'workbench.panel.alignment', 'window.menuBarVisibility', ...owned].forEach((k) => resetSetting(k));

const check = (on: boolean) => <span className={`codicon codicon-${on ? 'check' : 'blank'}`} aria-hidden="true" />;

/** W41 View: Customize Layout… — VS Code's quick pick: visibility, positions, alignment, quick input, modes. */
export function customizeLayout(activeId?: string) {
  if (!parts) return;
  const p = parts;
  const v = viewOptions();
  const groups: { title: string; rows: { id: string; label: string; on: boolean; run: () => void; keys?: string }[] }[] = [
    { title: 'Visibility', rows: [
      { id: 'menubar', label: 'Menu Bar', on: menuBarVisibility() === 'classic', run: () => setSetting('window.menuBarVisibility', menuBarVisibility() === 'classic' ? 'toggle' : 'classic') },
      { id: 'activity', label: 'Activity Bar', on: !v.hideActivityBar, run: () => setViewOptions({ hideActivityBar: !viewOptions().hideActivityBar }) },
      { id: 'sidebar', label: 'Primary Side Bar', on: p.sidebar, run: p.toggleSidebar, keys: 'Ctrl+B' },
      { id: 'secondary', label: 'Secondary Side Bar', on: p.secondary, run: p.toggleSecondary, keys: 'Ctrl+Alt+B' },
      { id: 'panel', label: 'Panel', on: p.panel, run: p.togglePanel },
      { id: 'status', label: 'Status Bar', on: !v.hideStatusBar, run: () => setViewOptions({ hideStatusBar: !viewOptions().hideStatusBar }) },
    ] },
    // W43 / W42: where the primary side bar goes, how wide a bottom panel is.
    { title: 'Primary Side Bar Position', rows: (['left', 'right'] as const).map((x) => ({ id: `side-${x}`, label: x === 'left' ? 'Left' : 'Right', on: sideBarLocation() === x, run: () => setSetting('workbench.sideBar.location', x) })) },
    { title: 'Panel Alignment', rows: (['left', 'right', 'center', 'justify'] as const).map((x) => ({ id: `align-${x}`, label: x[0].toUpperCase() + x.slice(1), on: panelAlignment() === x, run: () => setSetting('workbench.panel.alignment', x) })) },
    ...sections.map((s) => ({ title: s.title, rows: s.items() })),
    { title: 'Quick Input Position', rows: [
      { id: 'qi-top', label: 'Top', on: quickOpen.position() === 'top', run: () => resetSetting('workbench.quickInput.position') },
      { id: 'qi-center', label: 'Center', on: quickOpen.position() === 'center', run: () => setSetting('workbench.quickInput.position', 'center') },
    ] },
    { title: 'Modes', rows: [
      { id: 'fullscreen', label: 'Full Screen', on: !!document.fullscreenElement, run: () => runRider('full-screen', 'menu') },
      { id: 'zen', label: 'Zen Mode', on: layoutState().mode === 'vszen', run: () => runRider('vs-zen-mode', 'menu'), keys: 'Ctrl+K Z' },
      { id: 'centered', label: 'Centered Layout', on: !!v.centered, run: () => setViewOptions({ centered: !viewOptions().centered }) },
    ] },
  ];
  const items: QuickItem[] = groups.flatMap((g) => g.rows.map((r, i) => ({
    id: r.id, label: r.label, icon: check(r.on), keybinding: r.keys, separator: i === 0 ? g.title : undefined,
    // The picker stays open, as in VS Code: toggling shows the new state.
    accept: () => { r.run(); setTimeout(() => customizeLayout(r.id), 30); },
  })));
  items.push({ id: 'reset', label: 'Reset to Defaults', icon: <span className="codicon codicon-discard" aria-hidden="true" />, separator: '', accept: () => { p.reset(); setTimeout(() => customizeLayout('reset'), 30); } });
  openQuickPick({ placeholder: 'Customize Layout', items, activeId });
}

registerRider([{ id: 'customize-layout', label: 'Customize Layout…', menu: 'View', run: () => customizeLayout() }]);
