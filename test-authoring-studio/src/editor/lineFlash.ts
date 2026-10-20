import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import { featureOn } from '../features';

/**
 * A brief highlight of the line you were taken to (Go to Line, F12, a search result, Back / Forward): jumps that
 * were not your own typing or caret movement, to a line more than a screen's few lines away.
 */
const flash = StateEffect.define<number | null>();
const deco = Decoration.line({ class: 'cm-flash-line' });
const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(flash)) return e.value === null ? Decoration.none : Decoration.set([deco.range(tr.state.doc.lineAt(e.value).from)]);
    return v.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});
export const lineFlash = [
  field,
  EditorView.updateListener.of((u) => {
    if (!featureOn('line-flash') || !u.selectionSet || u.docChanged) return;
    if (u.transactions.some((t) => t.isUserEvent('select') || t.isUserEvent('input') || t.isUserEvent('delete') || t.isUserEvent('move'))) return;
    const from = u.startState.doc.lineAt(u.startState.selection.main.head).number, to = u.state.doc.lineAt(u.state.selection.main.head).number;
    if (Math.abs(from - to) < 4) return;
    const at = u.state.selection.main.head;
    setTimeout(() => { u.view.dispatch({ effects: flash.of(at) }); setTimeout(() => u.view.dispatch({ effects: flash.of(null) }), 900); });
  }),
  EditorView.baseTheme({
    '@keyframes cm-flash': { from: { backgroundColor: 'rgba(255, 200, 0, 0.35)' }, to: { backgroundColor: 'transparent' } },
    '.cm-flash-line': { animation: 'cm-flash 0.9s ease-out' },
  }),
];
