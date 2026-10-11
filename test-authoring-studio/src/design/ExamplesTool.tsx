import { useMemo, useState } from 'react';
import { Plus, Trash2, Wand2, FileCode2, TriangleAlert, FlaskConical } from 'lucide-react';
import { make } from 'covertable';
import { Button } from '../radix';
import { Meter, useAlgorithms } from '../radix2';
import { useLocalState } from '../ui';
import {
  aetg, baseChoice, cartesian, cartesianSize, coverage, decisionTable, eachChoice, expandValues, ipog, makeValidator, orthogonalArray,
  paramsFromCsv, parseConstraints, quineMcCluskey, randomSample, seedsFromExamples, toCsv, toExamples, type Param, type Row,
} from '../algorithms/combinatorial';
import { parseTagExpression, evaluate } from '../algorithms/tags';
import { annealCoveringArray, missingCombinations, reduceTable } from '../algorithms/logic';
import { AlgoGate, AlgoPicker, DropZone, ResultActions, usePicked, pct, type ToolProps } from './shared';

type Draft = { params: { name: string; values: string }[]; constraints: string; seeds: string; strength: number; seed: number; count: number; scenario: string; steps: string };
const sample: Draft = {
  params: [
    { name: 'browser', values: 'Chrome, Firefox, Safari, Edge' },
    { name: 'os', values: 'Windows, macOS, Linux' },
    { name: 'payment', values: 'Card*3, PayPal, Invoice' },
    { name: 'quantity', values: '1..10' },
  ],
  constraints: 'browser = Safari & os = Windows\nbrowser = Safari & os = Linux\nif payment = Invoice then quantity != 1',
  seeds: '',
  strength: 2,
  seed: 42,
  count: 10,
  scenario: 'Checkout works across environments',
  steps: 'Given the user opens the shop in <browser> on <os>\nWhen they buy <quantity> items paying by <payment>\nThen the order is confirmed',
};
const generators = ['ipog', 'aetg', 'covertable', 'sa-covering', 'orthogonal', 'each-choice', 'base-choice', 'random-sample', 'cartesian'];
const EXPLOSION = 2000;

