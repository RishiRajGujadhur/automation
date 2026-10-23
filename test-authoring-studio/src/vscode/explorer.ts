import { defineSetting } from './settings';

/** Explorer settings (VSCODE-250.md W92…), VS Code's ids. */
const E = 'Features ▸ Explorer';
export const explorerDeco = {
  colors: defineSetting<boolean>({ key: 'explorer.decorations.colors', category: E, title: 'Decorations: Colors', type: 'boolean', default: true, description: 'Controls whether file decorations should use colors.' }),
  badges: defineSetting<boolean>({ key: 'explorer.decorations.badges', category: E, title: 'Decorations: Badges', type: 'boolean', default: true, description: 'Controls whether file decorations should use badges.' }),
};
export const explorerSettings = {
  excludeGitIgnore: defineSetting<boolean>({ key: 'explorer.excludeGitIgnore', category: E, title: 'Exclude Git Ignore', type: 'boolean', default: true, description: 'Hide files matched by .gitignore in the Explorer, including when Show all files is active.' }),
  incrementalNaming: defineSetting<'visualStudio' | 'simple' | 'smart' | 'disabled'>({
    key: 'explorer.incrementalNaming', category: E, title: 'Incremental Naming', type: 'enum', default: 'visualStudio', description: 'Controls which naming strategy to use when giving a new name to a duplicated Explorer item on paste.',
    options: [{ value: 'visualStudio', description: 'Visual Studio\'s "Name - Copy.ext" (the studio\'s default).' }, { value: 'simple', description: 'Appends the word "copy" at the end of the duplicated name potentially followed by a number.' }, { value: 'smart', description: 'Adds a number at the end of the duplicated name. If some number is already part of the name, tries to increase that number.' }, { value: 'disabled', description: 'Disables incremental naming: the paste is refused when the name exists.' }],
  }),
  confirmDelete: defineSetting<boolean>({ key: 'explorer.confirmDelete', category: E, title: 'Confirm Delete', type: 'boolean', default: true, description: 'Controls whether the Explorer should ask for confirmation when deleting a file.' }),
  confirmDragAndDrop: defineSetting<boolean>({ key: 'explorer.confirmDragAndDrop', category: E, title: 'Confirm Drag And Drop', type: 'boolean', default: true, description: 'Controls whether the Explorer should ask for confirmation to move files and folders via drag and drop.' }),
  autoReveal: defineSetting<'true' | 'false' | 'focusNoScroll'>({
    key: 'explorer.autoReveal', category: E, title: 'Auto Reveal', type: 'enum', default: 'true', description: 'Controls whether the Explorer should automatically reveal and select files when opening them.',
    options: [{ value: 'true', description: 'Files will be revealed and selected.' }, { value: 'false', description: 'Files will not be revealed and selected.' }, { value: 'focusNoScroll', description: 'Files will not be scrolled into view, but will still be focused.' }],
  }),
  sortOrder: defineSetting<'default' | 'mixed' | 'filesFirst' | 'type'>({
    key: 'explorer.sortOrder', category: E, title: 'Sort Order', type: 'enum', default: 'default', description: 'Controls the property-based sorting of files and folders in the Explorer.',
    options: [{ value: 'default', description: 'Files and folders are sorted by their names. Folders are displayed before files.' }, { value: 'mixed', description: 'Files and folders are sorted by their names. Files are interwoven with folders.' }, { value: 'filesFirst', description: 'Files and folders are sorted by their names. Files are displayed before folders.' }, { value: 'type', description: 'Files and folders are grouped by extension type then sorted by their names. Folders are displayed before files.' }],
  }),
  compactFolders: defineSetting<boolean>({ key: 'explorer.compactFolders', category: E, title: 'Compact Folders', type: 'boolean', default: true, description: 'Controls whether the Explorer should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element.' }),
};
