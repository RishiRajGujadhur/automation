import { ENCODINGS, encodingOf, setReopenEncoding, setSaveEncoding, type EncodingId } from '../files/encoding';
import { featureOn } from '../features';
import { runRider } from '../rider/commands';
import { unsavedFiles } from '../editor/autosave';
import { FILES_CHANGED_EVENT } from '../editor/events';
import { readFile, saveFile } from '../files/provider';
import { openQuickPick } from './store';

const list = (file: string, title: string, pick: (e: EncodingId) => void) => {
  const current = encodingOf(file)?.save ?? 'utf8';
  openQuickPick({ placeholder: title, activeId: current, items: ENCODINGS.map((e) => ({ id: e.id, label: e.label, description: e.id === current ? 'Current' : e.id, accept: () => pick(e.id) })) });
};

/** W25 the encoding item: Reopen with Encoding / Save with Encoding (VS Code), File Properties (the studio's). */
export function selectEncoding(file: string) {
  openQuickPick({
    placeholder: 'Select Action',
    items: [
      { id: 'reopen', label: 'Reopen with Encoding', description: 'Reads the file again in another encoding', accept: () => setTimeout(() => list(file, 'Select File Encoding to Reopen File', (e) => {
        if (unsavedFiles().includes(file)) { window.dispatchEvent(new CustomEvent('tas:notice', { detail: `${file.split('/').pop()} has unsaved changes: save or revert them before reopening it with another encoding.` })); return; }
        setReopenEncoding(file, e);
        window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: [file] }));
      })) },
      { id: 'save', label: 'Save with Encoding', description: 'Writes the file in another encoding', accept: () => setTimeout(() => list(file, 'Select File Encoding to Save with', (e) => {
        // Unchanged in the editor: written now (VS Code saves at once); with unsaved edits, the next save does it.
        if (unsavedFiles().includes(file)) { setSaveEncoding(file, e); window.dispatchEvent(new CustomEvent('tas:notice', { detail: 'The next save writes the file in the new encoding.' })); return; }
        void readFile(file).then((r) => { setSaveEncoding(file, e); return saveFile(file, r.source, r.hash); }).then(() => window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: [file] })), (err: Error) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: err.message })));
      })) },
      ...(featureOn('status-file-props') ? [{ id: 'props', label: 'File Properties', keybinding: 'Alt+Enter', accept: () => runRider('file-props', 'menu') }] : []),
    ],
  });
}
