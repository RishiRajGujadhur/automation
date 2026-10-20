import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { mapLines } from './textTools';

/**
 * Fourth batch of text tools (IDE-FEATURES-4.md): JetBrains Rider's String Manipulation actions and Visual Studio 2026
 * editor commands. Each rewrites the selection (or the word / line at the caret) and returns false when it has nothing to do.
 */

/** Replaces each selection (or, with none, the word or line at the caret) with `fn(text)`. */
export function mapSelections(fn: (text: string) => string | null, empty: 'word' | 'line' | 'doc' = 'word') {
  return (view: EditorView) => {
    const { state } = view;
    let changed = false;
    const tr = state.changeByRange((r) => {
      let { from, to } = r;
      if (r.empty) {
        if (empty === 'doc') { from = 0; to = state.doc.length; }
        else if (empty === 'line') { const l = state.doc.lineAt(r.head); from = l.from; to = l.to; }
        else { const w = state.wordAt(r.head); if (w) { from = w.from; to = w.to; } }
      }
      const text = state.sliceDoc(from, to);
      const next = from === to ? null : fn(text);
      if (next === null || next === text) return { range: r };
      changed = true;
      return { changes: { from, to, insert: next }, range: EditorSelection.range(from, from + next.length) };
    });
    if (!changed) return false;
    view.dispatch({ ...tr, userEvent: 'input.convert' });
    return true;
  };
}
export { mapLines };

/** URL Encode / Decode (Rider String Manipulation): percent-encoding of the selection. */
export const urlEncode = mapSelections((t) => encodeURIComponent(t), 'line');
export const urlDecode = mapSelections((t) => { try { return decodeURIComponent(t.replace(/\+/g, ' ')); } catch { return null; } }, 'line');
