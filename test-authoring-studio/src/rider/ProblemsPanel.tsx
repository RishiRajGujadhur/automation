import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X, ChevronDown, ChevronRight, CircleX, TriangleAlert, Loader } from 'lucide-react';
import { api } from '../api';
import { fileType } from '../files/fileTypes';
import { useLocalState } from '../ui';

export type Problem = { source: 'C#' | 'Gherkin'; file: string; line: number; column: number; severity: 'error' | 'warning'; id: string; message: string; project?: string };

/**
 * Problems tool window (Rider's solution-wide analysis): C# compiler errors and warnings of every project (Roslyn) and
 * feature steps without a step definition or with several, grouped by file. Click a problem to go there.
 */
export default function ProblemsPanel({ onOpen, onClose }: { onOpen: (file: string, line: number, column: number) => void; onClose: () => void }) {
  const [list, setList] = useState<Problem[]>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useLocalState<{ errors: boolean; warnings: boolean }>('problemsShow', { errors: true, warnings: true });
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const load = () => {
    setLoading(true);
    api<{ problems: Problem[]; csharp?: string }>('/problems').then((r) => { setList(r.problems); setError(r.csharp ?? ''); }, (e) => setError((e as Error).message)).finally(() => setLoading(false));
  };
  useEffect(load, []);
  const groups = useMemo(() => {
    const map = new Map<string, Problem[]>();
    for (const p of list ?? []) if (p.severity === 'error' ? show.errors : show.warnings) map.set(p.file, [...(map.get(p.file) ?? []), p]);
    return [...map].sort(([a], [b]) => a.localeCompare(b));
  }, [list, show]);
  const errors = list?.filter((p) => p.severity === 'error').length ?? 0;
  const warnings = (list?.length ?? 0) - errors;
  return (
    <section className="debug-panel todo-panel problems-panel" aria-label="Problems">
      <div className="debug-toolbar" role="toolbar" aria-label="Problems">
        <strong className="todo-count">{list ? `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}` : 'Analyzing the solution…'}</strong>
        <label className="todo-kind"><input type="checkbox" checked={show.errors} onChange={(e) => setShow({ ...show, errors: e.target.checked })} /> Errors</label>
        <label className="todo-kind"><input type="checkbox" checked={show.warnings} onChange={(e) => setShow({ ...show, warnings: e.target.checked })} /> Warnings</label>
        <button className="icon-button" aria-label="Refresh problems" title="Analyze again" disabled={loading} onClick={load}>{loading ? <Loader size={14} className="spin" /> : <RefreshCw size={14} />}</button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Problems" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      {error && <p className="subtle hierarchy-hint">{error}</p>}
      <ul className="todo-list" aria-label="Problems in the solution">
        {groups.map(([file, items]) => {
          const open = !closed.has(file);
          const t = fileType(file);
          return (
            <li key={file}>
              <button className="todo-file" aria-expanded={open} onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(file)) n.delete(file); else n.add(file); return n; })}>
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<t.icon size={13} style={{ color: t.color }} /> {file} <small>{items.length}</small>
              </button>
              {open && (
                <ul>
                  {items.map((p) => (
                    <li key={`${p.line}:${p.column}:${p.id}:${p.message}`}>
                      <button className="todo-item" onClick={() => onOpen(p.file, p.line, p.column)}>
                        {p.severity === 'error' ? <CircleX size={13} className="problem-error" aria-label="Error" /> : <TriangleAlert size={13} className="problem-warning" aria-label="Warning" />}
                        {p.message} <small>{p.id} ({p.line}, {p.column})</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {list && !groups.length && <li className="subtle">No problems found.</li>}
      </ul>
    </section>
  );
}
