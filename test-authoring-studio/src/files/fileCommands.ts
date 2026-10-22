import { activeEditor } from '../editor/activeEditor';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { registerAdvanced } from '../editor/advanced';
import { registerRider, runRider } from '../rider/commands';
import { skipSaveParticipantsOnce } from '../vscode/filesOnSave';

/** Ask an open editor to reload its file from disk / to save (CodeEditor listens, by file). */
export const REVERT_FILE_EVENT = 'tas:revert-file';
export const SAVE_FILE_EVENT = 'tas:save-file';

/** VS Code's File: Revert File and File: Save without Formatting (Ctrl+K S) (VSCODE-250.md W82). */
registerRider([
  { id: 'revert-file', label: 'File: Revert File', menu: 'Edit', group: true, run: () => { const a = activeEditor(); if (a) window.dispatchEvent(new CustomEvent(REVERT_FILE_EVENT, { detail: a.file })); } },
  { id: 'save-without-formatting', label: 'File: Save without Formatting', menu: 'Edit', shortcut: 'Ctrl+K S', run: () => { const a = activeEditor(); if (!a) return; skipSaveParticipantsOnce(); window.dispatchEvent(new CustomEvent(SAVE_FILE_EVENT, { detail: a.file })); } },
]);
// Ctrl+K S in an editor (CodeMirror chord).
registerAdvanced(() => Prec.high(keymap.of([{ key: 'Mod-k s', preventDefault: true, run: () => { runRider('save-without-formatting', 'key'); return true; } }])));
