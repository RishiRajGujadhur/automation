import { useMemo, useState } from 'react';
import { ListChecks, ArrowDownWideNarrow } from 'lucide-react';
import { Button } from '../radix';
import { Meter, useAlgorithms } from '../radix2';
import { useLocalState } from '../ui';
import { additionalGreedy, adaptiveRandom, annealCover, apfd, coveredBy, exactCover, geneticCover, greedySetCover, hgs, totalGreedy, weightedSetCover, type Test } from '../algorithms/optimize';
import { AlgoGate, AlgoPicker, Empty, ResultActions, usePicked, pct, type Corpus, type ToolProps } from './shared';

const minimizers = ['greedy-set-cover', 'weighted-set-cover', 'hgs', 'exact-cover', 'simulated-annealing', 'genetic'];
const prioritizers = ['additional-greedy', 'total-greedy', 'art'];
type Basis = 'tags' | 'steps' | 'both';

/** Scenarios as tests; requirements are their tags (feature tags inherited) and/or distinct steps. */
export function scenariosAsTests(corpus: Corpus | undefined, basis: Basis): Test[] {
  return (corpus?.features ?? []).flatMap((f) => f.scenarios.map((s) => ({
    id: `${f.file}:${s.line}`,
    cost: Math.max(1, s.steps.length),
    covers: [...new Set([...(basis !== 'steps' ? [...f.tags, ...(s.tags ?? [])] : []), ...(basis !== 'tags' ? s.steps.map((st) => st.text.toLowerCase()) : [])])],
  }))).filter((t) => t.covers.length);
}

/** F6: suite minimization (set cover) and prioritization. */
export default function SuiteTool({ corpus, onNotice, onSource }: ToolProps) {
  const { on } = useAlgorithms();
  const [basis, setBasis] = useLocalState<Basis>('design:suite:basis', 'tags');
  const [seed, setSeed] = useLocalState('design:suite:seed', 7);
  const tests = useMemo(() => scenariosAsTests(corpus, basis), [corpus, basis]);
  const min = usePicked('suite-min', minimizers);
  const pri = usePicked('suite-pri', prioritizers);
  const [ran, setRan] = useState(0);
  const reduced = useMemo(() => {
    if (!tests.length || !min) return [];
    switch (min) {
      case 'greedy-set-cover': return greedySetCover(tests);
      case 'weighted-set-cover': return weightedSetCover(tests);
      case 'hgs': return hgs(tests);
      case 'exact-cover': return exactCover(tests);
      case 'simulated-annealing': return annealCover(tests, seed);
      case 'genetic': return geneticCover(tests, seed);
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tests, min, seed, ran]);
  const order = useMemo(() => (!pri ? [] : pri === 'total-greedy' ? totalGreedy(tests) : pri === 'art' ? adaptiveRandom(tests, seed) : additionalGreedy(tests)), [tests, pri, seed]);
  const name = (id: string) => { const [file, line] = [id.slice(0, id.lastIndexOf(':')), +id.slice(id.lastIndexOf(':') + 1)]; const f = corpus?.features.find((x) => x.file === file); return { file, line, label: `${f?.scenarios.find((s) => s.line === line)?.name ?? id}` }; };
  const reqs = coveredBy(tests);
  const steps = (ts: Test[]) => ts.reduce((a, t) => a + (t.cost ?? 1), 0);
  const list = reduced.map((t) => `${name(t.id).label}  (${t.id})`).join('\n');
  if (!corpus) return <p className="subtle">Loading scenarios…</p>;
  return (
    <div className="design-tool">
      <section className="panel" aria-labelledby="suite-min">
        <div className="design-head"><h2 id="suite-min"><ListChecks size={16} aria-hidden="true" /> Minimal suite</h2><span className="badge">{tests.length} scenarios · {reqs} requirements</span></div>
        <p className="subtle">Finds the fewest scenarios that still cover every requirement. Requirements are tags (a smoke run that still touches every tagged area) or distinct steps (every step exercised once).</p>
        <div className="design-options">
          <label className="field"><span className="micro-label">REQUIREMENTS</span>
            <select value={basis} onChange={(e) => setBasis(e.target.value as Basis)}><option value="tags">Tags</option><option value="steps">Distinct steps</option><option value="both">Tags and steps</option></select>
          </label>
          <AlgoPicker id="suite-min" label="ALGORITHM" options={minimizers} />
          {['simulated-annealing', 'genetic'].includes(min) && <label className="field small"><span className="micro-label">SEED</span><input type="number" value={seed} onChange={(e) => setSeed(+e.target.value || 0)} /></label>}
          <Button size="small" onClick={() => setRan(ran + 1)}>Run again</Button>
        </div>
        {!tests.length ? <Empty title="Nothing to cover">No scenarios have {basis === 'tags' ? 'tags' : 'steps'} yet. Tag scenarios (e.g. @checkout) or switch requirements to distinct steps.</Empty> : (
          <>
            <div className="coverage-meter">
              <span><strong>{reduced.length}</strong> of {tests.length} scenarios ({pct(reduced.length / tests.length)}), {steps(reduced)} of {steps(tests)} steps, covering {coveredBy(reduced)}/{reqs} requirements.</span>
              <Meter value={reduced.length} max={tests.length} label="Suite size after reduction" tone="purple" />
            </div>
            <ol className="suite-list">{reduced.map((t) => { const n = name(t.id); return <li key={t.id}><button className="text-button" onClick={() => onSource(n.file, n.line)}>{n.label}</button> <span className="meta">{t.covers.length} reqs · {t.cost} steps</span></li>; })}</ol>
            <ResultActions text={list} file="minimal-suite.txt" onNotice={onNotice} />
          </>
        )}
      </section>
      <section className="panel" aria-labelledby="suite-pri">
        <div className="design-head"><h2 id="suite-pri"><ArrowDownWideNarrow size={16} aria-hidden="true" /> Run order</h2>{on('apfd') && order.length > 0 && <span className="badge green">APFD {apfd(order).toFixed(3)}</span>}</div>
        <p className="subtle">Orders the whole suite so requirements are covered as early as possible{on('apfd') && <> (APFD vs. file order: {tests.length ? apfd(tests).toFixed(3) : '–'})</>}.</p>
        <AlgoPicker id="suite-pri" label="PRIORITIZATION" options={prioritizers} />
        <AlgoGate ids={prioritizers.slice(0, 1)} compact>{null}</AlgoGate>
        <ol className="suite-list">{order.slice(0, 50).map((t) => { const n = name(t.id); return <li key={t.id}><button className="text-button" onClick={() => onSource(n.file, n.line)}>{n.label}</button></li>; })}</ol>
        <ResultActions text={order.map((t) => name(t.id).label).join('\n')} file="run-order.txt" onNotice={onNotice} />
      </section>
    </div>
  );
}
