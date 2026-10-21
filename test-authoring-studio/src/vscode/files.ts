import { defineSetting } from './settings';

/** Files settings (VSCODE-250.md), VS Code's ids. */
const F = 'Text Editor ▸ Files';
export const files = {
  associations: defineSetting<Record<string, string>>({ key: 'files.associations', category: F, title: 'Associations', type: 'object', default: {}, description: 'Configure glob patterns of file associations to languages (for example "*.log": "plaintext", "**/settings/*.txt": "json"). These have precedence over the default associations of the languages installed.' }),
};
