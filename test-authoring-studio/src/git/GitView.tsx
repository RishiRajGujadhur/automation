import { useEffect, useState, type ReactNode } from 'react';
import { GitBranch, Plus, Minus, Undo2, RefreshCw, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Check, History, CloudDownload, GitBranchPlus, Cloud, GitMerge } from 'lucide-react';
import { Dropdown } from '../radix';
import { api } from '../api';
import { featureOn } from '../features';
import { useLocalState } from '../ui';
import { useConfirm } from '../radix2';
import { fileType } from '../files/fileTypes';
import { FILES_CHANGED_EVENT, UNSAVED_REFRESH, GIT_CHANGED_EVENT } from '../editor/events';
import Worktrees from './Worktrees';
import { issueKey, withIssueKey, COMMIT_TYPES, withCommitType, withoutTemplateComments } from './commitTools';

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
  // The commit message draft survives a reload (QOL-50).
  const [message, setMessage] = useLocalState('gitCommitDraft', '');
  // Commit message template (git's commit.template or .gitmessage): an empty box starts with it.
  const [template, setTemplate] = useState<{ text: string; source: string } | null>(null);
  // The template as it came (only its comments and headings): nothing to commit yet.
  const untouched = !!template && withoutTemplateComments(message, template.text) === withoutTemplateComments(template.text, template.text);
  useEffect(() => { if (featureOn('commit-template')) api<{ text: string; source: string } | null>('/git/commit-template').then((t) => { setTemplate(t); if (t) setMessage((m) => m || t.text); }, () => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pastMessages, setPastMessages] = useLocalState<string[]>('gitCommitHistory', []);
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set(['history']));
  const [history, setHistory] = useState<Commit[]>([]);
  const [branches, setBranches] = useState<{ local: { name: string; current: boolean; upstream?: string; when: string }[]; remote: string[] }>({ local: [], remote: [] });
  const [newBranch, setNewBranch] = useState<string | null>(null);
  const loadBranches = () => api<typeof branches>('/git/branches').then(setBranches, () => {});
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
    const r = await api<{ summary: string }>('/git/commit', { message: template ? withoutTemplateComments(message, template.text) : message, all, amend });
    // Previous commit messages: ↑ in an empty box recalls them (QOL-50).
    setPastMessages((h) => [message.trim(), ...h.filter((m) => m !== message.trim())].slice(0, 20));
    setMessage(template?.text ?? '');
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
  /** Switch / create a branch; Fetch, Pull, Push (Push publishes a new branch with its upstream). */
  const switchTo = (name: string, create = false) => act(async () => {
    await api('/git/checkout', { name, create });
    window.dispatchEvent(new Event(GIT_CHANGED_EVENT));
    onChanged();
    onNotice(create ? `Created and switched to ${name}.` : `Switched to ${name}.`);
    void loadBranches();
  });
  const mergeFrom = (name: string) => act(async () => {
    await api('/git/merge', { name });
    window.dispatchEvent(new Event(GIT_CHANGED_EVENT));
    onChanged();
    onNotice(`Merged ${name} into ${st?.branch ?? 'the current branch'}.`);
  });
  const syncAction = (action: 'fetch' | 'pull' | 'push') => act(async () => {
    await api('/git/sync', { action });
    if (action === 'pull') { window.dispatchEvent(new Event(GIT_CHANGED_EVENT)); onChanged(); }
    onNotice({ fetch: 'Fetched.', pull: 'Pulled.', push: 'Pushed.' }[action]);
  });
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
        <div className="git-branch">
          <Dropdown
            label="Branches"
            trigger={<button className="git-branch-button" aria-label={`Branch ${st.branch}`} title={st.upstream ? `Tracking ${st.upstream}. Switch branch` : 'No upstream branch. Switch branch'} onClick={() => void loadBranches()}><GitBranch size={14} aria-hidden="true" /><strong>{st.branch}</strong><ChevronDown size={12} /></button>}
            entries={[
              { label: 'New Branch…', icon: GitBranchPlus, onSelect: () => setNewBranch('') },
              'separator' as const,
              ...branches.local.map((b) => ({ label: `${b.current ? '✓ ' : ''}${b.name}`, icon: GitBranch, disabled: b.current, onSelect: () => void switchTo(b.name) })),
              ...(branches.remote.length ? ['separator' as const, ...branches.remote.map((r) => ({ label: r, icon: Cloud, onSelect: () => void switchTo(r) }))] : []),
              ...(branches.local.some((b) => !b.current) ? ['separator' as const, ...branches.local.filter((b) => !b.current).map((b) => ({ label: `Merge ${b.name} into ${st.branch}`, icon: GitMerge, onSelect: () => void mergeFrom(b.name) }))] : []),
            ]}
          />
          <span className="git-sync">
            <button className="icon-button" aria-label="Fetch" title="Fetch" disabled={busy} onClick={() => void syncAction('fetch')}><CloudDownload size={14} /></button>
            <button className="icon-button" aria-label={`Pull${st.behind ? ` (${st.behind})` : ''}`} title="Pull" disabled={busy || !st.upstream} onClick={() => void syncAction('pull')}><ArrowDown size={14} />{st.behind > 0 && <small>{st.behind}</small>}</button>
            <button className="icon-button" aria-label={`Push${st.ahead ? ` (${st.ahead})` : ''}`} title={st.upstream ? 'Push' : 'Push (publish branch)'} disabled={busy} onClick={() => void syncAction('push')}><ArrowUp size={14} />{st.ahead > 0 && <small>{st.ahead}</small>}</button>
          </span>
        </div>
      )}
      {newBranch !== null && (
        <form className="git-new-branch" onSubmit={(e) => { e.preventDefault(); if (newBranch.trim()) { void switchTo(newBranch.trim(), true); setNewBranch(null); } }}>
          <input autoFocus aria-label="New branch name" placeholder={`New branch from ${st?.branch ?? 'HEAD'}`} value={newBranch} onChange={(e) => setNewBranch(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setNewBranch(null); }} />
          <button className="button primary" type="submit" disabled={!newBranch.trim()}>Create</button>
        </form>
      )}
      <div className="git-commit">
        <textarea aria-label="Commit message" placeholder={`Message (Ctrl+Enter to commit${st?.branch ? ` on "${st.branch}"` : ''})`} value={message} onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && message.trim() && !untouched) { e.preventDefault(); void doCommit(!staged.length); return; }
            if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && featureOn('commit-pastMessages') && pastMessages.length && (message === '' || pastMessages.includes(message)) && e.currentTarget.selectionStart === 0) {
              e.preventDefault();
              const at = message === '' ? -1 : pastMessages.indexOf(message);
              const next = e.key === 'ArrowUp' ? Math.min(pastMessages.length - 1, at + 1) : at - 1;
              setMessage(next < 0 ? '' : pastMessages[next]);
            }
          }} rows={3} />
        {featureOn('commit-length') && (message.split('\n')[0].length > 72 || (message.includes('\n') && message.split('\n')[1].trim() !== '')) && <p className="git-commit-hint" role="note">{message.split('\n')[0].length > 72 ? `The summary line has ${message.split('\n')[0].length} characters; keep it under 72.` : 'Leave the second line empty between the summary and the description.'}</p>}
        <div className="git-commit-row">
          <button className="button primary" disabled={busy || !message.trim() || untouched || (!staged.length && !changes.length && !amend)} onClick={() => void doCommit(!staged.length)}>
            <Check size={14} />{staged.length ? 'Commit Staged' : 'Commit All'}
          </button>
          <label className="git-amend"><input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} />Amend</label>
          {featureOn('commit-type') && <select className="build-config" aria-label="Commit type" value="" onChange={(e) => { if (e.target.value) setMessage(withCommitType(message, e.target.value)); }}><option value="">Type…</option>{COMMIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>}
          {featureOn('commit-issue-key') && issueKey(st?.branch) && <button className="link-button" aria-label={`Insert issue key ${issueKey(st?.branch)}`} title={`Put the issue key of branch ${st?.branch} in front of the message`} onClick={() => setMessage(withIssueKey(message, issueKey(st?.branch)!))}>{issueKey(st?.branch)}</button>}
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
        {featureOn('git-worktrees') && <Worktrees onNotice={onNotice} />}
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
