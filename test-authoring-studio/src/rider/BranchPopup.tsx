import { useEffect, useState } from 'react';
import { GitBranch, Plus } from 'lucide-react';
import { api } from '../api';
import { GIT_CHANGED_EVENT, FILES_CHANGED_EVENT } from '../editor/events';

type Branches = { local: { name: string; current: boolean; upstream?: string; when: string }[]; remote: string[] };

/** Branches popup (Rider's status bar widget / Visual Studio's branch picker): switch to or create a branch. */
export default function BranchPopup({ onDone }: { onDone: (m: string) => void }) {
  const [b, setB] = useState<Branches>();
  const [query, setQuery] = useState('');
  useEffect(() => { api<Branches>('/git/branches').then(setB, (e) => onDone((e as Error).message)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const checkout = async (name: string, create = false) => {
    try {
      await api('/git/checkout', { name, create });
      window.dispatchEvent(new Event(GIT_CHANGED_EVENT));
      window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: [] }));
      onDone(create ? `Created and switched to ${name}.` : `Switched to ${name}.`);
    } catch (e) { onDone((e as Error).message); }
  };
  const q = query.trim().toLowerCase();
  const local = (b?.local ?? []).filter((l) => !q || l.name.toLowerCase().includes(q));
  const remote = (b?.remote ?? []).filter((r) => !q || r.toLowerCase().includes(q));
  return (
    <div className="goto-all branch-popup">
      <input autoFocus aria-label="Filter branches" placeholder="Branch name: filter, or a new name" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) { const exact = b?.local.find((l) => l.name === query.trim()); void checkout(query.trim(), !exact); } }} />
      <ul className="goto-results" role="listbox" aria-label="Branches">
        {query.trim() && !b?.local.some((l) => l.name === query.trim()) && <li role="option" aria-selected="false" onMouseDown={(e) => { e.preventDefault(); void checkout(query.trim(), true); }}><Plus size={13} /><span className="goto-label">New branch “{query.trim()}”</span></li>}
        {local.map((l) => (
          <li key={l.name} role="option" aria-selected={l.current} className={l.current ? 'active' : ''} onMouseDown={(e) => { e.preventDefault(); if (!l.current) void checkout(l.name); }}>
            <GitBranch size={13} /><span className="goto-label">{l.name}</span><small>{l.current ? 'current' : l.when}{l.upstream ? ` · ${l.upstream}` : ''}</small>
          </li>
        ))}
        {remote.map((r) => <li key={r} role="option" aria-selected="false" onMouseDown={(e) => { e.preventDefault(); void checkout(r); }}><GitBranch size={13} /><span className="goto-label">{r}</span><small>remote</small></li>)}
      </ul>
    </div>
  );
}
