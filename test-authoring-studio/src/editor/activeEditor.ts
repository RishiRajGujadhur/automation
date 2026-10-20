import { EditorView, ViewPlugin } from '@codemirror/view';
import { Compartment, EditorState } from '@codemirror/state';

/** The editor that last had focus (and its file): app-level commands (menus, palette, Rider tools) act on it. */
type Active = { view: EditorView; file: string };
let last: Active | undefined;
const files = new WeakMap<EditorView, string>();

const visible = (v: EditorView) => v.dom.isConnected && v.dom.getClientRects().length > 0;

/** Toggle Read-Only (VS Code's "Toggle Active Editor Read-only in Session"): files that refuse edits until toggled back. */
const readOnly = new Compartment();
const readOnlyFiles = new Set<string>();
const editors = new Set<EditorView>();
const readOnlyExt = (on: boolean) => (on ? [EditorState.readOnly.of(true), EditorView.editorAttributes.of({ class: 'cm-session-readonly' })] : []);
export const isReadOnlyFile = (file: string) => readOnlyFiles.has(file);
export function setReadOnlyFile(file: string, on: boolean) {
  if (on) readOnlyFiles.add(file); else readOnlyFiles.delete(file);
  for (const v of editors) if (files.get(v) === file) v.dispatch({ effects: readOnly.reconfigure(readOnlyExt(on)) });
}

/** The last focused editor while it is still shown, else the first visible editor on the page. */
export function activeEditor(): Active | undefined {
  if (last && visible(last.view)) return last;
  for (const dom of document.querySelectorAll<HTMLElement>('.cm-editor')) {
    const view = EditorView.findFromDOM(dom);
    if (view && files.has(view) && visible(view)) return { view, file: files.get(view)! };
  }
  return undefined;
}

/** Registers an editor for {@link activeEditor}. */
export function trackActive(file: string) {
  return [readOnly.of(readOnlyExt(readOnlyFiles.has(file))), ViewPlugin.fromClass(class {
    off: () => void;
    constructor(readonly view: EditorView) {
      files.set(view, file);
      editors.add(view);
      const on = () => { last = { view, file }; };
      view.contentDOM.addEventListener('focus', on);
      this.off = () => view.contentDOM.removeEventListener('focus', on);
    }
    destroy() { this.off(); editors.delete(this.view); if (last?.view === this.view) last = undefined; }
  })];
}

/**
 * Gives an editor focus back after a menu or popup without losing its caret: when a menu closes, the browser can move
 * the DOM selection, and the editor would read it as a caret at the start of the file.
 */
export function focusKeepingSelection(view: EditorView, deferred = false) {
  const { doc, selection } = view.state;
  const restore = () => { if (view.state.doc === doc && !view.state.selection.eq(selection)) view.dispatch({ selection }); };
  const focus = () => { view.focus(); restore(); requestAnimationFrame(restore); setTimeout(restore, 60); };
  if (deferred) requestAnimationFrame(focus); else focus();
}

// e2e tests read the editor state through this (development builds only).
if (import.meta.env?.DEV && typeof window !== 'undefined') (window as unknown as { __activeEditor: typeof activeEditor }).__activeEditor = activeEditor;
