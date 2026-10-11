import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { GutterMarker, gutter } from '@codemirror/view';

export type RunMark = { line: number; outcome: 'passed' | 'failed' | 'skipped' | 'none' | 'running'; label: string };
export const setRunMarks = StateEffect.define<RunMark[]>();

class RunMarker extends GutterMarker {
  constructor(readonly mark: RunMark) { super(); }
  eq(o: RunMarker) { return o.mark.outcome === this.mark.outcome && o.mark.label === this.mark.label; }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-run cm-run-${this.mark.outcome}`;
    const what = { passed: 'Passed', failed: 'Failed', skipped: 'Skipped', none: 'Not run', running: 'Running' }[this.mark.outcome];
    el.title = `${this.mark.label} (${what}). Click to run, Shift+click to debug.`;
    el.setAttribute('aria-label', `Run ${this.mark.label}`);
    el.textContent = this.mark.outcome === 'passed' ? '✓' : this.mark.outcome === 'failed' ? '✕' : this.mark.outcome === 'running' ? '◌' : '▶';
    return el;
  }
}

/**
 * Run / debug margin, like Visual Studio's test glyphs and VS Code's testing gutter: a ▶ beside each test (scenario,
 * feature, C# test method) showing its last outcome; click runs it, Shift+click debugs it.
 */
/** Unchanged marks keep their DOM (no flicker, clicks are not lost to re-rendering). */
function sameMarks(set: RangeSet<RunMarker>, next: RunMark[], doc: import('@codemirror/state').Text) {
  const have: string[] = [];
  set.between(0, doc.length, (from, _to, m) => { have.push(`${doc.lineAt(from).number}|${m.mark.outcome}|${m.mark.label}`); });
  const want = next.filter((m) => m.line >= 1 && m.line <= doc.lines).sort((a, b) => a.line - b.line).map((m) => `${m.line}|${m.outcome}|${m.label}`);
  return have.length === want.length && have.every((h, i) => h === want[i]);
}
export function runGutter(onRun: (line: number, debug: boolean) => void): Extension {
  const marks = StateField.define<RangeSet<RunMarker>>({
    create: () => RangeSet.empty,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setRunMarks)) {
        if (sameMarks(value, e.value, tr.state.doc)) return value;
        const doc = tr.state.doc;
        return RangeSet.of(e.value.filter((m) => m.line >= 1 && m.line <= doc.lines).sort((a, b) => a.line - b.line).map((m) => new RunMarker(m).range(doc.line(m.line).from)), true);
      }
      return value.map(tr.changes);
    },
  });
  return [
    marks,
    gutter({
      class: 'cm-run-gutter',
      markers: (v) => v.state.field(marks),
      domEventHandlers: {
        click: (view, block, event) => {
          let hit = false;
          view.state.field(marks).between(block.from, block.from, () => { hit = true; });
          if (!hit) return false;
          event.preventDefault();
          onRun(view.state.doc.lineAt(block.from).number, (event as MouseEvent).shiftKey);
          return true;
        },
      },
    }),
  ];
}
