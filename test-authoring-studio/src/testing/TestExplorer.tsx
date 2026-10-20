import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Play, PlayCircle, Bug, RefreshCw, Square, CircleCheck, CircleX, CircleSlash, Circle, Loader, Search, X, FileText, FlaskConical, Boxes, RotateCcw, Navigation, ListPlus, ListMinus, Trash2, ShieldCheck, Copy, ChevronsDownUp, ChevronsUpDown, Hash } from 'lucide-react';
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [configuration] = useLocalState('buildConfiguration', 'Debug');
  // Playlists (Visual Studio): named sets of tests to show and run together.
  const [playlists, setPlaylists] = useLocalState<Record<string, string[]>>('testPlaylists', {});
  const [playlist, setPlaylist] = useLocalState('testPlaylist', '');
  const [groupByPref, setGroupBy] = useLocalState<GroupBy>('testGroupBy', 'project');
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

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inList = playlist && playlists[playlist] ? new Set(playlists[playlist]) : null;
    const pool = inList ? tests.filter((t) => inList.has(t.id)) : tests;
    if (!q) return pool;
    return featureOn('test-search-filters') ? pool.filter((t) => matchTest(t, q, outcomeOf(t, run))) : pool.filter((t) => `${t.project} ${t.className} ${t.name} ${t.feature ?? ''}`.toLowerCase().includes(q));
  }, [tests, query, playlist, playlists, run]);
  // Scenario tags (Gherkin) as test traits: Group by Tag and the tag: search filter.
  const [tagRows, setTagRows] = useState<{ tag: string; scenarios: { file: string; line: number; scenario: string }[] }[]>([]);
  useEffect(() => { api<typeof tagRows>('/tags').then(setTagRows, () => setTagRows([])); }, [revision]);
  const tagsOf = useMemo(() => { const m = new Map<string, string[]>(); for (const r of tagRows) for (const s of r.scenarios) for (const k of [`${s.file}:${s.line}`, `${s.file}#${s.scenario}`]) m.set(k, [...(m.get(k) ?? []), r.tag]); return (t: DiscoveredTest) => (t.kind === 'scenario' ? [...new Set([...(m.get(`${t.file}:${t.line}`) ?? []), ...(m.get(`${t.file}#${t.name}`) ?? [])])] : []); }, [tagRows]);
  const groups = useMemo(() => groupTests(visible, groupBy, (t) => outcomeOf(t, run), (t) => { const rs = resultsOf(t, run.results); return rs.length ? rs.reduce((n, r) => n + r.durationMs, 0) : undefined; }, tagsOf), [visible, groupBy, run, tagsOf]);

  const outcome = (t: DiscoveredTest) => outcomeOf(t, run);
  const counts = useMemo(() => {
    const os = tests.map(outcome);
    return { passed: os.filter((o) => o === 'passed').length, failed: os.filter((o) => o === 'failed').length, skipped: os.filter((o) => o === 'skipped').length, none: os.filter((o) => o === 'none').length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, run]);
  const running = run.status === 'running';
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
    ...(featureOn('test-copy') ? [{ label: 'Copy', icon: Copy, onSelect: () => void copyText(ts.map((t) => testDetails(t, outcomeOf(t, run), resultsOf(t, run.results))).join('\n\n')).then((ok) => onNotice(ok ? `Copied ${ts.length === 1 ? ts[0].name : `${ts.length} tests`}.` : 'Clipboard unavailable.')) }] : []),
    'separator' as const,
    { label: 'Add to New Playlist…', icon: ListPlus, onSelect: () => setNaming(ts.map((t) => t.id)) },
    ...Object.keys(playlists).filter((n) => n !== playlist).map((n) => ({ label: `Add to Playlist ${n}`, icon: ListPlus, onSelect: () => addTo(n, ts.map((t) => t.id)) })),
    ...(playlist && playlists[playlist] ? [{ label: `Remove from Playlist ${playlist}`, icon: ListMinus, onSelect: () => removeFrom(playlist, ts.map((t) => t.id)) }] : []),
  ];
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
        <input aria-label="Search Test Explorer" placeholder={featureOn('test-search-filters') ? 'Search (outcome:failed class:… -name:…)' : 'Search Test Explorer'} value={query} onChange={(e) => setQuery(e.target.value)} />
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
        <small>{tests.length} test{tests.length === 1 ? '' : 's'}{run.summary && run.status !== 'running' ? ` · last run ${ms(run.summary.durationMs)}` : ''}</small>
      </div>
      {run.coverage && (
        <div className="t-coverage" role="note" aria-label="Code coverage">
          <ShieldCheck size={12} /> Line coverage {(run.coverage.lineRate * 100).toFixed(1)}% · {Object.keys(run.coverage.files).length} files
        </div>
      )}
      {warning && <p className="field-error" role="alert">{warning}</p>}
      {run.error && <p className="field-error" role="alert">{run.error}</p>}
      <nav className="t-tree" aria-label="Tests">
        <ul>{groups.map((g) => groupRow(g, 0))}</ul>
        {!loading && !tests.length && <p className="explorer-empty">No tests found. Add NUnit, xUnit or MSTest tests, or feature files.</p>}
      </nav>
      {detail && (
        <section className="t-detail" aria-label="Test details">
          <div className="t-detail-head">{icon(outcome(detail))}<strong>{detail.name}</strong>
            <button className="icon-button" aria-label="Go to test" title="Go To Test" onClick={() => onOpen(detail.file, detail.line)}><Navigation size={13} /></button>
          </div>
          <p className="meta">{detail.className}.{detail.method}</p>
          {!detailResults.length && <p className="meta">Not run yet.</p>}
          {detailResults.map((r, i) => (
            <div key={i} className="t-result">
              <p>{icon(r.outcome)} {r.name} · {ms(r.durationMs)}</p>
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
