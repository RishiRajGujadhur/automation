import { activeEditor } from '../editor/activeEditor';
import { Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { registerAdvanced } from '../editor/advanced';
import { registerRider, runRider } from '../rider/commands';
import { skipSaveParticipantsOnce } from '../vscode/filesOnSave';
import { api } from '../api';
import { readFile } from './provider';
import { openQuickPick } from '../quickinput/store';
import { createMatches, fuzzyScore } from '../quickinput/fuzzy';
import { COMPARE_TEXTS_EVENT } from '../views/TimelineView';

/** Ask an open editor to reload its file from disk / to save (CodeEditor listens, by file). */
export const REVERT_FILE_EVENT = 'tas:revert-file';
export const SAVE_FILE_EVENT = 'tas:save-file';

/** VS Code's File: Revert File and File: Save without Formatting (Ctrl+K S) (VSCODE-250.md W82). */
/** W88 File: Compare Active File With…: Quick Open's file list, then the two files' diff. */
async function compareActiveWith() {
  const a = activeEditor();
  if (!a) return;
  const mine = a.view.state.doc.toString();
  const all = (await api<{ files: { file: string }[] }>('/solution').catch(() => ({ files: [] }))).files.map((f) => f.file).filter((f) => f !== a.file);
  openQuickPick({
    placeholder: 'Select a file to compare with',
    items: (q) => all.flatMap((f) => { const s = q.trim() ? fuzzyScore(q.trim(), f.split('/').pop()!, true) : [0, 0]; return s ? [{ id: f, label: f.split('/').pop()!, labelMatches: q.trim() ? createMatches(s) : [], description: f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '', score: s[0], accept: () => void readFile(f).then((r) => window.dispatchEvent(new CustomEvent(COMPARE_TEXTS_EVENT, { detail: { left: a.file, right: f, leftText: mine, rightText: r.source } }))) }] : []; }).sort((x, y) => y.score - x.score).slice(0, 100),
  });
}

registerRider([
  { id: 'compare-active-with', label: 'File: Compare Active File With...', menu: 'Edit', run: () => void compareActiveWith() },
  { id: 'revert-file', label: 'File: Revert File', menu: 'Edit', group: true, run: () => { const a = activeEditor(); if (a) window.dispatchEvent(new CustomEvent(REVERT_FILE_EVENT, { detail: a.file })); } },
  { id: 'save-without-formatting', label: 'File: Save without Formatting', menu: 'Edit', shortcut: 'Ctrl+K S', run: () => { const a = activeEditor(); if (!a) return; skipSaveParticipantsOnce(); window.dispatchEvent(new CustomEvent(SAVE_FILE_EVENT, { detail: a.file })); } },
]);
// Ctrl+K S in an editor (CodeMirror chord).
registerAdvanced(() => Prec.high(keymap.of([{ key: 'Mod-k s', preventDefault: true, run: () => { runRider('save-without-formatting', 'key'); return true; } }])));
