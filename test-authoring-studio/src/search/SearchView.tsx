import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, CaseSensitive, WholeWord, Regex, Replace, MoreHorizontal, RefreshCw, X, ChevronsDownUp, ChevronsUpDown, ClipboardCopy, BookOpen } from 'lucide-react';
import { api } from '../api';
import { useTabs } from '../files/tabs';
import { useLocalState, copyText } from '../ui';
import { featureOn } from '../features';
import { useConfirm } from '../radix2';
import { fileType } from '../files/fileTypes';
import { FILES_CHANGED_EVENT } from '../editor/events';

type Match = { line: number; column: number; length: number; preview: string };
type Result = { files: { file: string; matches: Match[] }[]; total: number; truncated: boolean };

/**
 * Find and Replace in Files (Ctrl+Shift+F / Ctrl+Shift+H), like VS Code's Search view and Visual Studio's Find in
 * Files: match case, whole word, regular expressions, files to include / exclude, results by file, Replace All.
 */
export default function SearchView({ initialReplace, initialInclude, onOpen, onNotice, onChanged }: { initialReplace?: boolean; initialInclude?: string; onOpen: (file: string, line: number, column: number) => void; onNotice: (m: string) => void; onChanged: () => void }) {
  const confirm = useConfirm();
  // The last search comes back after a reload (QOL-50).
  const last = (() => { try { return featureOn('search-remember') ? JSON.parse(sessionStorage.getItem('tas:lastSearch') ?? '{}') as { query?: string; include?: string; exclude?: string; matchCase?: boolean; wholeWord?: boolean; regex?: boolean } : {}; } catch { return {}; } })();
  const [query, setQuery] = useState(last.query ?? '');
  const [replace, setReplace] = useState('');
  const [showReplace, setShowReplace] = useState(!!initialReplace);
  const [showFilters, setShowFilters] = useState(!!initialInclude);
  const [include, setInclude] = useState(initialInclude ?? last.include ?? '');
  const [exclude, setExclude] = useState(last.exclude ?? '');
  const [matchCase, setMatchCase] = useState(!!last.matchCase);
  const [wholeWord, setWholeWord] = useState(!!last.wholeWord);
  const [regex, setRegex] = useState(!!last.regex);
  // Search Only in Open Editors (VS Code's book toggle; Visual Studio's 'All open documents' scope).
  const [openOnly, setOpenOnly] = useState(false);
  const tabs = useTabs();
  const openFiles = tabs.tabs.map((t) => t.file).join(',');
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const input = useRef<HTMLInputElement>(null);
  // Search history (VS Code: ↑ / ↓ in the search box): the last 20 searches that found something.
  const [history, setHistory] = useLocalState<string[]>('searchHistory', []);
  const back = useRef(-1);
  const recalled = useRef('');
  const recall = (step: 1 | -1) => {
    if (!featureOn('search-history') || !history.length) return false;
    back.current = Math.max(-1, Math.min(history.length - 1, back.current + step));
    recalled.current = back.current < 0 ? '' : history[back.current];
    setQuery(recalled.current);
    return true;
  };
  useEffect(() => { if (initialReplace) setShowReplace(true); input.current?.focus(); input.current?.select(); }, [initialReplace]);

  const options = useMemo(() => ({ query, regex, matchCase, wholeWord, include: (openOnly && featureOn('search-open-only') ? openFiles || '\u0000none' : include) || undefined, exclude: exclude || undefined }), [query, regex, matchCase, wholeWord, include, exclude, openOnly, openFiles]);
  useEffect(() => { if (featureOn('search-remember')) try { sessionStorage.setItem('tas:lastSearch', JSON.stringify({ query, include, exclude, matchCase, wholeWord, regex })); } catch { /* storage blocked */ } }, [query, include, exclude, matchCase, wholeWord, regex]);
  const search = () => {
    if (!query) { setResult(undefined); setError(''); return; }
    setBusy(true);
    api<Result>('/search/text', options).then((r) => { setResult(r); setError(''); if (r.total && featureOn('search-history') && options.query !== recalled.current) { setHistory((h) => [options.query, ...h.filter((q) => q !== options.query)].slice(0, 20)); back.current = -1; } }, (e) => setError((e as Error).message)).finally(() => setBusy(false));
  };
  // Search as you type (debounced), like VS Code.
  useEffect(() => { const t = setTimeout(search, 300); return () => clearTimeout(t); }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  const replaceAll = async (files?: string[]) => {
    if (!result?.total) return;
    const count = files ? result.files.filter((f) => files.includes(f.file)).reduce((n, f) => n + f.matches.length, 0) : result.total;
    const fileCount = files?.length ?? result.files.length;
    if (!(await confirm({ title: 'Replace All', description: `Replace ${count} occurrence${count === 1 ? '' : 's'} of “${query}” with “${replace}” in ${fileCount} file${fileCount === 1 ? '' : 's'}? Files are written to disk.`, confirm: 'Replace', danger: true }))) return;
    try {
      const r = await api<{ changed: { file: string; count: number }[] }>('/search/replace', { ...options, replacement: replace, files, approved: true });
      window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: r.changed.map((c) => c.file) }));
      onNotice(`Replaced ${r.changed.reduce((n, c) => n + c.count, 0)} occurrences in ${r.changed.length} files.`);
      onChanged();
      search();
    } catch (e) { onNotice((e as Error).message); }
  };
  const toggle = (on: boolean, set: (v: boolean) => void, label: string, Icon: typeof Regex, key: string) => (
    <button className={`search-toggle ${on ? 'on' : ''}`} aria-label={label} title={`${label} (${key})`} aria-pressed={on} onClick={() => set(!on)}><Icon size={14} /></button>
  );
  const highlight = (m: Match) => {
    const at = m.preview.indexOf(m.preview.substr(m.column - 1, m.length)) >= 0 && m.preview.length >= m.column - 1 + m.length ? m.column - 1 : Math.max(0, m.preview.toLowerCase().indexOf(query.toLowerCase()));
    const start = Math.max(0, at - 40);
    return <>{start > 0 ? '…' : ''}{m.preview.slice(start, at).trimStart()}<mark>{m.preview.substr(at, m.length)}</mark>{m.preview.slice(at + m.length)}</>;
  };

  return (
    <section className="search-view" aria-label="Search">
      <div className="sidebar-heading">
        <span>SEARCH</span>
        <div className="se-tools">
          <button className="icon-button" aria-label="Refresh search" title="Refresh" onClick={search}><RefreshCw size={14} className={busy ? 'spin' : ''} /></button>
          {featureOn('search-collapse') && result && result.files.length > 0 && <button className="icon-button" aria-label={closed.size === result.files.length ? 'Expand All' : 'Collapse All'} title={closed.size === result.files.length ? 'Expand All' : 'Collapse All'} onClick={() => setClosed(closed.size === result.files.length ? new Set() : new Set(result.files.map((f) => f.file)))}>{closed.size === result.files.length ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}</button>}
          {featureOn('search-copy') && result && result.total > 0 && <button className="icon-button" aria-label="Copy All Results" title="Copy All (file:line: text)" onClick={() => void copyText(result.files.map((f) => [f.file, ...f.matches.map((m) => `  ${m.line}: ${m.preview.trim()}`)].join('\n')).join('\n\n')).then((ok) => onNotice(ok ? `Copied ${result.total} result${result.total === 1 ? '' : 's'}.` : 'Clipboard unavailable.'))}><ClipboardCopy size={14} /></button>}
          <button className="icon-button" aria-label="Clear search results" title="Clear" onClick={() => { setQuery(''); setReplace(''); setResult(undefined); }}><X size={14} /></button>
        </div>
      </div>
      <div className="search-form">
        <button className="search-expand" aria-label={showReplace ? 'Hide replace' : 'Toggle replace'} aria-expanded={showReplace} title="Toggle Replace (Ctrl+Shift+H)" onClick={() => setShowReplace(!showReplace)}>{showReplace ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
        <div className="search-fields">
          <div className="search-input">
            <input ref={input} aria-label="Search in files" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') search(); else if (e.key === 'ArrowDown' && featureOn('search-keys') && result?.total && back.current < 0) { e.preventDefault(); document.querySelector<HTMLElement>('.search-view .search-match')?.focus(); } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && recall(e.key === 'ArrowUp' ? 1 : -1)) e.preventDefault(); }} title={featureOn('search-history') ? 'Search (↑ / ↓: history)' : undefined} spellCheck={false} />
            {toggle(matchCase, setMatchCase, 'Match Case', CaseSensitive, 'Alt+C')}
            {toggle(wholeWord, setWholeWord, 'Match Whole Word', WholeWord, 'Alt+W')}
            {toggle(regex, setRegex, 'Use Regular Expression', Regex, 'Alt+R')}
          </div>
          {showReplace && (
            <div className="search-input">
              <input aria-label="Replace with" placeholder="Replace" value={replace} onChange={(e) => setReplace(e.target.value)} spellCheck={false} />
              <button className="search-toggle" aria-label="Replace All" title="Replace All (Ctrl+Alt+Enter)" disabled={!result?.total} onClick={() => void replaceAll()}><Replace size={14} /></button>
            </div>
          )}
          <button className="search-more" aria-label="Toggle search details" aria-expanded={showFilters} title="Files to include / exclude" onClick={() => setShowFilters(!showFilters)}><MoreHorizontal size={14} /></button>
          {showFilters && (
            <>
              <label className="search-glob">files to include<span className="search-glob-row"><input aria-label="Files to include" placeholder="e.g. *.cs, Steps/**" value={include} disabled={openOnly && featureOn('search-open-only')} onChange={(e) => setInclude(e.target.value)} />{featureOn('search-open-only') && <button className={`search-toggle ${openOnly ? 'on' : ''}`} aria-label="Search only in open editors" aria-pressed={openOnly} title="Search Only in Open Editors" onClick={() => setOpenOnly(!openOnly)}><BookOpen size={14} /></button>}</span></label>
              <label className="search-glob">files to exclude<input aria-label="Files to exclude" placeholder="e.g. *.feature.cs" value={exclude} onChange={(e) => setExclude(e.target.value)} /></label>
            </>
          )}
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {result && (
        <p className="search-summary" role="status">
          {result.total ? `${result.total} result${result.total === 1 ? '' : 's'} in ${result.files.length} file${result.files.length === 1 ? '' : 's'}${result.truncated ? ' (first results only — refine the search)' : ''}` : 'No results found.'}
        </p>
      )}
      <nav className="search-results" aria-label="Search results" onKeyDown={(e) => { if (!featureOn('search-keys') || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return; const all = [...e.currentTarget.querySelectorAll<HTMLElement>('.search-match')]; const i = all.indexOf(document.activeElement as HTMLElement); if (i < 0) return; e.preventDefault(); if (e.key === 'ArrowUp' && i === 0) input.current?.focus(); else all[Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus(); }}>
        <ul>
          {result?.files.map((f) => {
            const open = !closed.has(f.file);
            const { icon: Icon, color } = fileType(f.file);
            return (
              <li key={f.file}>
                <div className="search-file">
                  <button className="se-twisty" aria-label={`${open ? 'Collapse' : 'Expand'} ${f.file}`} aria-expanded={open} onClick={() => setClosed((p) => { const n = new Set(p); if (n.has(f.file)) n.delete(f.file); else n.add(f.file); return n; })}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
                  <Icon size={14} style={{ color }} aria-hidden="true" />
                  <span className="search-file-name">{f.file.split('/').pop()}</span>
                  <small>{f.file.includes('/') ? f.file.slice(0, f.file.lastIndexOf('/')) : ''}</small>
                  <span className="search-count">{f.matches.length}</span>
                  {showReplace && <button className="search-toggle" aria-label={`Replace all in ${f.file}`} title="Replace All in this file" onClick={() => void replaceAll([f.file])}><Replace size={13} /></button>}
                </div>
                {open && (
                  <ul>
                    {f.matches.map((m, i) => (
                      <li key={i}><button className="search-match" onClick={() => onOpen(f.file, m.line, m.column)} title={`${f.file}:${m.line}:${m.column}`}>{highlight(m)}</button></li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </section>
  );
}
