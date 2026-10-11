import { useMemo, useState } from 'react';
import { Activity, Trash2 } from 'lucide-react';
import { Button } from '../radix';
import { useAlgorithms, useConfirm } from '../radix2';
import { betaPosterior, entropy, ewma, flakyScore, flipRate, histories, parseCucumberJson, parseJUnit, wilson, type Run } from '../algorithms/results';
import { coFailures, cusum, madOutliers, mannKendall, mtbf, percentiles, sprt } from '../algorithms/stats';
import { AlgoGate, DropZone, Empty, ResultActions, pct, type ToolProps } from './shared';

const KEY = 'tas:design:runs';
export function loadRuns(): Run[] { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; } }
function saveRuns(r: Run[]) { try { localStorage.setItem(KEY, JSON.stringify(r.slice(-50))); } catch { /* storage full or blocked */ } }
const sampleRuns = (): Run[] => {
  const names = ['Sign in with valid credentials', 'Search returns results', 'Checkout with card', 'Apply coupon', 'Guest checkout'];
  const pattern = ['PPPPPPPP', 'PPFPPFPF', 'PPPPPPPF', 'FFFFFFFF', 'PFPFPPFP'];
  return Array.from({ length: 8 }, (_, i) => ({ id: `sample-${i}`, at: Date.now() - (8 - i) * 864e5, source: 'sample', results: names.map((n, k) => ({ name: n, feature: 'Sample', outcome: pattern[k][i] === 'P' ? 'passed' : 'failed', duration: +(1.2 + k * 0.8 + (k === 2 ? i * 0.6 : (i % 3) * 0.1) + (k === 4 ? 9 : 0)).toFixed(2) })) }));
};

