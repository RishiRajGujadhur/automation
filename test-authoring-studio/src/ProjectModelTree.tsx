import { useEffect, useState } from 'react';
import { Folder, FileCode2, ChevronRight, ChevronDown, CircleCheck, CircleDashed } from 'lucide-react';
import { api, type ProjectModel } from './api';

const order = ['Feature', 'Step', 'UI', 'Selector data', 'Support', 'Config', 'Data', 'Build', 'Output', 'Other'];

export function useProjectModel(revision = '') {
  const [model, setModel] = useState<ProjectModel>();
  const [error, setError] = useState('');
  useEffect(() => {
    const c = new AbortController();
    api<ProjectModel>('/project/model', undefined, c.signal)
      .then((m) => { setModel(m); setError(''); })
      .catch((e) => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [revision]);
  return { model, error };
}

/** Repository files grouped by architectural layer (rules §1–3), highlighting files the current test touches. */
export default function ProjectModelTree({ model, highlight = [], onSource, compact = false }: { model?: ProjectModel; highlight?: string[]; onSource?: (file: string, line: number) => void; compact?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ Feature: true, Step: true, UI: true, 'Selector data': true, Support: true, Build: true });
  if (!model) return <p className="subtle">Loading project model…</p>;
  const groups = order.filter((l) => model.layers[l]).filter((l) => !compact || l !== 'Other');
  return (
    <div className="model-tree" aria-label="Project model">
      <div className="model-root">
        <Folder size={15} />
        <strong>{model.root}/</strong>
      </div>
      {groups.map((layer) => {
        const files = model.files.filter((f) => f.layer === layer);
        const shown = compact ? files.filter((f) => highlight.includes(f.file)).concat(files.filter((f) => !highlight.includes(f.file))).slice(0, 6) : files;
        return (
          <div className="model-layer" key={layer}>
            <button className="model-layer-toggle" aria-expanded={!!open[layer]} onClick={() => setOpen({ ...open, [layer]: !open[layer] })}>
              {open[layer] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <Folder size={14} />
              {layer}
              <span className="nav-count">{files.length}</span>
            </button>
            {open[layer] && (
              <ul>
                {shown.map((f) => (
                  <li key={f.file}>
                    <button className={highlight.includes(f.file) ? 'highlight' : ''} onClick={() => onSource?.(f.file, 1)} title={f.file}>
                      <FileCode2 size={13} />
                      <span>{f.file}</span>
                    </button>
                  </li>
                ))}
                {shown.length < files.length && <li className="subtle">+{files.length - shown.length} more</li>}
              </ul>
            )}
          </div>
        );
      })}
      {model.truncated && <p className="subtle">Listing truncated at 4,000 files.</p>}
    </div>
  );
}

export function Indicators({ model }: { model?: ProjectModel }) {
  if (!model) return null;
  return (
    <ul className="indicator-list">
      {model.indicators.map((i) => (
        <li key={i.label} className={i.ok ? 'ok' : ''}>
          {i.ok ? <CircleCheck size={14} /> : <CircleDashed size={14} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}
