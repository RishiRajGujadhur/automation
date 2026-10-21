import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { api } from '../api';

/* Front-end commands of FRONTEND-100.md (the editor's Quick Actions cover most features; these are menu commands). */

type Item = { file?: string; line?: number; label: string; detail?: string };
const list = (title: string, items: Item[]) => window.dispatchEvent(new CustomEvent('tas:location-list', { detail: { title, items } }));

export function frontendCommands(h: MoreHelpers): RiderCommand[] {
  const A = { menu: 'Code' as const, submenu: 'Analyze' };
  return [
    // F49 Navigate React context providers.
    { id: 'context-providers', label: 'Go to Context Provider', menu: 'Navigate', run: h.inEditor((v, file) => {
      void api<{ name: string; providers: { file: string; line: number; column: number; text: string }[] }>('/web/contextProviders', { file, source: v.state.doc.toString(), pos: v.state.selection.main.head }).then((r) => {
        if (!r.providers.length) { h.notice(`No provider of ${r.name} found.`); return; }
        if (r.providers.length === 1) { const p = r.providers[0]; window.dispatchEvent(new CustomEvent('tas:open-location', { detail: p })); return; }
        list(`Providers of ${r.name}: ${r.providers.length}`, r.providers.map((p) => ({ file: p.file, line: p.line, label: p.text, detail: `${p.file}:${p.line}` })));
      }, (e) => h.notice((e as Error).message));
    }) },
    // F25 Navigate source maps: generated code ⇄ original source, at the caret.
    { id: 'source-map-jump', label: 'Go to Source-Mapped Location', menu: 'Navigate', run: h.inEditor((v, file) => {
      const r = v.state.selection.main;
      const line = v.state.doc.lineAt(r.head);
      void api<{ direction: string; file: string; line: number; column: number }>('/web/sourcemap', { file, line: line.number, column: r.head - line.from + 1 }).then((t) => {
        window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: t.file, line: t.line, column: t.column } }));
        h.notice(`${t.direction === 'original' ? 'Original source' : 'Generated code'}: ${t.file}:${t.line}`);
      }, (e) => h.notice((e as Error).message));
    }) },
    // F23 Detect circular module dependencies.
    { id: 'import-cycles', label: 'Find Circular Imports', ...A, run: () => {
      void api<{ files: number; cycles: { members: string[]; edges: { from: string; to: string; file: string; line: number }[] }[] }>('/web/analysis/cycles').then((r) => {
        if (!r.cycles.length) { h.notice(`No circular imports (${r.files} scripts checked).`); return; }
        list(`Circular imports: ${r.cycles.length}`, r.cycles.flatMap((c) => [
          { label: `Modules in a cycle: ${c.members.map((m) => m.split('/').pop()).join(' ⇄ ')}` },
          ...c.edges.map((e) => ({ file: e.file, line: e.line, label: `  ${e.from} → ${e.to}`, detail: `${e.file}:${e.line}` })),
        ]));
      }, (e) => h.notice((e as Error).message));
    } },
  ];
}
