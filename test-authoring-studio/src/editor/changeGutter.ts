import { diffLines } from 'diff';
import { RangeSet, StateEffect, StateField, type Extension, type Text } from '@codemirror/state';
import { GutterMarker, ViewPlugin, gutter, type EditorView, type ViewUpdate } from '@codemirror/view';

/** The committed (HEAD) text of the file; null = not in HEAD (new file), undefined = not under Git. */
export const setBase = StateEffect.define<string | null | undefined>();
const setMarks = StateEffect.define<RangeSet<ChangeMarker>>();

type Kind = 'added' | 'modified' | 'deleted';
class ChangeMarker extends GutterMarker {
  constructor(readonly kind: Kind) { super(); }
  eq(o: ChangeMarker) { return o.kind === this.kind; }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-change cm-change-${this.kind}`;
    el.title = { added: 'Added since the last commit', modified: 'Changed since the last commit', deleted: 'Lines deleted here since the last commit' }[this.kind];
    return el;
  }
}
const markers: Record<Kind, ChangeMarker> = { added: new ChangeMarker('added'), modified: new ChangeMarker('modified'), deleted: new ChangeMarker('deleted') };
const norm = (s: string) => s.replace(/\r\n/g, '\n');

/** Line changes of the buffer against the base, as VS Code's / Visual Studio's change bars. */
export function changeMarks(base: string, doc: Text) {
  const ranges: { line: number; kind: Kind }[] = [];
  const parts = diffLines(norm(base), norm(doc.toString()));
  let line = 1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const count = p.count ?? 0;
    if (p.removed) {
      const next = parts[i + 1];
      if (next?.added) {
        // A removal followed by an addition is a modification (extra added lines are additions).
        const added = next.count ?? 0;
        for (let k = 0; k < added; k++) ranges.push({ line: line + k, kind: k < count ? 'modified' : 'added' });
        line += added;
        i++;
      } else ranges.push({ line: Math.min(line, doc.lines), kind: 'deleted' });
    } else if (p.added) {
      for (let k = 0; k < count; k++) ranges.push({ line: line + k, kind: 'added' });
      line += count;
    } else line += count;
  }
  return ranges.filter((r) => r.line >= 1 && r.line <= doc.lines);
}

export function changeGutter(): Extension {
  const base = StateField.define<string | null | undefined>({ create: () => undefined, update: (v, tr) => { for (const e of tr.effects) if (e.is(setBase)) return e.value; return v; } });
  const marks = StateField.define<RangeSet<ChangeMarker>>({
    create: () => RangeSet.empty,
    update(v, tr) { for (const e of tr.effects) if (e.is(setMarks)) return e.value; return v.map(tr.changes); },
  });
  const compute = (view: EditorView) => {
    const b = view.state.field(base);
    if (b === undefined) return RangeSet.empty;
    const doc = view.state.doc;
    // Not in HEAD: every line is new.
    const list = b === null ? Array.from({ length: doc.lines }, (_, i) => ({ line: i + 1, kind: 'added' as Kind })) : changeMarks(b, doc);
    return RangeSet.of(list.map((r) => markers[r.kind].range(doc.line(r.line).from)), true);
  };
  const plugin = ViewPlugin.fromClass(class {
    timer = 0;
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      const baseChanged = u.transactions.some((t) => t.effects.some((e) => e.is(setBase)));
      if (!u.docChanged && !baseChanged) return;
      clearTimeout(this.timer);
      // Diffing on every keystroke is wasteful: settle first (immediately when the base changed).
      this.timer = window.setTimeout(() => { if (this.view.dom.isConnected) this.view.dispatch({ effects: setMarks.of(compute(this.view)) }); }, baseChanged ? 0 : 300);
    }
    destroy() { clearTimeout(this.timer); }
  });
  return [base, marks, plugin, gutter({ class: 'cm-change-gutter', markers: (v) => v.state.field(marks) })];
}
