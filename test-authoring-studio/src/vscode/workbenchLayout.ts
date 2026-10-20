import { defineSetting, onSettingsChanged } from './settings';

/** Workbench ▸ Layout (VS Code's appearance settings): where the activity bar and the panel go. */
const C = 'Workbench ▸ Layout';
export const activityBarLocation = defineSetting<'default' | 'right' | 'hidden'>({
  key: 'workbench.activityBar.location', category: C, title: 'Activity Bar: Location', type: 'enum', default: 'default', description: 'Controls the location of the Activity Bar.',
  options: [{ value: 'default', description: 'Show the Activity Bar on the left of the Side Bar.' }, { value: 'right', description: 'Show the Activity Bar on the right edge of the window.' }, { value: 'hidden', description: 'Hide the Activity Bar.' }],
});
export const panelLocation = defineSetting<'bottom' | 'left' | 'right'>({
  key: 'workbench.panel.defaultLocation', category: C, title: 'Panel: Default Location', type: 'enum', default: 'bottom', description: 'Controls where the panel (Build, Debug, Output, Terminal…) is shown: below the editors, or on their left or right. The move button of the panel switches between the bottom and the right.',
  options: [{ value: 'bottom' }, { value: 'left' }, { value: 'right' }],
});
// The activity bar's side is a CSS order on <html>.
function apply() { if (typeof document !== 'undefined') document.documentElement.dataset.activityBar = activityBarLocation(); }
if (typeof window !== 'undefined') { onSettingsChanged(apply); apply(); }
