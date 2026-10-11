import { useEffect, useState } from 'react';
import { Layers, FolderOpen } from 'lucide-react';
import { api } from './api';
import { Button } from './radix';
import { useLocalState } from './ui';
import type { Index } from './types';

/**
 * File ▸ Open ▸ Project/Solution… (web): a .sln / .slnx / .csproj path (or a folder), the solutions found in the
 * current repository, and recent ones. The studio server opens it from disk (the browser cannot reveal paths).
 */
export default function OpenSolution({ root, onOpened }: { root?: string; onOpened: (r: { config: { repositoryRoot: string; solution?: string }; index: Index }) => void }) {
  const [found, setFound] = useState<string[]>([]);
  const [recent, setRecent] = useLocalState<string[]>('recentSolutions', []);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<string[]>('/solution/find').then(setFound, () => {}); }, []);
  const abs = (rel: string) => `${(root ?? '').replace(/[\\/]+$/, '')}/${rel}`;
  const open = async (target: string) => {
    const path = target.trim().replace(/^"|"$/g, '');
    if (!path) return;
    setBusy(true);
    setError('');
    try {
      const r = await api<{ config: { repositoryRoot: string; solution?: string }; index: Index }>('/solution/open', { path });
      setRecent([path, ...recent.filter((x) => x.toLowerCase() !== path.toLowerCase())].slice(0, 10));
      onOpened(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const row = (path: string, label = path) => (
    <li key={path}>
      <button className="solution-choice" disabled={busy} onClick={() => void open(path)} title={path}>
        {/\.(slnx?|csproj)$/i.test(path) ? <Layers size={14} /> : <FolderOpen size={14} />}
        <span>{label.split(/[\\/]/).pop()}</span>
        <small>{label}</small>
      </button>
    </li>
  );
  return (
    <div className="open-solution">
      <form onSubmit={(e) => { e.preventDefault(); void open(value); }}>
        <label className="field-label" htmlFor="solution-path">SOLUTION, PROJECT OR FOLDER PATH</label>
        <div className="solution-path-row">
          <input id="solution-path" value={value} onChange={(e) => setValue(e.target.value)} placeholder="C:\src\Shop\Shop.sln" autoFocus spellCheck={false} />
          <Button type="submit" variant="primary" disabled={busy || !value.trim()}>Open</Button>
        </div>
      </form>
      {error && <p className="field-error" role="alert">{error}</p>}
      {found.length > 0 && (
        <section aria-label="Solutions in this repository">
          <h3 className="micro-label">IN THIS REPOSITORY</h3>
          <ul className="solution-list">{found.map((f) => row(abs(f), f))}</ul>
        </section>
      )}
      {recent.length > 0 && (
        <section aria-label="Recent solutions">
          <h3 className="micro-label">RECENT</h3>
          <ul className="solution-list">{recent.map((r) => row(r))}</ul>
        </section>
      )}
    </div>
  );
}
