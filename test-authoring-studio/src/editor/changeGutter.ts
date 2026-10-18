import { diffLines } from 'diff';
import { EditorSelection, RangeSet, StateEffect, StateField, type EditorState, type Extension, type Text } from '@codemirror/state';
import { EditorView, GutterMarker, ViewPlugin, gutter, type ViewUpdate } from '@codemirror/view';

const EditorViewScroll = (at: number) => EditorView.scrollIntoView(at, { y: 'center' });

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

const base = StateField.define<string | null | undefined>({ create: () => undefined, update: (v, tr) => { for (const e of tr.effects) if (e.is(setBase)) return e.value; return v; } });
/** The committed text the change bars compare with (undefined: not under Git). */
export const baseOf = (state: EditorState) => state.field(base, false);

/** A changed region: buffer lines [start, end] (end = start - 1 for a deletion) and the committed lines it replaced. */
export type Hunk = { start: number; end: number; base: string[] };
export function hunks(baseText: string, doc: Text): Hunk[] {
  const out: Hunk[] = [];
  const parts = diffLines(norm(baseText), norm(doc.toString()));
  const lines = (v: string) => v.replace(/\n$/, '').split('\n');
  let line = 1;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const count = p.count ?? 0;
    if (p.removed) {
      const next = parts[i + 1];
      if (next?.added) { out.push({ start: line, end: line + (next.count ?? 0) - 1, base: lines(p.value) }); line += next.count ?? 0; i++; }
      else out.push({ start: line, end: line - 1, base: lines(p.value) });
    } else if (p.added) { out.push({ start: line, end: line + count - 1, base: [] }); line += count; }
    else line += count;
  }
  return out;
}
const currentHunks = (state: EditorState) => { const b = baseOf(state); return b === undefined ? null : hunks(b ?? '', state.doc); };

/** Next / Previous Change (Alt+F5 / Shift+Alt+F5): the caret goes to the next changed region (wrapping). */
export function gotoChange(dir: 1 | -1) {
  return (view: EditorView) => {
    const list = currentHunks(view.state);
    if (!list?.length) return true;
    const line = view.state.doc.lineAt(view.state.selection.main.head).number;
    const starts = list.map((h) => Math.max(1, Math.min(h.start, view.state.doc.lines)));
    const target = dir > 0 ? starts.find((s) => s > line) ?? starts[0] : [...starts].reverse().find((s) => s < line) ?? starts.at(-1)!;
    const at = view.state.doc.line(target).from;
    view.dispatch({ selection: EditorSelection.cursor(at), effects: EditorViewScroll(at), userEvent: 'select' });
    return true;
  };
}

/** Rollback Lines (Rider): the changed region at the caret (or touched by the selection) goes back to the committed text. */
export function rollbackLines(view: EditorView) {
  const list = currentHunks(view.state);
  if (!list?.length) return false;
  const doc = view.state.doc;
  const sel = view.state.selection.main;
  const a = doc.lineAt(sel.from).number, b = doc.lineAt(sel.to).number;
  const hit = list.filter((h) => (h.end >= h.start ? h.start <= b && h.end >= a : h.start - 1 <= b && h.start >= a));
  if (!hit.length) return false;
  const nl = view.state.lineBreak;
  const changes = hit.map((h) => {
    if (h.end < h.start) {
      // Deleted lines: put them back before line `start`.
      const at = h.start <= doc.lines ? doc.line(h.start).from : doc.length;
      return h.start <= doc.lines ? { from: at, insert: h.base.join(nl) + nl } : { from: at, insert: nl + h.base.join(nl) };
    }
    const from = doc.line(h.start).from;
    const toLine = doc.line(h.end);
    if (!h.base.length) return { from: Math.max(0, h.start > 1 ? from - nl.length : from), to: h.start > 1 ? toLine.to : Math.min(doc.length, toLine.to + nl.length) };
    return { from, to: toLine.to, insert: h.base.join(nl) };
  });
  view.dispatch({ changes, userEvent: 'input.rollback' });
  return true;
}

export function changeGutter(): Extension {
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
