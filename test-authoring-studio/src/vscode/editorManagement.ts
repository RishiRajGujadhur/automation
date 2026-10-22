import { defineSetting } from './settings';

/** Workbench ▸ Editor Management settings (VSCODE-250.md W65…), VS Code's ids. */
const C = 'Workbench ▸ Editor Management';
export const editorPreview = {
  enable: defineSetting<boolean>({ key: 'workbench.editor.enablePreview', category: C, title: 'Enable Preview', type: 'boolean', default: false, description: 'Controls whether opened editors show as preview editors. Preview editors do not stay open, are reused until explicitly set to be kept open (via double-click or editing), and show file names in italics. (The studio starts with it off; Preferences ▸ Preview tab turns it on too.)' }),
  fromQuickOpen: defineSetting<boolean>({ key: 'workbench.editor.enablePreviewFromQuickOpen', category: C, title: 'Enable Preview From Quick Open', type: 'boolean', default: false, description: 'Controls whether editors opened from Quick Open show as preview editors.' }),
  fromCode: defineSetting<boolean>({ key: 'workbench.editor.enablePreviewFromCodeNavigation', category: C, title: 'Enable Preview From Code Navigation', type: 'boolean', default: false, description: 'Controls whether editors remain in preview when a code navigation is started from them (Go to Definition…).' }),
};
