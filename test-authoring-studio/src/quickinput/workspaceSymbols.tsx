import { api } from '../api';
import { isBrowser } from '../files/provider';
import { createMatches, fuzzyScore } from './fuzzy';
import { openLocation } from './providers';
import { symbolIcon } from './symbols';
import { registerQuickAccess, type QuickItem } from './store';

type Sym = { name: string; kind: string; container?: string; file: string; line: number; column: number };
const KIND: Record<string, string> = { var: 'variable', let: 'variable', const: 'constant', alias: 'variable', getter: 'property', setter: 'property', 'local function': 'function', 'enum member': 'enum-member', module: 'namespace' };

/** W6 Go to Symbol in Workspace (`#`): C# types and members (Roslyn) and TypeScript / JavaScript symbols. */
registerQuickAccess({
  prefix: '#',
  help: 'Go to Symbol in Workspace',
  placeholder: 'Type the name of a symbol to open.',
  noResults: 'No matching workspace symbols',
  provide: async (filter, signal) => {
    const q = filter.trim();
    if (!q || isBrowser()) return [];
    // Typing pauses: wait a little before asking the language services.
    await new Promise((r) => setTimeout(r, 120));
    if (signal.aborted) return [];
    const [cs, web] = await Promise.all([
      api<Sym[]>(`/symbols?q=${encodeURIComponent(q)}`).catch(() => [] as Sym[]),
      api<Sym[]>(`/web/symbols?q=${encodeURIComponent(q)}`).catch(() => [] as Sym[]),
    ]);
    const rows: { s: number; item: QuickItem }[] = [];
    for (const x of [...cs, ...web]) {
      const score = fuzzyScore(q, x.name, true);
      if (!score) continue;
      const kind = KIND[x.kind.toLowerCase()] ?? x.kind;
      rows.push({ s: score[0], item: { id: `ws:${x.file}:${x.line}:${x.column}:${x.name}`, label: x.name, labelMatches: createMatches(score), description: [x.container, x.file].filter(Boolean).join(' · '), icon: symbolIcon(kind), accept: () => openLocation(x.file, x.line, x.column) } });
    }
    return rows.sort((a, b) => b.s - a.s).slice(0, 200).map((r) => r.item);
  },
});
