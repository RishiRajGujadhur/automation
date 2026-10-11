import { useMemo } from 'react';
import { Binary, GitBranch, Ruler, ListTree, Bug, Copy as CopyIcon } from 'lucide-react';
import { useAlgorithms } from '../radix2';
import { useLocalState, copyText } from '../ui';
import { causeEffect, classificationParams, conditionCoverage, decisionCoverage, domainPoints, mcdc, multipleCondition, parseClassificationTree, valueCatalog, type LogicRow } from '../algorithms/logic';
import { eachChoice, ipog, toExamples } from '../algorithms/combinatorial';
import { AlgoGate, AlgoPicker, Empty, ResultActions, usePicked, type ToolProps } from './shared';

const criteria = ['mcdc', 'condition-coverage', 'decision-coverage', 'multiple-condition'];
const yn = (b: boolean | null) => (b === null ? '-' : b ? 'Y' : 'N');

/** J1–J8: logic coverage, cause–effect graphs, classification trees, domain points and test-value heuristics. */
export default function LogicTool({ onNotice }: ToolProps) {
  return (
    <div className="design-tool">
      <LogicCoverage onNotice={onNotice} />
      <AlgoGate ids={['cause-effect']}><CauseEffect onNotice={onNotice} /></AlgoGate>
      <AlgoGate ids={['classification-tree']}><ClassificationTree onNotice={onNotice} /></AlgoGate>
      <AlgoGate ids={['domain-testing']}><Domain onNotice={onNotice} /></AlgoGate>
      <AlgoGate ids={['value-catalog']}><Catalog onNotice={onNotice} /></AlgoGate>
    </div>
  );
}

function LogicCoverage({ onNotice }: { onNotice: (m: string) => void }) {
  const [rule, setRule] = useLocalState('design:logic:rule', 'member and (cartOver100 or couponValid)');
  const crit = usePicked('logic', criteria);
  const { rows, pairs, error } = useMemo(() => {
    try {
      if (crit === 'mcdc') { const r = mcdc(rule); return { rows: r.rows, pairs: r.pairs, error: '' }; }
      const rows: LogicRow[] = crit === 'condition-coverage' ? conditionCoverage(rule) : crit === 'decision-coverage' ? decisionCoverage(rule) : multipleCondition(rule);
      return { rows, pairs: undefined, error: '' };
    } catch (e) { return { rows: [] as LogicRow[], pairs: undefined, error: (e as Error).message }; }
  }, [rule, crit]);
  const names = Object.keys(rows[0]?.values ?? {});
  const md = rows.length ? [`| ${names.join(' | ')} | outcome |`, ...rows.map((r) => `| ${names.map((n) => (r.values[n] ? 'true' : 'false')).join(' | ')} | ${r.outcome} |`)].join('\n') : '';
  return (
    <section className="panel" aria-labelledby="lg-head">
      <div className="design-head"><h2 id="lg-head"><Binary size={16} aria-hidden="true" /> Logic coverage</h2>{rows.length > 0 && <span className="badge">{rows.length} of {2 ** names.length} combinations</span>}</div>
      <p className="subtle">Write the business rule with <code>and</code>, <code>or</code>, <code>not</code> and parentheses. The table is what to test.</p>
      <div className="design-options">
        <label className="field grow"><span className="micro-label">RULE</span><input value={rule} onChange={(e) => setRule(e.target.value)} aria-invalid={!!error || undefined} />{error && <span className="field-error">{error}</span>}</label>
        <AlgoPicker id="logic" label="CRITERION" options={criteria} />
      </div>
      {!rows.length ? <Empty title="No rows">Enter a rule such as <code>a and (b or c)</code>.</Empty> : (
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>#</th>{names.map((n) => <th key={n}>{n}</th>)}<th>outcome</th>{pairs && <th>shows independence of</th>}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{i + 1}</td>{names.map((n) => <td key={n}>{yn(r.values[n])}</td>)}<td><span className={`badge ${r.outcome ? 'green' : 'muted'}`}>{String(r.outcome)}</span></td>{pairs && <td className="meta">{r.note}</td>}</tr>)}</tbody>
          </table>
        </div>
      )}
      {pairs && Object.entries(pairs).some(([, p]) => !p) && <p className="warn-text">No independence pair for {Object.entries(pairs).filter(([, p]) => !p).map(([c]) => c).join(', ')}: that condition can never change the outcome (masked or redundant).</p>}
      <ResultActions text={md} file="logic-coverage.md" onNotice={onNotice} />
    </section>
  );
}

