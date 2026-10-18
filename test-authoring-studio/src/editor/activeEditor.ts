import { EditorView, ViewPlugin } from '@codemirror/view';

/** The editor that last had focus (and its file): app-level commands (menus, palette, Rider tools) act on it. */
type Active = { view: EditorView; file: string };
let last: Active | undefined;
const files = new WeakMap<EditorView, string>();

const visible = (v: EditorView) => v.dom.isConnected && v.dom.getClientRects().length > 0;

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
  return ViewPlugin.fromClass(class {
    off: () => void;
    constructor(readonly view: EditorView) {
      files.set(view, file);
      const on = () => { last = { view, file }; };
      view.contentDOM.addEventListener('focus', on);
      this.off = () => view.contentDOM.removeEventListener('focus', on);
    }
    destroy() { this.off(); if (last?.view === this.view) last = undefined; }
  });
}
