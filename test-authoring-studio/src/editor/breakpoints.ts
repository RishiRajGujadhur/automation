import { Prec, StateEffect, StateField, RangeSet, type Extension, type Text } from '@codemirror/state';
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter, hoverTooltip, keymap, type DecorationSet } from '@codemirror/view';
import { api } from '../api';
import { breakpointsOf, currentFrame, getSnapshot, setBreakpoints, subscribe, toggleBreakpoint, specsOf, BREAKPOINT_SETTINGS_EVENT, type BreakpointSpec } from '../debug/store';

type Kind = 'plain' | 'conditional' | 'tracepoint' | 'disabled';
const kindOf = (b?: BreakpointSpec): Kind => (!b ? 'plain' : b.enabled === false ? 'disabled' : b.logMessage?.trim() ? 'tracepoint' : b.condition?.trim() || b.hitCondition?.trim() ? 'conditional' : 'plain');
class BreakpointMarker extends GutterMarker {
  constructor(readonly kind: Kind) { super(); }
  eq(o: BreakpointMarker) { return o.kind === this.kind; }
  toDOM() {
    const el = document.createElement('span');
    el.className = `cm-bp ${this.kind}`;
    el.title = { plain: 'Breakpoint (F9 toggles, right-click for settings)', conditional: 'Conditional breakpoint (right-click for settings)', tracepoint: 'Tracepoint: logs a message and continues (right-click for settings)', disabled: 'Disabled breakpoint (right-click for settings)' }[this.kind];
    return el;
  }
}
const kinds: Record<Kind, BreakpointMarker> = { plain: new BreakpointMarker('plain'), conditional: new BreakpointMarker('conditional'), tracepoint: new BreakpointMarker('tracepoint'), disabled: new BreakpointMarker('disabled') };
class ExecMarker extends GutterMarker {
  toDOM() { const el = document.createElement('span'); el.className = 'cm-exec-arrow'; el.title = 'Next statement'; return el; }
}
const bpMarker = kinds.plain;
const execMarker = new ExecMarker();

const setLines = StateEffect.define<{ line: number; kind: Kind }[]>();
const setExec = StateEffect.define<number | null>();

const clampLines = (doc: Text, lines: number[]) => lines.filter((l) => l >= 1 && l <= doc.lines);
const linesOf = (doc: Text, set: RangeSet<GutterMarker>) => {
  const out: number[] = [];
  set.between(0, doc.length, (from) => { out.push(doc.lineAt(from).number); });
  return [...new Set(out)];
};
const marksOf = (doc: Text, set: RangeSet<GutterMarker>) => {
  const out: string[] = [];
  set.between(0, doc.length, (from, _to, m) => { out.push(`${doc.lineAt(from).number}:${(m as BreakpointMarker).kind}`); });
  return out;
};
const wanted = (doc: Text, file: string) => specsOf(file).filter((b) => b.line >= 1 && b.line <= doc.lines).sort((a, b) => a.line - b.line).map((b) => ({ line: b.line, kind: kindOf(b) }));
const toSet = (doc: Text, list: { line: number; kind: Kind }[]) => RangeSet.of(list.filter((b) => b.line >= 1 && b.line <= doc.lines).map((b) => kinds[b.kind].range(doc.line(b.line).from)));

const execLine = Decoration.line({ class: 'cm-exec-line' });

/**
 * Visual Studio style breakpoints for one repository file: click the gutter or press F9, the red dots follow
 * edits, and while the debugger is paused here the next statement is marked with a yellow arrow and line.
 * DataTips: hovering an identifier while paused shows its value.
 */
export function breakpoints(file: string): Extension {
  const field = StateField.define<RangeSet<GutterMarker>>({
    create: (state) => toSet(state.doc, wanted(state.doc, file)),
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
      const want = wanted(view.state.doc, file);
      const have = marksOf(view.state.doc, view.state.field(field));
      const frame = currentFrame();
      const line = frame?.file === file ? frame.line : null;
      const effects: StateEffect<unknown>[] = [];
      if (want.map((b) => `${b.line}:${b.kind}`).join() !== have.join()) effects.push(setLines.of(want));
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
      domEventHandlers: {
        mousedown: (view, block, e) => ((e as MouseEvent).button === 0 ? toggle(view, block.from) : false),
        // Right-click a breakpoint: Breakpoint Settings (condition, hit count, log message), as in Visual Studio.
        contextmenu: (view, block, e) => {
          const line = view.state.doc.lineAt(block.from).number;
          if (!breakpointsOf(file).includes(line)) return false;
          e.preventDefault();
          window.dispatchEvent(new CustomEvent(BREAKPOINT_SETTINGS_EVENT, { detail: `${file}:${line}` }));
          return true;
        },
      },
    })),
    keymap.of([{ key: 'F9', preventDefault: true, run: (v) => toggle(v, v.state.selection.main.head) }]),
    sync,
    dataTips,
  ];
}
