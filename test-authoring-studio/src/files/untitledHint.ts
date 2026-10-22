import { useSyncExternalStore } from 'react';
import { EditorView, ViewPlugin, placeholder, type ViewUpdate } from '@codemirror/view';
import { registerAdvanced } from '../editor/advanced';
import { defineSetting, onSettingsChanged } from '../vscode/settings';
import { isUntitled } from './untitled';
import { changeLanguageMode } from '../quickinput/languagePick';

/** workbench.editor.empty.hint / workbench.editor.untitled.labelFormat (VSCODE-250.md W63). */
export const emptyHint = defineSetting<'text' | 'hidden'>({ key: 'workbench.editor.empty.hint', category: 'Workbench ▸ Editor Management', title: 'Empty Hint', type: 'enum', default: 'text', description: 'Controls if the empty editor text hint should be visible in the editor.', options: [{ value: 'text' }, { value: 'hidden' }] });
export const untitledLabelFormat = defineSetting<'content' | 'name'>({ key: 'workbench.editor.untitled.labelFormat', category: 'Workbench ▸ Editor Management', title: 'Untitled: Label Format', type: 'enum', default: 'content', description: 'Controls the format of the label for an untitled editor.', options: [{ value: 'content', description: 'The name of the untitled file is derived from the contents of its first line.' }, { value: 'name', description: 'The name of the untitled file is not derived from the contents of the file.' }] });

// The first line of each untitled editor, for its tab label.
const firstLines = new Map<string, string>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };
onSettingsChanged(emit);
export const useUntitledLabels = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
/** "Untitled-1" or, with labelFormat content, the first line (up to 40 characters). */
export function untitledTabLabel(file: string, name: string) {
  const first = firstLines.get(file)?.trim();
  return untitledLabelFormat() === 'content' && first ? first.slice(0, 40) : name;
}

function hint(view: EditorView) {
  const el = document.createElement('span');
  el.className = 'cm-untitled-hint';
  const a = document.createElement('a');
  a.textContent = 'Select a language';
  a.href = '#';
  a.onmousedown = (e) => { e.preventDefault(); const file = view.dom.closest('[aria-label^="Editing "]')?.getAttribute('aria-label')?.slice(8); if (file) changeLanguageMode(file); };
  el.append(a, ', or start typing to dismiss. Open a different editor to get started.');
  return el;
}

registerAdvanced((file) => (!isUntitled(file) ? [] : [
  ...(emptyHint() === 'text' ? [placeholder((v: EditorView) => hint(v))] : []),
  ViewPlugin.fromClass(class {
    constructor(view: EditorView) { this.note(view); }
    update(u: ViewUpdate) { if (u.docChanged) this.note(u.view); }
    note(view: EditorView) { const line = view.state.doc.line(1).text; if (firstLines.get(file) !== line) { firstLines.set(file, line); emit(); } }
  }),
]));
