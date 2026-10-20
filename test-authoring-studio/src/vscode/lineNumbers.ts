import { gutter, GutterMarker, EditorView, type ViewUpdate } from '@codemirror/view';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** editor.lineNumbers (VS Code): on, off, relative to the caret's line, or every 10th line. */
export const lineNumbersSetting = defineSetting<'on' | 'off' | 'relative' | 'interval'>({
  key: 'editor.lineNumbers', category: 'Text Editor', title: 'Line Numbers', type: 'enum', default: 'on',
  description: 'Controls the display of line numbers.',
  options: [
    { value: 'off', description: 'Line numbers are not rendered.' },
    { value: 'on', description: 'Line numbers are rendered as absolute number.' },
    { value: 'relative', description: 'Line numbers are rendered as distance in lines to cursor position.' },
    { value: 'interval', description: 'Line numbers are rendered every 10 lines.' },
  ],
});

/** The text shown for line `n` when the caret is on line `caret`. */
export function lineLabel(mode: string, n: number, caret: number) {
  if (mode === 'relative') return n === caret ? String(n) : String(Math.abs(n - caret));
  if (mode === 'interval') return n === caret || n === 1 || n % 10 === 0 ? String(n) : '';
  return String(n);
}
class Num extends GutterMarker { constructor(readonly text: string) { super(); } eq(o: Num) { return o.text === this.text; } toDOM() { return document.createTextNode(this.text); } }

const hide = EditorView.theme({ '.cm-gutter.cm-lineNumbers:not(.cm-vsc-numbers)': { display: 'none !important' } });
settingsExtension(() => {
  const mode = lineNumbersSetting();
  if (mode === 'on') return [];
  if (mode === 'off') return [EditorView.editorAttributes.of({ class: 'cm-no-line-numbers cm-vsc-lines-off' }), hide];
  return [
    hide,
    EditorView.editorAttributes.of({ class: `cm-vsc-lines-${mode}` }),
    gutter({
      class: 'cm-lineNumbers cm-vsc-numbers',
      lineMarker: (view, line) => { const n = view.state.doc.lineAt(line.from).number; return new Num(lineLabel(mode, n, view.state.doc.lineAt(view.state.selection.main.head).number)); },
      lineMarkerChange: (u: ViewUpdate) => u.selectionSet,
      initialSpacer: (view) => new Num(String(view.state.doc.lines)),
      updateSpacer: (_s, u) => new Num(String(u.state.doc.lines)),
    }),
  ];
});
