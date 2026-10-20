import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { featureOn } from '../features';
import { EditorView, hoverTooltip, keymap, showTooltip, ViewPlugin, type Tooltip, type ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField, type Extension, type Text } from '@codemirror/state';
import { api } from '../api';
import { snippetOptions, snippetTab } from './snippets';
import { inlayHints } from './inlayHints';

export type CsLocation = { file: string; line: number; column: number; endLine?: number; endColumn?: number };
type Item = { label: string; insert: string; filter: string; sort: string; kind: string; detail?: string; preselect?: boolean };
export type CsHandlers = {
  /** F12 / Ctrl+click: the definition(s) of the symbol at `pos`. */
  definition: (pos: number) => void;
  /** Shift+F12. */
  references: (pos: number) => void;
  /** F2: inline rename at `pos`. */
  rename: (pos: number) => void;
  /** Ctrl+.: Quick Actions and Refactorings for the selection. */
  actions: (from: number, to: number) => void;
  /** Shift+Alt+F / Ctrl+K, Ctrl+D: Format Document (or the selection). */
  format: () => void;
  /** Ctrl+F12: Go To Implementation. */
  implementations: (pos: number) => void;
  /** Alt+F12: Peek Definition. */
  peek: (pos: number) => void;
};

/** 1-based line/column for a document offset (the language service's convention). */
export function lineCol(doc: Text, pos: number) { const l = doc.lineAt(pos); return { line: l.number, column: pos - l.from + 1 }; }
export function offsetOf(doc: Text, line: number, column: number) { const l = doc.line(Math.max(1, Math.min(line, doc.lines))); return Math.min(l.to, l.from + column - 1); }

// Roslyn completion tags → CodeMirror completion types (icons).
const kinds: Record<string, string> = {
  Class: 'class', Structure: 'class', Record: 'class', RecordStruct: 'class', Delegate: 'class', Interface: 'interface', Enum: 'enum', EnumMember: 'enum',
  Method: 'method', ExtensionMethod: 'method', Property: 'property', Field: 'variable', Event: 'property', Local: 'variable', Parameter: 'variable',
  RangeVariable: 'variable', Constant: 'constant', Namespace: 'namespace', Keyword: 'keyword', Snippet: 'text', TypeParameter: 'type', Label: 'text', Operator: 'keyword',
};

/**
 * IntelliSense from Roslyn's CompletionService for the whole repository (types, members, locals, keywords,
 * NuGet package APIs): opens after "." or while typing an identifier, and on Ctrl+Space.
 */
function completionSource(file: string) {
  return async (ctx: CompletionContext): Promise<CompletionResult | null> => {
    const word = ctx.matchBefore(/[\w@]*/);
    if (!word) return null;
    const before = ctx.state.sliceDoc(Math.max(0, word.from - 1), word.from);
    if (!ctx.explicit && word.from === word.to && before !== '.') return null;
    const { line, column } = lineCol(ctx.state.doc, ctx.pos);
    let r: { from: { line: number; column: number }; items: Item[] };
    try { r = await api('/csharp/complete', { file, source: ctx.state.doc.toString(), line, column }); } catch { return null; }
    if (ctx.aborted) return null;
    // Code snippets join IntelliSense when typing a word (not after "."), as in Visual Studio.
    const snippets = before === '.' || word.from === word.to ? [] : snippetOptions(ctx.view!, ctx.pos);
    if (!r.items.length && !snippets.length) return null;
    const options: Completion[] = [...snippets, ...r.items.map((i, n) => ({
      label: i.label,
      apply: i.insert,
      type: kinds[i.kind] ?? 'text',
      detail: i.detail || undefined,
      // Roslyn's own order (sort text) as a tie-breaker; its preselection on top.
      boost: (i.preselect ? 99 : 0) - Math.min(98, n / 50),
    }))];
    return { from: offsetOf(ctx.state.doc, r.from.line, r.from.column), options, validFor: /^[\w@]*$/ };
  };
}

/** Quick info on hover (signature, type, XML documentation), like Visual Studio's QuickInfo. */
const quickInfo = (file: string) => hoverTooltip(async (view, pos) => {
  const word = view.state.wordAt(pos);
  if (!word) return null;
  const { line, column } = lineCol(view.state.doc, pos);
  const r = await api<{ sections: { kind: string; text: string }[] } | null>('/csharp/hover', { file, source: view.state.doc.toString(), line, column }).catch(() => null);
  if (!r?.sections.length) return null;
  return {
    pos: word.from,
    end: word.to,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'cm-quickinfo';
      for (const s of r.sections) {
        const el = document.createElement(s.kind === 'Description' ? 'code' : 'p');
        el.textContent = s.text;
        dom.append(el);
      }
      return { dom };
    },
  };
}, { hoverTime: 450 });

