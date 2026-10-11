import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Play, PlayCircle, Bug, RefreshCw, Square, CircleCheck, CircleX, CircleSlash, Circle, Loader, Search, X, FileText, FlaskConical, Boxes, RotateCcw, Navigation } from 'lucide-react';
import { RowMenu, useLocalState } from '../ui';
import { useTestRun, discoverTests, runTests, cancelTests, resultsOf, outcomeOf, combine, type DiscoveredTest, type Outcome } from './store';

const icon = (o: Outcome) =>
  o === 'passed' ? <CircleCheck size={14} className="t-pass" aria-label="Passed" /> :
  o === 'failed' ? <CircleX size={14} className="t-fail" aria-label="Failed" /> :
  o === 'skipped' ? <CircleSlash size={14} className="t-skip" aria-label="Skipped" /> :
  o === 'running' ? <Loader size={14} className="spin t-run" aria-label="Running" /> :
  <Circle size={14} className="t-none" aria-label="Not run" />;
const ms = (n: number) => (n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(1)} s`);

type Group = { key: string; label: string; kind: 'project' | 'class' | 'feature'; tests: DiscoveredTest[]; children: Group[] };

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
    return q ? tests.filter((t) => `${t.project} ${t.className} ${t.name} ${t.feature ?? ''}`.toLowerCase().includes(q)) : tests;
  }, [tests, query]);
  const groups = useMemo(() => {
    const projects = new Map<string, Group>();
    for (const t of visible) {
      const p = projects.get(t.project) ?? { key: `p:${t.project}`, label: t.project, kind: 'project' as const, tests: [], children: [] };
      projects.set(t.project, p);
      const key = t.kind === 'scenario' ? `f:${t.file}` : `c:${t.className}`;
      let g = p.children.find((c) => c.key === key);
      if (!g) { g = { key, label: t.kind === 'scenario' ? (t.feature ?? t.file) : t.className, kind: t.kind === 'scenario' ? 'feature' : 'class', tests: [], children: [] }; p.children.push(g); }
      g.tests.push(t);
      p.tests.push(t);
    }
    return [...projects.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [visible]);

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
    ...(go ? ['separator' as const, { label: 'Go To Test', icon: Navigation, onSelect: () => onOpen(go.file, go.line) }] : []),
  ];
  const toggle = (k: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const groupRow = (g: Group, depth: number): ReactNode => {
    const open = !!query || !collapsed.has(g.key);
    const ids = g.tests.map((t) => t.id);
    const isSel = ids.length > 0 && ids.every((id) => selected.includes(id));
    const GroupIcon = g.kind === 'project' ? Boxes : g.kind === 'feature' ? FileText : FlaskConical;
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
          <button className="icon-button" aria-label="Run All Tests" title="Run All Tests" disabled={running || !tests.length} onClick={() => void start('all')}><PlayCircle size={14} /></button>
          <button className="icon-button" aria-label="Run selected tests" title="Run" disabled={running || !selectedTests.length} onClick={() => void start(selectedTests)}><Play size={14} /></button>
          <button className="icon-button" aria-label="Debug selected test" title="Debug" disabled={running || selectedTests.length !== 1} onClick={() => selectedTests[0] && onDebug(selectedTests[0])}><Bug size={14} /></button>
          <button className="icon-button" aria-label="Run Failed Tests" title="Run Failed Tests" disabled={running || !failed.length} onClick={() => void start(failed)}><RotateCcw size={14} /></button>
          {running ? <button className="icon-button" aria-label="Cancel test run" title="Cancel" onClick={() => void cancelTests()}><Square size={13} /></button>
            : <button className="icon-button" aria-label="Refresh tests" title="Refresh (rediscover)" onClick={refresh}><RefreshCw size={14} className={loading ? 'spin' : ''} /></button>}
        </div>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input aria-label="Search Test Explorer" placeholder="Search Test Explorer" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && <button className="icon-button" aria-label="Clear test search" onClick={() => setQuery('')}><X size={13} /></button>}
      </label>
      <div className="t-summary" role="status">
        <span title="Passed"><CircleCheck size={12} className="t-pass" />{counts.passed}</span>
        <span title="Failed"><CircleX size={12} className="t-fail" />{counts.failed}</span>
        <span title="Skipped"><CircleSlash size={12} className="t-skip" />{counts.skipped}</span>
        <span title="Not run"><Circle size={12} className="t-none" />{counts.none}</span>
        <small>{tests.length} test{tests.length === 1 ? '' : 's'}{run.summary && run.status !== 'running' ? ` · last run ${ms(run.summary.durationMs)}` : ''}</small>
      </div>
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
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
