import { useState } from 'react';
import { Layers, FolderOpen, GitBranch, Clock } from 'lucide-react';
import { api } from './api';
import { Button } from './radix';
import { useLocalState } from './ui';
import type { Index } from './types';

type Opened = { config: { repositoryRoot: string; solution?: string }; index: Index };

/**
 * Start Window (Visual Studio): shown when no editor is open. Open recent (solutions, projects and folders), Clone a
 * repository, Open a project or solution, Open a local folder.
 */
export default function StartWindow({ onOpenSolution, onOpenFolder, onOpened, onNotice }: { onOpenSolution: () => void; onOpenFolder: () => void; onOpened: (r: Opened) => void; onNotice: (m: string) => void }) {
  const [recent, setRecent] = useLocalState<string[]>('recentSolutions', []);
  const [clone, setClone] = useState<{ url: string; folder: string } | null>(null);
  const [busy, setBusy] = useState('');
  const open = async (path: string) => {
    setBusy(path);
    try {
      const r = await api<Opened>('/solution/open', { path });
      setRecent([path, ...recent.filter((x) => x.toLowerCase() !== path.toLowerCase())].slice(0, 10));
      onOpened(r);
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  const doClone = async () => {
    if (!clone) return;
    setBusy('clone');
    try {
      const { path } = await api<{ path: string }>('/git/clone', clone);
      setBusy('');
      onNotice(`Cloned into ${path}.`);
      await open(path);
    } catch (e) {
      onNotice((e as Error).message);
      setBusy('');
    }
  };
  return (
    <section className="start-window" aria-label="Start Window">
      <div className="start-recent">
        <h2>Open recent</h2>
        {recent.length ? (
          <ul aria-label="Recent">
            {recent.map((p) => (
              <li key={p}>
                <button disabled={!!busy} onClick={() => void open(p)} title={p}>
                  {/\.(slnx?|csproj)$/i.test(p) ? <Layers size={16} /> : <FolderOpen size={16} />}
                  <span>{p.split(/[\\/]/).pop()}</span>
                  <small>{p}</small>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="start-none"><Clock size={14} /> Solutions and folders you open appear here.</p>}
      </div>
      <div className="start-actions">
        <h2>Get started</h2>
        <button className="start-action" onClick={() => setClone(clone ? null : { url: '', folder: '' })} aria-expanded={!!clone}>
          <GitBranch size={22} /><span><strong>Clone a repository</strong><small>Get code from an online repository like GitHub or Azure DevOps</small></span>
        </button>
        {clone && (
          <form className="start-clone" onSubmit={(e) => { e.preventDefault(); void doClone(); }}>
            <label>Repository location<input autoFocus value={clone.url} onChange={(e) => setClone({ ...clone, url: e.target.value })} placeholder="https://github.com/org/repo.git" spellCheck={false} /></label>
            <label>Path<input value={clone.folder} onChange={(e) => setClone({ ...clone, folder: e.target.value })} placeholder="C:\src" spellCheck={false} /></label>
            <Button type="submit" variant="primary" disabled={!!busy || !clone.url.trim() || !clone.folder.trim()}>{busy === 'clone' ? 'Cloning…' : 'Clone'}</Button>
          </form>
        )}
        <button className="start-action" onClick={onOpenSolution}>
          <Layers size={22} /><span><strong>Open a project or solution</strong><small>Open a .sln, .slnx or .csproj</small></span>
        </button>
        <button className="start-action" onClick={onOpenFolder}>
          <FolderOpen size={22} /><span><strong>Open a local folder</strong><small>Navigate and edit code within any folder</small></span>
        </button>
      </div>
    </section>
  );
}
