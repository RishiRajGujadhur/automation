import { useMemo, useState } from 'react';
import { Filter, ClipboardList, Grid3x3, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '../radix';
import { Meter, useAlgorithms } from '../radix2';
import { useLocalState, clearOnEscape } from '../ui';
import { cooccurrence, matchTags, parseTagExpression, type Expr } from '../algorithms/tags';
import { AlgoGate, Empty, ResultActions, type Corpus, type ToolProps } from './shared';

type SavedFilter = { name: string; expr: string; folder: string };
type PlanStatus = 'untested' | 'passed' | 'failed' | 'blocked';
type Plan = { id: string; name: string; filter: SavedFilter; created: number; status: Record<string, PlanStatus> };
export type ScenarioRef = { id: string; file: string; line: number; name: string; tags: string[] };

export function scenarioRefs(corpus?: Corpus): ScenarioRef[] {
  return (corpus?.features ?? []).flatMap((f) => f.scenarios.map((s) => ({ id: `${f.file}:${s.line}`, file: f.file, line: s.line, name: s.name, tags: [...new Set([...f.tags, ...(s.tags ?? [])])] })));
}
export function applyFilter(items: ScenarioRef[], expr: Expr | null, folder: string) {
  return items.filter((s) => (!folder || s.file.startsWith(folder + '/')) && matchTags(expr, s.tags));
}

/** F8: tag-expression filters, saved filters and test plans / cycles. */
export default function PlansTool({ corpus, onNotice, onSource }: ToolProps) {
  const { on } = useAlgorithms();
  const [expr, setExpr] = useLocalState('design:plans:expr', '');
  const [folder, setFolder] = useLocalState('design:plans:folder', '');
  const [saved, setSaved] = useLocalState<SavedFilter[]>('design:filters', []);
  const [plans, setPlans] = useLocalState<Plan[]>('design:plans', []);
  const [active, setActive] = useLocalState('design:plans:active', '');
  const [name, setName] = useState('');
  const refs = useMemo(() => scenarioRefs(corpus), [corpus]);
  const folders = useMemo(() => [...new Set(refs.map((r) => r.file.split('/').slice(0, -1).join('/')).filter(Boolean))].sort(), [refs]);
  let parsed: Expr | null = null, err = '';
  if (on('tag-expression')) { try { parsed = parseTagExpression(expr); } catch (e) { err = (e as Error).message; } }
  const matches = err ? [] : applyFilter(refs, parsed, folder);
  const allTags = [...new Set(refs.flatMap((r) => r.tags))].sort();
  const plan = plans.find((p) => p.id === active);
  const planItems = plan ? applyFilter(refs, (() => { try { return parseTagExpression(plan.filter.expr); } catch { return null; } })(), plan.filter.folder) : [];
  const setStatus = (id: string, s: PlanStatus) => setPlans(plans.map((p) => (p.id === active ? { ...p, status: { ...p.status, [id]: s } } : p)));
  const counts = planItems.reduce<Record<PlanStatus, number>>((m, s) => { const st = plan?.status[s.id] ?? 'untested'; m[st]++; return m; }, { untested: 0, passed: 0, failed: 0, blocked: 0 });
  const report = plan ? [`# ${plan.name}`, `Filter: ${plan.filter.expr || '(all)'} ${plan.filter.folder}`, '', ...planItems.map((s) => `- [${plan.status[s.id] ?? 'untested'}] ${s.name} (${s.id})`)].join('\n') : '';
  if (!corpus) return <p className="subtle">Loading scenarios…</p>;
  return (
    <div className="design-tool">
      <section className="panel" aria-labelledby="plans-filter">
        <div className="design-head"><h2 id="plans-filter"><Filter size={16} aria-hidden="true" /> Filter scenarios</h2><span className="badge">{matches.length} of {refs.length}</span></div>
        <div className="design-options">
          <AlgoGate ids={['tag-expression']} compact>
            <label className="field grow"><span className="micro-label">TAG EXPRESSION</span><input value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={clearOnEscape(expr, setExpr)} placeholder="@smoke and not (@slow or @wip)" aria-invalid={!!err || undefined} />{err && <span className="field-error">{err}</span>}</label>
          </AlgoGate>
          <label className="field"><span className="micro-label">FOLDER</span><select value={folder} onChange={(e) => setFolder(e.target.value)}><option value="">All folders</option>{folders.map((f) => <option key={f}>{f}</option>)}</select></label>
        </div>
        {allTags.length > 0 && <div className="chip-row" aria-label="Insert tag">{allTags.slice(0, 30).map((t) => <button key={t} className="chip" onClick={() => setExpr(expr.trim() ? `${expr.trim()} and ${t}` : t)}>{t}</button>)}</div>}
        <div className="button-row">
          <input aria-label="Filter name" placeholder="Name this filter" value={name} onChange={(e) => setName(e.target.value)} />
          <Button size="small" disabled={!name.trim() || !!err} onClick={() => { setSaved([...saved.filter((s) => s.name !== name.trim()), { name: name.trim(), expr, folder }]); setName(''); onNotice('Filter saved.'); }}><Save size={13} aria-hidden="true" />Save filter</Button>
          <Button size="small" variant="soft" disabled={!!err || !matches.length} onClick={() => { const p: Plan = { id: String(Date.now()), name: name.trim() || `Test cycle ${plans.length + 1}`, filter: { name: name.trim(), expr, folder }, created: Date.now(), status: {} }; setPlans([...plans, p]); setActive(p.id); setName(''); onNotice(`Plan "${p.name}" created with ${matches.length} scenarios.`); }}><Plus size={13} aria-hidden="true" />Create test plan</Button>
        </div>
        {saved.length > 0 && <div className="chip-row" aria-label="Saved filters">{saved.map((s) => <span key={s.name} className="chip saved"><button className="text-button" onClick={() => { setExpr(s.expr); setFolder(s.folder); }}>{s.name}</button><button className="icon-button tiny" aria-label={`Delete filter ${s.name}`} onClick={() => setSaved(saved.filter((x) => x !== s))}><Trash2 size={11} /></button></span>)}</div>}
        {!matches.length ? <Empty title="No scenarios match">Loosen the expression or choose another folder.</Empty> : (
          <ul className="suite-list">{matches.slice(0, 80).map((s) => <li key={s.id}><button className="text-button" onClick={() => onSource(s.file, s.line)}>{s.name}</button> <span className="meta">{s.tags.join(' ')}</span></li>)}</ul>
        )}
      </section>
      <section className="panel" aria-labelledby="plans-plans">
        <div className="design-head"><h2 id="plans-plans"><ClipboardList size={16} aria-hidden="true" /> Test plans & cycles</h2>{plans.length > 0 && <select aria-label="Active plan" value={active} onChange={(e) => setActive(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}</div>
        {!plan ? <Empty title="No plan selected">Build a filter above and select <b>Create test plan</b> to track a manual or regression cycle.</Empty> : (
          <>
            <div className="coverage-meter">
              <span>{counts.passed} passed · {counts.failed} failed · {counts.blocked} blocked · {counts.untested} untested</span>
              <Meter value={planItems.length - counts.untested} max={planItems.length || 1} label="Plan progress" tone="purple" />
            </div>
            <ul className="plan-list">
              {planItems.map((s) => (
                <li key={s.id}>
                  <button className="text-button" onClick={() => onSource(s.file, s.line)}>{s.name}</button>
                  <select aria-label={`Status of ${s.name}`} className={`status-${plan.status[s.id] ?? 'untested'}`} value={plan.status[s.id] ?? 'untested'} onChange={(e) => setStatus(s.id, e.target.value as PlanStatus)}>
                    {(['untested', 'passed', 'failed', 'blocked'] as PlanStatus[]).map((x) => <option key={x}>{x}</option>)}
                  </select>
                </li>
              ))}
            </ul>
            <ResultActions text={report} file={`${plan.name.replace(/\W+/g, '-')}.md`} onNotice={onNotice}>
              <Button size="small" variant="ghost" onClick={() => { setPlans(plans.filter((p) => p.id !== active)); setActive(''); }}><Trash2 size={13} aria-hidden="true" />Delete plan</Button>
            </ResultActions>
          </>
        )}
      </section>
      <AlgoGate ids={['tag-cooccurrence']}><Cooccurrence refs={refs} /></AlgoGate>
    </div>
  );
}

function Cooccurrence({ refs }: { refs: ScenarioRef[] }) {
  const { tags, matrix } = useMemo(() => cooccurrence(refs.map((r) => r.tags)), [refs]);
  const top = tags.map((t, i) => ({ t, i, n: matrix[i][i] })).sort((a, b) => b.n - a.n).slice(0, 12);
  const max = Math.max(1, ...top.flatMap((a) => top.map((b) => (a.i === b.i ? 0 : matrix[a.i][b.i]))));
  return (
    <section className="panel" aria-labelledby="plans-co">
      <div className="design-head"><h2 id="plans-co"><Grid3x3 size={16} aria-hidden="true" /> Tag co-occurrence</h2></div>
      {top.length < 2 ? <Empty title="Not enough tags">Tag at least two scenarios with two different tags.</Empty> : (
        <div className="table-scroll">
          <table className="data-table heat">
            <thead><tr><th />{top.map((c) => <th key={c.t} scope="col">{c.t}</th>)}</tr></thead>
            <tbody>{top.map((r) => <tr key={r.t}><th scope="row">{r.t}</th>{top.map((c) => { const v = matrix[r.i][c.i]; return <td key={c.t} style={r.i === c.i ? undefined : { background: `color-mix(in srgb, var(--accent) ${Math.round((v / max) * 60)}%, transparent)` }} title={`${r.t} with ${c.t}: ${v}`}>{v || ''}</td>; })}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
