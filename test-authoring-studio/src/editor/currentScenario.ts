import { RangeSetBuilder } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { scenarioBlock } from './gherkinTools';

/** Highlight Current Scenario: a light band behind the scenario (tags to Examples) the caret is in. */
const band = Decoration.line({ class: 'cm-current-scenario' });
export const currentScenario = [
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) { if (u.docChanged || u.selectionSet) this.decorations = this.build(u.view); }
    build(view: EditorView) {
      const { state } = view;
      const b = new RangeSetBuilder<Decoration>();
      const blk = scenarioBlock(state, state.doc.lineAt(state.selection.main.head).number);
      if (blk) for (let n = blk.first; n <= blk.end; n++) b.add(state.doc.line(n).from, state.doc.line(n).from, band);
      return b.finish();
    }
  }, { decorations: (v) => v.decorations }),
  EditorView.baseTheme({
    '&light .cm-current-scenario': { backgroundColor: 'rgba(80, 140, 255, 0.05)' },
    '&dark .cm-current-scenario': { backgroundColor: 'rgba(120, 170, 255, 0.06)' },
  }),
];
