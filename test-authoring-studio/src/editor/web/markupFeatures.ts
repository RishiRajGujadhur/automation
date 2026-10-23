import { autocompletion, snippet, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { api } from '../../api';
import { gateSource } from '../../vscode/suggestions';
import { doComplete } from '@vscode/emmet-helper';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { emmetConfig, emmetSettings } from './emmet';

/**
 * HTML in the editor (FRONTEND-100.md F51–F70): VS Code's HTML language service through /api/web — tag, attribute,
 * value and entity completion (CSS inside <style> and style=""), and the studio's structure, attribute, nesting,
 * accessibility and ARIA checks. Closing tags and folding come from CodeMirror's HTML mode.
 */
type Item = { label: string; kind: string; insert: string; snippet: boolean; from: number; to: number; detail?: string };
type Problem = { from: number; to: number; severity: 'error' | 'warning' | 'info'; message: string; rule?: string };

export const markupLinter = (file: string) => linter(async (view) => {
  const doc = view.state.doc;
  try {
    const list = await api<Problem[]>('/web/diagnostics', { file, source: doc.toString() });
    return list.filter((d) => d.from <= doc.length).map((d): Diagnostic => ({ from: d.from, to: Math.min(doc.length, Math.max(d.from + 1, d.to)), severity: d.severity, source: 'HTML', message: d.rule ? `${d.message} (${d.rule})` : d.message }));
  } catch { return []; }
}, { delay: 500 });

/** A VS Code snippet ($1, ${1:x}, $0) as a CodeMirror snippet template (${1}, ${1:x}, ${0}). */
export const cmSnippet = (s: string) => s.replace(/\$(\d+)/g, '${$1}');

async function complete(file: string, ctx: CompletionContext): Promise<CompletionResult | null> {
  const word = ctx.matchBefore(/[\w:.#&-]*/);
  const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 1), ctx.pos);
  if (!ctx.explicit && !word?.text && !/[<\s"'=&:]/.test(before)) return null;
  const items = await api<Item[]>('/web/markup/complete', { file, source: ctx.state.doc.toString(), pos: ctx.pos }).catch(() => [] as Item[]);
  if (!items.length) return null;
  const from = Math.min(...items.map((i) => i.from));
  const options = items.map((i): Completion => ({
    label: i.label, type: i.kind, detail: i.detail && i.detail.length < 60 ? i.detail : undefined, info: i.detail && i.detail.length >= 60 ? i.detail : undefined,
    apply: (view: EditorView, c: Completion, f: number, t: number) => {
      const range = { from: i.from, to: Math.max(i.to, t) };
      if (i.snippet) snippet(cmSnippet(i.insert))(view, c, range.from, range.to);
      else view.dispatch({ changes: { from: range.from, to: range.to, insert: i.insert }, selection: { anchor: range.from + i.insert.length }, userEvent: 'input.complete' });
      void f;
    },
  }));
  return { from, options, validFor: /^[\w:.#&-]*$/ };
}

/** VS Code's Emmet helper supplies the rendered preview and snippet for structural abbreviations. */
function emmetComplete(file: string, ctx: CompletionContext): CompletionResult | null {
  if (emmetSettings.suggestions() === 'never') return null;
  const document = TextDocument.create(file, 'html', 1, ctx.state.doc.toString());
  const items = doComplete(document, document.positionAt(ctx.pos), 'html', emmetConfig())?.items ?? [];
  const options: Completion[] = [];
  let from = ctx.pos;
  for (const item of items) {
    const edit = item.textEdit;
    if (!edit || !('range' in edit) || !/[>+*#.$\[\]{}^]/.test(item.label)) continue;
    const start = document.offsetAt(edit.range.start);
    from = Math.min(from, start);
    options.push({ label: item.label, type: 'type', detail: 'Emmet', info: typeof item.documentation === 'string' ? item.documentation : undefined,
      apply: (view: EditorView) => snippet(cmSnippet(edit.newText.replace(/\t/g, '  ')))(view, null, start, document.offsetAt(edit.range.end)),
    });
  }
  return options.length ? { from, options } : null;
}

export function markupFeatures(file: string): Extension[] {
  return [
    markupLinter(file),
    autocompletion({ override: [gateSource((ctx) => complete(file, ctx)), gateSource((ctx) => emmetComplete(file, ctx))], activateOnTyping: true, maxRenderedOptions: 100, icons: true }),
  ];
}
