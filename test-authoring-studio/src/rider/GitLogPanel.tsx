import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { api } from '../api';
import { matchCommit } from './gitFilter';
import { createTwoFilesPatch } from 'diff';
import { readFile } from '../files/provider';
import { copyText, useLocalState } from '../ui';
import { featureOn } from '../features';
import { GIT_CHANGED_EVENT, FILES_CHANGED_EVENT } from '../editor/events';
import { useEditorTheme } from '../themes';

type Row = { graph: string; hash?: string; author?: string; when?: string; refs?: string; subject?: string };
type Commit = { hash: string; author: string; email: string; date: string; message: string; files: { status: string; file: string }[]; patch: string };
const SETUP = { foldGutter: false, autocompletion: false };
const DIFF = [StreamLanguage.define(diffMode)];

/** Git Log tool window (Rider, Alt+9): every branch's commits with the graph; select one for its message, files and patch. */
export default function GitLogPanel({ onOpen, onClose, onNotice }: { onOpen: (file: string) => void; onClose: () => void; onNotice: (m: string) => void }) {
  const theme = useEditorTheme();
  const [rows, setRows] = useState<Row[]>();
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>();
  const [commit, setCommit] = useState<Commit>();
  // A file at the selected revision, or its difference from the working copy, instead of the commit's patch.
  const [shownFile, setShownFile] = useState<{ title: string; text: string; diff: boolean }>();
  /** Runs a commit action on the server, then refreshes the log (and editors / Git views when files changed). */
  const act = async (action: string, extra: Record<string, string> = {}, done = '') => {
    if (!commit) return;
    try {
      const r = await api<{ output: string }>('/git/commit-action', { hash: commit.hash, action, ...extra });
      onNotice(done || r.output || 'Done.');
      window.dispatchEvent(new Event(GIT_CHANGED_EVENT));
      window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: commit.files.map((f) => f.file) }));
      void load();
    } catch (e) { onNotice((e as Error).message); }
  };
  // Current branch only (Rider's Branch filter: HEAD), else every branch.
  const [currentOnly, setCurrentOnly] = useLocalState('gitLogCurrentOnly', false);
  const load = () => api<Row[]>(`/git/graph${currentOnly && featureOn('git-log-current') ? '?scope=current' : ''}`).then((r) => { setRows(r); setError(''); }, (e) => setError((e as Error).message));
  useEffect(() => { void load(); }, [currentOnly]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCommit(undefined); setShownFile(undefined); if (selected) api<Commit>(`/git/commit?hash=${selected}`).then(setCommit, (e) => setError((e as Error).message)); }, [selected]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || (featureOn('git-log-filters') ? matchCommit(r, q) : !!r.hash && `${r.hash} ${r.subject} ${r.author} ${r.refs}`.toLowerCase().includes(q)));
  }, [rows, query]);
  return (
    <section className="debug-panel git-log-panel" aria-label="Git Log">
      <div className="debug-toolbar" role="toolbar" aria-label="Git Log">
        <input className="shelf-name" aria-label="Filter commits" placeholder={featureOn('git-log-filters') ? 'Filter: words, author:…, branch:…, hash:…, -exclude' : 'Filter: text, hash, author, branch'} value={query} onChange={(e) => setQuery(e.target.value)} />
        {featureOn('git-log-current') && <label className="build-on-save" title="Show only the commits of the current branch"><input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} /> Current branch only</label>}
        <button className="icon-button" aria-label="Refresh log" title="Refresh" onClick={() => void load()}><RefreshCw size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Git Log" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      {error && <p className="subtle hierarchy-hint" role="alert">{error}</p>}
      <div className="git-log-body">
        <ul className="git-log-list" role="listbox" aria-label="Commits">
          {shown.map((r, i) => (r.hash ? (
            <li key={`${r.hash}-${i}`} role="option" aria-selected={selected === r.hash} className={selected === r.hash ? 'active' : ''} onClick={() => setSelected(r.hash)}>
              <span className="git-graph">{r.graph}</span>
              {r.refs && <span className="git-refs">{r.refs}</span>}
              <span className="git-subject">{r.subject}</span>
              <small>{r.author} · {r.when}</small>
            </li>
          ) : !query && <li key={`g${i}`} className="git-graph-only"><span className="git-graph">{r.graph}</span></li>))}
          {rows && !shown.length && <li className="subtle">No commits.</li>}
        </ul>
        <div className="git-log-details" aria-label="Commit details">
          {!selected && <p className="subtle">Select a commit to see its changes.</p>}
          {commit && (
            <>
              <p className="git-commit-head"><strong>{commit.message.split('\n')[0]}</strong><br /><small>{commit.hash.slice(0, 10)} · {commit.author} &lt;{commit.email}&gt; · {new Date(commit.date).toLocaleString()}</small></p>
              {commit.message.includes('\n') && <pre className="git-commit-body">{commit.message.split('\n').slice(1).join('\n').trim()}</pre>}
              <div className="git-commit-actions" role="toolbar" aria-label="Commit actions">
              {/* commit actions */}
              {featureOn('git-copy-message') && <button className="button" onClick={() => void copyText(commit.message.trim()).then((ok) => onNotice(ok ? 'Copied the commit message.' : 'Clipboard unavailable.'))}>Copy Message</button>}
              {featureOn('git-reset') && <button className="button" onClick={() => { const mode = window.prompt('Reset the current branch here. Mode: soft (keep changes staged), mixed (keep changes), hard (discard changes)', 'mixed')?.trim().toLowerCase(); if (!mode) return; if (!['soft', 'mixed', 'hard'].includes(mode)) { onNotice('Use soft, mixed or hard.'); return; } if (mode === 'hard' && !window.confirm('Hard reset discards every uncommitted change. Continue?')) return; void act('reset', { mode }); }}>Reset to Here…</button>}
              {featureOn('git-checkout-revision') && <button className="button" onClick={() => { if (window.confirm('Check out this commit (detached HEAD)? Uncommitted changes stay.')) void act('checkout'); }}>Checkout Revision</button>}
              {featureOn('git-revert') && <button className="button" onClick={() => void act('revert')}>Revert Commit</button>}
              {featureOn('git-cherry-pick') && <button className="button" onClick={() => void act('cherry-pick')}>Cherry-Pick</button>}
              {featureOn('git-new-tag') && <button className="button" onClick={() => { const name = window.prompt('New tag at this commit:', ''); if (name) void act('tag', { name: name.trim() }); }}>New Tag…</button>}
              {featureOn('git-new-branch') && <button className="button" onClick={() => { const name = window.prompt('New branch at this commit:', ''); if (name) void act('branch', { name: name.trim() }); }}>New Branch…</button>}
              {featureOn('git-copy-revision') && <button className="button" onClick={() => void copyText(commit.hash).then((ok) => onNotice(ok ? `Copied ${commit.hash.slice(0, 10)}.` : 'Clipboard unavailable.'))}>Copy Revision</button>}
              </div>
              <ul className="git-commit-files" aria-label="Changed files">
                {commit.files.map((f) => <li key={f.file}><span className={`git-status s-${f.status}`}>{f.status}</span> <button className="link-button" onClick={() => onOpen(f.file)}>{f.file}</button>{featureOn('git-view-revision') && f.status !== 'D' && <button className="link-button git-file-action" aria-label={`View ${f.file} at this revision`} onClick={() => void api<{ text: string | null }>(`/git/at?file=${encodeURIComponent(f.file)}&ref=${commit.hash}`).then((r) => setShownFile({ title: `${f.file} @ ${commit.hash.slice(0, 7)}`, text: r.text ?? '', diff: false }), (e) => onNotice((e as Error).message))}>view</button>}{featureOn('git-compare-local') && f.status !== 'D' && <button className="link-button git-file-action" aria-label={`Compare ${f.file} with the working copy`} onClick={() => void Promise.all([api<{ text: string | null }>(`/git/at?file=${encodeURIComponent(f.file)}&ref=${commit.hash}`), readFile(f.file).then((r) => r.source, () => '')]).then(([old, now]) => { const a = (old.text ?? '').replace(/\r\n/g, '\n'), b = now.replace(/\r\n/g, '\n'); setShownFile({ title: `${f.file}: ${commit.hash.slice(0, 7)} → working copy`, text: a === b ? '(no difference)' : createTwoFilesPatch(`${f.file} @ ${commit.hash.slice(0, 7)}`, `${f.file} (working copy)`, a, b, '', '', { context: 3 }).split('\n').slice(2).join('\n'), diff: true }); }, (e) => onNotice((e as Error).message))}>compare with local</button>}</li>)}
              </ul>
              {shownFile ? (
                <>
                  <div className="git-shown-file"><strong>{shownFile.title}</strong><button className="link-button" onClick={() => setShownFile(undefined)}>Back to the patch</button></div>
                  <CodeMirror value={shownFile.text} theme={theme} editable={false} basicSetup={SETUP} extensions={shownFile.diff ? DIFF : []} height="220px" aria-label={shownFile.diff ? 'Difference from the working copy' : 'File at revision'} />
                </>
              ) : <CodeMirror value={commit.patch} theme={theme} editable={false} basicSetup={SETUP} extensions={DIFF} height="220px" aria-label="Patch" />}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
