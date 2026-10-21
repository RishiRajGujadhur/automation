import { defineSetting } from './settings';

/** Quick Input settings (VSCODE-250.md W13–W15, W20), VS Code's ids. */
const Q = 'Workbench ▸ Quick Open';
const P = 'Workbench ▸ Command Palette';
export const quickOpen = {
  closeOnFocusLost: defineSetting<boolean>({ key: 'workbench.quickOpen.closeOnFocusLost', category: Q, title: 'Close On Focus Lost', type: 'boolean', default: true, description: 'Controls whether Quick Open should close automatically once it loses focus.' }),
  preserveInput: defineSetting<boolean>({ key: 'workbench.quickOpen.preserveInput', category: Q, title: 'Preserve Input', type: 'boolean', default: false, description: 'Controls whether the last typed input to Quick Open should be restored when opening it the next time.' }),
  palettePreserveInput: defineSetting<boolean>({ key: 'workbench.commandPalette.preserveInput', category: P, title: 'Preserve Input', type: 'boolean', default: false, description: 'Controls whether the last typed input to the command palette should be restored when opening it the next time.' }),
  position: defineSetting<'top' | 'center'>({ key: 'workbench.quickInput.position', category: 'Workbench ▸ Quick Open', title: 'Quick Input Position', type: 'enum', default: 'top', description: 'Controls where the Quick Input (Quick Open, Command Palette) appears.', options: [{ value: 'top', description: 'At the top of the window.' }, { value: 'center', description: 'In the middle of the window.' }] }),
  history: defineSetting<number>({ key: 'workbench.commandPalette.history', category: P, title: 'History', type: 'number', default: 50, min: 0, max: 500, description: 'Controls the number of recently used commands to keep in history for the command palette. Set to 0 to disable command history.' }),
};
