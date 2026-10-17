import { useEffect, useState } from 'react';
import { Layers, FolderOpen, Folder, ArrowUp, FileCode2, HardDrive } from 'lucide-react';
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
  // Browse: folders and .sln / .slnx / .csproj files on this computer (served by the local studio API).
  type Listing = { dir: string; parent: string | null; drives: string[]; items: { name: string; path: string; kind: 'folder' | 'solution' | 'project' }[] };
  const [listing, setListing] = useState<Listing>();
  const browse = (dir?: string) => api<Listing>(`/fs/browse${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`).then((l) => { setListing(l); setError(''); }, (e) => setError((e as Error).message));
  useEffect(() => { void browse(); }, []);
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
      <section className="solution-browser" aria-label="Browse">
        <div className="browser-bar">
          <button type="button" className="icon-button" aria-label="Up one folder" disabled={!listing?.parent} onClick={() => listing?.parent && void browse(listing.parent)}><ArrowUp size={14} /></button>
          {listing && listing.drives.length > 1 && (
            <select aria-label="Drive" value={listing.drives.find((d) => listing.dir.toUpperCase().startsWith(d.toUpperCase())) ?? ''} onChange={(e) => void browse(e.target.value)}>
              {listing.drives.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          )}
          <span className="browser-path" title={listing?.dir}><HardDrive size={13} /> {listing?.dir ?? '…'}</span>
        </div>
        <ul className="browser-list" aria-label="Folders and solutions">
          {listing?.items.map((it) => (
            <li key={it.path}>
              <button type="button" className={it.kind} disabled={busy}
                onClick={() => (it.kind === 'folder' ? void browse(it.path) : setValue(it.path))}
                onDoubleClick={() => (it.kind === 'folder' ? undefined : void open(it.path))}
                aria-label={`${it.kind === 'folder' ? 'Folder' : it.kind === 'solution' ? 'Solution' : 'Project'} ${it.name}`}>
                {it.kind === 'folder' ? <Folder size={14} /> : it.kind === 'solution' ? <Layers size={14} /> : <FileCode2 size={14} />}
                <span>{it.name}</span>
              </button>
            </li>
          ))}
          {listing && !listing.items.length && <li className="subtle">No folders or solutions here.</li>}
        </ul>
        <div className="browser-actions">
          <Button type="button" variant="ghost" size="small" disabled={!listing || busy} onClick={() => listing && void open(listing.dir)}><FolderOpen size={14} /> Open this folder</Button>
        </div>
      </section>
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
