import { defineSetting } from './settings';

/** Git settings (VSCODE-250.md), VS Code's ids. */
const G = 'Extensions ▸ Git';
export const gitSettings = {
  blameStatusBar: defineSetting<boolean>({ key: 'git.blame.statusBarItem.enabled', category: G, title: 'Blame: Status Bar Item Enabled', type: 'boolean', default: true, description: 'Controls whether to show blame information in the status bar.' }),
};
