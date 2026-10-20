import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { FILE_SAVED_EVENT } from '../editor/events';
import { ChevronDown, ChevronRight, Play, PlayCircle, Bug, RefreshCw, Square, CircleCheck, CircleX, CircleSlash, Circle, Loader, Search, X, FileText, FlaskConical, Boxes, RotateCcw, Navigation, ListPlus, ListMinus, Trash2, ShieldCheck, Copy, ChevronsDownUp, ChevronsUpDown, Hash, ClipboardList, Download, Timer, Repeat } from 'lucide-react';
import { RowMenu, useLocalState, copyText } from '../ui';
import { api } from '../api';
import { Dropdown, type MenuEntry } from '../radix';
import { groupTests, type Group, type GroupBy, matchTest, testDetails } from './grouping';
import { featureOn } from '../features';
import { useTestRun, discoverTests, runTests, cancelTests, resultsOf, outcomeOf, combine, type DiscoveredTest, type Outcome } from './store';

const icon = (o: Outcome) =>
  o === 'passed' ? <CircleCheck size={14} className="t-pass" aria-label="Passed" /> :
  o === 'failed' ? <CircleX size={14} className="t-fail" aria-label="Failed" /> :
  o === 'skipped' ? <CircleSlash size={14} className="t-skip" aria-label="Skipped" /> :
  o === 'running' ? <Loader size={14} className="spin t-run" aria-label="Running" /> :
  <Circle size={14} className="t-none" aria-label="Not run" />;
const ms = (n: number) => (n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);


/**
 * Visual Studio's Test Explorer: tests by project → class / feature → test, with outcome icons and durations.
 * Run All, Run selected, Debug selected, Run Failed, filter, and a details pane (message, stack trace
 * with links into the editor). C# test methods come from Roslyn; feature scenarios from the index.
 */
