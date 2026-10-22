import { defineSetting } from './settings';

/** Explorer settings (VSCODE-250.md W92…), VS Code's ids. */
const E = 'Features ▸ Explorer';
export const explorerDeco = {
  colors: defineSetting<boolean>({ key: 'explorer.decorations.colors', category: E, title: 'Decorations: Colors', type: 'boolean', default: true, description: 'Controls whether file decorations should use colors.' }),
  badges: defineSetting<boolean>({ key: 'explorer.decorations.badges', category: E, title: 'Decorations: Badges', type: 'boolean', default: true, description: 'Controls whether file decorations should use badges.' }),
};
export const explorerSettings = {
  sortOrder: defineSetting<'default' | 'mixed' | 'filesFirst' | 'type'>({
    key: 'explorer.sortOrder', category: E, title: 'Sort Order', type: 'enum', default: 'default', description: 'Controls the property-based sorting of files and folders in the Explorer.',
    options: [{ value: 'default', description: 'Files and folders are sorted by their names. Folders are displayed before files.' }, { value: 'mixed', description: 'Files and folders are sorted by their names. Files are interwoven with folders.' }, { value: 'filesFirst', description: 'Files and folders are sorted by their names. Files are displayed before folders.' }, { value: 'type', description: 'Files and folders are grouped by extension type then sorted by their names. Folders are displayed before files.' }],
  }),
  compactFolders: defineSetting<boolean>({ key: 'explorer.compactFolders', category: E, title: 'Compact Folders', type: 'boolean', default: true, description: 'Controls whether the Explorer should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element.' }),
};
