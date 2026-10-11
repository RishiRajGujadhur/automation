import { useMemo } from 'react';
import { ShieldCheck, Copy as CopyIcon, BookA } from 'lucide-react';
import { useAlgorithms } from '../radix2';
import { useLocalState } from '../ui';
import { smellChecks, duplicateScenarios, flesch, fleschLabel, type Finding } from '../algorithms/quality';
import { algorithmById } from '../algorithms/registry';
import { gunningFog, rake, typeTokenRatio } from '../algorithms/text';
import { AlgoGate, Empty, ResultActions, toQFeature, type ToolProps } from './shared';

/** Duplicates, smells and readability across the whole corpus. */
export default function QualityTool({ corpus, onNotice, onSource }: ToolProps) {
  const { on } = useAlgorithms();
  const [maxSteps, setMaxSteps] = useLocalState('design:maxSteps', 10);
  const [filter, setFilter] = useLocalState('design:smellFilter', '');
  const features = useMemo(() => (corpus?.features ?? []).map(toQFeature), [corpus]);
  const findings: Finding[] = useMemo(() => features.flatMap((f) => Object.entries(smellChecks).filter(([id]) => on(id)).flatMap(([, check]) => check(f, { maxSteps }))), [features, on, maxSteps]);
  const dups = useMemo(() => (on('scenario-fingerprint') ? duplicateScenarios(features) : []), [features, on]);
  const readability = useMemo(() => (on('flesch') ? features.flatMap((f) => f.scenarios.filter((s) => s.steps.length).map((s) => ({ file: f.file, line: s.line, name: s.name, score: flesch(s.steps.map((x) => x.text)) }))).sort((a, b) => a.score - b.score).slice(0, 12) : []), [features, on]);
  const shown = filter ? findings.filter((x) => x.check === filter) : findings;
  const byCheck = findings.reduce<Record<string, number>>((m, f) => ({ ...m, [f.check]: (m[f.check] ?? 0) + 1 }), {});
  const report = shown.map((f) => `${f.file}:${f.line}  [${f.check}] ${f.message}`).join('\n');
  if (!corpus) return <p className="subtle">Loading features…</p>;
  return (
    <div className="design-tool">
      <section className="panel" aria-labelledby="q-smells">
        <div className="design-head"><h2 id="q-smells"><ShieldCheck size={16} aria-hidden="true" /> Scenario smells</h2><span className={`badge ${findings.length ? 'amber' : 'green'}`}>{findings.length} findings</span></div>
        <div className="chip-row" role="group" aria-label="Filter by check">
          <button className={`chip ${!filter ? 'active' : ''}`} aria-pressed={!filter} onClick={() => setFilter('')}>All {findings.length}</button>
          {Object.entries(byCheck).map(([id, n]) => <button key={id} className={`chip ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(filter === id ? '' : id)} title={algorithmById.get(id)?.tooltip}>{algorithmById.get(id)?.name ?? id} {n}</button>)}
        </div>
        {on('smell-long') && <label className="field small"><span className="micro-label">MAX STEPS</span><input type="number" min={3} value={maxSteps} onChange={(e) => setMaxSteps(Math.max(3, +e.target.value || 10))} /></label>}
        {!shown.length ? <Empty title="No smells found">Every enabled check passed.</Empty> : (
          <ul className="finding-list">
            {shown.slice(0, 200).map((f, i) => (
              <li key={i} className={f.severity}>
                <button className="text-button" onClick={() => onSource(f.file, f.line)}>{f.file}:{f.line}</button>
                <span>{f.message}</span>
              </li>
            ))}
          </ul>
        )}
        <ResultActions text={report} file="smells.txt" onNotice={onNotice} />
      </section>
      <AlgoGate ids={['scenario-fingerprint']}>
        <section className="panel" aria-labelledby="q-dups">
          <div className="design-head"><h2 id="q-dups"><CopyIcon size={16} aria-hidden="true" /> Duplicate scenarios</h2><span className="badge">{dups.length} groups</span></div>
          <p className="subtle">Same steps in the same order, ignoring quoted values and numbers. Merge them into a Scenario Outline.</p>
          {!dups.length ? <Empty title="No duplicate scenarios" /> : (
            <ul className="cluster-list">{dups.map((g, i) => <li key={i}><ul>{g.map((s) => <li key={s.file + s.line}><button className="text-button" onClick={() => onSource(s.file, s.line)}>{s.name}</button> <span className="meta">{s.file}:{s.line}</span></li>)}</ul></li>)}</ul>
          )}
        </section>
      </AlgoGate>
      <AlgoGate ids={['flesch']}>
        <section className="panel" aria-labelledby="q-read">
          <div className="design-head"><h2 id="q-read"><BookA size={16} aria-hidden="true" /> Hardest to read</h2></div>
          {!readability.length ? <Empty title="No scenarios" /> : (
            <table className="data-table"><thead><tr><th>Scenario</th><th>Flesch</th><th>Reading</th></tr></thead>
              <tbody>{readability.map((r) => <tr key={r.file + r.line}><td><button className="text-button" onClick={() => onSource(r.file, r.line)}>{r.name}</button></td><td>{r.score.toFixed(0)}</td><td>{fleschLabel(r.score)}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      </AlgoGate>
      <Wording features={features} onNotice={onNotice} />
    </div>
  );
}

/** N1, N2, N5: readability by fog index, vocabulary spread and the key phrases of each feature. */
function Wording({ features, onNotice }: { features: ReturnType<typeof toQFeature>[]; onNotice: (m: string) => void }) {
  const { on } = useAlgorithms();
  const all = features.flatMap((f) => f.scenarios.flatMap((s) => s.steps.map((x) => x.text)));
  if (!all.length || (!on('gunning-fog') && !on('lexical-diversity') && !on('rake'))) return null;
  const fog = on('gunning-fog') ? features.map((f) => ({ f, fog: gunningFog(f.scenarios.flatMap((s) => s.steps.map((x) => x.text))) })).sort((a, b) => b.fog - a.fog) : [];
  const ttr = typeTokenRatio(all);
  const md = features.map((f) => `- **${f.name}**: ${rake(f.scenarios.flatMap((s) => [s.name, ...s.steps.map((x) => x.text)]), 5).map((k) => k.phrase).join(', ')}`).join('\n');
  return (
    <section className="panel" aria-labelledby="q-wording">
      <div className="design-head"><h2 id="q-wording">Wording</h2>{on('lexical-diversity') && <span className="badge">lexical diversity {ttr.toFixed(2)}</span>}</div>
      {on('lexical-diversity') && <p className="subtle">{ttr < 0.2 ? 'Very repetitive wording: good for reuse, but check steps say what differs.' : ttr > 0.6 ? 'Many different words: consider a shared vocabulary so steps get reused.' : 'Vocabulary is consistent.'}</p>}
      <table className="data-table"><thead><tr><th>Feature</th>{on('gunning-fog') && <th>Fog index</th>}{on('rake') && <th>Key phrases</th>}</tr></thead>
        <tbody>{(fog.length ? fog : features.map((f) => ({ f, fog: 0 }))).map(({ f, fog: g }) => <tr key={f.file}><td>{f.name}</td>{on('gunning-fog') && <td>{g.toFixed(1)}</td>}{on('rake') && <td className="meta">{rake(f.scenarios.flatMap((s) => [s.name, ...s.steps.map((x) => x.text)]), 4).map((k) => k.phrase).join(', ')}</td>}</tr>)}</tbody>
      </table>
      <ResultActions text={md} file="feature-keywords.md" onNotice={onNotice} />
    </section>
  );
}