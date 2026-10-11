import { Prec, StateEffect, StateField, RangeSet, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, hoverTooltip, keymap, type DecorationSet } from '@codemirror/view';
import { api } from '../api';
import { breakpointsOf, currentFrame, getSnapshot, setBreakpoints, subscribe, toggleBreakpoint } from '../debug/store';

class BreakpointMarker extends GutterMarker {
  constructor(readonly verified: boolean) { super(); }
  eq(o: BreakpointMarker) { return o.verified === this.verified; }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-bp ${this.verified ? '' : 'pending'}`;
    el.title = 'Breakpoint (F9 to toggle)';
    return el;
  }
}
class ExecMarker extends GutterMarker {
  toDOM() { const el = document.createElement('span'); el.className = 'cm-exec-arrow'; el.title = 'Next statement'; return el; }
}
const bpMarker = new BreakpointMarker(true);
const execMarker = new ExecMarker();

const setLines = StateEffect.define<number[]>();
const setExec = StateEffect.define<number | null>();

const clampLines = (doc: Text, lines: number[]) => lines.filter((l) => l >= 1 && l <= doc.lines);
const linesOf = (doc: Text, set: RangeSet<GutterMarker>) => {
  const out: number[] = [];
  set.between(0, doc.length, (from) => { out.push(doc.lineAt(from).number); });
  return [...new Set(out)];
};
const toSet = (doc: Text, lines: number[]) => RangeSet.of(clampLines(doc, [...new Set(lines)].sort((a, b) => a - b)).map((l) => bpMarker.range(doc.line(l).from)));

const execLine = Decoration.line({ class: 'cm-exec-line' });

/**
 * Visual Studio style breakpoints for one repository file: click the gutter or press F9, the red dots follow
 * edits, and while the debugger is paused here the next statement is marked with a yellow arrow and line.
 * DataTips: hovering an identifier while paused shows its value.
 */
export function breakpoints(file: string): Extension {
  const field = StateField.define<RangeSet<GutterMarker>>({
    create: (state) => toSet(state.doc, breakpointsOf(file)),
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setLines)) return toSet(tr.state.doc, e.value);
      return value.map(tr.changes);
    },
  });
  const exec = StateField.define<{ line: number | null; deco: DecorationSet; marks: RangeSet<GutterMarker> }>({
    create: () => ({ line: null, deco: Decoration.none, marks: RangeSet.empty }),
    update(value, tr) {
      let line = value.line;
      for (const e of tr.effects) if (e.is(setExec)) line = e.value;
      if (line === value.line && !tr.docChanged) return value;
      if (line === null || line > tr.state.doc.lines) return { line, deco: Decoration.none, marks: RangeSet.empty };
      const from = tr.state.doc.line(line).from;
      return { line, deco: Decoration.set([execLine.range(from)]), marks: RangeSet.of([execMarker.range(from)]) };
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });
  const toggle = (view: EditorView, pos: number) => { toggleBreakpoint(file, view.state.doc.lineAt(pos).number); return true; };
  const sync = ViewPlugin.define((view) => {
    const apply = () => {
      const want = clampLines(view.state.doc, breakpointsOf(file));
      const have = linesOf(view.state.doc, view.state.field(field));
      const frame = currentFrame();
      const line = frame?.file === file ? frame.line : null;
      const effects: StateEffect<unknown>[] = [];
      if (want.join() !== have.sort((a, b) => a - b).join()) effects.push(setLines.of(want));
      if (line !== view.state.field(exec).line) effects.push(setExec.of(line));
      if (!effects.length) return;
      // Dispatching during another view update is not allowed; defer to the next frame.
      if (line && effects.some((e) => e.is(setExec))) effects.push(EditorView.scrollIntoView(view.state.doc.line(Math.min(line, view.state.doc.lines)).from, { y: 'center' }));
      queueMicrotask(() => { if (view.dom.isConnected) view.dispatch({ effects }); });
    };
    const off = subscribe(apply);
    apply();
    return {
      update(u) {
        if (!u.docChanged) return;
        // Edits move breakpoints with their lines; a programmatic reload keeps the stored lines instead.
        if (u.transactions.some((t) => ['input', 'delete', 'undo', 'redo', 'move'].some((k) => t.isUserEvent(k)))) setBreakpoints(file, linesOf(u.state.doc, u.state.field(field)));
        else apply();
      },
      destroy() { off(); },
    };
  });
  const dataTips = hoverTooltip(async (view, pos) => {
    const frame = currentFrame();
    if (!frame || getSnapshot().state.status !== 'paused') return null;
    const line = view.state.doc.lineAt(pos);
    const text = line.text;
    let s = pos - line.from, e = s;
    while (s > 0 && /[\w.]/.test(text[s - 1])) s--;
    while (e < text.length && /\w/.test(text[e])) e++;
    const expression = text.slice(s, e).replace(/^\.+|\.+$/g, '');
    if (!expression || !/^[A-Za-z_@]/.test(expression)) return null;
    const [r] = await api<{ result?: string; type?: string; error?: string }[]>('/debug/evaluate', { expressions: [expression], frameId: frame.id }).catch(() => [{ error: 'x' } as { result?: string; type?: string; error?: string }]);
    if (!r || r.error) return null;
    return {
      pos: line.from + s,
      end: line.from + e,
      create: () => {
        const dom = document.createElement('div');
        dom.className = 'cm-datatip';
        dom.textContent = `${expression} = ${r.result}${r.type ? `  (${r.type})` : ''}`;
        return { dom };
      },
    };
  }, { hoverTime: 350 });
  return [
    field,
    exec,
    // Leftmost, before the line numbers, like Visual Studio's indicator margin.
    Prec.highest(gutter({
      class: 'cm-breakpoint-gutter',
      markers: (v) => RangeSet.join([v.state.field(field), v.state.field(exec).marks]),
      initialSpacer: () => bpMarker,
      domEventHandlers: { mousedown: (view, block) => toggle(view, block.from) },
    })),
    keymap.of([{ key: 'F9', preventDefault: true, run: (v) => toggle(v, v.state.selection.main.head) }]),
    sync,
    dataTips,
  ];
}
