import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { api } from '../api';
import { offsetOf } from './csharp';

type Hint = { line: number; column: number; label: string; kind: 'parameter' | 'type' };
const setHints = StateEffect.define<DecorationSet>();

class HintWidget extends WidgetType {
  constructor(readonly hint: Hint) { super(); }
  eq(o: HintWidget) { return o.hint.label === this.hint.label && o.hint.kind === this.hint.kind; }
  toDOM() {
    const s = document.createElement('span');
    s.className = `cm-inlay cm-inlay-${this.hint.kind}`;
    s.textContent = this.hint.label;
    return s;
  }
  ignoreEvent() { return true; }
}

const field = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setHints)) return e.value;
    return value.map(tr.changes);
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Inlay hints (Visual Studio's Alt+F1 / VS Code's editor.inlayHints): parameter names before literal arguments and the
 * inferred type after `var` and untyped lambda parameters. Refreshed shortly after typing stops.
 */
export function inlayHints(file: string, enabled: () => boolean): Extension {
  const plugin = ViewPlugin.fromClass(class {
    timer = 0;
    seq = 0;
    constructor(readonly view: EditorView) { this.schedule(50); }
    update(u: ViewUpdate) { if (u.docChanged) this.schedule(700); }
    schedule(ms: number) {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.load(), ms);
    }
    async load() {
      const seq = ++this.seq;
      if (!enabled()) { this.view.dispatch({ effects: setHints.of(Decoration.none) }); return; }
      const doc = this.view.state.doc;
      let hints: Hint[];
      try { hints = await api<Hint[]>('/csharp/inlayHints', { file, source: doc.toString() }); } catch { return; }
      // Drop stale answers: the text changed while the request ran.
      if (seq !== this.seq || this.view.state.doc !== doc) return;
      const ranges = hints.filter((h) => h.line <= doc.lines).map((h) => Decoration.widget({ widget: new HintWidget(h), side: h.kind === 'type' ? 1 : -1 }).range(offsetOf(doc, h.line, h.column)));
      this.view.dispatch({ effects: setHints.of(Decoration.set(ranges, true)) });
    }
    destroy() { clearTimeout(this.timer); }
  });
  return [field, plugin];
}
