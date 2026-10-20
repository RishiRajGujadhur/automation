import { useEffect, useMemo, useState } from 'react';
import { featureOn } from '../features';
import { FileCode2, Boxes, Braces, SquareFunction, Variable, FileText, ListTree, Zap, History } from 'lucide-react';
import { recentFiles } from '../navHistory';
import { api } from '../api';
import { fileType } from '../files/fileTypes';
import type { Feature } from '../types';

type Symbol = { name: string; kind: string; container?: string; file: string; line: number; column: number };
type Item = { key: string; group: 'Recent' | 'Files' | 'Types' | 'Members' | 'Features' | 'Actions'; label: string; detail?: string; file: string; line?: number; column?: number; icon: typeof FileCode2; color?: string; run?: () => void };
const filters = ['All', 'Files', 'Types', 'Members', 'Features', 'Actions'] as const;
export type SearchAction = { label: string; run: () => void; shortcut?: string; disabled?: boolean };

/** Subsequence match with a score (consecutive and word-start characters rank higher), like VS Code's quick open. */
function fuzzy(text: string, q: string) {
  if (!q) return 1;
  const t = text.toLowerCase();
  const s = q.toLowerCase();
  const exact = t.indexOf(s);
  if (exact >= 0) return 1000 - exact - t.length / 100;
  let score = 0, i = 0, last = -2;
  for (const ch of s) {
    const at = t.indexOf(ch, i);
    if (at < 0) return 0;
    score += at === last + 1 ? 5 : /[\\/._\-\s]/.test(text[at - 1] ?? '/') || text[at] !== t[at] ? 3 : 1;
    last = at;
    i = at + 1;
  }
  return score;
}

/**
 * Go to All (Ctrl+T, or Ctrl+P in a browser where Ctrl+T opens a tab): files, types and members (Roslyn), features
 * and scenarios, filtered by category like Visual Studio's Go To All.
 */
export default function GoToAll({ features, onOpen, onClose, actions = [] }: { features: Feature[]; onOpen: (file: string, line?: number, column?: number) => void; onClose: () => void; actions?: SearchAction[] }) {
  // The last query comes back, selected, when Go to All reopens (QOL-50).
  const [query, setQuery] = useState(() => { try { return featureOn('goto-last') ? sessionStorage.getItem('tas:gotoQuery') ?? '' : ''; } catch { return ''; } });
  useEffect(() => { try { sessionStorage.setItem('tas:gotoQuery', query); } catch { /* storage blocked */ } }, [query]);
  const [filter, setFilter] = useState<(typeof filters)[number]>('All');
  const [files, setFiles] = useState<string[]>([]);
  const [symbols, setSymbols] = useState<Symbol[]>([]);
  const [index, setIndex] = useState(0);
  useEffect(() => { api<{ files: { file: string }[] }>('/solution').then((s) => setFiles(s.files.map((f) => f.file)), () => {}); }, []);
  useEffect(() => {
    if (!query.trim() || filter === 'Files' || filter === 'Features') { setSymbols([]); return; }
    let live = true;
    const t = setTimeout(() => api<Symbol[]>(`/symbols?q=${encodeURIComponent(query.trim())}`).then((r) => live && setSymbols(r), () => {}), 150);
    return () => { live = false; clearTimeout(t); };
  }, [query, filter]);
  const items = useMemo(() => {
    const q = query.trim();
    const out: (Item & { score: number })[] = [];
    // Search Everywhere (Rider): with nothing typed, recent files first.
    if (!q && (filter === 'All' || filter === 'Files')) recentFiles().slice(0, 12).forEach((f, i) => out.push({ key: `r:${f}`, group: 'Recent', label: f.split('/').pop()!, detail: f, file: f, icon: History, color: fileType(f).color, score: 5000 - i }));
    if ((filter === 'All' && q) || filter === 'Actions') for (const a of actions) { if (a.disabled) continue; const score = fuzzy(a.label, q); if (score > 0) out.push({ key: `a:${a.label}`, group: 'Actions', label: a.label, detail: a.shortcut ? `action · ${a.shortcut}` : 'action', file: '', icon: Zap, run: a.run, score: score + 1 }); }
    if (filter === 'All' || filter === 'Files') for (const f of files) { if (!q && recentFiles().includes(f)) continue; const score = fuzzy(f.split('/').pop()!, q) * 2 + fuzzy(f, q); if (score > 0) out.push({ key: `f:${f}`, group: 'Files', label: f.split('/').pop()!, detail: f, file: f, icon: fileType(f).icon, color: fileType(f).color, score }); }
    for (const s of symbols) {
      const type = !['Method', 'Property', 'Field', 'Event'].includes(s.kind);
      if (filter === 'All' || (filter === 'Types' && type) || (filter === 'Members' && !type))
        out.push({ key: `s:${s.file}:${s.line}:${s.name}`, group: type ? 'Types' : 'Members', label: s.name, detail: `${s.kind.toLowerCase()} · ${s.container ?? ''} · ${s.file}`, file: s.file, line: s.line, column: s.column, icon: s.kind === 'Method' ? SquareFunction : s.kind === 'Property' || s.kind === 'Field' ? Variable : s.kind === 'Interface' ? Braces : Boxes, score: 2000 - out.length });
    }
    if (filter === 'All' || filter === 'Features')
      for (const f of features) {
        const fs = fuzzy(f.name, q);
        if (fs > 0) out.push({ key: `ft:${f.file}`, group: 'Features', label: f.name, detail: f.file, file: f.file, icon: FileText, color: fileType(f.file).color, score: fs });
        for (const sc of f.scenarios) { const s = fuzzy(sc.name, q); if (s > 0 && q) out.push({ key: `sc:${f.file}:${sc.name}`, group: 'Features', label: sc.name, detail: `scenario · ${f.file}`, file: f.file, line: sc.line, icon: ListTree, score: s }); }
      }
    return out.sort((a, b) => b.score - a.score).slice(0, 80);
  }, [files, symbols, features, query, filter, actions]);
  useEffect(() => setIndex(0), [query, filter]);
  const go = (i: number) => { const it = items[i]; if (!it) return; onClose(); if (it.run) it.run(); else onOpen(it.file, it.line, it.column); };

  return (
    <div className="goto-all">
      <input
        autoFocus onFocus={(e) => e.currentTarget.select()}
        aria-label="Go to All"
        placeholder="Search everywhere: files, types, members, features, actions (Shift Shift / Ctrl+T)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); go(index); }
        }}
        spellCheck={false}
      />
      <div className="goto-filters" role="radiogroup" aria-label="Show">
        {filters.map((f) => <button key={f} role="radio" aria-checked={filter === f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>{f}</button>)}
      </div>
      <ul className="goto-results" role="listbox" aria-label="Results">
        {items.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === index} className={i === index ? 'active' : ''} onMouseEnter={() => setIndex(i)} onMouseDown={(e) => { e.preventDefault(); go(i); }}>
            <it.icon size={14} style={{ color: it.color }} aria-hidden="true" />
            <span className="goto-label">{it.label}</span>
            <small>{it.detail}</small>
          </li>
        ))}
        {!items.length && <li className="goto-empty">{query ? 'No results.' : 'Type to search.'}</li>}
      </ul>
    </div>
  );
}
