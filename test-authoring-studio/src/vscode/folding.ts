import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { EditorState, StateField, RangeSetBuilder } from '@codemirror/state';
import { foldEffect, foldedRanges } from '@codemirror/language';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Folding (VS Code): on or off, when the fold arrows show, and a tint on folded lines. */
export const folding = {
  enabled: defineSetting<boolean>({ key: 'editor.folding', category: 'Text Editor', title: 'Folding', type: 'boolean', default: true, description: 'Controls whether the editor has code folding enabled.' }),
  controls: defineSetting<'always' | 'never' | 'mouseover'>({
    key: 'editor.showFoldingControls', category: 'Text Editor', title: 'Show Folding Controls', type: 'enum', default: 'mouseover', description: 'Controls when the folding controls on the gutter are shown.',
    options: [{ value: 'always', description: 'Always show the folding controls.' }, { value: 'never', description: 'Never show the folding controls and reduce the gutter size.' }, { value: 'mouseover', description: 'Only show the folding controls when the mouse is over the gutter.' }],
  }),
  highlight: defineSetting<boolean>({ key: 'editor.foldingHighlight', category: 'Text Editor', title: 'Folding Highlight', type: 'boolean', default: true, description: 'Controls whether the editor should highlight folded ranges.' }),
};
// No folding: fold commands do nothing (and what was folded opens).
const noFolds = EditorState.transactionFilter.of((tr) => {
  if (!tr.effects.some((e) => e.is(foldEffect))) return tr;
  return { changes: tr.changes, selection: tr.selection, scrollIntoView: tr.scrollIntoView, effects: tr.effects.filter((e) => !e.is(foldEffect)) };
});
const foldedLine = Decoration.line({ class: 'cm-vsc-folded' });
const highlight = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(_d, tr) {
    const b = new RangeSetBuilder<Decoration>();
    const seen = new Set<number>();
    foldedRanges(tr.state).between(0, tr.state.doc.length, (from) => { const l = tr.state.doc.lineAt(from); if (!seen.has(l.from)) { seen.add(l.from); b.add(l.from, l.from, foldedLine); } });
    return b.finish();
  },
  provide: (f) => EditorView.decorations.from(f),
});
settingsExtension(() => {
  const on = folding.enabled(), controls = folding.controls();
  if (!on) return [noFolds, EditorView.editorAttributes.of({ class: 'cm-vsc-no-folding' }), EditorView.theme({ '.cm-foldGutter': { display: 'none !important' } })];
  return [
    controls === 'never' ? EditorView.theme({ '.cm-foldGutter': { display: 'none !important' } })
      : controls === 'mouseover' ? EditorView.theme({ '.cm-foldGutter .cm-gutterElement': { opacity: '0', transition: 'opacity 0.15s' }, '.cm-gutters:hover .cm-foldGutter .cm-gutterElement, .cm-foldGutter .cm-gutterElement:focus-visible': { opacity: '1' } }) : [],
    folding.highlight() ? [highlight, EditorView.theme({ '.cm-vsc-folded': { backgroundColor: 'rgba(110, 140, 220, 0.12)' } })] : [],
  ];
});
