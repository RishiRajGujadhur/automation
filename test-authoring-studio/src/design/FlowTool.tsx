import { useMemo } from 'react';
import { Workflow, FileCode2, TriangleAlert, Network } from 'lucide-react';
import { Button } from '../radix';
import { Meter, useAlgorithms } from '../radix2';
import { useLocalState } from '../ui';
import { chinesePostman, deadStates, dijkstra, edgeCoverage, kahn, nSwitchCoverage, parseFsm, pathsToGherkin, primePaths, randomWalks, simplePaths, stateCoverage, stateCoverageOf, tarjan, transitionCoverage, bfsPath, type Edge } from '../algorithms/graph';
import { basisPaths, cyclomatic, floydWarshall, mostProbablePaths, pageRank, sneakPaths, stationaryDistribution, yenKShortest } from '../algorithms/graph2';
import { AlgoGate, AlgoPicker, Empty, ResultActions, usePicked, pct, type ToolProps } from './shared';

const sample = `# From -> To : action [cost]
start: Home
end: Confirmation
Home -> Search : searches for a product
Home -> Login : opens the sign-in page
Login -> Home : signs in
Search -> Product : opens the first result
Product -> Cart : adds the product to the cart
Product -> Search : goes back to the results
Cart -> Checkout : proceeds to checkout [2]
Cart -> Product : removes the product
Checkout -> Login : is asked to sign in
Checkout -> Confirmation : places the order [3]`;
const criteria = ['transition-coverage', 'state-coverage', 'n-switch', 'prime-paths', 'basis-paths', 'markov-usage', 'chinese-postman', 'simple-paths', 'random-walk'];

