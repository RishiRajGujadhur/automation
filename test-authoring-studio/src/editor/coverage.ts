import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';

export type FileCoverage = { covered: number[]; uncovered: number[]; partial?: { line: number; covered: number; total: number }[] } | null;
export const setCoverage = StateEffect.define<FileCoverage>();

class CoverageMarker extends GutterMarker {
  constructor(readonly hit: boolean, readonly branches?: { covered: number; total: number }) { super(); }
  eq(o: CoverageMarker) { return o.hit === this.hit && o.branches?.covered === this.branches?.covered && o.branches?.total === this.branches?.total; }
  toDOM() {
    const el = document.createElement('span');
    // A line whose branches are not all taken is partly covered (Visual Studio's yellow).
    const partial = !!this.branches && this.branches.covered < this.branches.total;
    el.className = `cm-cov ${partial ? 'cm-cov-partial' : this.hit ? 'cm-cov-hit' : 'cm-cov-miss'}`;
    el.title = partial ? `Partly covered: ${this.branches!.covered} of ${this.branches!.total} branches` : this.hit ? `Covered by the last coverage run${this.branches ? ` (all ${this.branches.total} branches)` : ''}` : 'Not covered';
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
      const branches = new Map((e.value.partial ?? []).map((p) => [p.line, p]));
      const marks = [...e.value.covered.map((n) => [n, branches.has(n) ? new CoverageMarker(true, branches.get(n)) : HIT] as const), ...e.value.uncovered.map((n) => [n, MISS] as const)]
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
