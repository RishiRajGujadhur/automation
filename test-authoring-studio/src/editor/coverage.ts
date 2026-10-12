import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';

export type FileCoverage = { covered: number[]; uncovered: number[] } | null;
export const setCoverage = StateEffect.define<FileCoverage>();

class CoverageMarker extends GutterMarker {
  constructor(readonly hit: boolean) { super(); }
  eq(o: CoverageMarker) { return o.hit === this.hit; }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-cov ${this.hit ? 'cm-cov-hit' : 'cm-cov-miss'}`;
    el.title = this.hit ? 'Covered by the last coverage run' : 'Not covered';
    return el;
  }
}
const HIT = new CoverageMarker(true);
const MISS = new CoverageMarker(false);

const field = StateField.define<RangeSet<CoverageMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setCoverage)) {
      if (!e.value) return RangeSet.empty;
      const doc = tr.state.doc;
      const marks = [...e.value.covered.map((n) => [n, HIT] as const), ...e.value.uncovered.map((n) => [n, MISS] as const)]
        .filter(([n]) => n >= 1 && n <= doc.lines).sort((a, b) => a[0] - b[0]).map(([n, m]) => m.range(doc.line(n).from));
      return RangeSet.of(marks);
    }
    return set.map(tr.changes);
  },
});

/** Code coverage colouring (Visual Studio's "Show Code Coverage Coloring"): a green / red bar per covered / uncovered line. */
export function coverageGutter(): Extension {
  return [field, gutter({ class: 'cm-coverage-gutter', markers: (v) => v.state.field(field) })];
}
