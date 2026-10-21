import { api } from '../api';
import { isBrowser } from '../files/provider';
import { openLocation } from './providers';
import { openQuickInput, registerQuickAccess, type QuickItem } from './store';

type Result = { files: { file: string; matches: { line: number; column: number; length: number; preview: string }[] }[]; total: number; truncated?: boolean };

/** W10 Quick text search (`%`): matching lines across the workspace, grouped by file; Enter opens at the match. */
registerQuickAccess({
  prefix: '%',
  help: 'Search for Text',
  placeholder: 'Search for text in your workspace files.',
  noResults: 'No matching results',
  provide: async (filter, signal) => {
    const q = filter;
    if (!q.trim() || isBrowser()) return [];
    await new Promise((r) => setTimeout(r, 200));
    if (signal.aborted) return [];
    const r = await api<Result>('/search/text', { query: q });
    const out: QuickItem[] = [];
    for (const f of r.files) {
      f.matches.slice(0, 50).forEach((m, i) => {
        // The line without its indentation, the match highlighted.
        const indent = m.preview.length - m.preview.trimStart().length;
        const text = m.preview.trim();
        const start = Math.max(0, m.column - 1 - indent);
        out.push({ id: `pct:${f.file}:${m.line}:${m.column}`, label: text, labelMatches: [{ start, end: Math.min(text.length, start + m.length) }], description: `${f.file.split('/').pop()}:${m.line}`, separator: i === 0 ? f.file : undefined, accept: () => openLocation(f.file, m.line, m.column) });
      });
      if (out.length > 300) break;
    }
    return out;
  },
});

/** Search: Quick Search (VS Code's command): the `%` picker, seeded with the editor's selection. */
export function quickTextSearch(seed = '') { openQuickInput('%' + seed); }
