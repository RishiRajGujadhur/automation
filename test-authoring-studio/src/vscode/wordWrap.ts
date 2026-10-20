import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type EditorState } from '@codemirror/state';
import { getIndentUnit } from '@codemirror/language';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Word wrap (VS Code): off, at the viewport, at a column, or at whichever is smaller; and the indent of wrapped lines. */
export const wordWrap = {
  mode: defineSetting<'off' | 'on' | 'wordWrapColumn' | 'bounded'>({
    key: 'editor.wordWrap', category: 'Text Editor', title: 'Word Wrap', type: 'enum', default: 'off', description: 'Controls how lines should wrap. View ▸ Soft Wrap also wraps at the viewport.',
    options: [
      { value: 'off', description: 'Lines will never wrap.' },
      { value: 'on', description: 'Lines will wrap at the viewport width.' },
      { value: 'wordWrapColumn', description: 'Lines will wrap at editor.wordWrapColumn.' },
      { value: 'bounded', description: 'Lines will wrap at the minimum of viewport and editor.wordWrapColumn.' },
    ],
  }),
  column: defineSetting<number>({ key: 'editor.wordWrapColumn', category: 'Text Editor', title: 'Word Wrap Column', type: 'number', default: 80, min: 1, max: 500, description: 'Controls the wrapping column of the editor when editor.wordWrap is wordWrapColumn or bounded.' }),
  indent: defineSetting<'none' | 'same' | 'indent' | 'deepIndent'>({
    key: 'editor.wrappingIndent', category: 'Text Editor', title: 'Wrapping Indent', type: 'enum', default: 'same', description: 'Controls the indentation of wrapped lines.',
    options: [
      { value: 'none', description: 'No indentation. Wrapped lines begin at column 1.' },
      { value: 'same', description: 'Wrapped lines get the same indentation as the parent.' },
      { value: 'indent', description: 'Wrapped lines get +1 indentation toward the parent.' },
      { value: 'deepIndent', description: 'Wrapped lines get +2 indentation toward the parent.' },
    ],
  }),
};
/** Columns a wrapped line of `text` continues at. Pure, for the unit tests. */
export function hangingIndent(text: string, mode: string, tabSize: number, unit: number) {
  if (mode === 'none') return 0;
  let cols = 0;
  for (const ch of text) { if (ch === ' ') cols++; else if (ch === '\t') cols += tabSize - (cols % tabSize); else break; }
  return cols + (mode === 'indent' ? unit : mode === 'deepIndent' ? 2 * unit : 0);
}
const decoFor = new Map<number, Decoration>();
const hang = (n: number) => { let d = decoFor.get(n); if (!d) { d = Decoration.line({ attributes: { style: `padding-left: calc(${n}ch + 6px); text-indent: -${n}ch` } }); decoFor.set(n, d); } return d; };
function build(view: EditorView, mode: string, state: EditorState): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  if (!view.lineWrapping || mode === 'none') return b.finish();
  const unit = getIndentUnit(state);
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = state.doc.lineAt(pos);
      const n = line.length ? hangingIndent(line.text, mode, state.tabSize, unit) : 0;
      if (n) b.add(line.from, line.from, hang(n));
      pos = line.to + 1;
    }
  }
  return b.finish();
}
settingsExtension(() => {
  const mode = wordWrap.mode(), col = wordWrap.column(), indent = wordWrap.indent();
  const wrap = mode === 'off' ? [] : [EditorView.lineWrapping, EditorView.editorAttributes.of({ class: `cm-vsc-wrap-${mode}` })];
  const width = mode === 'wordWrapColumn' ? EditorView.theme({ '.cm-content': { flexGrow: '0 !important', width: `calc(${col}ch + 8px)`, minWidth: `calc(${col}ch + 8px)` } })
    : mode === 'bounded' ? EditorView.theme({ '.cm-content': { flexGrow: '0 !important', maxWidth: `calc(${col}ch + 8px)` } }) : [];
  return [wrap, width, ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view, indent, view.state); }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || u.geometryChanged) this.decorations = build(u.view, indent, u.state); }
  }, { decorations: (v) => v.decorations })];
});
