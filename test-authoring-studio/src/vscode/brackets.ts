import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { Prec, type EditorState } from '@codemirror/state';
import { matchBrackets } from '@codemirror/language';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Brackets (VS Code): which pair is highlighted, and whether brackets and quotes close themselves. */
const auto = [
  { value: 'always' }, { value: 'languageDefined', description: 'Use language configurations to determine when to autoclose.' },
  { value: 'beforeWhitespace', description: 'Autoclose only when the cursor is to the left of whitespace.' }, { value: 'never' },
];
export const brackets = {
  match: defineSetting<'always' | 'near' | 'never'>({ key: 'editor.matchBrackets', category: 'Text Editor', title: 'Match Brackets', type: 'enum', default: 'always', description: 'Highlight matching brackets: the pair around the caret (always), only next to the caret (near), or never.', options: [{ value: 'always' }, { value: 'near' }, { value: 'never' }] }),
  close: defineSetting<string>({ key: 'editor.autoClosingBrackets', category: 'Text Editor', title: 'Auto Closing Brackets', type: 'enum', default: 'languageDefined', description: 'Controls whether the editor should automatically close brackets after the user adds an opening bracket.', options: auto }),
  quotes: defineSetting<string>({ key: 'editor.autoClosingQuotes', category: 'Text Editor', title: 'Auto Closing Quotes', type: 'enum', default: 'languageDefined', description: 'Controls whether the editor should automatically close quotes after the user adds an opening quote.', options: auto }),
};
/** Whether a typed opening character may close itself, from the setting and the next character. Pure. */
export const mayClose = (mode: string, next: string) => mode === 'always' || mode === 'languageDefined' || (mode === 'beforeWhitespace' && (next === '' || /\s/.test(next)));
const OPEN = '([{', QUOTES = '"\'`';
// The editors' closeBrackets() handles closing; this runs first and types the plain character when it may not.
const typing = Prec.highest(EditorView.inputHandler.of((view, from, to, text) => {
  const kind = OPEN.includes(text) ? brackets.close() : QUOTES.includes(text) ? brackets.quotes() : null;
  if (!kind || text.length !== 1 || mayClose(kind, view.state.sliceDoc(to, to + 1))) return false;
  view.dispatch(view.state.update({ changes: { from, to, insert: text }, selection: { anchor: from + 1 }, userEvent: 'input.type' }));
  return true;
}));

/** The innermost bracket pair around `pos` ([open, close] positions), scanning back at most `limit` characters. */
export function enclosingPair(state: EditorState, pos: number, limit = 20000): [number, number] | null {
  let depth = 0;
  for (let i = pos - 1; i >= Math.max(0, pos - limit); i--) {
    const ch = state.sliceDoc(i, i + 1);
    if (')]}'.includes(ch)) depth++;
    else if ('([{'.includes(ch)) {
      if (depth) { depth--; continue; }
      const m = matchBrackets(state, i, 1);
      if (m?.matched && m.end && m.end.from >= pos) return [i, m.end.from];
    }
  }
  return null;
}
const mark = Decoration.mark({ class: 'cm-matchingBracket cm-vsc-enclosing' });
const always = ViewPlugin.fromClass(class {
  decorations: DecorationSet = Decoration.none;
  constructor(view: EditorView) { this.build(view.state); }
  update(u: ViewUpdate) { if (u.docChanged || u.selectionSet) this.build(u.state); }
  build(state: EditorState) {
    const pos = state.selection.main.head;
    // Next to a bracket CodeMirror's own matching already shows the pair.
    if (/[()[\]{}]/.test(state.sliceDoc(Math.max(0, pos - 1), pos + 1))) { this.decorations = Decoration.none; return; }
    const p = enclosingPair(state, pos);
    this.decorations = p ? Decoration.set([mark.range(p[0], p[0] + 1), mark.range(p[1], p[1] + 1)]) : Decoration.none;
  }
}, { decorations: (v) => v.decorations });
settingsExtension(() => {
  const m = brackets.match();
  return [
    typing,
    m === 'always' ? always : m === 'never' ? EditorView.theme({ '.cm-matchingBracket, .cm-nonmatchingBracket': { backgroundColor: 'transparent !important', outline: 'none !important', color: 'inherit !important' } }) : [],
  ];
});
