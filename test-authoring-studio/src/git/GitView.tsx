import { useEffect, useState, type ReactNode } from 'react';
import { GitBranch, Plus, Minus, Undo2, RefreshCw, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Check, History } from 'lucide-react';
import { api } from '../api';
import { useConfirm } from '../radix2';
import { fileType } from '../files/fileTypes';
import { FILES_CHANGED_EVENT, UNSAVED_REFRESH, GIT_CHANGED_EVENT } from '../editor/events';

type GitFile = { file: string; staged: boolean; status: 'M' | 'A' | 'D' | 'R' | 'U' | '?'; from?: string };
type GitStatus = { repo: boolean; branch?: string; upstream?: string; ahead: number; behind: number; files: GitFile[] };
type Commit = { hash: string; author: string; when: string; subject: string };
const statusName: Record<GitFile['status'], string> = { M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', U: 'Conflict', '?': 'Untracked' };

/**
 * Visual Studio's Git Changes window (VS Code's Source Control): branch, commit message, Commit Staged / Commit All
 * (Ctrl+Enter), Amend, Staged Changes and Changes with stage / unstage / discard, and recent history.
 */
export default function GitView({ onOpen, onNotice, onChanged }: { onOpen: (file: string) => void; onNotice: (m: string) => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const [st, setSt] = useState<GitStatus>();
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set(['history']));
  const [history, setHistory] = useState<Commit[]>([]);
  const refresh = () => api<GitStatus>('/git/status').then(setSt, () => {});
  useEffect(() => {
    void refresh();
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 4000);
    const h = () => void refresh();
    window.addEventListener('focus', h);
    window.addEventListener(FILES_CHANGED_EVENT, h);
    window.addEventListener(UNSAVED_REFRESH, h);
    return () => { clearInterval(t); window.removeEventListener('focus', h); window.removeEventListener(FILES_CHANGED_EVENT, h); window.removeEventListener(UNSAVED_REFRESH, h); };
  }, []);
  useEffect(() => { if (!closed.has('history')) api<Commit[]>('/git/log').then(setHistory, () => {}); }, [closed, st?.ahead, st?.branch]);

  const act = async (fn: () => Promise<unknown>) => { setBusy(true); try { await fn(); } catch (e) { onNotice((e as Error).message); } finally { setBusy(false); void refresh(); } };
  const staged = st?.files.filter((f) => f.staged) ?? [];
  const changes = st?.files.filter((f) => !f.staged) ?? [];
  const doCommit = (all: boolean) => act(async () => {
    const r = await api<{ summary: string }>('/git/commit', { message, all, amend });
    setMessage('');
    setAmend(false);
    window.dispatchEvent(new Event(GIT_CHANGED_EVENT));
    onNotice(`Committed ${r.summary}.`);
    api<Commit[]>('/git/log').then(setHistory, () => {});
  });
  const discard = async (files: string[]) => {
    const untracked = files.filter((f) => changes.some((c) => c.file === f && c.status === '?')).length;
    if (!(await confirm({ title: files.length === 1 ? `Discard changes to ${files[0].split('/').pop()}?` : `Discard ${files.length} changes?`, description: `${untracked ? `${untracked} new file${untracked === 1 ? '' : 's'} will be deleted. ` : ''}Changes go back to the last commit. This cannot be undone.`, confirm: 'Discard', danger: true }))) return;
    await act(async () => { await api('/git/discard', { files, approved: true }); window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: files })); window.dispatchEvent(new Event(GIT_CHANGED_EVENT)); onChanged(); });
  };
  const toggle = (k: string) => setClosed((p) => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const row = (f: GitFile) => {
    const { icon: Icon, color } = fileType(f.file);
    const name = f.file.split('/').pop()!;
    const dir = f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : '';
    return (
      <li key={`${f.staged}:${f.file}`} className="git-row">
        <button className="git-file" onClick={() => f.status !== 'D' && onOpen(f.file)} title={`${f.file} — ${statusName[f.status]}`} disabled={f.status === 'D'}>
          <Icon size={14} style={{ color }} aria-hidden="true" />
          <span className={f.status === 'D' ? 'deleted' : ''}>{name}</span>
          <small>{dir}</small>
        </button>
        <span className="git-actions">
          {!f.staged && <button className="icon-button" aria-label={`Discard changes to ${f.file}`} title="Discard Changes" disabled={busy} onClick={() => void discard([f.file])}><Undo2 size={13} /></button>}
          {f.staged
            ? <button className="icon-button" aria-label={`Unstage ${f.file}`} title="Unstage" disabled={busy} onClick={() => void act(() => api('/git/unstage', { files: [f.file] }))}><Minus size={13} /></button>
            : <button className="icon-button" aria-label={`Stage ${f.file}`} title="Stage" disabled={busy} onClick={() => void act(() => api('/git/stage', { files: [f.file] }))}><Plus size={13} /></button>}
        </span>
        <span className={`git-status s-${f.status === '?' ? 'U2' : f.status}`} aria-label={statusName[f.status]}>{f.status === '?' ? 'U' : f.status === 'U' ? '!' : f.status}</span>
      </li>
    );
  };
  const group = (key: string, title: string, files: GitFile[], actions: ReactNode) => (
    <section className="git-group" aria-label={title}>
      <div className="git-group-head">
        <button className="se-twisty" aria-label={`${closed.has(key) ? 'Expand' : 'Collapse'} ${title}`} aria-expanded={!closed.has(key)} onClick={() => toggle(key)}>{closed.has(key) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>
        <span>{title}</span>
        <span className="git-actions">{actions}</span>
        <span className="git-count">{files.length}</span>
      </div>
      {!closed.has(key) && <ul>{files.map(row)}</ul>}
    </section>
  );

  if (st && !st.repo) return (
    <section className="git-view" aria-label="Git Changes">
      <div className="sidebar-heading"><span>GIT CHANGES</span></div>
      <p className="explorer-empty">This folder is not in a Git repository.</p>
    </section>
  );
  return (
    <section className="git-view" aria-label="Git Changes">
      <div className="sidebar-heading">
        <span>GIT CHANGES</span>
        <div className="se-tools"><button className="icon-button" aria-label="Refresh Git status" title="Refresh" onClick={() => void refresh()}><RefreshCw size={14} /></button></div>
      </div>
      {st?.branch && (
        <p className="git-branch" title={st.upstream ? `Tracking ${st.upstream}` : 'No upstream branch'}>
          <GitBranch size={14} aria-hidden="true" /><strong>{st.branch}</strong>
          {st.ahead > 0 && <span title="Commits to push"><ArrowUp size={12} />{st.ahead}</span>}
          {st.behind > 0 && <span title="Commits to pull"><ArrowDown size={12} />{st.behind}</span>}
        </p>
      )}
      <div className="git-commit">
        <textarea aria-label="Commit message" placeholder={`Message (Ctrl+Enter to commit${st?.branch ? ` on "${st.branch}"` : ''})`} value={message} onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && message.trim()) { e.preventDefault(); void doCommit(!staged.length); } }} rows={3} />
        <div className="git-commit-row">
          <button className="button primary" disabled={busy || !message.trim() || (!staged.length && !changes.length && !amend)} onClick={() => void doCommit(!staged.length)}>
            <Check size={14} />{staged.length ? 'Commit Staged' : 'Commit All'}
          </button>
          <label className="git-amend"><input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />Amend</label>
        </div>
      </div>
      <div className="git-lists">
        {staged.length > 0 && group('staged', 'Staged Changes', staged,
          <button className="icon-button" aria-label="Unstage All" title="Unstage All" disabled={busy} onClick={() => void act(() => api('/git/unstage', { files: staged.map((f) => f.file) }))}><Minus size={13} /></button>)}
        {group('changes', 'Changes', changes, <>
          <button className="icon-button" aria-label="Discard All Changes" title="Discard All" disabled={busy || !changes.length} onClick={() => void discard(changes.map((f) => f.file))}><Undo2 size={13} /></button>
          <button className="icon-button" aria-label="Stage All Changes" title="Stage All" disabled={busy || !changes.length} onClick={() => void act(() => api('/git/stage', { files: changes.map((f) => f.file) }))}><Plus size={13} /></button>
        </>)}
        {st && !st.files.length && <p className="explorer-empty">No changes.</p>}
        <section className="git-group" aria-label="History">
          <div className="git-group-head">
            <button className="se-twisty" aria-label={`${closed.has('history') ? 'Expand' : 'Collapse'} History`} aria-expanded={!closed.has('history')} onClick={() => toggle('history')}>{closed.has('history') ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</button>
            <History size={13} aria-hidden="true" /><span>History</span>
          </div>
          {!closed.has('history') && <ul className="git-history">{history.map((c) => <li key={c.hash} title={`${c.hash} · ${c.author} · ${c.when}`}><code>{c.hash}</code> {c.subject}<small>{c.when}</small></li>)}</ul>}
        </section>
      </div>
    </section>
  );
}
