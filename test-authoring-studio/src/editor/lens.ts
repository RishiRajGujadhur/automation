import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

export type StepLens = { line: number; keyword: string; pattern: string; method: string; usages: { file: string; line: number; text: string; scenario: string }[] };
export const setLenses = StateEffect.define<StepLens[]>();
/** Reference counts (Visual Studio's "3 references") for each type and member declared in the file. */
export type RefLens = { line: number; symbolLine: number; symbolColumn: number; name: string; count: number; test?: 'passed' | 'failed' | 'skipped' | 'none' | 'running' };
export const setRefLenses = StateEffect.define<RefLens[]>();

class RefLensWidget extends WidgetType {
  constructor(readonly lens: RefLens, readonly open: (l: RefLens) => void, readonly indent: number) { super(); }
  eq(o: RefLensWidget) { return o.lens.test === this.lens.test && o.lens.count === this.lens.count && o.lens.name === this.lens.name && o.indent === this.indent; }
  toDOM() {
    const row = document.createElement('div');
    row.className = 'cm-lens';
    row.style.paddingLeft = `${this.indent}ch`;
    const a = document.createElement('button');
    const n = this.lens.count;
    a.textContent = `${n} reference${n === 1 ? '' : 's'}`;
    a.className = n ? '' : 'none';
    a.title = n ? `Find All References to ${this.lens.name}` : `Nothing references ${this.lens.name}`;
    a.onmousedown = (e) => { e.preventDefault(); if (n) this.open(this.lens); };
    // Test methods: the last run's outcome first, as Visual Studio's test CodeLens.
    const t = this.lens.test;
    if (t) {
      const s = document.createElement('span');
      s.className = `cm-lens-test ${t}`;
      s.textContent = { passed: '✓ Passed', failed: '✕ Failed', skipped: '○ Skipped', none: '▶ Not run', running: '◌ Running' }[t];
      row.append(s, document.createTextNode(' | '));
    }
    row.append(a);
    return row;
  }
  ignoreEvent() { return true; }
}

class LensWidget extends WidgetType {
  constructor(readonly lens: StepLens, readonly open: (l: StepLens) => void, readonly indent: number) { super(); }
  eq(o: LensWidget) { return o.lens.usages.length === this.lens.usages.length && o.lens.pattern === this.lens.pattern; }
  toDOM() {
    const row = document.createElement('div');
    row.className = 'cm-lens';
    row.style.paddingLeft = `${this.indent}ch`;
    const a = document.createElement('button');
    const n = this.lens.usages.length;
    const scenarios = new Set(this.lens.usages.map((u) => `${u.file}#${u.scenario}`)).size;
    a.textContent = n ? `${n} step usage${n === 1 ? '' : 's'} · ${scenarios} scenario${scenarios === 1 ? '' : 's'}` : '0 step usages';
    a.className = n ? '' : 'none';
    a.title = n ? 'Show the feature lines that use this step (Find Step Usages)' : 'No feature uses this step yet';
    a.onmousedown = (e) => { e.preventDefault(); if (n) this.open(this.lens); };
    row.append(a);
    return row;
  }
  ignoreEvent() { return true; }
}

/**
 * CodeLens for step definitions (like Visual Studio's reference counts and the Reqnroll extension): a line above each
 * [Given]/[When]/[Then] binding with how many feature steps use it; clicking lists them. Lenses follow edits.
 */
export function stepLenses(open: (l: StepLens) => void, openRefs?: (l: RefLens) => void): Extension {
  let steps: StepLens[] = [];
  let refs: RefLens[] = [];
  const build = (doc: EditorView['state']['doc'], lenses: StepLens[]) => {
    // One lens per line (a method can carry several step attributes: each gets its own).
    const ranges = lenses.filter((l) => l.line >= 1 && l.line <= doc.lines).sort((a, b) => a.line - b.line)
      .map((l) => {
        const line = doc.line(l.line);
        const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
        return Decoration.widget({ widget: new LensWidget(l, open, indent), block: true, side: -1 }).range(line.from);
      });
    // Reference counts go on declarations without a step lens on the same line.
    const taken = new Set(ranges.map((r) => r.from));
    const refRanges = openRefs ? refs.filter((l) => l.line >= 1 && l.line <= doc.lines).flatMap((l) => {
      const line = doc.line(l.line);
      if (taken.has(line.from)) return [];
      taken.add(line.from);
      const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
      return [Decoration.widget({ widget: new RefLensWidget(l, openRefs, indent), block: true, side: -1 }).range(line.from)];
    }) : [];
    return Decoration.set([...ranges, ...refRanges], true);
  };
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      let rebuild = false;
      for (const e of tr.effects) {
        if (e.is(setLenses)) { steps = e.value; rebuild = true; }
        if (e.is(setRefLenses)) { refs = e.value; rebuild = true; }
      }
      if (rebuild) return build(tr.state.doc, steps);
      return value.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
