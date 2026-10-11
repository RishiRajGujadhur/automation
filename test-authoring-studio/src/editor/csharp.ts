import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorView, hoverTooltip, keymap } from '@codemirror/view';
import type { Extension, Text } from '@codemirror/state';
import { api } from '../api';

export type CsLocation = { file: string; line: number; column: number; endLine?: number; endColumn?: number };
type Item = { label: string; insert: string; filter: string; sort: string; kind: string; detail?: string; preselect?: boolean };
export type CsHandlers = {
  /** F12 / Ctrl+click: the definition(s) of the symbol at `pos`. */
  definition: (pos: number) => void;
  /** Shift+F12. */
  references: (pos: number) => void;
  /** F2: inline rename at `pos`. */
  rename: (pos: number) => void;
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
    if (ctx.aborted || !r.items.length) return null;
    const options: Completion[] = r.items.map((i, n) => ({
      label: i.label,
      apply: i.insert,
      type: kinds[i.kind] ?? 'text',
      detail: i.detail || undefined,
      // Roslyn's own order (sort text) as a tie-breaker; its preselection on top.
      boost: (i.preselect ? 99 : 0) - Math.min(98, n / 50),
    }));
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

export function csharpLanguage(file: string, handlers: { current: CsHandlers }): Extension[] {
  const at = (v: EditorView) => v.state.selection.main.head;
  return [
    autocompletion({ override: [completionSource(file)], activateOnTyping: true, maxRenderedOptions: 80, icons: true, defaultKeymap: true }),
    quickInfo(file),
    keymap.of([
      { key: 'F12', preventDefault: true, run: (v) => { handlers.current.definition(at(v)); return true; } },
      { key: 'Shift-F12', preventDefault: true, run: (v) => { handlers.current.references(at(v)); return true; } },
      { key: 'F2', preventDefault: true, run: (v) => { handlers.current.rename(at(v)); return true; } },
    ]),
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
