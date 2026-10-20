import { EditorSelection, Prec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { featureOn } from '../features';

/** Markdown / text editing comforts (QOL-50 QL51–QL56), for .md, .markdown and .txt files. */
/** Markdown and text files wrap long lines (VS Code's Markdown default). */
/** Pasting a web address over selected text makes a Markdown link: [text](url). */
const URL_ONLY = /^https?:\/\/\S+$/;
export function pasteLink(view: EditorView, text: string) {
  const s = view.state.selection.main;
  if (s.empty || !URL_ONLY.test(text.trim()) || view.state.selection.ranges.length > 1) return false;
  const label = view.state.sliceDoc(s.from, s.to);
  if (label.includes('\n')) return false;
  const insert = `[${label}](${text.trim()})`;
  view.dispatch({ changes: { from: s.from, to: s.to, insert }, selection: { anchor: s.from + insert.length }, userEvent: 'input.paste' });
  return true;
}
const linkOnPaste = EditorView.domEventHandlers({ paste: (e, view) => (featureOn('md-paste-link') && pasteLink(view, e.clipboardData?.getData('text/plain') ?? '') ? (e.preventDefault(), true) : false) });
// markdown qol
export const markdownQol: Extension[] = [linkOnPaste, ...(featureOn('md-wrap') ? [EditorView.lineWrapping] : []), ];
