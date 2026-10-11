import { useMemo, useState } from 'react';
import { GitPullRequest, Network, Flame, ShieldAlert, Timer, TrendingUp, Brain, Shapes } from 'lucide-react';
import { Button } from '../radix';
import { useAlgorithms } from '../radix2';
import { useLocalState } from '../ui';
import { api } from '../api';
import { kMeans, knapsack, logisticRegression, naiveBayes, paretoFront, quarantinePolicy, riskScore, silhouette, testImpact, traceability } from '../algorithms/analytics';
import { additionalGreedy } from '../algorithms/optimize';
import { histories, type Outcome } from '../algorithms/results';
import { tfidfVectors, tokens } from '../algorithms/strings';
import { rake } from '../algorithms/text';
import { loadRuns } from './ResultsTool';
import { AlgoGate, AlgoPicker, Empty, ResultActions, pct, usePicked, type Corpus, type ToolProps } from './shared';

type Sc = { id: string; name: string; file: string; line: number; tags: string[]; steps: { text: string }[] };
const scenarios = (c?: Corpus): Sc[] => (c?.features ?? []).flatMap((f) => f.scenarios.map((s) => ({ id: `${f.file}:${s.line}`, name: s.name, file: f.file, line: s.line, tags: [...new Set([...f.tags, ...(s.tags ?? [])])], steps: s.steps.map((st) => ({ text: st.text })) })));
/** Outcome history per scenario name (results are matched to scenarios by name). */
function historyByName() {
  const m = new Map<string, Outcome[]>();
  histories(loadRuns()).forEach((h, key) => m.set(key.split('::')[1].trim().toLowerCase(), h));
  return m;
}
function durationByName() {
  const m = new Map<string, number[]>();
  loadRuns().forEach((r) => r.results.forEach((x) => { if (x.duration !== undefined) (m.get(x.name.trim().toLowerCase()) ?? m.set(x.name.trim().toLowerCase(), []).get(x.name.trim().toLowerCase())!).push(x.duration); }));
  return m;
}

/** Batch 2, group L: change impact, traceability, risk, quarantine, budgets, prediction and themes. */
export default function ImpactTool(props: ToolProps) {
  const list = useMemo(() => scenarios(props.corpus), [props.corpus]);
  if (!props.corpus) return <p className="subtle">Loading scenarios…</p>;
  return (
    <div className="design-tool">
      <AlgoGate ids={['test-impact']}><Impact {...props} list={list} /></AlgoGate>
      <AlgoGate ids={['rtm']}><Rtm {...props} list={list} /></AlgoGate>
      <AlgoGate ids={['risk-score']}><Risk {...props} list={list} /></AlgoGate>
      <AlgoGate ids={['quarantine']}><Quarantine {...props} /></AlgoGate>
      <Budget {...props} list={list} />
      <Prediction {...props} list={list} />
      <AlgoGate ids={['kmeans']}><Themes {...props} list={list} /></AlgoGate>
    </div>
  );
}
type P = ToolProps & { list: Sc[] };
const open = (onSource: ToolProps['onSource'], s: Sc) => <button className="text-button" onClick={() => onSource(s.file, s.line)}>{s.name}</button>;

