import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { api } from '../api';
import { featureOn } from '../features';
import { isBrowser } from '../files/provider';
import { registerAdvanced } from './advanced';
import { defineSetting } from '../vscode/settings';

/* C# editor features of RIDER-VSCODE-FEATURES.md that come from the language service. */

const refresh = StateEffect.define<null>();
/** A plugin that asks the language service for ranges after the text settles and shows them as decorations. */
function serverDecorations(file: string, enabled: () => boolean, fetch: (view: EditorView) => Promise<{ from: number; to: number; deco: Decoration }[] | null>, delay = 500) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    timer = 0;
    version = 0;
    constructor(readonly view: EditorView) { this.schedule(); }
    schedule() {
      clearTimeout(this.timer);
      if (!enabled() || isBrowser()) { this.decorations = Decoration.none; return; }
      const v = ++this.version;
      const doc = this.view.state.doc;
      this.timer = window.setTimeout(() => {
        void fetch(this.view).then((list) => {
          if (!list || v !== this.version || this.view.state.doc !== doc) return;
          const b = new RangeSetBuilder<Decoration>();
          for (const r of list.filter((x) => x.to <= doc.length && x.from < x.to).sort((a, c) => a.from - c.from || a.to - c.to)) b.add(r.from, r.to, r.deco);
          this.decorations = b.finish();
          try { this.view.dispatch({ effects: refresh.of(null) }); } catch { /* destroyed */ }
        }, () => {});
      }, delay);
    }
    update(u: ViewUpdate) { if (u.docChanged) { this.decorations = this.decorations.map(u.changes); this.schedule(); } }
    destroy() { clearTimeout(this.timer); }
  }, { decorations: (v) => v.decorations });
  void file;
}

/* 259 Conditional compilation: the code an #if leaves out (with the project's symbols) is greyed. */
const inactive = (symbols: string) => Decoration.mark({ class: 'cm-inactive-code', attributes: { title: `Inactive: not compiled with ${symbols || 'these symbols'}` } });
registerAdvanced((file) => (!file.endsWith('.cs') ? [] : [
  serverDecorations(file, () => featureOn('inactive-code'), async (view) => {
    const r = await api<{ symbols: string[]; spans: { from: number; to: number }[] }>('/csharp/op', { op: 'inactive', file, source: view.state.doc.toString() });
    const d = inactive(r.symbols.join(';'));
    return r.spans.map((s) => ({ from: s.from, to: s.to, deco: d }));
  }),
  EditorView.baseTheme({ '.cm-inactive-code': { opacity: '0.45' } }),
]));

/* 179 Semantic highlighting: Roslyn's classifications (types, members, locals, parameters, static symbols). */
export const semanticHighlighting = defineSetting<'true' | 'false' | 'configuredByTheme'>({
  key: 'editor.semanticHighlighting.enabled', category: 'Text Editor', title: 'Semantic Highlighting: Enabled', type: 'enum', default: 'configuredByTheme',
  description: 'Controls whether semantic highlighting is shown (C#: types, members, locals and parameters coloured by what they are, from the language service).',
  options: [{ value: 'true', description: 'Semantic highlighting enabled for all color themes.' }, { value: 'false', description: 'Semantic highlighting disabled for all color themes.' }, { value: 'configuredByTheme', description: 'Semantic highlighting is configured by the current color theme\'s semanticHighlighting setting.' }],
});
const CLASSES: Record<string, string> = {
  'class name': 'type', 'record class name': 'type', 'struct name': 'struct', 'record struct name': 'struct', 'interface name': 'interface', 'enum name': 'enum', 'delegate name': 'type', 'type parameter name': 'typeparam',
  'method name': 'method', 'extension method name': 'method', 'property name': 'property', 'field name': 'field', 'constant name': 'constant', 'enum member name': 'constant', 'event name': 'event',
  'local name': 'local', 'parameter name': 'parameter', 'namespace name': 'namespace', 'static symbol': 'static', 'label name': 'local',
};
const markOf = new Map<string, Decoration>();
const mark = (kind: string) => { let d = markOf.get(kind); if (!d) { d = Decoration.mark({ class: `cm-sem-${CLASSES[kind] ?? 'other'}` }); markOf.set(kind, d); } return d; };
registerAdvanced((file) => (!file.endsWith('.cs') ? [] : [
  serverDecorations(file, () => featureOn('semantic-highlighting') && semanticHighlighting() !== 'false', async (view) => {
    const list = await api<{ from: number; to: number; kind: string }[]>('/csharp/op', { op: 'classify', file, source: view.state.doc.toString(), from: 0, to: view.state.doc.length });
    return list.map((s) => ({ from: s.from, to: s.to, deco: mark(s.kind) }));
  }, 400),
  EditorView.baseTheme({
    '&light .cm-sem-type, &light .cm-sem-struct, &light .cm-sem-type span, &light .cm-sem-struct span': { color: '#267f99 !important' }, '&dark .cm-sem-type, &dark .cm-sem-struct, &dark .cm-sem-type span, &dark .cm-sem-struct span': { color: '#4ec9b0 !important' },
    '&light .cm-sem-interface, &light .cm-sem-interface span': { color: '#267f99 !important', fontStyle: 'italic !important' }, '&dark .cm-sem-interface, &dark .cm-sem-interface span': { color: '#b8d7a3 !important', fontStyle: 'italic !important' },
    '&light .cm-sem-enum, &light .cm-sem-enum span': { color: '#267f99 !important' }, '&dark .cm-sem-enum, &dark .cm-sem-enum span': { color: '#b8d7a3 !important' },
    '&light .cm-sem-typeparam, &light .cm-sem-typeparam span': { color: '#267f99 !important' }, '&dark .cm-sem-typeparam, &dark .cm-sem-typeparam span': { color: '#b8d7a3 !important' },
    '&light .cm-sem-method, &light .cm-sem-method span': { color: '#795e26 !important' }, '&dark .cm-sem-method, &dark .cm-sem-method span': { color: '#dcdcaa !important' },
    '&light .cm-sem-property, &light .cm-sem-field, &light .cm-sem-event, &light .cm-sem-property span, &light .cm-sem-field span, &light .cm-sem-event span': { color: '#001080 !important' }, '&dark .cm-sem-property, &dark .cm-sem-field, &dark .cm-sem-event, &dark .cm-sem-property span, &dark .cm-sem-field span, &dark .cm-sem-event span': { color: '#9cdcfe !important' },
    '&light .cm-sem-constant, &light .cm-sem-constant span': { color: '#0070c1 !important' }, '&dark .cm-sem-constant, &dark .cm-sem-constant span': { color: '#4fc1ff !important' },
    '&light .cm-sem-local, &light .cm-sem-parameter, &light .cm-sem-local span, &light .cm-sem-parameter span': { color: '#001080 !important' }, '&dark .cm-sem-local, &dark .cm-sem-parameter, &dark .cm-sem-local span, &dark .cm-sem-parameter span': { color: '#9cdcfe !important' },
    '.cm-sem-parameter, .cm-sem-parameter span': { fontStyle: 'italic !important' },
    '.cm-sem-static, .cm-sem-static span': { fontWeight: '600 !important' },
  }),
]));
