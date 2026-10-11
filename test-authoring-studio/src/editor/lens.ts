import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

export type StepLens = { line: number; keyword: string; pattern: string; method: string; usages: { file: string; line: number; text: string; scenario: string }[] };
export const setLenses = StateEffect.define<StepLens[]>();

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
export function stepLenses(open: (l: StepLens) => void): Extension {
  const build = (doc: EditorView['state']['doc'], lenses: StepLens[]) => {
    // One lens per line (a method can carry several step attributes: each gets its own).
    const ranges = lenses.filter((l) => l.line >= 1 && l.line <= doc.lines).sort((a, b) => a.line - b.line)
      .map((l) => {
        const line = doc.line(l.line);
        const indent = /^\s*/.exec(line.text)?.[0].length ?? 0;
        return Decoration.widget({ widget: new LensWidget(l, open, indent), block: true, side: -1 }).range(line.from);
      });
    return Decoration.set(ranges, true);
  };
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setLenses)) return build(tr.state.doc, e.value);
      return value.map(tr.changes);
    },
    provide: (f) => EditorView.decorations.from(f),
  });
}