function Impact({ corpus, list, onNotice, onSource }: P) {
  const [changed, setChanged] = useLocalState('design:impact:changed', 'Steps/AuthSteps.cs');
  const [base, setBase] = useLocalState('design:impact:base', 'HEAD');
  const [error, setError] = useState('');
  const files = changed.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
  const hits = useMemo(() => testImpact(files, list, corpus?.bindings.map((b) => ({ pattern: b.pattern, expression: b.expression, file: b.file, keyword: b.keyword })) ?? []), [files.join('|'), list, corpus]);
  const filter = hits.length ? hits.map((h) => `Name~${JSON.stringify(h.scenario.name.replace(/\W+/g, ' ').trim()).slice(1, -1).split(' ').slice(0, 4).join(' ')}`).join(' | ') : '';
  return (
    <section className="panel" aria-labelledby="imp-head">
      <div className="design-head"><h2 id="imp-head"><GitPullRequest size={16} aria-hidden="true" /> Test impact</h2><span className="badge">{hits.length} of {list.length} scenarios affected</span></div>
      <p className="subtle">Changed files, one per line (repository-relative), or read them from git.</p>
      <div className="design-options">
        <label className="field grow"><span className="micro-label">CHANGED FILES</span><textarea rows={3} className="mono" value={changed} onChange={(e) => setChanged(e.target.value)} spellCheck={false} /></label>
        <label className="field small"><span className="micro-label">GIT BASE</span><input value={base} onChange={(e) => setBase(e.target.value)} /></label>
        <Button size="small" onClick={async () => { setError(''); try { const r = await api<{ files: string[] }>('/design/changed?base=' + encodeURIComponent(base)); setChanged(r.files.join('\n')); onNotice(`${r.files.length} changed files since ${base}.`); } catch (e) { setError((e as Error).message); } }}>Load from git</Button>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!hits.length ? <Empty title="Nothing affected">No scenario uses a step bound in these files.</Empty> : (
        <ul className="finding-list">{hits.map((h) => <li key={h.scenario.id}>{open(onSource, h.scenario)}<span className="meta">{h.reasons.join(' · ')}</span></li>)}</ul>
      )}
      <ResultActions text={filter} file="impacted-filter.txt" onNotice={onNotice} />
    </section>
  );
}

function Rtm({ list, onNotice, onSource }: P) {
  const [pattern, setPattern] = useLocalState('design:rtm:pattern', '^@(req|jira|us|story|[A-Z]{2,10})-?\\d+$');
  const [expected, setExpected] = useLocalState('design:rtm:expected', '');
  let re: RegExp | undefined, bad = '';
  try { re = new RegExp(pattern, 'i'); } catch (e) { bad = (e as Error).message; }
  const t = re ? traceability(list, re, expected.split(/[\s,]+/).filter(Boolean)) : undefined;
  const md = t ? ['| Requirement | Scenarios |', '| --- | --- |', ...t.rows.map((r) => `| ${r.req} | ${r.scenarios.map((id) => list.find((s) => s.id === id)?.name).join('; ') || '**not covered**'} |`)].join('\n') : '';
  return (
    <section className="panel" aria-labelledby="rtm-head">
      <div className="design-head"><h2 id="rtm-head"><Network size={16} aria-hidden="true" /> Traceability matrix</h2>{t && <span className={`badge ${t.uncovered.length ? 'amber' : 'green'}`}>{pct(t.coverage)} of requirements covered</span>}</div>
      <div className="form-grid">
        <label className="field"><span className="micro-label">REQUIREMENT TAG PATTERN (REGEX)</span><input value={pattern} onChange={(e) => setPattern(e.target.value)} aria-invalid={!!bad || undefined} />{bad && <span className="field-error">{bad}</span>}</label>
        <label className="field"><span className="micro-label">EXPECTED REQUIREMENTS (optional)</span><input value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="REQ-1, REQ-2, JIRA-40" /></label>
      </div>
      {t && (t.rows.length ? (
        <div className="table-scroll"><table className="data-table"><thead><tr><th>Requirement</th><th>Scenarios</th></tr></thead>
          <tbody>{t.rows.map((r) => <tr key={r.req}><td>{r.req}</td><td>{r.scenarios.length ? r.scenarios.map((id) => { const s = list.find((x) => x.id === id)!; return <div key={id}>{open(onSource, s)}</div>; }) : <span className="badge amber">not covered</span>}</td></tr>)}</tbody></table></div>
      ) : <Empty title="No requirement tags">Tag scenarios like <code>@REQ-12</code> or list expected requirements.</Empty>)}
      {t && t.untraced.length > 0 && <p className="meta">{t.untraced.length} scenarios have no requirement tag.</p>}
      <ResultActions text={md} file="traceability.md" onNotice={onNotice} />
    </section>
  );
}

