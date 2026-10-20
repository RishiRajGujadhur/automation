import { useEffect, useMemo, useState } from 'react';
import RebaseEditor from './RebaseEditor';
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

/** Show History for File: the Git Log opens on one file (the file waits here until the window mounts). */
export const FILE_HISTORY_EVENT = 'tas:git-file-history';
let pendingFile: string | undefined;
export const requestFileHistory = (file: string) => { pendingFile = file; window.dispatchEvent(new CustomEvent(FILE_HISTORY_EVENT, { detail: file })); };
const takeFileHistory = () => { const f = pendingFile; pendingFile = undefined; return f; };
type Row = { graph: string; hash?: string; author?: string; when?: string; refs?: string; subject?: string };
type Commit = { hash: string; author: string; email: string; date: string; message: string; files: { status: string; file: string }[]; patch: string };
const SETUP = { foldGutter: false, autocompletion: false };
const DIFF = [StreamLanguage.define(diffMode)];

/** Git Log tool window (Rider, Alt+9): every branch's commits with the graph; select one for its message, files and patch. */
export default function GitLogPanel({ onOpen, onClose, onNotice }: { onOpen: (file: string) => void; onClose: () => void; onNotice: (m: string) => void }) {
  const theme = useEditorTheme();
  const [rows, setRows] = useState<Row[]>();
  const [error, setError] = useState('');
  // The filter is remembered (QOL-50).
  const [savedQuery, setSavedQuery] = useLocalState('gitLogQuery', '');
  const [plainQuery, setPlainQuery] = useState('');
  const remember = featureOn('git-log-remember');
  const query = remember ? savedQuery : plainQuery;
  const setQuery = remember ? setSavedQuery : setPlainQuery;
  const [selected, setSelected] = useState<string>();
  // Compare commits: Ctrl+click a second commit (Rider's Compare Versions).
  const [other, setOther] = useState<string>();
  // Interactive Rebase from the selected commit.
  const [rebaseFrom, setRebaseFrom] = useState<string>();
  // Git bisect: in progress or not, and what git said last.
  const [bisecting, setBisecting] = useState<{ active: boolean; head: string; firstBad?: string; output?: string }>();
  useEffect(() => { if (featureOn('git-bisect')) api<{ active: boolean; head: string }>('/git/bisect').then(setBisecting, () => {}); }, []);
  const bisectAct = (action: string, ref?: string) => void api<{ active: boolean; head: string; firstBad?: string; output: string }>('/git/bisect', { action, ...(ref ? { ref } : {}) }).then((r) => { setBisecting(r); onNotice(r.firstBad ? `First bad commit: ${r.firstBad}` : r.active ? `Bisecting: now at ${r.head}` : 'Bisect ended.'); window.dispatchEvent(new Event(GIT_CHANGED_EVENT)); void load(); }, (e) => onNotice((e as Error).message));
  const [comparison, setComparison] = useState<{ files: { file: string; status: string }[]; patch: string }>();
  useEffect(() => { setComparison(undefined); if (selected && other) api<{ files: { file: string; status: string }[]; patch: string }>(`/git/compare?from=${other}&to=${selected}`).then(setComparison, (e) => setError((e as Error).message)); }, [selected, other]);
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
  // Show History for File (Git): the log of one file.
  const [ofFile, setOfFile] = useState<string | undefined>(takeFileHistory);
  useEffect(() => { const h = (e: Event) => setOfFile((e as CustomEvent<string>).detail); window.addEventListener(FILE_HISTORY_EVENT, h); return () => window.removeEventListener(FILE_HISTORY_EVENT, h); }, []);
  const load = () => api<Row[]>(`/git/graph?${new URLSearchParams({ ...(currentOnly && featureOn('git-log-current') ? { scope: 'current' } : {}), ...(ofFile ? { file: ofFile } : {}) })}`).then((r) => { setRows(r); setError(''); }, (e) => setError((e as Error).message));
  useEffect(() => { void load(); }, [currentOnly, ofFile]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setCommit(undefined); setShownFile(undefined); if (selected) api<Commit>(`/git/commit?hash=${selected}`).then(setCommit, (e) => setError((e as Error).message)); }, [selected]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || (featureOn('git-log-filters') ? matchCommit(r, q) : !!r.hash && `${r.hash} ${r.subject} ${r.author} ${r.refs}`.toLowerCase().includes(q)));
  }, [rows, query]);
  return (
    <section className="debug-panel git-log-panel" aria-label="Git Log">
      <div className="debug-toolbar" role="toolbar" aria-label="Git Log">
        <input className="shelf-name" aria-label="Filter commits" placeholder={featureOn('git-log-filters') ? 'Filter: words, author:…, branch:…, hash:…, -exclude' : 'Filter: text, hash, author, branch'} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && query && featureOn('search-escape')) { e.stopPropagation(); setQuery(''); } }} />
        {featureOn('git-log-current') && <label className="build-on-save" title="Show only the commits of the current branch"><input type="checkbox" checked={currentOnly} onChange={(e) => setCurrentOnly(e.target.checked)} /> Current branch only</label>}
        {ofFile && <span className="git-file-chip" title={ofFile}>History of {ofFile.split('/').pop()} <button className="icon-button" aria-label="Show every file" title="Every file" onClick={() => setOfFile(undefined)}><X size={12} /></button></span>}
        <button className="icon-button" aria-label="Refresh log" title="Refresh" onClick={() => void load()}><RefreshCw size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Git Log" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      {featureOn('git-bisect') && bisecting?.active && (
        <div className="git-bisect" role="status" aria-label="Bisect">
          <span>{bisecting.firstBad ? <>First bad commit: <code>{bisecting.firstBad.slice(0, 10)}</code></> : <>Bisecting · at {bisecting.head}</>}</span>
          {!bisecting.firstBad && <><button className="button" onClick={() => bisectAct('good')}>Good</button><button className="button" onClick={() => bisectAct('bad')}>Bad</button><button className="button" onClick={() => bisectAct('skip')}>Skip</button></>}
          <button className="button" onClick={() => bisectAct('reset')}>Reset Bisect</button>
        </div>
      )}
      {error && <p className="subtle hierarchy-hint" role="alert">{error}</p>}
      <div className="git-log-body">
        <ul className="git-log-list" role="listbox" aria-label="Commits">
          {shown.map((r, i) => (r.hash ? (
            <li key={`${r.hash}-${i}`} role="option" aria-selected={selected === r.hash || other === r.hash} className={selected === r.hash ? 'active' : other === r.hash ? 'active compared' : ''} onClick={(e) => { if ((e.ctrlKey || e.metaKey) && selected && selected !== r.hash && featureOn('git-compare-commits')) setOther(r.hash); else { setSelected(r.hash); setOther(undefined); } }}>
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
          {other && selected && (
            <div className="git-compare" aria-label="Commit comparison">
              <p className="git-commit-head"><strong>Comparing {other.slice(0, 7)} → {selected.slice(0, 7)}</strong> <button className="link-button" onClick={() => setOther(undefined)}>Stop comparing</button></p>
              {comparison && (comparison.files.length ? <ul className="git-commit-files" aria-label="Files that differ">{comparison.files.map((f) => <li key={f.file}><span className={`git-status s-${f.status}`}>{f.status}</span> <button className="link-button" onClick={() => onOpen(f.file)}>{f.file}</button></li>)}</ul> : <p className="subtle">No difference.</p>)}
              {comparison && comparison.files.length > 0 && <CodeMirror value={comparison.patch} theme={theme} editable={false} basicSetup={SETUP} extensions={DIFF} height="260px" aria-label="Comparison patch" />}
            </div>
          )}
          {rebaseFrom && <RebaseEditor base={rebaseFrom} onNotice={onNotice} onCancel={() => setRebaseFrom(undefined)} onDone={() => { setRebaseFrom(undefined); setSelected(undefined); window.dispatchEvent(new Event(GIT_CHANGED_EVENT)); void load(); }} />}
          {commit && !other && !rebaseFrom && (
            <>
              <p className="git-commit-head"><strong>{commit.message.split('\n')[0]}</strong><br /><small>{commit.hash.slice(0, 10)} · {commit.author} &lt;{commit.email}&gt; · {new Date(commit.date).toLocaleString()}</small></p>
              {commit.message.includes('\n') && <pre className="git-commit-body">{commit.message.split('\n').slice(1).join('\n').trim()}</pre>}
              <div className="git-commit-actions" role="toolbar" aria-label="Commit actions">
              {/* commit actions */}
              {featureOn('git-bisect') && <><button className="button" onClick={() => bisectAct('bad', commit.hash)}>Bisect: Mark Bad</button><button className="button" onClick={() => bisectAct('good', commit.hash)}>Bisect: Mark Good</button></>}
              {featureOn('git-interactive-rebase') && <button className="button" onClick={() => setRebaseFrom(commit.hash)}>Interactively Rebase from Here…</button>}
              {featureOn('git-squash') && <button className="button" onClick={() => { void api<{ subject: string }[]>(`/git/rebase?base=${commit.hash}`).then((list) => { const message = window.prompt(`Squash ${list.length} commit${list.length === 1 ? '' : 's'} (this one up to HEAD) into one. Message:`, list.map((c) => c.subject).join('\n')); if (!message?.trim()) return; return api<{ head: string }>('/git/squash', { base: commit.hash, message }).then((r) => { onNotice(`Squashed: ${r.head}`); setSelected(undefined); window.dispatchEvent(new Event(GIT_CHANGED_EVENT)); void load(); }); }).catch((e) => onNotice((e as Error).message)); }}>Squash to HEAD…</button>}
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