/** F3: combinatorial Examples generator → Scenario Outline. */
export default function ExamplesTool({ onNotice, onOpenDraft }: ToolProps) {
  const { on } = useAlgorithms();
  const [d, setD] = useLocalState<Draft>('design:examples', sample);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });
  const algo = usePicked('examples', generators);
  const [rows, setRows] = useState<Row[]>();
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Row[][]>([]);

  const params: Param[] = useMemo(() => d.params.filter((p) => p.name.trim()).map((p) => {
    const raw = expandValues(p.values, { bva: on('bva'), equivalence: on('equivalence') });
    const parsed = raw.map((v) => { const m = /^(.*?)\*(\d+(?:\.\d+)?)$/.exec(v); return m && on('weighted-values') ? { v: m[1].trim(), w: +m[2] } : { v: v.replace(/\*\d+(\.\d+)?$/, ''), w: 1 }; });
    return { name: p.name.trim(), values: [...new Set(parsed.map((x) => x.v))], weights: parsed.map((x) => x.w) };
  }).filter((p) => p.values.length), [d.params, on]);
  const { rules, errors } = useMemo(() => (on('constraints') ? parseConstraints(d.constraints, params) : { rules: [], errors: [] }), [d.constraints, params, on]);
  const valid = useMemo(() => makeValidator(params, rules), [params, rules]);
  const size = cartesianSize(params);
  const t = Math.min(d.strength, params.length || 1);
  const cov = rows && on('tway-coverage') ? coverage(params, rows, t, valid) : undefined;
  const missing = rows && on('missing-pairs') && cov && cov.ratio < 1 ? missingCombinations(params, rows, t, valid) : undefined;

  const generate = () => {
    setError('');
    try {
      const seeds = on('seeds') ? seedsFromExamples(d.seeds, params) : [];
      let out: Row[];
      switch (algo) {
        case 'ipog': out = ipog(params, t, valid, seeds); break;
        case 'aetg': out = aetg(params, t, valid, d.seed); break;
        case 'sa-covering': { out = annealCoveringArray(params, t, undefined, d.seed).filter(valid); if (!out.length) throw new Error('Annealing did not find a covering table; try IPOG for this model.'); if (rules.length && coverage(params, out, t, valid).ratio < 1) out = ipog(params, t, valid, out); break; }
        case 'covertable': {
          const factors = Object.fromEntries(params.map((p) => [p.name, p.values]));
          const made = make(factors, { strength: t, salt: d.seed }) as Record<string, string>[];
          out = made.map((r) => params.map((p) => p.values.indexOf(r[p.name]))).filter(valid);
          break;
        }
        case 'orthogonal': { const oa = orthogonalArray(params); if (!oa) throw new Error('Orthogonal arrays need at most p+1 parameters, where p is the smallest prime ≥ the largest value count.'); out = oa.filter(valid); break; }
        case 'each-choice': out = eachChoice(params, valid); break;
        case 'base-choice': out = baseChoice(params, valid); break;
        case 'random-sample': out = randomSample(params, d.count, d.seed, valid); break;
        case 'cartesian': out = cartesian(params, valid); break;
        default: throw new Error('Turn on a generator in Settings → Algorithms.');
      }
      if (seeds.length && algo !== 'ipog') out = [...seeds.filter((s) => s.every((v) => v >= 0)), ...out];
      if (rows) setHistory([...history.slice(-9), rows]);
      setRows(out);
      onNotice(`${out.length} rows generated (full product: ${size.toLocaleString()}).`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const examples = rows ? toExamples(params, rows) : '';
  const outline = rows ? `  Scenario Outline: ${d.scenario}\n${d.steps.split('\n').filter(Boolean).map((l) => '    ' + l.trim()).join('\n')}\n\n    Examples:\n${examples.split('\n').map((l) => '      ' + l).join('\n')}\n` : '';
  const unknownPlaceholders = [...new Set([...d.steps.matchAll(/<([^>]+)>/g)].map((m) => m[1]))].filter((n) => !params.some((p) => p.name === n));

  return (
    <div className="design-tool">
      <div className="design-columns">
        <section className="panel design-inputs" aria-labelledby="ex-params">
          <div className="design-head">
            <h2 id="ex-params">Parameters</h2>
            <div className="button-row">
              <Button size="small" variant="ghost" onClick={() => { setD(sample); setRows(undefined); }}>Load sample</Button>
              <DropZone accept=".csv,text/csv" label="Import CSV" onText={(text) => { const ps = paramsFromCsv(text); if (!ps.length) onNotice('No columns found in that CSV.'); else { set({ params: ps.map((p) => ({ name: p.name, values: p.values.join(', ') })) }); onNotice(`${ps.length} parameters imported.`); } }} />
            </div>
          </div>
          <p className="subtle">One parameter per row; separate values with commas. {on('bva') && <>Write <code>18..65</code> for boundary values. </>}{on('equivalence') && <>Write <code>[0..17|18..64]</code> for equivalence classes. </>}{on('weighted-values') && <>Add <code>*3</code> to weight a value.</>}</p>
          <div className="param-list">
            {d.params.map((p, i) => (
              <div className="param-row" key={i}>
                <input aria-label={`Parameter ${i + 1} name`} placeholder="name" value={p.name} onChange={(e) => set({ params: d.params.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)) })} />
                <input aria-label={`Parameter ${i + 1} values`} placeholder="value, value, value" value={p.values} onChange={(e) => set({ params: d.params.map((x, k) => (k === i ? { ...x, values: e.target.value } : x)) })} />
                <span className="meta" title="Values after expansion">{params.find((x) => x.name === p.name.trim())?.values.length ?? 0}</span>
                <button className="icon-button" aria-label={`Remove parameter ${p.name || i + 1}`} onClick={() => set({ params: d.params.filter((_, k) => k !== i) })}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <Button size="small" onClick={() => set({ params: [...d.params, { name: '', values: '' }] })}><Plus size={13} aria-hidden="true" />Add parameter</Button>

          <AlgoGate ids={['constraints']} compact>
            <label className="field">
              <span className="micro-label">CONSTRAINTS</span>
              <textarea rows={3} value={d.constraints} onChange={(e) => set({ constraints: e.target.value })} placeholder={'browser = Safari & os = Windows\nif plan = Free then seats = 1'} spellCheck={false} />
              {errors.map((er) => <span className="field-error" key={er}>{er}</span>)}
              {!errors.length && rules.length > 0 && <span className="field-hint">{rules.length} rule{rules.length === 1 ? '' : 's'} applied during generation.</span>}
            </label>
          </AlgoGate>
          <AlgoGate ids={['seeds']} compact>
            <label className="field">
              <span className="micro-label">SEED ROWS (EXISTING EXAMPLES)</span>
              <textarea rows={2} value={d.seeds} onChange={(e) => set({ seeds: e.target.value })} placeholder="| browser | os |&#10;| Chrome  | Windows |" spellCheck={false} />
            </label>
          </AlgoGate>
          <div className="design-options">
            <AlgoPicker id="examples" label="ALGORITHM" options={generators} />
            {['ipog', 'aetg', 'covertable', 'sa-covering'].includes(algo) && (
              <label className="field small"><span className="micro-label">STRENGTH (t)</span><input type="number" min={1} max={Math.max(1, params.length)} value={d.strength} onChange={(e) => set({ strength: Math.max(1, Math.min(6, +e.target.value || 2)) })} /></label>
            )}
            {['aetg', 'random-sample', 'covertable', 'sa-covering'].includes(algo) && (
              <label className="field small"><span className="micro-label">SEED</span><input type="number" value={d.seed} onChange={(e) => set({ seed: +e.target.value || 0 })} /></label>
            )}
            {algo === 'random-sample' && <label className="field small"><span className="micro-label">ROWS</span><input type="number" min={1} value={d.count} onChange={(e) => set({ count: Math.max(1, +e.target.value || 1) })} /></label>}
          </div>
          {algo === 'cartesian' && size > EXPLOSION && <p className="warn-text"><TriangleAlert size={14} aria-hidden="true" />The full product is {size.toLocaleString()} rows. Pairwise usually needs far fewer.</p>}
          <Button variant="primary" onClick={generate} disabled={!params.length || !algo}><Wand2 size={15} aria-hidden="true" />Generate Examples</Button>
          {error && <p className="field-error" role="alert">{error}</p>}
        </section>

        <section className="panel design-output" aria-labelledby="ex-out">
          <div className="design-head">
            <h2 id="ex-out">Scenario Outline</h2>
            {rows && <span className="badge">{rows.length} rows · product {size.toLocaleString()}</span>}
          </div>
          <label className="field"><span className="micro-label">SCENARIO NAME</span><input value={d.scenario} onChange={(e) => set({ scenario: e.target.value })} /></label>
          <label className="field"><span className="micro-label">STEPS (use &lt;parameter&gt;)</span><textarea rows={3} value={d.steps} onChange={(e) => set({ steps: e.target.value })} spellCheck={false} /></label>
          {unknownPlaceholders.length > 0 && <p className="warn-text"><TriangleAlert size={14} aria-hidden="true" />No parameter named {unknownPlaceholders.map((u) => `<${u}>`).join(', ')}.</p>}
          {cov && (
            <div className="coverage-meter">
              <span>{t}-way coverage: <strong>{pct(cov.ratio)}</strong> ({cov.covered}/{cov.total} combinations)</span>
              <Meter value={cov.covered} max={cov.total || 1} label={`${t}-way coverage`} />
            </div>
          )}
          {rows ? (
            <>
              <pre className="code-block" tabIndex={0} aria-label="Generated Scenario Outline">{outline}</pre>
              {missing && missing.missing.length > 0 && <details className="missing-list"><summary>{missing.missing.length} uncovered {t}-way combinations</summary><ul>{missing.missing.slice(0, 60).map((m) => <li key={m}>{m}</li>)}</ul></details>}
              <ResultActions text={outline} file="generated.feature" onNotice={onNotice}>
                <Button size="small" onClick={() => rows && navigator.clipboard?.writeText(toCsv(params, rows)).then(() => onNotice('CSV copied.'))}>Copy CSV</Button>
                {on('table-reducer') && <Button size="small" onClick={() => { const r = reduceTable(params, rows, t); setHistory([...history.slice(-9), rows]); setRows(r); onNotice(`Removed ${rows.length - r.length} rows; ${t}-way coverage kept.`); }}>Reduce</Button>}
                <Button size="small" disabled={!history.length} onClick={() => { setRows(history[history.length - 1]); setHistory(history.slice(0, -1)); }}>Undo</Button>
                <Button size="small" variant="soft" onClick={() => onOpenDraft(`Feature: Generated\n\n${outline}`, 'Features/Generated.feature')}><FileCode2 size={13} aria-hidden="true" />Open in editor</Button>
              </ResultActions>
            </>
          ) : (
            <p className="subtle">Choose an algorithm and select <b>Generate Examples</b>. Pairwise (IPOG, t = 2) covers every pair of values with a fraction of the rows.</p>
          )}
        </section>
      </div>
      <DecisionTableTool onNotice={onNotice} />
    </div>
  );
}

/** A13 + A14: decision table with Quine–McCluskey minimized rules. */
function DecisionTableTool({ onNotice }: { onNotice: (m: string) => void }) {
  const { on } = useAlgorithms();
  const [conds, setConds] = useLocalState('design:dt:conds', 'member, cartOver100, couponValid');
  const [rule, setRule] = useLocalState('design:dt:rule', 'member or (cartOver100 and couponValid)');
  const names = conds.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
  let expr = null, err = '';
  try { expr = parseTagExpression(rule); } catch (e) { err = (e as Error).message; }
  const table = names.length ? decisionTable(names) : [];
  const outcome = table.map((row) => (expr && !err ? evaluate(expr, (id) => row[names.indexOf(id)] ?? false) : false));
  const minterms = table.map((_, i) => i).filter((i) => outcome[i]);
  const minimized = on('quine-mccluskey') ? quineMcCluskey(names.length, minterms) : [];
  const offMin = on('quine-mccluskey') ? quineMcCluskey(names.length, table.map((_, i) => i).filter((i) => !outcome[i])) : [];
  const cell = (b: 0 | 1 | -1) => (b === -1 ? '-' : b ? 'Y' : 'N');
  const md = [`| ${names.join(' | ')} | outcome |`, ...minimized.map((r) => `| ${r.map(cell).join(' | ')} | yes |`), ...offMin.map((r) => `| ${r.map(cell).join(' | ')} | no |`)].join('\n');
  return (
    <AlgoGate ids={['decision-table']}>
      <section className="panel" aria-labelledby="dt-head">
        <div className="design-head"><h2 id="dt-head"><FlaskConical size={16} aria-hidden="true" /> Decision table</h2><span className="badge">{table.length} combinations → {minimized.length + offMin.length || table.length} rules</span></div>
        <div className="form-grid">
          <label className="field"><span className="micro-label">CONDITIONS (comma-separated, max 8)</span><input value={conds} onChange={(e) => setConds(e.target.value)} /></label>
          <label className="field"><span className="micro-label">OUTCOME IS TRUE WHEN</span><input value={rule} onChange={(e) => setRule(e.target.value)} aria-invalid={!!err || undefined} />{err && <span className="field-error">{err}</span>}</label>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr>{names.map((n) => <th key={n}>{n}</th>)}<th>outcome</th></tr></thead>
            <tbody>
              {(on('quine-mccluskey') ? [...minimized.map((r) => [r, true] as const), ...offMin.map((r) => [r, false] as const)] : table.map((r, i) => [r.map((b) => (b ? 1 : 0)) as (0 | 1 | -1)[], outcome[i]] as const)).map(([r, o], i) => (
                <tr key={i}>{r.map((b, k) => <td key={k} className={b === -1 ? 'dc' : ''}>{cell(b)}</td>)}<td><span className={`badge ${o ? 'green' : 'muted'}`}>{o ? 'yes' : 'no'}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <ResultActions text={md} file="decision-table.md" onNotice={onNotice} />
      </section>
    </AlgoGate>
  );
}