function Risk({ list, onNotice, onSource }: P) {
  const [weights, setWeights] = useLocalState('design:risk:weights', '@payments=5\n@checkout=4\n@authentication=3\n@smoke=2');
  const w = Object.fromEntries(weights.split('\n').map((l) => /^\s*(@?[\w-]+)\s*=\s*(\d+(?:\.\d+)?)/.exec(l)).filter(Boolean).map((m) => [(m![1].startsWith('@') ? m![1] : '@' + m![1]).toLowerCase(), +m![2]]));
  const hist = historyByName();
  const ranked = riskScore(list.map((s) => { const h = hist.get(s.name.toLowerCase()) ?? []; return { id: s.id, tags: s.tags, fails: h.filter((o) => o === 'failed').length, runs: h.filter((o) => o !== 'skipped').length, steps: s.steps.length }; }), w).slice(0, 25);
  return (
    <section className="panel" aria-labelledby="risk-head">
      <div className="design-head"><h2 id="risk-head"><Flame size={16} aria-hidden="true" /> Risk-based priority</h2></div>
      <div className="design-columns">
        <label className="field"><span className="micro-label">IMPACT WEIGHTS (tag = weight)</span><textarea rows={4} className="mono" value={weights} onChange={(e) => setWeights(e.target.value)} spellCheck={false} /></label>
        <table className="data-table"><thead><tr><th>Scenario</th><th>Likelihood</th><th>Impact</th><th>Risk</th></tr></thead>
          <tbody>{ranked.map((r) => { const s = list.find((x) => x.id === r.id)!; return <tr key={r.id}><td>{open(onSource, s)}</td><td>{pct(r.likelihood)}</td><td>{r.impact.toFixed(1)}</td><td><strong>{r.risk.toFixed(2)}</strong></td></tr>; })}</tbody></table>
      </div>
      <ResultActions text={ranked.map((r) => `${r.risk.toFixed(2)}\t${list.find((s) => s.id === r.id)?.name}`).join('\n')} file="risk.tsv" onNotice={onNotice} />
    </section>
  );
}

function Quarantine({ onNotice }: ToolProps) {
  const rows = [...histories(loadRuns())].map(([k, h]) => ({ name: k.split('::')[1], ...quarantinePolicy(h) })).filter((r) => r.action !== 'keep');
  return (
    <section className="panel" aria-labelledby="q-head">
      <div className="design-head"><h2 id="q-head"><ShieldAlert size={16} aria-hidden="true" /> Quarantine recommendations</h2></div>
      {!rows.length ? <Empty title="Nothing to quarantine">Import run history in Results & flakiness first.</Empty> : (
        <table className="data-table"><thead><tr><th>Scenario</th><th>Action</th><th>Why</th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}</td><td><span className={`badge ${r.action === 'quarantine' ? 'amber' : r.action === 'fix' ? 'red' : 'green'}`}>{r.action}</span></td><td className="meta">{r.reason}</td></tr>)}</tbody></table>
      )}
      <ResultActions text={rows.map((r) => `${r.action}\t${r.name}\t${r.reason}`).join('\n')} file="quarantine.tsv" onNotice={onNotice} />
    </section>
  );
}

