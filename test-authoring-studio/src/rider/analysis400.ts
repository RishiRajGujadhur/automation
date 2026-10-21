import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { api } from '../api';
import { defineSetting } from '../vscode/settings';

/* Solution analyses of RIDER-VSCODE-FEATURES.md: duplicates (119), dependency cycles (121), layer rules (122), public API (124, 125). */

export const duplicateTokens = defineSetting<number>({ key: 'codeAnalysis.duplicates.minimumTokens', category: 'Workbench ▸ Code Analysis', title: 'Duplicates: Minimum Tokens', type: 'number', default: 60, min: 20, max: 500, description: 'How long (in tokens) a repeated piece of code must be for Find Duplicate Code to report it.' });
type Item = { file?: string; line?: number; label: string; detail?: string };
const list = (title: string, items: Item[]) => window.dispatchEvent(new CustomEvent('tas:location-list', { detail: { title, items } }));

export const LAYERS_TEMPLATE = `{
  // Layers: the namespaces of each layer (wildcards).
  "layers": [
    { "name": "Steps", "namespaces": ["*.Steps", "*.Steps.*"] },
    { "name": "Pages", "namespaces": ["*.Pages", "*.Pages.*"] },
    { "name": "Support", "namespaces": ["*.Support", "*.Support.*"] }
  ],
  // Rules: a layer that must not use another one.
  "rules": [
    { "from": "Pages", "notTo": "Steps" },
    { "from": "Support", "notTo": "Steps" }
  ]
}
`;

export function analysisCommands(h: MoreHelpers): RiderCommand[] {
  const A = { menu: 'Code' as const, submenu: 'Analyze' };
  return [
    { id: 'find-duplicates', label: 'Find Duplicate Code', ...A, run: () => {
      h.notice('Looking for duplicate code…');
      void api<{ tokens: number; places: { file: string; line: number; endLine: number }[] }[]>(`/csharp/analysis/duplicates?minTokens=${duplicateTokens()}`).then((groups) => {
        if (!groups.length) { h.notice(`No duplicate code of ${duplicateTokens()} tokens or more.`); return; }
        list(`Duplicate code: ${groups.length} group${groups.length === 1 ? '' : 's'}`, groups.flatMap((g, i) => g.places.map((p) => ({ file: p.file, line: p.line, label: `Duplicate ${i + 1} · ${g.tokens} tokens · ${p.file.split('/').pop()}:${p.line}–${p.endLine}`, detail: `${g.places.length} places` }))));
      }, (e) => h.notice((e as Error).message));
    } },
    { id: 'dependency-cycles', label: 'Find Dependency Cycles', ...A, run: () => {
      void api<{ cycles: { kind: string; members: string[]; edges: { from: string; to: string; file: string; line: number }[] }[]; namespaces: number }>('/csharp/analysis/cycles').then((r) => {
        if (!r.cycles.length) { h.notice(`No dependency cycles (${r.namespaces} namespaces checked, and the project references).`); return; }
        list(`Dependency cycles: ${r.cycles.length}`, r.cycles.flatMap((c) => [
          { label: `${c.kind === 'project' ? 'Projects' : 'Namespaces'} in a cycle: ${c.members.join(' ⇄ ')}` },
          ...c.edges.map((e) => ({ file: e.file, line: e.line, label: `  ${e.from} → ${e.to}`, detail: `${e.file}:${e.line}` })),
        ]));
      }, (e) => h.notice((e as Error).message));
    } },
    { id: 'layer-rules', label: 'Check Layer Rules', ...A, run: () => {
      void api<{ configured: boolean; layers: string[]; violations: { file: string; line: number; message: string }[] }>('/csharp/analysis/layers').then(async (r) => {
        if (!r.configured) {
          const pv = await api<{ id: string }>('/file/preview', { file: 'layers.json', source: LAYERS_TEMPLATE });
          window.dispatchEvent(new CustomEvent('tas:project-previews', { detail: { title: 'Layer rules: create layers.json (then Check Layer Rules again)', previews: [pv] } }));
          return;
        }
        if (!r.violations.length) { h.notice(`No layer rule is broken (${r.layers.join(', ')}).`); return; }
        list(`Layer rules: ${r.violations.length} violation${r.violations.length === 1 ? '' : 's'}`, r.violations.map((v) => ({ file: v.file, line: v.line, label: v.message, detail: `${v.file}:${v.line}` })));
      }, (e) => h.notice((e as Error).message));
    } },
    { id: 'public-api', label: 'Public API…', ...A, run: () => window.dispatchEvent(new Event('tas:public-api')) },
  ];
}

/** Public API changes against the baseline: added, removed (breaking) and changed (removed and added again) members. Pure. */
export function apiChanges(current: string[], baseline: string[]) {
  const now = new Set(current), before = new Set(baseline);
  const added = current.filter((l) => !before.has(l));
  const removed = baseline.filter((l) => !now.has(l));
  // A member whose signature changed: the same name (up to the parameter list) removed and added.
  const nameOf = (l: string) => l.replace(/\(.*$/, '').replace(/\s*\{.*$/, '').split(' ').pop() ?? l;
  const changed = removed.filter((r) => added.some((a) => nameOf(a) === nameOf(r))).map((r) => ({ before: r, after: added.find((a) => nameOf(a) === nameOf(r))! }));
  return { added: added.filter((a) => !changed.some((c) => c.after === a)), removed: removed.filter((r) => !changed.some((c) => c.before === r)), changed };
}
