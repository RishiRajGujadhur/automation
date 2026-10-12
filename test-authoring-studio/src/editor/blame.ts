import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';

export type BlameLine = { hash: string; author: string; when: string; summary: string };
/** One entry per line of the file (null hides the annotations). */
export const setBlame = StateEffect.define<BlameLine[] | null>();

class BlameMarker extends GutterMarker {
  constructor(readonly b: BlameLine, readonly first: boolean) { super(); }
  eq(o: BlameMarker) { return o.b.hash === this.b.hash && o.first === this.first; }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-blame${this.first ? '' : ' cont'}`;
    const uncommitted = /^0+$/.test(this.b.hash);
    el.textContent = this.first ? (uncommitted ? 'Not committed yet' : `${this.b.hash.slice(0, 7)} ${this.b.author}, ${this.b.when}`) : '';
    el.title = uncommitted ? 'Local change' : `${this.b.hash.slice(0, 10)} — ${this.b.author}, ${this.b.when}\n${this.b.summary}`;
    return el;
  }
}

const field = StateField.define<BlameLine[] | null>({
  create: () => null,
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setBlame)) return e.value;
    // Edits shift lines: annotations would be wrong, so hide them until reloaded.
    return tr.docChanged ? null : v;
  },
});

/** Annotate (Visual Studio's Git ▸ Blame): who last changed each line, shown once per block of lines from one commit. */
export function blameGutter(): Extension {
  return [field, gutter({
    class: 'cm-blame-gutter',
    lineMarker(view, line) {
      const b = view.state.field(field);
      if (!b) return null;
      const n = view.state.doc.lineAt(line.from).number;
      const cur = b[n - 1];
      if (!cur) return null;
      return new BlameMarker(cur, n === 1 || b[n - 2]?.hash !== cur.hash);
    },
    lineMarkerChange: (u) => u.startState.field(field) !== u.state.field(field),
  })];
}