// Quick Info from the keyboard (Visual Studio's Ctrl+K, Ctrl+I): the hover tooltip at the caret until it moves.
const setInfo = StateEffect.define<Tooltip | null>();
const infoField = StateField.define<Tooltip | null>({
  create: () => null,
  update: (t, tr) => { for (const e of tr.effects) if (e.is(setInfo)) return e.value; return tr.docChanged || tr.selection ? null : t; },
  provide: (f) => showTooltip.from(f),
});
export async function quickInfoAtCaret(view: EditorView, file: string) {
  const pos = view.state.selection.main.head;
  const word = view.state.wordAt(pos) ?? view.state.wordAt(Math.max(0, pos - 1));
  if (!word) return false;
  const { line, column } = lineCol(view.state.doc, word.from);
  const r = await api<{ sections: { kind: string; text: string }[] } | null>('/csharp/hover', { file, source: view.state.doc.toString(), line, column }).catch(() => null);
  if (!r?.sections.length) return false;
  view.dispatch({ effects: setInfo.of({ pos: word.from, end: word.to, create: () => { const dom = document.createElement('div'); dom.className = 'cm-quickinfo'; for (const s of r.sections) { const el = document.createElement(s.kind === 'Description' ? 'code' : 'p'); el.textContent = s.text; dom.append(el); } return { dom }; } }) });
  return true;
}

// ------------------------------------------------------------------ signature help (parameter info)
type Signatures = { signatures: { label: string; parameters: string[]; documentation?: string | null }[]; activeSignature: number; activeParameter: number };
const setSignature = StateEffect.define<{ pos: number; data: Signatures } | null>();
function signatureDom(data: Signatures, pick: { index: number }) {
  const dom = document.createElement('div');
  dom.className = 'cm-signature';
  dom.setAttribute('role', 'tooltip');
  const render = () => {
    const sig = data.signatures[pick.index];
    dom.textContent = '';
    if (data.signatures.length > 1) {
      const count = document.createElement('span');
      count.className = 'cm-signature-count';
      count.textContent = `${pick.index + 1} of ${data.signatures.length}`;
      dom.append(count);
    }
    const code = document.createElement('code');
    // Bold the parameter being typed.
    const open = sig.label.indexOf('(');
    code.append(sig.label.slice(0, open + 1));
    sig.parameters.forEach((p, i) => {
      if (i) code.append(', ');
      if (i === Math.min(data.activeParameter, sig.parameters.length - 1)) { const b = document.createElement('b'); b.textContent = p; code.append(b); } else code.append(p);
    });
    code.append(')');
    dom.append(code);
    if (sig.documentation) { const doc = document.createElement('p'); doc.textContent = sig.documentation; dom.append(doc); }
  };
  render();
  return { dom, render };
}
const signatureField = StateField.define<{ tooltip: Tooltip | null; data?: Signatures; pick: { index: number } }>({
  create: () => ({ tooltip: null, pick: { index: 0 } }),
  update(v, tr) {
    for (const e of tr.effects) if (e.is(setSignature)) {
      if (!e.value) return { tooltip: null, pick: { index: 0 } };
      const { pos, data } = e.value;
      const pick = { index: data.activeSignature };
      return { data, pick, tooltip: { pos, above: true, strictSide: false, arrow: false, create: () => { const { dom } = signatureDom(data, pick); return { dom }; } } };
    }
    return v.tooltip && tr.docChanged ? { ...v, tooltip: { ...v.tooltip, pos: tr.changes.mapPos(v.tooltip.pos) } } : v;
  },
  provide: (f) => showTooltip.from(f, (v) => v.tooltip),
});
function signatureHelp(file: string): Extension[] {
  const plugin = ViewPlugin.fromClass(class {
    timer = 0;
    seq = 0;
    constructor(readonly view: EditorView) {}
    update(u: ViewUpdate) {
      if (!u.docChanged && !u.selectionSet) return;
      const open = !!u.state.field(signatureField).tooltip;
      let trigger = false;
      for (const tr of u.transactions) if (tr.isUserEvent('input.type')) tr.changes.iterChanges((_a, _b, _c, _d, text) => { if (/[(,<]/.test(text.toString())) trigger = true; });
      if (trigger || open) this.schedule();
    }
    schedule() {
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.fetch(), 120);
    }
    async fetch() {
      const seq = ++this.seq;
      const view = this.view;
      const pos = view.state.selection.main.head;
      const { line, column } = lineCol(view.state.doc, pos);
      const data = await api<Signatures | null>('/csharp/signature', { file, source: view.state.doc.toString(), line, column }).catch(() => null);
      if (seq !== this.seq || !view.dom.isConnected) return;
      view.dispatch({ effects: setSignature.of(data?.signatures.length ? { pos, data } : null) });
    }
    destroy() { clearTimeout(this.timer); }
  });
  const close = (v: EditorView) => { if (!v.state.field(signatureField).tooltip) return false; v.dispatch({ effects: setSignature.of(null) }); return true; };
  const cycle = (step: number) => (v: EditorView) => {
    const f = v.state.field(signatureField);
    if (!f.tooltip || !f.data || f.data.signatures.length < 2) return false;
    v.dispatch({ effects: setSignature.of({ pos: f.tooltip.pos, data: { ...f.data, activeSignature: (f.pick.index + step + f.data.signatures.length) % f.data.signatures.length } }) });
    return true;
  };
  return [
    signatureField,
    plugin,
    keymap.of([
      { key: 'Escape', run: close },
      { key: 'Mod-Shift-Space', preventDefault: true, run: (v) => { v.plugin(plugin)?.schedule(); return true; } },
      { key: 'Alt-ArrowDown', run: cycle(1) },
      { key: 'Alt-ArrowUp', run: cycle(-1) },
    ]),
  ];
}