function CauseEffect({ onNotice }: { onNotice: (m: string) => void }) {
  const [causes, setCauses] = useLocalState('design:ce:causes', 'validCard, sufficientFunds, fraudSuspected');
  const [effects, setEffects] = useLocalState('design:ce:effects', 'approve = validCard and sufficientFunds and not fraudSuspected\nreview = fraudSuspected\ndecline = not validCard or not sufficientFunds');
  const names = causes.split(',').map((s) => s.trim()).filter(Boolean);
  const parsed = effects.split('\n').map((l) => /^\s*([\w-]+)\s*=\s*(.+)$/.exec(l)).filter(Boolean).map((m) => ({ name: m![1], when: m![2] }));
  let table: ReturnType<typeof causeEffect> = [], error = '';
  try { table = names.length ? causeEffect(names, parsed) : []; } catch (e) { error = (e as Error).message; }
  const md = table.length ? [`| ${names.join(' | ')} | ${parsed.map((e) => e.name).join(' | ')} |`, ...table.map((r) => `| ${names.map((n) => yn(r.values[n])).join(' | ')} | ${parsed.map((e) => (r.effects[e.name] ? 'X' : '')).join(' | ')} |`)].join('\n') : '';
  return (
    <section className="panel" aria-labelledby="ce-head">
      <div className="design-head"><h2 id="ce-head"><GitBranch size={16} aria-hidden="true" /> Cause–effect graph</h2><span className="badge">{table.length} rules from {2 ** names.length} combinations</span></div>
      <div className="form-grid">
        <label className="field"><span className="micro-label">CAUSES</span><input value={causes} onChange={(e) => setCauses(e.target.value)} /></label>
        <label className="field"><span className="micro-label">EFFECTS (name = rule, one per line)</span><textarea rows={3} value={effects} onChange={(e) => setEffects(e.target.value)} spellCheck={false} /></label>
      </div>
      {error && <p className="field-error">{error}</p>}
      {table.length > 0 && (
        <div className="table-scroll"><table className="data-table">
          <thead><tr>{names.map((n) => <th key={n}>{n}</th>)}{parsed.map((e) => <th key={e.name}>{e.name}</th>)}</tr></thead>
          <tbody>{table.map((r, i) => <tr key={i}>{names.map((n) => <td key={n} className={r.values[n] === null ? 'dc' : ''}>{yn(r.values[n])}</td>)}{parsed.map((e) => <td key={e.name}>{r.effects[e.name] ? <span className="badge green">X</span> : ''}</td>)}</tr>)}</tbody>
        </table></div>
      )}
      {table.some((r) => !Object.values(r.effects).some(Boolean)) && <p className="warn-text">Some combinations trigger no effect: the specification may be incomplete.</p>}
      <ResultActions text={md} file="cause-effect.md" onNotice={onNotice} />
    </section>
  );
}

