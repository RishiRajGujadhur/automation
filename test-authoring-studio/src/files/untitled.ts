import { api } from '../api';
import { activeEditor } from '../editor/activeEditor';
import { renameTab } from './tabs';
import { registerRider } from '../rider/commands';
import { openInputBox } from '../quickinput/store';

/**
 * Untitled editors (VSCODE-250.md W62): File ▸ New Untitled Text File opens "Untitled-1", kept under .tas/untitled
 * until Ctrl+S asks for a name (Save As) and writes it there.
 */
export const isUntitled = (file: string) => /^\.tas\/untitled\/Untitled-\d+\.txt$/.test(file);
/** The tab label of a file: "Untitled-1" for an untitled editor. */
export const untitledLabel = (file: string) => (isUntitled(file) ? file.split('/').pop()!.replace(/\.txt$/, '') : undefined);
const notice = (m: string) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: m }));
const open = (file: string) => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file, line: 1 } }));

export async function newUntitled() {
  try { open((await api<{ file: string }>('/untitled/new', {})).file); } catch (e) { notice((e as Error).message); }
}

/** Save As for an untitled editor: a name relative to the workspace, then the file is written and the tab follows. */
export function saveUntitledAs(file: string) {
  const a = activeEditor();
  const text = a && a.file === file ? a.view.state.doc.toString() : '';
  openInputBox({
    prompt: 'Save As: the file\'s path in the workspace',
    value: 'untitled.txt',
    validate: (v) => (!v.trim() ? 'Please type a file name' : /(^|[\\/])\.\.([\\/]|$)/.test(v) ? 'The path cannot leave the workspace' : /^[\\/]|^[a-z]:/i.test(v) ? 'Type a path relative to the workspace' : undefined),
    accept: async (to) => {
      try {
        const r = await api<{ file: string }>('/untitled/save-as', { from: file, to: to.trim(), source: text });
        try { localStorage.removeItem(`tas:unsaved:${file}`); } catch { /* storage blocked */ }
        renameTab(file, r.file);
        open(r.file);
        notice(`Saved ${r.file}.`);
      } catch (e) { notice((e as Error).message); }
    },
  });
}

registerRider([{ id: 'new-untitled', label: 'File: New Untitled Text File', menu: 'Edit', group: true, run: () => void newUntitled() }]);
// Ctrl+S in an untitled editor is Save As.
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
  const a = activeEditor();
  if (!a || !isUntitled(a.file) || !a.view.hasFocus) return;
  e.preventDefault();
  e.stopPropagation();
  saveUntitledAs(a.file);
}, true);