function Budget({ list, onNotice, onSource }: P) {
  const { on } = useAlgorithms();
  const [budget, setBudget] = useLocalState('design:budget', 120);
  const dur = durationByName();
  const cost = (s: Sc) => { const d = dur.get(s.name.toLowerCase()); return d?.length ? d.reduce((a, x) => a + x, 0) / d.length : Math.max(1, s.steps.length * 2); };
  // Value: distinct tags + steps the scenario covers (rarer requirements are worth more).
  const freq = new Map<string, number>();
  list.forEach((s) => [...s.tags, ...s.steps.map((x) => x.text.toLowerCase())].forEach((k) => freq.set(k, (freq.get(k) ?? 0) + 1)));
  const items = list.map((s) => ({ s, cost: cost(s), value: [...new Set([...s.tags, ...s.steps.map((x) => x.text.toLowerCase())])].reduce((a, k) => a + 1 / (freq.get(k) ?? 1), 0) }));
  const picked = on('knapsack') ? knapsack(items, budget) : [];
  const order = additionalGreedy(items.map((i) => ({ id: i.s.id, covers: [...i.s.tags, ...i.s.steps.map((x) => x.text.toLowerCase())], cost: i.cost })));
  const all = new Set(order.flatMap((t) => t.covers));
  let acc = 0; const seen = new Set<string>();
  const curve = order.map((t) => { acc += t.cost ?? 1; t.covers.forEach((c) => seen.add(c)); return { cost: Math.round(acc), coverage: all.size ? seen.size / all.size : 1, n: 0 }; }).map((p, i) => ({ ...p, n: i + 1 }));
  const front = on('pareto') ? paretoFront(curve) : [];
  return (
    <section className="panel" aria-labelledby="bud-head">
      <div className="design-head"><h2 id="bud-head"><Timer size={16} aria-hidden="true" /> Time budget</h2></div>
      <AlgoGate ids={['knapsack']} compact>
        <label className="field small"><span className="micro-label">BUDGET (SECONDS)</span><input type="number" min={1} value={budget} onChange={(e) => setBudget(Math.max(1, +e.target.value || 1))} /></label>
        <p>{picked.length} scenarios fit in {budget}s ({Math.round(picked.reduce((a, x) => a + x.cost, 0))}s used). Durations come from imported results; otherwise 2s per step.</p>
        <ol className="suite-list">{picked.map((p) => <li key={p.s.id}>{open(onSource, p.s)} <span className="meta">{p.cost.toFixed(1)}s</span></li>)}</ol>
      </AlgoGate>
      <AlgoGate ids={['pareto']} compact>
        <h3 className="micro-label"><TrendingUp size={13} aria-hidden="true" /> COVERAGE VS. TIME (PARETO FRONT)</h3>
        <table className="data-table"><thead><tr><th>Scenarios</th><th>Time</th><th>Coverage</th></tr></thead><tbody>{front.slice(0, 12).map((p) => <tr key={p.n}><td>{p.n}</td><td>{p.cost}s</td><td className="bar-cell"><span className="bar" style={{ width: pct(p.coverage) }} /> {pct(p.coverage)}</td></tr>)}</tbody></table>
      </AlgoGate>
      <ResultActions text={picked.map((p) => p.s.name).join('\n')} file="budget-suite.txt" onNotice={onNotice} />
    </section>
  );
}

