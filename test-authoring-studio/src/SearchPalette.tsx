import { useState } from 'react';
import { Command } from 'cmdk';
import { Search, History } from 'lucide-react';
import { useStepSearch } from './useStepSearch';
import type { Binding } from './types';

export type PaletteCommand = { label: string; run: () => void; shortcut?: string };
const pages = ['Dashboard', 'Test Generator', 'Project Explorer', 'Dictionary Inspector', 'Config', 'Step Catalog', 'Backgrounds', 'Selectors', 'Scenario Builder', 'Playwright Recorder', 'Feature Editor'];

export default function SearchPalette({ open, onOpenChange, onNavigate, onAdd, revision, commands = [], recentPages = [] }: { open: boolean; onOpenChange: (open: boolean) => void; onNavigate: (name: string) => void; onAdd: (binding: Binding) => void; revision?: string; commands?: PaletteCommand[]; recentPages?: string[] }) {
  const [query, setQuery] = useState('');
  const { data, loading, error } = useStepSearch(query, 0, 8, '', revision);
  const q = query.toLowerCase();
  const recent = recentPages.filter((p) => pages.includes(p)).slice(0, 3);
  const ordered = [...recent, ...pages.filter((p) => !recent.includes(p))].filter((p) => p.toLowerCase().includes(q));
  const cmds = commands.filter((c) => c.label.toLowerCase().includes(q));
  const close = () => { onOpenChange(false); setQuery(''); };
  return (
    <Command.Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setQuery(''); }} label="Search commands and steps" shouldFilter={false} className="command-palette">
      <div className="palette-heading">
        <Search size={20} />
        <Command.Input autoFocus aria-label="Search commands and steps" placeholder="Go to a page, run a command, or find a step…" value={query} onValueChange={setQuery} />
        <kbd>Esc</kbd>
      </div>
      <Command.List>
        {ordered.length > 0 && (
          <Command.Group heading="Go to">
            {ordered.map((p) => (
              <Command.Item key={p} value={'page:' + p} onSelect={() => { close(); onNavigate(p); }}>
                <span>{recent.includes(p) && <History size={12} />} {p}</span>
                <span>{recent.includes(p) ? 'Recent' : 'Open'}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {cmds.length > 0 && (
          <Command.Group heading="Commands">
            {cmds.map((c) => (
              <Command.Item key={c.label} value={'cmd:' + c.label} onSelect={() => { close(); c.run(); }}>
                {c.label}
                {c.shortcut ? <kbd>{c.shortcut}</kbd> : <span>Run</span>}
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {query && (
          <Command.Group heading="Repository steps">
            {loading ? <Command.Loading>Searching…</Command.Loading> : error ? <p role="alert">{error}</p> : data.items.map((b) => (
              <Command.Item key={b.id} value={'step:' + b.id} onSelect={() => { close(); onAdd(b); }}>
                <div><strong>{b.keyword} {b.pattern}</strong><small>{b.file}:{b.line}</small></div>
                <span>Add</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {!loading && !data.items.length && !ordered.length && !cmds.length && <Command.Empty>No pages, commands or steps found.</Command.Empty>}
      </Command.List>
      <footer>↑ ↓ Navigate · Enter Select · Esc Close · Type to search steps</footer>
    </Command.Dialog>
  );
}
