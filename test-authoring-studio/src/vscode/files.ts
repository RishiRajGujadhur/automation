import { defineSetting } from './settings';

/** Files settings (VSCODE-250.md), VS Code's ids. */
const F = 'Text Editor ▸ Files';
export const files = {
  exclude: defineSetting<Record<string, boolean>>({ key: 'files.exclude', category: F, title: 'Exclude', type: 'object', default: { '**/.git': true, '**/.svn': true, '**/.hg': true, '**/.DS_Store': true, '**/Thumbs.db': true }, description: 'Configure glob patterns for excluding files and folders. The Explorer hides them unless Show All Files is on (VSCODE-250.md W100).' }),
  associations: defineSetting<Record<string, string>>({ key: 'files.associations', category: F, title: 'Associations', type: 'object', default: {}, description: 'Configure glob patterns of file associations to languages (for example "*.log": "plaintext", "**/settings/*.txt": "json"). These have precedence over the default associations of the languages installed.' }),
  encoding: defineSetting<'utf8' | 'utf8bom' | 'utf16le' | 'utf16be' | 'windows1252' | 'iso88591'>({ key: 'files.encoding', category: F, title: 'Encoding', type: 'enum', default: 'utf8', description: 'The default character set encoding to use when reading and writing files (a byte order mark wins when reading).', options: [{ value: 'utf8', label: 'UTF-8' }, { value: 'utf8bom', label: 'UTF-8 with BOM' }, { value: 'utf16le', label: 'UTF-16 LE' }, { value: 'utf16be', label: 'UTF-16 BE' }, { value: 'windows1252', label: 'Western (Windows 1252)' }, { value: 'iso88591', label: 'Western (ISO 8859-1)' }] }),
};