function Prediction({ list, onNotice }: P) {
  const model = usePicked('predict', ['logistic-regression', 'naive-bayes']);
  const result = useMemo(() => {
    const hist = historyByName();
    // Features from all runs but the last; label = did the last run fail. Then predict the next run from all runs.
    const feats = (h: Outcome[], s: Sc) => { const r = h.filter((o) => o !== 'skipped'); let flips = 0; for (let i = 1; i < r.length; i++) if (r[i] !== r[i - 1]) flips++; return [s.steps.length, r.length ? r.filter((o) => o === 'failed').length / r.length : 0, flips, s.tags.length, r.at(-1) === 'failed' ? 1 : 0]; };
    const train = list.map((s) => ({ s, h: hist.get(s.name.toLowerCase()) ?? [] })).filter((x) => x.h.length >= 3);
    if (train.length < 4 || !model) return null;
    const X = train.map((x) => feats(x.h.slice(0, -1), x.s)), y = train.map((x) => (x.h.at(-1) === 'failed' ? 1 : 0));
    if (!y.some(Boolean) || y.every(Boolean)) return null;
    const m = model === 'naive-bayes' ? naiveBayes(X, y) : logisticRegression(X, y);
    return train.map((x) => ({ s: x.s, p: m.predict(feats(x.h, x.s)) })).sort((a, b) => b.p - a.p).slice(0, 15);
  }, [list, model]);
  return (
    <section className="panel" aria-labelledby="pred-head">
      <div className="design-head"><h2 id="pred-head"><Brain size={16} aria-hidden="true" /> Next-run failure prediction</h2></div>
      <AlgoPicker id="predict" label="MODEL" options={['logistic-regression', 'naive-bayes']} />
      {!result ? <Empty title="Not enough history">Needs at least 4 scenarios with 3+ runs, including some failures (import reports in Results & flakiness).</Empty> : (
        <table className="data-table"><thead><tr><th>Scenario</th><th>P(fail next run)</th></tr></thead><tbody>{result.map((r) => <tr key={r.s.id}><td>{r.s.name}</td><td className="bar-cell"><span className="bar" style={{ width: pct(r.p) }} /> {pct(r.p)}</td></tr>)}</tbody></table>
      )}
      <ResultActions text={(result ?? []).map((r) => `${r.p.toFixed(3)}\t${r.s.name}`).join('\n')} file="failure-prediction.tsv" onNotice={onNotice} />
    </section>
  );
}

function Themes({ list, onNotice, onSource }: P) {
  const { on } = useAlgorithms();
  const [k, setK] = useLocalState('design:themes:k', 0);
  const vectors = useMemo(() => tfidfVectors(list.map((s) => tokens(`${s.name} ${s.steps.map((x) => x.text).join(' ')}`))), [list]);
  const best = useMemo(() => {
    if (list.length < 3) return { k: 1, assign: list.map(() => 0), score: 0 };
    const tryK = (n: number) => { const r = kMeans(vectors, n, 7); return { k: n, assign: r.assign, score: on('silhouette') ? silhouette(vectors, r.assign) : 0 }; };
    if (k > 0) return tryK(Math.min(k, list.length));
    const cands = Array.from({ length: Math.min(8, list.length - 1) - 1 }, (_, i) => tryK(i + 2));
    return cands.reduce((a, b) => (b.score > a.score ? b : a), cands[0] ?? tryK(1));
  }, [vectors, k, list.length, on]);
  const groups = Array.from({ length: best.k }, (_, c) => list.filter((_, i) => best.assign[i] === c)).filter((g) => g.length);
  const md = groups.map((g, i) => `## Theme ${i + 1}: ${rake(g.map((s) => s.name + ' ' + s.steps.map((x) => x.text).join(' ')), 3).map((x) => x.phrase).join(', ')}\n${g.map((s) => `- ${s.name}`).join('\n')}`).join('\n\n');
  return (
    <section className="panel" aria-labelledby="th-head">
      <div className="design-head"><h2 id="th-head"><Shapes size={16} aria-hidden="true" /> Scenario themes</h2><span className="badge">k = {best.k}{on('silhouette') && ` · silhouette ${best.score.toFixed(2)}`}</span></div>
      <label className="field small"><span className="micro-label">K (0 = AUTO)</span><input type="number" min={0} max={12} value={k} onChange={(e) => setK(Math.max(0, Math.min(12, +e.target.value || 0)))} /></label>
      {groups.length < 2 ? <Empty title="Not enough scenarios to group" /> : (
        <ul className="cluster-list">{groups.map((g, i) => <li key={i}><span className="micro-label">THEME {i + 1} · {on('rake') ? rake(g.map((s) => s.name + ' ' + s.steps.map((x) => x.text).join(' ')), 3).map((x) => x.phrase).join(', ') : `${g.length} scenarios`}</span><ul>{g.map((s) => <li key={s.id}>{open(onSource, s)}</li>)}</ul></li>)}</ul>
      )}
      <ResultActions text={md} file="themes.md" onNotice={onNotice} />
    </section>
  );
}
