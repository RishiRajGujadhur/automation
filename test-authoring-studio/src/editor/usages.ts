import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';

/** Highlight Usages in File (Rider, Ctrl+Shift+F7): marked ranges until Escape or an edit. */
export const setUsages = StateEffect.define<{ from: number; to: number }[]>();
const mark = Decoration.mark({ class: 'cm-usage-highlight' });
const usageField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setUsages)) return Decoration.set(e.value.filter((r) => r.to > r.from && r.to <= tr.state.doc.length).sort((a, b) => a.from - b.from).map((r) => mark.range(r.from, r.to)));
    return tr.docChanged ? Decoration.none : set;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function usageRanges(view: EditorView) {
  const out: { from: number; to: number }[] = [];
  view.state.field(usageField, false)?.between(0, view.state.doc.length, (from, to) => { out.push({ from, to }); });
  return out;
}
/** Whole-word occurrences of the word at the cursor (files without a language service). */
export function wordUsages(view: EditorView) {
  const st = view.state;
  const w = st.wordAt(st.selection.main.head);
  if (!w) return [];
  const word = st.sliceDoc(w.from, w.to);
  const text = st.doc.toString();
  const re = new RegExp(`(?<![\\w])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w])`, 'g');
  return [...text.matchAll(re)].map((m) => ({ from: m.index!, to: m.index! + word.length }));
}
/** Moves to the next / previous highlighted usage (F3 / Shift+F3 while usages are shown). */
function step(dir: 1 | -1) {
  return (view: EditorView) => {
    const list = usageRanges(view);
    if (!list.length) return false;
    const head = view.state.selection.main.head;
    const next = dir > 0 ? list.find((r) => r.from > head) ?? list[0] : [...list].reverse().find((r) => r.from < head) ?? list.at(-1)!;
    view.dispatch({ selection: { anchor: next.from, head: next.to }, scrollIntoView: true });
    return true;
  };
}

export function usageHighlights(): Extension {
  return [
    usageField,
    Prec.high(keymap.of([
      { key: 'Escape', run: (v) => { if (!usageRanges(v).length) return false; v.dispatch({ effects: setUsages.of([]) }); return true; } },
      { key: 'F3', run: step(1) },
      { key: 'Shift-F3', run: step(-1) },
    ])),
    EditorView.baseTheme({ '.cm-usage-highlight': { backgroundColor: 'rgba(98, 166, 255, 0.28)', outline: '1px solid rgba(98, 166, 255, 0.6)', borderRadius: '2px' } }),
  ];
}
