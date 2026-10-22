import { defineSetting } from './settings';

/** Explorer settings (VSCODE-250.md W92…), VS Code's ids. */
const E = 'Features ▸ Explorer';
export const explorerDeco = {
  colors: defineSetting<boolean>({ key: 'explorer.decorations.colors', category: E, title: 'Decorations: Colors', type: 'boolean', default: true, description: 'Controls whether file decorations should use colors.' }),
  badges: defineSetting<boolean>({ key: 'explorer.decorations.badges', category: E, title: 'Decorations: Badges', type: 'boolean', default: true, description: 'Controls whether file decorations should use badges.' }),
};
export const explorerSettings = {
  compactFolders: defineSetting<boolean>({ key: 'explorer.compactFolders', category: E, title: 'Compact Folders', type: 'boolean', default: true, description: 'Controls whether the Explorer should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element.' }),
};
