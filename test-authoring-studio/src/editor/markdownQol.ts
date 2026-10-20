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
/** Ctrl+B / Ctrl+I: **bold** / *italic* around the selection (or the word at the caret), and off again. */
export function toggleWrap(mark: string) {
  return (view: EditorView) => {
    if (!featureOn('md-format-keys')) return false;
    const { state } = view;
    const changes = state.changeByRange((r) => {
      let { from, to } = r;
      if (r.empty) { const w = state.wordAt(r.head); if (w) ({ from, to } = w); }
      const before = state.sliceDoc(from - mark.length, from), after = state.sliceDoc(to, to + mark.length);
      if (before === mark && after === mark) return { changes: [{ from: from - mark.length, to: from }, { from: to, to: to + mark.length }], range: EditorSelection.range(from - mark.length, to - mark.length) };
      return { changes: [{ from, insert: mark }, { from: to, insert: mark }], range: EditorSelection.range(from + mark.length, to + mark.length) };
    });
    view.dispatch(changes, { userEvent: 'input' });
    return true;
  };
}
const formatKeys = Prec.high(keymap.of([{ key: 'Mod-b', run: toggleWrap('**') }, { key: 'Mod-i', run: toggleWrap('*') }]));
/** Enter in a list continues it (-, *, 1., - [ ]); Enter on an empty item ends the list. */
export function continueList(view: EditorView) {
  if (!featureOn('md-lists')) return false;
  const { state } = view;
  const s = state.selection.main;
  if (!s.empty) return false;
  const line = state.doc.lineAt(s.head);
  const m = /^(\s*)([-*+]|(\d+)[.)])(\s+)(\[[ xX]\]\s+)?/.exec(line.text);
  if (!m || s.head < line.from + m[0].length) return false;
  if (line.text.slice(m[0].length).trim() === '' ) {
    view.dispatch({ changes: { from: line.from, to: line.to, insert: '' }, userEvent: 'delete' });
    return true;
  }
  const bullet = m[3] ? `${Number(m[3]) + 1}${m[2].slice(-1)}` : m[2];
  const insert = `${state.lineBreak}${m[1]}${bullet}${m[4]}${m[5] ? '[ ] ' : ''}`;
  view.dispatch({ changes: { from: s.head, to: s.head, insert }, selection: { anchor: s.head + insert.length }, scrollIntoView: true, userEvent: 'input' });
  return true;
}
const listKeys = Prec.high(keymap.of([{ key: 'Enter', run: continueList }]));
// markdown qol
export const markdownQol: Extension[] = [listKeys, formatKeys, linkOnPaste, ...(featureOn('md-wrap') ? [EditorView.lineWrapping] : []), ];
