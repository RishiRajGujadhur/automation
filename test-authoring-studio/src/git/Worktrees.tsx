import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FolderGit2, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useConfirm } from '../radix2';

type Worktree = { path: string; branch?: string; head: string; main: boolean; locked: boolean; current: boolean };
/** Git Changes ▸ Worktrees (Rider / VS Code): the repository's worktrees; add one, open it in the studio, remove it. */
export default function Worktrees({ onNotice }: { onNotice: (m: string) => void }) {
  const [list, setList] = useState<Worktree[]>([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<{ dir: string; branch: string; create: boolean } | null>(null);
  const confirm = useConfirm();
  const load = () => api<Worktree[]>('/git/worktrees').then(setList, () => setList([]));
  useEffect(() => { void load(); }, []);
  const add = async () => {
    if (!adding?.dir.trim() || !adding.branch.trim()) return;
    try { const r = await api<{ path: string }>('/git/worktrees', { dir: adding.dir.trim(), branch: adding.branch.trim(), create: adding.create }); onNotice(`Worktree added: ${r.path}`); setAdding(null); void load(); } catch (e) { onNotice((e as Error).message); }
  };
  const remove = async (w: Worktree) => {
    if (!(await confirm({ title: 'Remove worktree?', description: `${w.path} is deleted from disk (its branch ${w.branch ?? ''} stays).`, confirm: 'Remove', danger: true }))) return;
    try { await api('/git/worktrees/remove', { path: w.path, force: true }); onNotice('Worktree removed.'); void load(); } catch (e) { onNotice((e as Error).message); }
  };
  const switchTo = async (w: Worktree) => {
    try { await api('/workspace', { repositoryRoot: w.path, targetProject: '.' }); location.reload(); } catch (e) { onNotice((e as Error).message); }
  };
  return (
    <section className="git-group" aria-label="Worktrees">
      <div className="git-group-head">
        <button className="se-twisty" aria-label={`${open ? 'Collapse' : 'Expand'} Worktrees`} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
        <FolderGit2 size={13} aria-hidden="true" /><span>Worktrees</span><small className="git-count">{list.length}</small>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Add Worktree" title="Add Worktree" onClick={() => { setOpen(true); setAdding({ dir: '', branch: '', create: true }); }}><Plus size={13} /></button>
      </div>
      {open && (
        <>
          {adding && (
            <form className="git-new-branch git-worktree-form" onSubmit={(e) => { e.preventDefault(); void add(); }}>
              <input autoFocus aria-label="Worktree folder" placeholder="Folder (next to the repository), e.g. ../feature-x" value={adding.dir} onChange={(e) => setAdding({ ...adding, dir: e.target.value })} />
              <input aria-label="Worktree branch" placeholder="Branch" value={adding.branch} onChange={(e) => setAdding({ ...adding, branch: e.target.value })} />
              <label className="git-amend"><input type="checkbox" checked={adding.create} onChange={(e) => setAdding({ ...adding, create: e.target.checked })} />New branch</label>
              <button className="button primary" type="submit" disabled={!adding.dir.trim() || !adding.branch.trim()}>Add</button>
              <button className="button" type="button" onClick={() => setAdding(null)}>Cancel</button>
            </form>
          )}
          <ul className="git-history git-worktrees">
            {list.map((w) => (
              <li key={w.path} title={w.path}>
                <code>{w.branch ?? w.head}</code> <span className="git-worktree-path">{w.path}</span>{w.current && <small>open</small>}{w.main && <small>main</small>}
                {!w.current && <button className="icon-button" aria-label={`Open worktree ${w.branch ?? w.path}`} title="Open in the studio" onClick={() => void switchTo(w)}><FolderOpen size={13} /></button>}
                {!w.main && !w.current && <button className="icon-button" aria-label={`Remove worktree ${w.branch ?? w.path}`} title="Remove" onClick={() => void remove(w)}><Trash2 size={13} /></button>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