export default function TestExplorer({ revision, onOpen, onDebug, onNotice }: { revision?: string; onOpen: (file: string, line: number) => void; onDebug: (t: DiscoveredTest) => void; onNotice: (m: string) => void }) {
  const run = useTestRun();
  const [tests, setTests] = useState<DiscoveredTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string>();
  const [selected, setSelected] = useState<string[]>([]);
  // Collapsed groups and the search come back after a reload (QOL-50).
  const [collapsedList, setCollapsedList] = useLocalState<string[]>('testCollapsed', []);
  const collapsed = useMemo(() => new Set(featureOn('test-remember') ? collapsedList : []), [collapsedList]); // eslint-disable-line react-hooks/exhaustive-deps
  const setCollapsed = (next: Set<string> | ((prev: Set<string>) => Set<string>)) => setCollapsedList((prev) => [...(typeof next === 'function' ? next(new Set(prev)) : next)]);
  const [query, setQuery] = useLocalState('testQuery', '');
  const [configuration] = useLocalState('buildConfiguration', 'Debug');
  // Playlists (Visual Studio): named sets of tests to show and run together.
  const [playlists, setPlaylists] = useLocalState<Record<string, string[]>>('testPlaylists', {});
  const [playlist, setPlaylist] = useLocalState('testPlaylist', '');
  const [groupByPref, setGroupBy] = useLocalState<GroupBy>('testGroupBy', 'project');
  const [failedOnly, setFailedOnly] = useState(false);
  const groupBy: GroupBy = featureOn('test-group-by') ? groupByPref : 'project';
  const [naming, setNaming] = useState<string[] | null>(null);
  const addTo = (name: string, ids: string[]) => setPlaylists({ ...playlists, [name]: [...new Set([...(playlists[name] ?? []), ...ids])] });
  const removeFrom = (name: string, ids: string[]) => setPlaylists({ ...playlists, [name]: (playlists[name] ?? []).filter((id) => !ids.includes(id)) });
  const deletePlaylist = (name: string) => { const next = { ...playlists }; delete next[name]; setPlaylists(next); setPlaylist(''); };

  const refresh = () => {
    setLoading(true);
    discoverTests().then((r) => { setTests(r.tests); setWarning(r.warning); }, (e) => setWarning((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(refresh, [revision]);
  // After a run the code-behind exists (the run built the project): rediscover so scenarios get their real names.
  const finished = run.status === 'done' || run.status === 'failed' ? run.version : 0;
  useEffect(() => { if (finished) refresh(); }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps
  // After a run with failures the first failed test is selected (its details show) and scrolled into view (QOL-50).
  useEffect(() => {
    if (!finished || !featureOn('reveal-failure')) return;
    const f = tests.find((t) => outcomeOf(t, run) === 'failed');
    if (!f) return;
    setSelected([f.id]);
    setCollapsed((prev) => { const n = new Set(prev); n.delete(`p:${f.project}`); n.delete(f.kind === 'scenario' ? `f:${f.file}` : `c:${f.className}`); return n; });
    requestAnimationFrame(() => document.querySelector('.t-tree .t-row.selected')?.scrollIntoView({ block: 'nearest' }));
  }, [finished]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scenario tags (Gherkin) as test traits: Group by Tag and the tag: search filter.
  const [tagRows, setTagRows] = useState<{ tag: string; scenarios: { file: string; line: number; scenario: string }[] }[]>([]);
  useEffect(() => { api<typeof tagRows>('/tags').then(setTagRows, () => setTagRows([])); }, [revision]);
  const tagsOf = useMemo(() => { const m = new Map<string, string[]>(); for (const r of tagRows) for (const s of r.scenarios) for (const k of [`${s.file}:${s.line}`, `${s.file}#${s.scenario}`]) m.set(k, [...(m.get(k) ?? []), r.tag]); return (t: DiscoveredTest) => (t.kind === 'scenario' ? [...new Set([...(m.get(`${t.file}:${t.line}`) ?? []), ...(m.get(`${t.file}#${t.name}`) ?? [])])] : []); }, [tagRows]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inList = playlist && playlists[playlist] ? new Set(playlists[playlist]) : null;
    // Failed tests only (Visual Studio's Test Explorer filter button).
    const all = inList ? tests.filter((t) => inList.has(t.id)) : tests;
    const pool = failedOnly && featureOn('test-failed-only') ? all.filter((t) => outcomeOf(t, run) === 'failed') : all;
    if (!q) return pool;
    return featureOn('test-search-filters') ? pool.filter((t) => matchTest(t, q, outcomeOf(t, run), featureOn('test-tag-filter') ? tagsOf(t) : [])) : pool.filter((t) => `${t.project} ${t.className} ${t.name} ${t.feature ?? ''}`.toLowerCase().includes(q));
  }, [tests, query, playlist, playlists, run, tagsOf, failedOnly]);
  const groups = useMemo(() => groupTests(visible, groupBy, (t) => outcomeOf(t, run), (t) => { const rs = resultsOf(t, run.results); return rs.length ? rs.reduce((n, r) => n + r.durationMs, 0) : undefined; }, tagsOf), [visible, groupBy, run, tagsOf]);

  const outcome = (t: DiscoveredTest) => outcomeOf(t, run);
  const counts = useMemo(() => {
    const os = tests.map(outcome);
    return { passed: os.filter((o) => o === 'passed').length, failed: os.filter((o) => o === 'failed').length, skipped: os.filter((o) => o === 'skipped').length, none: os.filter((o) => o === 'none').length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, run]);
  const running = run.status === 'running';
  // Elapsed time while tests run (QOL-50).
  const [startedAt, setStartedAt] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => { if (!running) return; setStartedAt(Date.now()); const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, [running]);
  const start = (which: DiscoveredTest[] | 'all') => runTests(which, configuration).catch((e) => onNotice((e as Error).message));
  const selectedTests = tests.filter((t) => selected.includes(t.id));
  const failed = tests.filter((t) => outcome(t) === 'failed');
  const select = (ids: string[], e?: React.MouseEvent) => setSelected((prev) => (e?.ctrlKey || e?.metaKey ? [...new Set([...prev, ...ids].filter((id) => !(prev.includes(id) && ids.includes(id) && ids.length === 1)))] : ids));
  const detail = selectedTests.length === 1 ? selectedTests[0] : undefined;
  const detailResults = detail ? resultsOf(detail, run.results) : [];

  const menu = (ts: DiscoveredTest[], go?: DiscoveredTest) => [
    { label: 'Run', icon: Play, disabled: running, onSelect: () => void start(ts) },
    { label: 'Debug', icon: Bug, disabled: running || ts.length !== 1, onSelect: () => onDebug(ts[0]) },
    ...(featureOn('coverage-selected') ? [{ label: 'Analyze Code Coverage', icon: ShieldCheck, disabled: running, onSelect: () => void runTests(ts, configuration, true).catch((e) => onNotice((e as Error).message)) }] : []),
    ...(go ? ['separator' as const, { label: 'Go To Test', icon: Navigation, onSelect: () => onOpen(go.file, go.line) }] : []),
    ...(featureOn('test-copy-filter') ? [{ label: 'Copy dotnet test Filter', icon: Copy, onSelect: () => { const f = `dotnet test --filter "${ts.map((t) => t.filter).join('|')}"`; void copyText(f).then((ok) => onNotice(ok ? `Copied: ${f.length > 120 ? `${f.slice(0, 117)}…` : f}` : 'Clipboard unavailable.')); } }] : []),
    ...(featureOn('test-copy-name') ? [{ label: 'Copy Test Name', icon: Copy, onSelect: () => { const n = ts.map((t) => `${t.className}.${t.method}`).join('\n'); void copyText(n).then((ok) => onNotice(ok ? `Copied ${ts.length === 1 ? n : `${ts.length} test names`}.` : 'Clipboard unavailable.')); } }] : []),
    ...(featureOn('test-copy') ? [{ label: 'Copy', icon: Copy, onSelect: () => void copyText(ts.map((t) => testDetails(t, outcomeOf(t, run), resultsOf(t, run.results))).join('\n\n')).then((ok) => onNotice(ok ? `Copied ${ts.length === 1 ? ts[0].name : `${ts.length} tests`}.` : 'Clipboard unavailable.')) }] : []),
    'separator' as const,
    { label: 'Add to New Playlist…', icon: ListPlus, onSelect: () => setNaming(ts.map((t) => t.id)) },
    ...Object.keys(playlists).filter((n) => n !== playlist).map((n) => ({ label: `Add to Playlist ${n}`, icon: ListPlus, onSelect: () => addTo(n, ts.map((t) => t.id)) })),
    ...(playlist && playlists[playlist] ? [{ label: `Remove from Playlist ${playlist}`, icon: ListMinus, onSelect: () => removeFrom(playlist, ts.map((t) => t.id)) }] : []),
  ];
  // Continuous testing (Rider): after each save the failed tests run again (when no run is going on).
  const [continuous, setContinuous] = useLocalState('continuousTesting', false);
  const live = useRef({ failed, running, start });
  live.current = { failed, running, start };
  useEffect(() => {
    if (!continuous || !featureOn('continuous-testing')) return;
    let t = 0;
    const h = () => { clearTimeout(t); t = window.setTimeout(() => { const l = live.current; if (!l.running && l.failed.length) { onNotice(`Continuous testing: running ${l.failed.length} failed test${l.failed.length === 1 ? '' : 's'} again…`); void l.start(l.failed); } }, 800); };
    window.addEventListener(FILE_SAVED_EVENT, h);
    return () => { clearTimeout(t); window.removeEventListener(FILE_SAVED_EVENT, h); };
  }, [continuous]); // eslint-disable-line react-hooks/exhaustive-deps
  // Collapse All / Expand All (Visual Studio's Test Explorer toolbar).
  const groupKeys = (gs: Group[]): string[] => gs.flatMap((g) => [g.key, ...groupKeys(g.children)]);
  const allCollapsed = groups.length > 0 && groupKeys(groups).every((k) => collapsed.has(k));
  // Run ▸ Not Run / Passed tests (Visual Studio's Run menu of the Test Explorer).
  const moreRuns: MenuEntry[] = [
    featureOn('run-not-run') && { label: 'Run Not Run Tests', onSelect: () => { const ts = tests.filter((t) => outcome(t) === 'none'); if (ts.length) void start(ts); else onNotice('Every test has run.'); } },
    featureOn('run-passed') && { label: 'Run Passed Tests', onSelect: () => { const ts = tests.filter((t) => outcome(t) === 'passed'); if (ts.length) void start(ts); else onNotice('No passed tests yet.'); } },
    // more run options
  ].filter(Boolean) as MenuEntry[];
  const toggle = (k: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const groupRow = (g: Group, depth: number): ReactNode => {
    const open = !!query || !collapsed.has(g.key);
    const ids = g.tests.map((t) => t.id);
    const isSel = ids.length > 0 && ids.every((id) => selected.includes(id));
    const GroupIcon = g.kind === 'project' ? Boxes : g.kind === 'feature' ? FileText : g.kind === 'tag' ? Hash : FlaskConical;
    const durations = g.tests.flatMap((t) => resultsOf(t, run.results)).reduce((n, r) => n + r.durationMs, 0);
    return (
      <li key={g.key}>
        <RowMenu items={menu(g.tests)}>
          <div className={`t-row ${isSel ? 'selected' : ''}`} data-menu-row style={{ paddingLeft: depth * 12 }}>
            <button className="se-twisty" aria-label={`${open ? 'Collapse' : 'Expand'} ${g.label}`} aria-expanded={open} onClick={() => toggle(g.key)}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button>
            <button className="t-label" onClick={(e) => select(ids, e)} onDoubleClick={() => toggle(g.key)} aria-pressed={isSel}>
              {icon(combine(g.tests.map(outcome)))}<GroupIcon size={13} className="t-kind" aria-hidden="true" /><span>{g.label}</span><small>({g.tests.length})</small>
              {durations > 0 && <small className="t-time">{ms(durations)}</small>}
            </button>
          </div>
        </RowMenu>
        {open && (
          <ul>
            {g.children.map((c) => groupRow(c, depth + 1))}
            {g.kind !== 'project' && g.tests.map((t) => {
              const o = outcome(t);
              const rs = resultsOf(t, run.results);
              const isSel = selected.includes(t.id);
              return (
                <li key={t.id}>
                  <RowMenu items={menu([t], t)}>
                    <div className={`t-row ${isSel ? 'selected' : ''}`} data-menu-row style={{ paddingLeft: (depth + 1) * 12 + 24 }}>
                      <button className="t-label" onClick={(e) => select([t.id], e)} onDoubleClick={() => onOpen(t.file, t.line)} aria-pressed={isSel} title={`${t.className}.${t.method}`}>
                        {icon(o)}<span>{t.name}</span>{t.cases ? <small>({t.cases} cases)</small> : null}
                        {rs.length > 0 && <small className="t-time">{ms(rs.reduce((n, r) => n + r.durationMs, 0))}</small>}
                      </button>
                    </div>
                  </RowMenu>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section className="test-explorer" aria-label="Test Explorer">
      <div className="sidebar-heading">
        <span>TEST EXPLORER</span>
        <div className="se-tools">
          <button className="icon-button" aria-label="Run All Tests" title="Run All Tests" disabled={running || !tests.length} onClick={() => void start(playlist && playlists[playlist] ? visible : 'all')}><PlayCircle size={14} /></button>
          <button className="icon-button" aria-label="Run selected tests" title="Run" disabled={running || !selectedTests.length} onClick={() => void start(selectedTests)}><Play size={14} /></button>
          <button className="icon-button" aria-label="Debug selected test" title="Debug" disabled={running || selectedTests.length !== 1} onClick={() => selectedTests[0] && onDebug(selectedTests[0])}><Bug size={14} /></button>
          <button className="icon-button" aria-label="Analyze Code Coverage for All Tests" title="Analyze Code Coverage for All Tests" disabled={running || !tests.length} onClick={() => void runTests('all', configuration, true).catch((e) => onNotice((e as Error).message))}><ShieldCheck size={14} /></button>
          <button className="icon-button" aria-label="Run Failed Tests" title="Run Failed Tests" disabled={running || !failed.length} onClick={() => void start(failed)}><RotateCcw size={14} /></button>
          {moreRuns.length > 0 && <Dropdown label="More run options" align="end" trigger={<button className="icon-button" aria-label="More run options" title="More run options" disabled={running}><ChevronDown size={14} /></button>} entries={moreRuns} />}
          {featureOn('slowest-tests') && <button className="icon-button" aria-label="Slowest tests" title="Slowest tests" disabled={!run.results.length} onClick={() => { const top = tests.map((t) => ({ t, ms: resultsOf(t, run.results).reduce((n, r) => n + r.durationMs, 0) })).filter((x) => x.ms > 0).sort((a, b) => b.ms - a.ms).slice(0, 5); onNotice(top.length ? `Slowest: ${top.map((x) => `${x.t.method} ${ms(x.ms)}`).join(', ')}.` : 'Run the tests first.'); }}><Timer size={14} /></button>}
          {featureOn('continuous-testing') && <button className={`icon-button ${continuous ? 'pressed' : ''}`} aria-label="Continuous testing" aria-pressed={continuous} title="Continuous testing: run failed tests again after each save" onClick={() => setContinuous(!continuous)}><Repeat size={14} /></button>}
          {featureOn('test-export') && <button className="icon-button" aria-label="Export results as CSV" title="Export results (CSV)" disabled={!tests.length} onClick={() => { const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v); const rows = [['Test', 'Project', 'Outcome', 'Duration (ms)', 'Message'], ...tests.map((t) => { const rs = resultsOf(t, run.results); return [`${t.className}.${t.method}`, t.project, outcome(t) ?? 'not run', rs.length ? String(rs.reduce((n, r) => n + r.durationMs, 0)) : '', rs.find((r) => r.message)?.message ?? '']; })]; const url = URL.createObjectURL(new Blob([rows.map((r) => r.map(q).join(',')).join('\r\n')], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = 'test-results.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}><Download size={14} /></button>}
          {featureOn('test-summary') && <button className="icon-button" aria-label="Copy results summary" title="Copy results summary" disabled={!tests.length} onClick={() => { const failedNames = tests.filter((t) => outcome(t) === 'failed').map((t) => `- ${t.className}.${t.method}`); const text = [`Passed ${counts.passed}, failed ${counts.failed}, skipped ${counts.skipped}, not run ${counts.none} (${tests.length} tests)`, ...(failedNames.length ? ['', 'Failed:', ...failedNames] : [])].join('\n'); void copyText(text).then((ok) => onNotice(ok ? 'Copied the test results summary.' : 'Clipboard unavailable.')); }}><ClipboardList size={14} /></button>}
          {featureOn('test-failed-only') && <button className={`icon-button ${failedOnly ? 'pressed' : ''}`} aria-label="Show only failed tests" aria-pressed={failedOnly} title="Failed tests only" onClick={() => setFailedOnly(!failedOnly)}><CircleX size={14} /></button>}
          {featureOn('test-collapse-all') && <button className="icon-button" aria-label={allCollapsed ? 'Expand All' : 'Collapse All'} title={allCollapsed ? 'Expand All' : 'Collapse All'} disabled={!groups.length} onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groupKeys(groups)))}>{allCollapsed ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}</button>}
          {running ? <button className="icon-button" aria-label="Cancel test run" title="Cancel" onClick={() => void cancelTests()}><Square size={13} /></button>
            : <button className="icon-button" aria-label="Refresh tests" title="Refresh (rediscover)" onClick={refresh}><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>}
        </div>
      </div>
      {(Object.keys(playlists).length > 0 || naming) && (
        <div className="t-playlist">
          {naming ? (
            <form onSubmit={(e) => { e.preventDefault(); const name = new FormData(e.currentTarget).get('name')?.toString().trim(); if (name) { addTo(name, naming); setPlaylist(name); } setNaming(null); }}>
              <input name="name" autoFocus aria-label="Playlist name" placeholder="Playlist name" onKeyDown={(e) => { if (e.key === 'Escape') setNaming(null); }} />
            </form>
          ) : (
            <>
              <select aria-label="Playlist" value={playlist && playlists[playlist] ? playlist : ''} onChange={(e) => setPlaylist(e.target.value)}>
                <option value="">All tests</option>
                {Object.keys(playlists).map((n) => <option key={n} value={n}>{n} ({playlists[n].length})</option>)}
              </select>
              {playlist && playlists[playlist] && <button className="icon-button" aria-label={`Delete playlist ${playlist}`} title="Delete playlist" onClick={() => deletePlaylist(playlist)}><Trash2 size={13} /></button>}
            </>
          )}
        </div>
      )}
      <label className="search-box">
        <Search size={14} />
        <input aria-label="Search Test Explorer" placeholder={featureOn('test-search-filters') ? featureOn('test-tag-filter') ? 'Search (outcome:failed tag:@smoke -name:…)' : 'Search (outcome:failed class:… -name:…)' : 'Search Test Explorer'} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && query && featureOn('search-escape')) { e.stopPropagation(); setQuery(''); } }} />
        {query && <button className="icon-button" aria-label="Clear test search" onClick={() => setQuery('')}><X size={13} /></button>}
      </label>
      {featureOn('test-group-by') && (
        <label className="t-group-by">Group by
          <select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="project">Project, Class</option>
            <option value="class">Class / Feature</option>
            <option value="outcome">Outcome</option>
            <option value="duration">Duration</option>
            {featureOn('test-group-tag') && <option value="tag">Tag (traits)</option>}
          </select>
        </label>
      )}
      <div className="t-summary" role="status">
        <span title="Passed"><CircleCheck size={12} className="t-pass" />{counts.passed}</span>
        <span title="Failed"><CircleX size={12} className="t-fail" />{counts.failed}</span>
        <span title="Skipped"><CircleSlash size={12} className="t-skip" />{counts.skipped}</span>
        <span title="Not run"><Circle size={12} className="t-none" />{counts.none}</span>
        <small>{tests.length} test{tests.length === 1 ? '' : 's'}{run.summary && run.status !== 'running' ? ` · last run ${ms(run.summary.durationMs)}` : ''}{running && featureOn('test-elapsed') && startedAt ? ` · running ${Math.round((Date.now() - startedAt) / 1000)} s` : ''}</small>
      </div>
      {run.coverage && (
        <div className="t-coverage" role="note" aria-label="Code coverage">
          <ShieldCheck size={12} /> Line coverage {(run.coverage.lineRate * 100).toFixed(1)}% · {Object.keys(run.coverage.files).length} files
        </div>
      )}
      {warning && <p className="field-error" role="alert">{warning}</p>}
      {run.error && <p className="field-error" role="alert">{run.error}</p>}
      <nav className="t-tree" aria-label="Tests" onKeyDown={(e) => {
        // ↑ / ↓ between rows, ← / → collapse and expand a group (QOL-50).
        const t = e.target as HTMLElement;
        if (!featureOn('test-tree-keys') || !t.matches('.t-label')) return;
        const rows = [...e.currentTarget.querySelectorAll<HTMLElement>('.t-label')];
        const i = rows.indexOf(t);
        const twisty = t.parentElement?.querySelector<HTMLButtonElement>('.se-twisty');
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); rows[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus(); }
        else if (e.key === 'ArrowRight' && twisty?.getAttribute('aria-expanded') === 'false') { e.preventDefault(); twisty.click(); }
        else if (e.key === 'ArrowLeft' && twisty?.getAttribute('aria-expanded') === 'true') { e.preventDefault(); twisty.click(); }
      }}>
        <ul>{groups.map((g) => groupRow(g, 0))}</ul>
        {!loading && !tests.length && (featureOn('test-empty-help') ? (
          <div className="explorer-empty t-empty" role="note">
            <p>No tests found.</p>
            <ul>
              <li>Tests are NUnit, xUnit or MSTest methods, and feature files' scenarios.</li>
              <li>Scenarios get their test names when the project builds: build it (Ctrl+Shift+B), then refresh.</li>
              {warning && <li>Discovery said: {warning}</li>}
            </ul>
            <button className="button" onClick={refresh}><RefreshCw size={13} /> Refresh</button>
          </div>
        ) : <p className="explorer-empty">No tests found. Add NUnit, xUnit or MSTest tests, or feature files.</p>)}
      </nav>
      {detail && (
        <section className="t-detail" aria-label="Test details">
          <div className="t-detail-head">{icon(outcome(detail))}<strong>{detail.name}</strong>
            <button className="icon-button" aria-label="Go to test" title="Go To Test" onClick={() => onOpen(detail.file, detail.line)}><Navigation size={13} /></button>
            {featureOn('test-detail-run') && <button className="icon-button" aria-label="Run this test" title="Run" disabled={running} onClick={() => void start([detail])}><Play size={13} /></button>}
            {featureOn('test-detail-run') && <button className="icon-button" aria-label="Debug this test" title="Debug" disabled={running} onClick={() => onDebug(detail)}><Bug size={13} /></button>}
          </div>
          <p className="meta">{detail.className}.{detail.method}</p>
          {!detailResults.length && <p className="meta">Not run yet.</p>}
          {detailResults.map((r, i) => (
            <div key={i} className="t-result">
              <p>{icon(r.outcome)} {r.name} · {ms(r.durationMs)}</p>
              {featureOn('test-detail-copy') && (r.message || r.stackTrace) && (
                <div className="t-copy">
                  {r.message && <button className="link-button" onClick={() => void copyText(r.message!).then((ok) => onNotice(ok ? 'Copied the message.' : 'Clipboard unavailable.'))}>Copy message</button>}
                  {r.stackTrace && <button className="link-button" onClick={() => void copyText(r.stackTrace!).then((ok) => onNotice(ok ? 'Copied the stack trace.' : 'Clipboard unavailable.'))}>Copy stack trace</button>}
                </div>
              )}
              {r.message && <pre className="t-message">{r.message}</pre>}
              {r.stackTrace && <pre className="t-stack">{r.stackTrace.split('\n').map((line, j) => {
                const m = /in (.+?):line (\d+)/.exec(line);
                const file = m && tests.find((t) => m[1].replaceAll('\\', '/').endsWith(t.file))?.file;
                return <span key={j}>{file ? <button className="t-link" onClick={() => onOpen(file, Number(m![2]))}>{line.trim()}</button> : line}{'\n'}</span>;
              })}</pre>}
              {r.traces?.map((t) => <a key={t} className="t-link t-trace" href={`/api/traces/${encodeURIComponent(t)}`} download title="Playwright trace: open it with npx playwright show-trace, or drop it on trace.playwright.dev">Playwright trace: {t}</a>)}
              {r.output && <details className="t-output"><summary>Standard output</summary><pre aria-label="Test output">{r.output}</pre></details>}
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
