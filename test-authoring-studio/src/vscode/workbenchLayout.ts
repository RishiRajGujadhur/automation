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

/** workbench.activityBar.iconClickBehavior (VSCODE-250.md W50): what clicking the active side bar view's icon does. */
export const iconClickBehavior = defineSetting<'toggle' | 'focus'>({
  key: 'workbench.activityBar.iconClickBehavior', category: C, title: 'Activity Bar: Icon Click Behavior', type: 'enum', default: 'toggle', description: 'Controls the behavior of clicking an Activity Bar icon in the workbench.',
  options: [{ value: 'toggle', description: 'Hide the Primary Side Bar if the clicked item is already visible.' }, { value: 'focus', description: 'Focus the Primary Side Bar if the clicked item is already visible.' }],
});

/** workbench.view.alwaysShowHeaderActions (VSCODE-250.md W58): view title actions shown always, not only on hover. */
export const alwaysShowHeaderActions = defineSetting<boolean>({ key: 'workbench.view.alwaysShowHeaderActions', category: C, title: 'View: Always Show Header Actions', type: 'boolean', default: false, description: 'Controls the visibility of view header actions. View header actions may either be always visible, or only visible when that view is focused or hovered over.' });
if (typeof window !== 'undefined') { const applyHeader = () => { document.documentElement.dataset.headerActions = alwaysShowHeaderActions() ? 'always' : 'hover'; }; onSettingsChanged(applyHeader); applyHeader(); }

/** workbench.tree.indent / renderIndentGuides (VSCODE-250.md W59): the Explorer tree's indent and guide lines. */
export const treeIndent = defineSetting<number>({ key: 'workbench.tree.indent', category: 'Workbench ▸ Appearance', title: 'Tree: Indent', type: 'number', default: 8, min: 4, max: 40, description: 'Controls tree indentation in pixels.' });
export const treeIndentGuides = defineSetting<'none' | 'onHover' | 'always'>({ key: 'workbench.tree.renderIndentGuides', category: 'Workbench ▸ Appearance', title: 'Tree: Render Indent Guides', type: 'enum', default: 'onHover', description: 'Controls whether the tree should render indent guides.', options: [{ value: 'none' }, { value: 'onHover' }, { value: 'always' }] });
if (typeof window !== 'undefined') { const applyGuides = () => { document.documentElement.dataset.treeGuides = treeIndentGuides(); }; onSettingsChanged(applyGuides); applyGuides(); }

/** workbench.list.smoothScrolling / mouseWheelScrollSensitivity (VSCODE-250.md W60): lists and trees (side bar, Quick Input, panes). */
export const listSmooth = defineSetting<boolean>({ key: 'workbench.list.smoothScrolling', category: 'Workbench ▸ Appearance', title: 'List: Smooth Scrolling', type: 'boolean', default: false, description: 'Controls whether lists and trees have smooth scrolling.' });
export const listWheel = defineSetting<number>({ key: 'workbench.list.mouseWheelScrollSensitivity', category: 'Workbench ▸ Appearance', title: 'List: Mouse Wheel Scroll Sensitivity', type: 'number', default: 1, min: 0.1, max: 10, step: 0.1, description: 'A multiplier to be used on the deltaX and deltaY of mouse wheel scroll events.' });
const LISTS = '#feature-sidebar, .quick-input-list, .view-pane-body, .explorer-tree';
if (typeof window !== 'undefined') {
  window.addEventListener('wheel', (e) => {
    const factor = listWheel(), smooth = listSmooth();
    if ((factor === 1 && !smooth) || e.ctrlKey) return;
    // Inside a list: the innermost element under the pointer that can scroll.
    const list = (e.target as HTMLElement).closest?.(LISTS);
    if (!list) return;
    let el: HTMLElement | null = e.target as HTMLElement;
    const scrolls = (x: HTMLElement) => x.scrollHeight > x.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(x).overflowY);
    while (el && !scrolls(el)) el = el.parentElement;
    if (!el) return;
    e.preventDefault();
    const px = e.deltaMode === 1 ? 18 : e.deltaMode === 2 ? el.clientHeight : 1;
    el.scrollBy({ top: e.deltaY * px * factor, left: e.deltaX * px * factor, behavior: smooth ? 'smooth' : 'auto' });
  }, { passive: false });
}
