import { defineSetting } from './settings';

/** Workbench ▸ Editor Management (VS Code): how the editor tabs look. EditorTabs reads these. */
const C = 'Workbench ▸ Editor Management';
export const tabs = {
  show: defineSetting<'multiple' | 'single' | 'none'>({
    key: 'workbench.editor.showTabs', category: C, title: 'Show Tabs', type: 'enum', default: 'multiple', description: 'Controls whether opened editors should show as individual tabs, one single large tab or if the title area should not be shown.',
    options: [{ value: 'multiple', description: 'Each editor is displayed as a tab in the editor title area.' }, { value: 'single', description: 'The active editor is displayed as a single large tab in the editor title area.' }, { value: 'none', description: 'The editor title area is not displayed.' }],
  }),
  actionLocation: defineSetting<'right' | 'left'>({ key: 'workbench.editor.tabActionLocation', category: C, title: 'Tab Action Location', type: 'enum', default: 'right', description: 'Controls the position of the editor\'s tabs action buttons (close, unpin).', options: [{ value: 'right' }, { value: 'left' }] }),
  highlightModified: defineSetting<boolean>({ key: 'workbench.editor.highlightModifiedTabs', category: C, title: 'Highlight Modified Tabs', type: 'boolean', default: false, description: 'Controls whether a top border is drawn on tabs for editors that have unsaved changes.' }),
  sizing: defineSetting<'fit' | 'shrink' | 'fixed'>({
    key: 'workbench.editor.tabSizing', category: C, title: 'Tab Sizing', type: 'enum', default: 'fit', description: 'Controls the size of editor tabs.',
    options: [{ value: 'fit', description: 'Always keep tabs large enough to show the full editor label.' }, { value: 'shrink', description: 'Allow tabs to get smaller when the available space is not enough to show all tabs at once.' }, { value: 'fixed', description: 'Make all tabs the same size (workbench.editor.tabSizingFixedMaxWidth), while allowing them to get smaller when the available space is not enough.' }],
  }),
  fixedWidth: defineSetting<number>({ key: 'workbench.editor.tabSizingFixedMaxWidth', category: C, title: 'Tab Sizing Fixed Max Width', type: 'number', default: 160, min: 38, max: 600, description: 'Controls the maximum width of tabs when workbench.editor.tabSizing is fixed.' }),
};
