import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { currentFrame, useDebug, type Variable } from '../debug/store';

type Result = { result?: string; type?: string; error?: string; variablesReference?: number };
const HISTORY = 'tas:rider:evaluate';
const readHistory = (): string[] => { try { return JSON.parse(localStorage.getItem(HISTORY) ?? '[]') as string[]; } catch { return []; } };

/** A value whose children (fields, items) load when expanded. */
function Node({ name, value, type, refId, depth }: { name: string; value: string; type?: string; refId: number; depth: number }) {
  const [open, setOpen] = useState(false);
  const [kids, setKids] = useState<Variable[]>();
  const toggle = async () => { setOpen(!open); if (!kids && refId) setKids(await api<Variable[]>('/debug/variables', { ref: refId }).catch(() => [])); };
  return (
    <li role="treeitem" aria-expanded={refId ? open : undefined} aria-label={name}>
      <div className="evaluate-row" style={{ paddingLeft: depth * 14 }}>
        {refId ? <button className="icon-button" aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`} onClick={() => void toggle()}>{open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</button> : <span className="evaluate-leaf" />}
        <strong>{name}</strong> = <code>{value}</code> {type && <small>{type}</small>}
      </div>
      {open && kids && <ul role="group">{kids.map((k) => <Node key={k.name} name={k.name} value={k.value} type={k.type} refId={k.variablesReference} depth={depth + 1} />)}</ul>}
    </li>
  );
}

/** Evaluate Expression (Rider, Alt+F8): any C# expression in the selected stack frame while paused, with its members. */
export default function EvaluateExpression({ initial }: { initial: string }) {
  const debug = useDebug();
  const [expr, setExpr] = useState(initial);
  const [result, setResult] = useState<{ expr: string; r: Result }>();
  const [history, setHistory] = useState(readHistory);
  const [hIndex, setHIndex] = useState(-1);
  const paused = debug.state.status === 'paused';
  const evaluate = async () => {
    const e = expr.trim();
    const frame = currentFrame();
    if (!e || !frame) return;
    const [r] = await api<Result[]>('/debug/evaluate', { expressions: [e], frameId: frame.id }).catch((err) => [{ error: (err as Error).message }]);
    setResult({ expr: e, r });
    const next = [e, ...history.filter((h) => h !== e)].slice(0, 30);
    setHistory(next); setHIndex(-1);
    try { localStorage.setItem(HISTORY, JSON.stringify(next)); } catch { /* storage blocked */ }
  };
  return (
    <div className="evaluate-expression">
      {!paused && <p className="subtle" role="status">Pause the debugger (a breakpoint, or Break All) to evaluate expressions.</p>}
      <div className="evaluate-input">
        <input
          autoFocus
          aria-label="Expression"
          placeholder="Expression, e.g. calculator.First + 1"
          value={expr}
          spellCheck={false}
          onChange={(e) => setExpr(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void evaluate(); }
            else if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); const i = Math.min(history.length - 1, hIndex + 1); setHIndex(i); setExpr(history[i]); }
            else if (e.key === 'ArrowDown' && hIndex >= 0) { e.preventDefault(); const i = hIndex - 1; setHIndex(i); setExpr(i < 0 ? '' : history[i]); }
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="button" disabled={!paused || !expr.trim()} onClick={() => void evaluate()}>Evaluate</button>
      </div>
      {result && (
        result.r.error
          ? <p className="field-error" role="alert">{result.r.error}</p>
          : <ul className="evaluate-result" role="tree" aria-label="Result"><Node name={result.expr} value={result.r.result ?? ''} type={result.r.type} refId={result.r.variablesReference ?? 0} depth={0} /></ul>
      )}
    </div>
  );
}
