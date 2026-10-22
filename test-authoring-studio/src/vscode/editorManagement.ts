import { defineSetting } from './settings';

/** Workbench ▸ Editor Management settings (VSCODE-250.md W65…), VS Code's ids. */
const C = 'Workbench ▸ Editor Management';
export const editorPreview = {
  enable: defineSetting<boolean>({ key: 'workbench.editor.enablePreview', category: C, title: 'Enable Preview', type: 'boolean', default: false, description: 'Controls whether opened editors show as preview editors. Preview editors do not stay open, are reused until explicitly set to be kept open (via double-click or editing), and show file names in italics. (The studio starts with it off; Preferences ▸ Preview tab turns it on too.)' }),
  fromQuickOpen: defineSetting<boolean>({ key: 'workbench.editor.enablePreviewFromQuickOpen', category: C, title: 'Enable Preview From Quick Open', type: 'boolean', default: false, description: 'Controls whether editors opened from Quick Open show as preview editors.' }),
  fromCode: defineSetting<boolean>({ key: 'workbench.editor.enablePreviewFromCodeNavigation', category: C, title: 'Enable Preview From Code Navigation', type: 'boolean', default: false, description: 'Controls whether editors remain in preview when a code navigation is started from them (Go to Definition…).' }),
};
/** workbench.editor.labelFormat (W68): the description after a tab's name. */
export const labelFormat = defineSetting<'default' | 'short' | 'medium' | 'long'>({
  key: 'workbench.editor.labelFormat', category: C, title: 'Label Format', type: 'enum', default: 'default', description: 'Controls the format of the label for an editor.',
  options: [
    { value: 'default', description: 'Show the name of the file. When two editors have the same name, their parent folders tell them apart.' },
    { value: 'short', description: 'Show the name of the file followed by its directory name.' },
    { value: 'medium', description: 'Show the name of the file followed by its path relative to the workspace folder.' },
    { value: 'long', description: 'Show the name of the file followed by its absolute path.' },
  ],
});
/** workbench.editor.wrapTabs (W69): tabs wrap into rows instead of scrolling (as Visual Studio's multiple rows). */
export const wrapTabs = defineSetting<boolean>({ key: 'workbench.editor.wrapTabs', category: C, title: 'Wrap Tabs', type: 'boolean', default: false, description: 'Controls whether tabs should be wrapped over multiple lines when exceeding available space or whether a scrollbar should appear instead.' });
/** workbench.editor.scrollToSwitchTabs (W74): the mouse wheel over the tabs switches between them. */
export const scrollToSwitchTabs = defineSetting<boolean>({ key: 'workbench.editor.scrollToSwitchTabs', category: C, title: 'Scroll To Switch Tabs', type: 'boolean', default: false, description: 'Controls whether scrolling over tabs will open them or not. By default tabs will only reveal upon scrolling, but not open.' });
/** workbench.editor.mouseBackForwardToNavigate (W75): mouse buttons 4 and 5 are Back and Forward. */
export const mouseBackForward = defineSetting<boolean>({ key: 'workbench.editor.mouseBackForwardToNavigate', category: C, title: 'Mouse Back Forward To Navigate', type: 'boolean', default: true, description: 'Enables the use of mouse buttons four and five for commands Go Back and Go Forward.' });
/** workbench.editor.pinnedTabSizing (W76): pinned tabs as wide as their name, icon only, or shrunk. */
export const pinnedTabSizing = defineSetting<'normal' | 'compact' | 'shrink'>({
  key: 'workbench.editor.pinnedTabSizing', category: C, title: 'Pinned Tab Sizing', type: 'enum', default: 'normal', description: 'Controls the size of pinned editor tabs.',
  options: [{ value: 'normal', description: 'A pinned tab inherits the look of non pinned tabs.' }, { value: 'compact', description: 'A pinned tab will show in a compact form with only icon or first letter of the editor name.' }, { value: 'shrink', description: 'A pinned tab shrinks to a compact fixed size showing parts of the editor name.' }],
});