/** F7: finite-state machine → scenarios. */
export default function FlowTool({ onNotice, onOpenDraft }: ToolProps) {
  const { on } = useAlgorithms();
  const [text, setText] = useLocalState('design:flow', sample);
  const [title, setTitle] = useLocalState('design:flow:title', 'Shopping journey');
  const [seed, setSeed] = useLocalState('design:flow:seed', 3);
  const [from, setFrom] = useLocalState('design:flow:from', 'Home');
  const [to, setTo] = useLocalState('design:flow:to', 'Confirmation');
  const crit = usePicked('flow', criteria);
  const { fsm, errors } = useMemo(() => parseFsm(text), [text]);
  const paths: Edge[][] = useMemo(() => {
    if (!fsm.edges.length) return [];
    switch (crit) {
      case 'transition-coverage': return transitionCoverage(fsm);
      case 'state-coverage': return stateCoverage(fsm);
      case 'n-switch': return nSwitchCoverage(fsm, 1);
      case 'prime-paths': return primePaths(fsm);
      case 'chinese-postman': { if (!on('hierholzer')) return []; const tour = chinesePostman(fsm); return tour ? [tour] : []; }
      case 'simple-paths': return simplePaths(fsm);
      case 'random-walk': return randomWalks(fsm, 6, seed);
      case 'basis-paths': return basisPaths(fsm);
      case 'markov-usage': return mostProbablePaths(fsm, 6).map((p) => p.path);
    }
    return [];
  }, [fsm, crit, seed, on]);
  const gherkin = paths.length ? `Feature: ${title}\n\n${pathsToGherkin(fsm, paths, title)}\n` : '';
  const ec = edgeCoverage(fsm, paths), sc = stateCoverageOf(fsm, paths);
  const health = on('reachability') ? deadStates(fsm) : { unreachable: [], dead: [] };
  const scc = on('tarjan') ? tarjan(fsm).filter((c) => c.length > 1) : [];
  const route = on('dijkstra') ? dijkstra(fsm, from, to) : on('bfs') ? (() => { const p = bfsPath(fsm, from, to); return p ? { path: p, cost: p.length } : null; })() : null;
  return (
    <div className="design-tool">
      <AlgoGate ids={['fsm-parse']}>
        <div className="design-columns">
          <section className="panel design-inputs" aria-labelledby="flow-model">
            <div className="design-head"><h2 id="flow-model"><Workflow size={16} aria-hidden="true" /> State machine</h2><Button size="small" variant="ghost" onClick={() => setText(sample)}>Load sample</Button></div>
            <p className="subtle">One transition per line: <code>From -&gt; To : action [cost]</code>. <code>start:</code> and <code>end:</code> name the initial and final states.</p>
            <textarea className="mono" rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="State machine model" />
            {errors.map((e) => <p className="field-error" key={e}>{e}</p>)}
            <p className="meta">{fsm.states.length} states · {fsm.edges.length} transitions · start {fsm.initial || '–'} · end {fsm.finals.join(', ') || '–'}</p>
            {(health.unreachable.length > 0 || health.dead.length > 0) && <p className="warn-text"><TriangleAlert size={14} aria-hidden="true" />{health.unreachable.length > 0 && `Unreachable: ${health.unreachable.join(', ')}. `}{health.dead.length > 0 && `Dead ends (can't reach an end state): ${health.dead.join(', ')}.`}</p>}
            {scc.length > 0 && <p className="meta">Strongly connected groups: {scc.map((c) => `{${c.join(', ')}}`).join(' ')}</p>}
          </section>
          <section className="panel design-output" aria-labelledby="flow-out">
            <div className="design-head"><h2 id="flow-out">Generated scenarios</h2><span className="badge">{paths.length} scenarios · {paths.reduce((a, p) => a + p.length, 0)} steps</span></div>
            <div className="design-options">
              <AlgoPicker id="flow" label="COVERAGE CRITERION" options={criteria} />
              {crit === 'random-walk' && <label className="field small"><span className="micro-label">SEED</span><input type="number" value={seed} onChange={(e) => setSeed(+e.target.value || 0)} /></label>}
              <label className="field"><span className="micro-label">FEATURE NAME</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            </div>
            {crit === 'chinese-postman' && <AlgoGate ids={['hierholzer']} compact>{null}</AlgoGate>}
            {crit === 'chinese-postman' && on('hierholzer') && !paths.length && fsm.edges.length > 0 && <p className="warn-text">No single tour exists: some state can't get back to the others. Add return transitions or pick transition coverage.</p>}
            {paths.length > 0 && (
              <div className="coverage-meter">
                <span>Transitions {ec.covered}/{ec.total} · states {sc.covered}/{sc.total}</span>
                <Meter value={ec.covered} max={ec.total || 1} label="Transition coverage" />
              </div>
            )}
            {gherkin ? <pre className="code-block" tabIndex={0} aria-label="Generated scenarios">{gherkin}</pre> : <Empty title="No scenarios yet">Describe transitions on the left; scenarios appear here.</Empty>}
            <ResultActions text={gherkin} file={`${title.replace(/\W+/g, '') || 'Flow'}.feature`} onNotice={onNotice}>
              <Button size="small" variant="soft" disabled={!gherkin} onClick={() => onOpenDraft(gherkin, `Features/${title.replace(/\W+/g, '') || 'Flow'}.feature`)}><FileCode2 size={13} aria-hidden="true" />Open in editor</Button>
            </ResultActions>
          </section>
        </div>
      </AlgoGate>
      <section className="panel" aria-labelledby="flow-route">
        <div className="design-head"><h2 id="flow-route"><Network size={16} aria-hidden="true" /> Route finder</h2></div>
        <AlgoGate ids={on('dijkstra') ? ['dijkstra'] : ['bfs']}>
          <div className="design-options">
            <label className="field"><span className="micro-label">FROM</span><select value={from} onChange={(e) => setFrom(e.target.value)}>{fsm.states.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className="field"><span className="micro-label">TO</span><select value={to} onChange={(e) => setTo(e.target.value)}>{fsm.states.map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          {route ? <p>{[from, ...route.path.map((e) => e.to)].join(' → ')} <span className="meta">({on('dijkstra') ? `cost ${route.cost}` : `${route.cost} steps`})</span></p> : <p className="subtle">No route from {from} to {to}.</p>}
          {on('yen-k-shortest') && route && <ol className="suite-list" aria-label="Alternative routes">{yenKShortest(fsm, from, to, 4).slice(1).map((r, i) => <li key={i}>{[from, ...r.path.map((e) => e.to)].join(' → ')} <span className="meta">cost {r.cost}</span></li>)}</ol>}
        </AlgoGate>
      </section>
      <ModelAnalysis fsm={fsm} title={title} onNotice={onNotice} onOpenDraft={onOpenDraft} />
      <AlgoGate ids={['kahn']}><DependencyOrder onNotice={onNotice} /></AlgoGate>
    </div>
  );
}

function DependencyOrder({ onNotice }: { onNotice: (m: string) => void }) {
  const [deps, setDeps] = useLocalState('design:deps', 'Login -> Checkout\nCatalog -> Search\nSearch -> Checkout\nCheckout -> Refunds');
  const pairs = deps.split('\n').map((l) => l.split(/\s*-+>\s*/).map((s) => s.trim())).filter((p) => p.length === 2 && p[0] && p[1]) as [string, string][];
  const nodes = [...new Set(pairs.flat())];
  const { order, cycle } = kahn(nodes, pairs);
  return (
    <section className="panel" aria-labelledby="flow-deps">
      <div className="design-head"><h2 id="flow-deps">Feature dependency order</h2></div>
      <p className="subtle"><code>A -&gt; B</code> means A must pass (or run) before B.</p>
      <textarea className="mono" rows={4} value={deps} onChange={(e) => setDeps(e.target.value)} aria-label="Dependencies" spellCheck={false} />
      <p><strong>Order:</strong> {order.join(' → ') || '–'}</p>
      {cycle.length > 0 && <p className="warn-text"><TriangleAlert size={14} aria-hidden="true" />Cycle between {cycle.join(', ')}.</p>}
      <ResultActions text={order.join('\n')} file="dependency-order.txt" onNotice={onNotice} />
    </section>
  );
}

/** K1, K2, K5, K6, J12: numbers about the model, plus negative (sneak path) scenarios. */
function ModelAnalysis({ fsm, title, onNotice, onOpenDraft }: { fsm: ReturnType<typeof parseFsm>['fsm']; title: string; onNotice: (m: string) => void; onOpenDraft: (s: string, f: string) => void }) {
  const { on } = useAlgorithms();
  if (!fsm.edges.length) return null;
  const sneaks = on('sneak-paths') ? sneakPaths(fsm) : [];
  const negative = sneaks.length ? `Feature: ${title} — invalid actions\n\n${sneaks.slice(0, 40).map((s) => `  Scenario: "${s.action}" is not possible on ${s.state}\n    Given the user is on the ${fsm.initial} screen\n${s.path.map((e, i) => `    ${i ? 'And' : 'When'} the user ${e.label}`).join('\n')}${s.path.length ? '\n' : ''}    Then the user cannot ${s.action}\n    And the user is still on the ${s.state} screen`).join('\n\n')}\n` : '';
  const fw = on('floyd-warshall') ? floydWarshall(fsm) : undefined;
  const ranks = on('pagerank') ? pageRank(fsm).slice(0, 6) : [];
  const usage = on('markov-usage') ? [...stationaryDistribution(fsm)].sort((a, b) => b[1] - a[1]).slice(0, 6) : [];
  return (
    <section className="panel" aria-labelledby="flow-analysis">
      <div className="design-head"><h2 id="flow-analysis">Model analysis</h2>{on('cyclomatic') && <span className="badge">cyclomatic complexity {cyclomatic(fsm)}</span>}</div>
      <div className="design-columns">
        {ranks.length > 0 && <div><span className="micro-label">HUB STATES (PAGERANK)</span><ol className="suite-list">{ranks.map(([s, r]) => <li key={s}>{s} <span className="meta">{pct(r)}</span></li>)}</ol></div>}
        {usage.length > 0 && <div><span className="micro-label">TIME SPENT PER STATE (USAGE MODEL)</span><ol className="suite-list">{usage.map(([s, r]) => <li key={s}>{s} <span className="meta">{pct(r)}</span></li>)}</ol></div>}
      </div>
      {fw && fw.states.length <= 14 && (
        <div className="table-scroll"><table className="data-table heat" aria-label="Shortest path cost between states">
          <thead><tr><th>from \ to</th>{fw.states.map((s) => <th key={s} scope="col">{s}</th>)}</tr></thead>
          <tbody>{fw.states.map((s, i) => <tr key={s}><th scope="row">{s}</th>{fw.distance[i].map((d, j) => <td key={j}>{d === Infinity ? '∞' : d}</td>)}</tr>)}</tbody>
        </table></div>
      )}
      {on('sneak-paths') && (
        <>
          <span className="micro-label">SNEAK PATHS · {sneaks.length} INVALID STATE/ACTION PAIRS</span>
          {negative ? <pre className="code-block" tabIndex={0} aria-label="Negative scenarios">{negative}</pre> : <p className="subtle">Every action is allowed in every state.</p>}
          <ResultActions text={negative} file="invalid-actions.feature" onNotice={onNotice}>
            <Button size="small" variant="soft" disabled={!negative} onClick={() => onOpenDraft(negative, `Features/${title.replace(/\W+/g, '') || 'Flow'}InvalidActions.feature`)}><FileCode2 size={13} aria-hidden="true" />Open in editor</Button>
          </ResultActions>
        </>
      )}
    </section>
  );
}