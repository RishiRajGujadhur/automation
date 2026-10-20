import { Decoration, ViewPlugin, type DecorationSet, type EditorView, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** editor.renderWhitespace (VS Code): which spaces and tabs are drawn as · and →. */
export const renderWhitespace = defineSetting<'none' | 'boundary' | 'selection' | 'trailing' | 'all'>({
  key: 'editor.renderWhitespace', category: 'Text Editor', title: 'Render Whitespace', type: 'enum', default: 'selection', description: 'Controls how the editor should render whitespace characters.',
  options: [
    { value: 'none' },
    { value: 'boundary', description: 'Render whitespace characters except for single spaces between words.' },
    { value: 'selection', description: 'Render whitespace characters only on selected text.' },
    { value: 'trailing', description: 'Render only trailing whitespace characters.' },
    { value: 'all' },
  ],
});

/** The whitespace characters of a line to draw, as offsets in the line. Pure, for the unit tests. */
export function whitespaceToDraw(text: string, mode: string, selected: [number, number][] = []): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/[ \t]+/g)) {
    const from = m.index!, to = from + m[0].length;
    const edge = from === 0 || to === text.length;
    const take = mode === 'all' || (mode === 'boundary' && (edge || m[0].length > 1 || m[0].includes('\t'))) || (mode === 'trailing' && to === text.length);
    for (let i = from; i < to; i++) if (take || (mode === 'selection' && selected.some(([a, b]) => i >= a && i < b))) out.push(i);
  }
  return out;
}
const space = Decoration.mark({ class: 'cm-highlightSpace' });
const tab = Decoration.mark({ class: 'cm-highlightTab' });
function build(view: EditorView, mode: string): DecorationSet {
  const b = new RangeSetBuilder<Decoration>();
  const sel = view.state.selection.ranges.filter((r) => !r.empty);
  if (mode === 'selection' && !sel.length) return b.finish();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      const selected = sel.filter((r) => r.to > line.from && r.from < line.to).map((r) => [Math.max(0, r.from - line.from), r.to - line.from] as [number, number]);
      if (mode !== 'selection' || selected.length) for (const i of whitespaceToDraw(line.text, mode, selected)) b.add(line.from + i, line.from + i + 1, line.text[i] === '\t' ? tab : space);
      pos = line.to + 1;
    }
  }
  return b.finish();
}
settingsExtension(() => {
  const mode = renderWhitespace();
  if (mode === 'none') return [];
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view, mode); }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || (mode === 'selection' && u.selectionSet)) this.decorations = build(u.view, mode); }
  }, { decorations: (v) => v.decorations });
});
