import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { api } from '../api';

/* Front-end commands of FRONTEND-100.md (the editor's Quick Actions cover most features; these are menu commands). */

type Item = { file?: string; line?: number; label: string; detail?: string };
const list = (title: string, items: Item[]) => window.dispatchEvent(new CustomEvent('tas:location-list', { detail: { title, items } }));

export function frontendCommands(h: MoreHelpers): RiderCommand[] {
  const A = { menu: 'Code' as const, submenu: 'Analyze' };
  return [
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