/** F10: import results over time and rank flaky scenarios. */
export default function ResultsTool({ onNotice }: ToolProps) {
  const { on } = useAlgorithms();
  const confirm = useConfirm();
  const [runs, setRuns] = useState<Run[]>(loadRuns);
  const [error, setError] = useState('');
  const update = (r: Run[]) => { setRuns(r); saveRuns(r); };
  const add = (text: string, name: string) => {
    setError('');
    try {
      const t = text.trim();
      const results = t.startsWith('[') ? (on('cucumber-json') ? parseCucumberJson(t) : null) : t.startsWith('<') ? (on('junit-parse') ? parseJUnit(t) : null) : undefined;
      if (results === undefined) throw new Error('Unrecognised format. Use JUnit XML or Cucumber JSON.');
      if (results === null) throw new Error('That parser is turned off in Settings → Algorithms.');
      update([...runs, { id: crypto.randomUUID?.() ?? String(Date.now()), at: Date.now(), source: name, results }]);
      onNotice(`${results.length} results imported from ${name}.`);
    } catch (e) { setError((e as Error).message); }
  };
  const rows = useMemo(() => [...histories(runs)].map(([key, h]) => {
    const [feature, name] = key.split('::');
    const passes = h.filter((o) => o === 'passed').length, n = h.filter((o) => o !== 'skipped').length;
    return { key, feature, name, h, flip: flipRate(h), ent: entropy(h), score: flakyScore(h), w: wilson(passes, n), trend: ewma(h), post: betaPosterior(h), passRate: n ? passes / n : 0 };
  }).sort((a, b) => b.score.score - a.score.score || b.flip - a.flip), [runs]);
  const csv = ['scenario,feature,runs,pass rate,flip rate,entropy,flaky score,label', ...rows.map((r) => [r.name, r.feature, r.h.length, r.passRate.toFixed(2), r.flip.toFixed(2), r.ent.toFixed(2), r.score.score.toFixed(2), r.score.label].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(','))].join('\n');
  return (
    <div className="design-tool">
      <section className="panel" aria-labelledby="res-import">
        <div className="design-head"><h2 id="res-import"><Activity size={16} aria-hidden="true" /> Test runs</h2><span className="badge">{runs.length} runs stored in this browser</span></div>
        <AlgoGate ids={['junit-parse']} compact>{null}</AlgoGate>
        <div className="button-row">
          <DropZone accept=".xml,.json,application/json,text/xml" label="Drop or choose a JUnit XML / Cucumber JSON report" onText={add} />
          <Button size="small" variant="ghost" onClick={() => { update([...runs, ...sampleRuns()]); onNotice('Sample history loaded.'); }}>Load sample history</Button>
          <Button size="small" variant="ghost" disabled={!runs.length} onClick={async () => { if (await confirm({ title: 'Remove all imported runs?', description: 'Results stored in this browser are deleted. Report files are not touched.', confirm: 'Remove runs', danger: true })) update([]); }}><Trash2 size={13} aria-hidden="true" />Clear runs</Button>
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <p className="subtle">The latest run also drives pass/fail badges in Living docs.</p>
      </section>
      <section className="panel" aria-labelledby="res-flaky">
        <div className="design-head"><h2 id="res-flaky">Flakiness ranking</h2><span className="badge amber">{rows.filter((r) => r.score.label === 'flaky').length} flaky</span></div>
        {!rows.length ? <Empty title="No history yet">Import two or more reports (or load the sample) to see flip rate, entropy and confidence intervals.</Empty> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Scenario</th><th>History</th>{on('flaky-score') && <th>Score</th>}{on('flip-rate') && <th>Flip rate</th>}{on('entropy') && <th>Entropy</th>}{on('wilson') && <th>Pass rate (95% CI)</th>}{on('ewma') && <th>Recent fail rate</th>}{on('beta-posterior') && <th>P(fail) 90% CI</th>}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{r.name}<div className="meta">{r.feature}</div></td>
                    <td><span className="history" aria-label={`${r.h.length} runs`}>{r.h.slice(-16).map((o, i) => <span key={i} className={`dot ${o}`} title={o} />)}</span></td>
                    {on('flaky-score') && <td><span className={`badge ${r.score.label === 'flaky' ? 'amber' : r.score.label === 'broken' ? 'red' : r.score.label === 'stable' ? 'green' : 'muted'}`}>{r.score.label}</span> {r.score.score.toFixed(2)}</td>}
                    {on('flip-rate') && <td>{pct(r.flip)}</td>}
                    {on('entropy') && <td>{r.ent.toFixed(2)}</td>}
                    {on('wilson') && <td>{pct(r.passRate)} <span className="meta">({pct(r.w.low)}–{pct(r.w.high)})</span></td>}
                    {on('ewma') && <td>{pct(r.trend)}</td>}
                    {on('beta-posterior') && <td>{pct(r.post.mean)} <span className="meta">({pct(r.post.low)}–{pct(r.post.high)})</span></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ResultActions text={rows.length ? csv : ''} file="flakiness.csv" type="text/csv" onNotice={onNotice} />
      </section>
      <RunStatistics runs={runs} onNotice={onNotice} />
    </div>
  );
}

/** M1–M7: change points, rerun decisions, duration trends and outliers, MTBF and co-failures. */
function RunStatistics({ runs, onNotice }: { runs: Run[]; onNotice: (m: string) => void }) {
  const { on } = useAlgorithms();
  const ordered = useMemo(() => runs.slice().sort((a, b) => a.at - b.at), [runs]);
  const rows = useMemo(() => {
    const byName = new Map<string, { outcomes: boolean[]; durations: number[] }>();
    ordered.forEach((r) => r.results.forEach((x) => { if (x.outcome === 'skipped') return; const k = x.name; const e = byName.get(k) ?? byName.set(k, { outcomes: [], durations: [] }).get(k)!; e.outcomes.push(x.outcome === 'failed'); if (x.duration !== undefined) e.durations.push(x.duration); }));
    return [...byName].map(([name, e]) => ({ name, ...e, cusum: cusum(e.outcomes.map(Number)), sprt: sprt(e.outcomes), mtbf: mtbf(e.outcomes), p: percentiles(e.durations), mk: e.durations.length >= 4 ? mannKendall(e.durations) : undefined, mean: e.durations.length ? e.durations.reduce((a, x) => a + x, 0) / e.durations.length : 0 }));
  }, [ordered]);
  const slow = on('mad-outliers') ? madOutliers(rows.filter((r) => r.durations.length), (r) => r.mean) : [];
  const pairs = on('co-failure') ? coFailures(ordered.map((r) => ({ failed: r.results.filter((x) => x.outcome === 'failed').map((x) => x.name) }))) : [];
  if (!rows.length) return null;
  const tsv = ['scenario\tchange at run\tsprt\tmtbf\tp50\tp90\ttrend', ...rows.map((r) => [r.name, r.cusum.changeAt + 1 || '', r.sprt.decision, r.mtbf === Infinity ? '' : r.mtbf.toFixed(1), r.p.p50.toFixed?.(2) ?? '', r.p.p90.toFixed?.(2) ?? '', r.mk?.trend ?? ''].join('\t'))].join('\n');
  return (
    <section className="panel" aria-labelledby="res-stats">
      <div className="design-head"><h2 id="res-stats">Run statistics</h2></div>
      <div className="table-scroll">
        <table className="data-table">
          <thead><tr><th>Scenario</th>{on('cusum') && <th>Started failing</th>}{on('sprt') && <th>Rerun verdict (SPRT)</th>}{on('mtbf') && <th>Runs between failures</th>}{on('percentiles') && <th>p50 / p90 / p95</th>}{on('mann-kendall') && <th>Duration trend</th>}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              {on('cusum') && <td>{r.cusum.changeAt >= 0 ? `run ${r.cusum.changeAt + 1}` : '–'}</td>}
              {on('sprt') && <td><span className={`badge ${r.sprt.decision === 'failing' ? 'red' : r.sprt.decision === 'flaky' ? 'amber' : r.sprt.decision === 'stable' ? 'green' : 'muted'}`}>{r.sprt.decision}</span>{r.sprt.decision === 'continue' && 'rerunsToStable' in r.sprt && <span className="meta"> ~{r.sprt.rerunsToStable} more passes</span>}</td>}
              {on('mtbf') && <td>{r.mtbf === Infinity ? 'never failed' : r.mtbf.toFixed(1)}</td>}
              {on('percentiles') && <td>{r.durations.length ? `${r.p.p50.toFixed(2)} / ${r.p.p90.toFixed(2)} / ${r.p.p95.toFixed(2)} s` : '–'}</td>}
              {on('mann-kendall') && <td>{r.mk ? <span className={`badge ${r.mk.trend === 'increasing' ? 'amber' : r.mk.trend === 'decreasing' ? 'green' : 'muted'}`}>{r.mk.trend}</span> : '–'}</td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      {slow.length > 0 && <p className="warn-text">Unusually slow: {slow.map((s) => `${s.item.name} (${s.item.mean.toFixed(1)}s)`).join(', ')}.</p>}
      {pairs.length > 0 && <div><span className="micro-label">FAIL TOGETHER (LIKELY ONE ROOT CAUSE)</span><ul className="finding-list">{pairs.slice(0, 12).map((p) => <li key={p.a + p.b}><span>{p.a} ⇄ {p.b}</span><span className="meta">{p.together} runs · Jaccard {p.jaccard.toFixed(2)}</span></li>)}</ul></div>}
      <ResultActions text={tsv} file="run-statistics.tsv" onNotice={onNotice} />
    </section>
  );
}