function ClassificationTree({ onNotice }: { onNotice: (m: string) => void }) {
  const { on } = useAlgorithms();
  const [text, setText] = useLocalState('design:ctm', 'Customer:\n  Guest\n  Member\n  Employee\nPayment:\n  Card\n  PayPal\n  Invoice\nDelivery:\n  Standard\n  Express\n');
  const [mode, setMode] = useLocalState<'minimal' | 'pairwise'>('design:ctm:mode', 'minimal');
  const tree = parseClassificationTree(text);
  const params = classificationParams(tree);
  const rows = !params.length ? [] : mode === 'pairwise' && on('ipog') ? ipog(params, 2) : eachChoice(params);
  const table = rows.length ? toExamples(params, rows) : '';
  return (
    <section className="panel" aria-labelledby="ctm-head">
      <div className="design-head"><h2 id="ctm-head"><ListTree size={16} aria-hidden="true" /> Classification tree</h2><span className="badge">{tree.length} classifications · {rows.length} test cases</span></div>
      <div className="design-columns">
        <textarea className="mono" rows={10} value={text} onChange={(e) => setText(e.target.value)} aria-label="Classification tree outline" spellCheck={false} />
        <div>
          <div className="chip-row" role="group" aria-label="Combination rule">
            <button className={`chip ${mode === 'minimal' ? 'active' : ''}`} aria-pressed={mode === 'minimal'} onClick={() => setMode('minimal')}>Minimal (each class once)</button>
            <button className={`chip ${mode === 'pairwise' ? 'active' : ''}`} aria-pressed={mode === 'pairwise'} onClick={() => setMode('pairwise')} disabled={!on('ipog')}>Pairwise</button>
          </div>
          {table ? <pre className="code-block" tabIndex={0} aria-label="Classification tree test cases">{table}</pre> : <Empty title="No classes">Classification lines end with a colon; classes are indented below.</Empty>}
        </div>
      </div>
      <ResultActions text={table} file="classification-tree.txt" onNotice={onNotice} />
    </section>
  );
}

function Domain({ onNotice }: { onNotice: (m: string) => void }) {
  const [conds, setConds] = useLocalState('design:domain', 'age >= 18\nquantity <= 10\ntotal > 100');
  const out = conds.split('\n').filter((l) => l.trim()).map((c) => { try { return { c, points: domainPoints(c), error: '' }; } catch (e) { return { c, points: [], error: (e as Error).message }; } });
  const md = out.flatMap((o) => o.points.map((p) => `| ${o.c} | ${p.kind} | ${p.value} | ${p.satisfies ? 'accept' : 'reject'} |`)).join('\n');
  return (
    <section className="panel" aria-labelledby="dom-head">
      <div className="design-head"><h2 id="dom-head"><Ruler size={16} aria-hidden="true" /> Domain testing</h2></div>
      <textarea className="mono" rows={3} value={conds} onChange={(e) => setConds(e.target.value)} aria-label="Boundary conditions" spellCheck={false} />
      <table className="data-table"><thead><tr><th>Condition</th><th>Point</th><th>Value</th><th>Expected</th></tr></thead>
        <tbody>{out.flatMap((o) => (o.error ? [<tr key={o.c}><td>{o.c}</td><td colSpan={3} className="field-error">{o.error}</td></tr>] : o.points.map((p) => <tr key={o.c + p.kind}><td>{o.c}</td><td>{p.kind}</td><td>{p.value}</td><td><span className={`badge ${p.satisfies ? 'green' : 'amber'}`}>{p.satisfies ? 'accept' : 'reject'}</span></td></tr>)))}</tbody>
      </table>
      <ResultActions text={md} file="domain-points.md" onNotice={onNotice} />
    </section>
  );
}

function Catalog({ onNotice }: { onNotice: (m: string) => void }) {
  const [type, setType] = useLocalState('design:catalog', 'string');
  return (
    <section className="panel" aria-labelledby="cat-head">
      <div className="design-head"><h2 id="cat-head"><Bug size={16} aria-hidden="true" /> Tricky values</h2></div>
      <div className="chip-row" role="group" aria-label="Value type">{Object.keys(valueCatalog).map((t) => <button key={t} className={`chip ${type === t ? 'active' : ''}`} aria-pressed={type === t} onClick={() => setType(t)}>{t}</button>)}</div>
      <ul className="lib-list">{(valueCatalog[type] ?? []).map((v) => <li key={v}><code className="conv-out">{v.length > 60 ? v.slice(0, 60) + '…' : v}</code><button className="icon-button" aria-label={`Copy ${v.slice(0, 20)}`} onClick={() => copyText(v).then(() => onNotice('Value copied.'))}><CopyIcon size={13} /></button></li>)}</ul>
      <ResultActions text={(valueCatalog[type] ?? []).join(', ')} file={`${type}-values.txt`} onNotice={onNotice} />
    </section>
  );
}
