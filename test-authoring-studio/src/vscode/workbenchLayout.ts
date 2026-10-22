import { defineSetting, onSettingsChanged } from './settings';

/** Workbench ▸ Layout (VS Code's appearance settings): where the activity bar and the panel go. */
const C = 'Workbench ▸ Layout';
export const activityBarLocation = defineSetting<'default' | 'top' | 'right' | 'hidden'>({
  key: 'workbench.activityBar.location', category: C, title: 'Activity Bar: Location', type: 'enum', default: 'default', description: 'Controls the location of the Activity Bar.',
  options: [{ value: 'default', description: 'Show the Activity Bar on the left of the Side Bar.' }, { value: 'top', description: 'Show the Activity Bar on top of the Primary Side Bar.' }, { value: 'right', description: 'Show the Activity Bar on the right edge of the window.' }, { value: 'hidden', description: 'Hide the Activity Bar.' }],
});
export const panelLocation = defineSetting<'bottom' | 'left' | 'right'>({
  key: 'workbench.panel.defaultLocation', category: C, title: 'Panel: Default Location', type: 'enum', default: 'bottom', description: 'Controls where the panel (Build, Debug, Output, Terminal…) is shown: below the editors, or on their left or right. The move button of the panel switches between the bottom and the right.',
  options: [{ value: 'bottom' }, { value: 'left' }, { value: 'right' }],
});
/** workbench.sideBar.location (VSCODE-250.md W43): the primary side bar (and its activity bar) left or right. */
export const sideBarLocation = defineSetting<'left' | 'right'>({
  key: 'workbench.sideBar.location', category: C, title: 'Side Bar: Location', type: 'enum', default: 'left', description: 'Controls the location of the primary side bar and activity bar. They can either show on the left or right of the workbench. The secondary side bar will show on the other side of the workbench.',
  options: [{ value: 'left' }, { value: 'right' }],
});
// The activity bar's and side bar's sides are CSS orders on <html>.
function apply() { if (typeof document === 'undefined') return; document.documentElement.dataset.activityBar = activityBarLocation(); document.documentElement.dataset.sideBar = sideBarLocation(); }
if (typeof window !== 'undefined') { onSettingsChanged(apply); apply(); }

/** workbench.panel.alignment (VSCODE-250.md W42): how wide a bottom panel is. */
export const panelAlignment = defineSetting<'center' | 'justify' | 'left' | 'right'>({
  key: 'workbench.panel.alignment', category: C, title: 'Panel: Alignment', type: 'enum', default: 'center', description: 'Controls the alignment of the panel (terminal, debug console, output, problems) when it is at the bottom of the workbench.',
  options: [
    { value: 'left', description: 'The panel extends under the editor area and the primary side bar.' },
    { value: 'right', description: 'The panel extends under the editor area and the secondary side bar.' },
    { value: 'center', description: 'The panel only extends under the editor area.' },
    { value: 'justify', description: 'The panel extends under the editor area and both side bars.' },
  ],
});
