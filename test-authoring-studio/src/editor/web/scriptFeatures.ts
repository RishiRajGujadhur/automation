import { autocompletion, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import { EditorView, hoverTooltip } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { api } from '../../api';
import { gateSource } from '../../vscode/suggestions';

/**
 * TypeScript / JavaScript in the editor (FRONTEND-100.md): the TypeScript service's diagnostics (unused code faded),
 * completions with auto-imports, and Quick Info on hover. Requests carry the editor's text.
 */
type WebDiagnostic = { from: number; to: number; severity: 'error' | 'warning' | 'info'; message: string; code: number; unnecessary: boolean; deprecated: boolean };
type Item = { label: string; kind: string; sort: string; insert?: string; source?: string; data?: string; replace?: { from: number; to: number } };

export const scriptLinter = (file: string) => linter(async (view) => {
  const doc = view.state.doc;
  try {
    const list = await api<WebDiagnostic[]>('/web/diagnostics', { file, source: doc.toString() });
    return list.filter((d) => d.from <= doc.length).map((d): Diagnostic => ({
      from: d.from, to: Math.min(doc.length, Math.max(d.from + 1, d.to)),
      severity: d.severity === 'info' && d.unnecessary ? 'hint' : d.severity,
      ...(d.unnecessary ? { markClass: 'cm-unnecessary' } : d.deprecated ? { markClass: 'cm-deprecated' } : {}),
      source: 'TypeScript', message: `TS${d.code}: ${d.message}`,
    }));
  } catch { return []; }
}, { delay: 500 });

const TYPES: Record<string, string> = { function: 'function', method: 'method', property: 'property', getter: 'property', setter: 'property', var: 'variable', let: 'variable', const: 'constant', 'local var': 'variable', parameter: 'variable', class: 'class', interface: 'interface', type: 'type', enum: 'enum', 'enum member': 'constant', module: 'namespace', keyword: 'keyword', alias: 'variable', string: 'text', directory: 'namespace', script: 'namespace', 'JSX attribute': 'property' };

async function complete(file: string, ctx: CompletionContext): Promise<CompletionResult | null> {
  const word = ctx.matchBefore(/[\w$]*/);
  const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 1), ctx.pos);
  if (!ctx.explicit && !word?.text && !/[.'"/<@]/.test(before)) return null;
  const source = ctx.state.doc.toString();
  const r: { from?: number; items: Item[] } = await api<{ from?: number; items: Item[] }>('/web/complete', { file, source, pos: ctx.pos }).catch(() => ({ items: [] }));
  if (!r.items.length) return null;
  const options = r.items.map((i): Completion => ({
    label: i.label, type: TYPES[i.kind] ?? 'text', boost: -Number(i.sort.replace(/\D/g, '') || 0), detail: i.source ? `import from "${i.source}"` : undefined,
    apply: (view: EditorView, _c: Completion, from: number, to: number) => {
      const range = i.replace ?? { from, to };
      view.dispatch({ changes: { from: range.from, to: range.to, insert: i.insert ?? i.label }, selection: { anchor: range.from + (i.insert ?? i.label).length }, userEvent: 'input.complete' });
      // Auto-import: the import the completion needs, added where the service puts it.
      if (!i.source) return;
      void api<{ edits: { from: number; to: number; insert: string }[] }>('/web/completeDetails', { file, source: view.state.doc.toString(), pos: view.state.selection.main.head, name: i.label, origin: i.source, data: i.data }).then((d) => {
        if (d.edits.length) view.dispatch({ changes: d.edits, userEvent: 'input.complete' });
      }, () => {});
    },
  }));
  return { from: r.from ?? word?.from ?? ctx.pos, options, validFor: /^[\w$]*$/ };
}

const quickInfo = (file: string) => hoverTooltip(async (view, pos) => {
  const r = await api<{ text: string; doc: string; from: number; to: number } | null>('/web/quickinfo', { file, source: view.state.doc.toString(), pos }).catch(() => null);
  if (!r?.text) return null;
  return {
    pos: r.from, end: r.to,
    create: () => {
      const dom = document.createElement('div');
      dom.className = 'cm-quickinfo';
      const code = document.createElement('code');
      code.textContent = r.text;
      dom.append(code);
      if (r.doc) { const p = document.createElement('p'); p.textContent = r.doc; dom.append(p); }
      return { dom };
    },
  };
}, { hoverTime: 450 });

export function scriptFeatures(file: string): Extension[] {
  return [
    scriptLinter(file),
    autocompletion({ override: [gateSource((ctx) => complete(file, ctx))], activateOnTyping: true, maxRenderedOptions: 80, icons: true }),
    quickInfo(file),
  ];
}