export function csharpLanguage(file: string, handlers: { current: CsHandlers }): Extension[] {
  const at = (v: EditorView) => v.state.selection.main.head;
  return [
    autocompletion({ override: [completionSource(file)], activateOnTyping: true, maxRenderedOptions: 80, icons: true, defaultKeymap: true }),
    quickInfo(file),
    infoField,
    keymap.of([
      { key: 'Mod-k Mod-i', preventDefault: true, run: (v) => { if (featureOn('quick-info-key')) void quickInfoAtCaret(v, file); return featureOn('quick-info-key'); } },
      { key: 'Escape', run: (v) => { if (!v.state.field(infoField)) return false; v.dispatch({ effects: setInfo.of(null) }); return true; } },
      { key: 'F12', preventDefault: true, run: (v) => { handlers.current.definition(at(v)); return true; } },
      { key: 'Shift-F12', preventDefault: true, run: (v) => { handlers.current.references(at(v)); return true; } },
      { key: 'Mod-F12', preventDefault: true, run: (v) => { handlers.current.implementations(at(v)); return true; } },
      { key: 'Alt-F12', preventDefault: true, run: (v) => { handlers.current.peek(at(v)); return true; } },
      { key: 'F2', preventDefault: true, run: (v) => { handlers.current.rename(at(v)); return true; } },
      { key: 'Mod-.', preventDefault: true, run: (v) => { const r = v.state.selection.main; handlers.current.actions(r.from, r.to); return true; } },
      { key: 'Shift-Alt-f', preventDefault: true, run: () => { handlers.current.format(); return true; } },
      { key: 'Mod-k Mod-d', preventDefault: true, run: () => { handlers.current.format(); return true; } },
    ]),
    ...signatureHelp(file),
    snippetTab(),
    inlayHints(file, () => localStorage.getItem('tas:inlayHints') !== 'false' && featureOn('inlay-hints')),
    // Ctrl+click (Cmd+click) goes to definition, as in Visual Studio and VS Code.
    EditorView.domEventHandlers({
      mousedown: (e, view) => {
        if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        e.preventDefault();
        handlers.current.definition(pos);
        return true;
      },
    }),
  ];
}

/** Applies new document text as one minimal change (common prefix/suffix kept), so the cursor and undo stay sensible. */
export function replaceText(view: EditorView, next: string) {
  const prev = view.state.doc.toString();
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let endPrev = prev.length, endNext = next.length;
  while (endPrev > start && endNext > start && prev[endPrev - 1] === next[endNext - 1]) { endPrev--; endNext--; }
  view.dispatch({ changes: { from: start, to: endPrev, insert: next.slice(start, endNext) }, userEvent: 'input.refactor' });
}
