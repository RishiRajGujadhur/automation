import { useEffect, useState } from 'react';
import { api } from '../api';
import { apiChanges } from './analysis400';

type Project = { project: string; baselineFile: string; hasBaseline: boolean; api: string[]; baseline: string[] | null };
/**
 * Public API (Microsoft's PublicAPI analyzers, Rider's API change tracking): each project's public API against its
 * PublicAPI.Shipped.txt baseline; removed and changed members are breaking changes. Save Baseline writes the file (with
 * a diff to approve).
 */
export default function PublicApi({ onNotice }: { onNotice: (m: string) => void }) {
  const [projects, setProjects] = useState<Project[]>();
  const [error, setError] = useState('');
  useEffect(() => { api<Project[]>('/csharp/analysis/publicApi').then(setProjects, (e) => setError((e as Error).message)); }, []);
  const saveBaseline = async (p: Project) => {
    try {
      const pv = await api<{ id: string }>('/file/preview', { file: p.baselineFile, source: `${p.api.join('\n')}\n` });
      window.dispatchEvent(new CustomEvent('tas:project-previews', { detail: { title: `Public API baseline: ${p.baselineFile}`, previews: [pv] } }));
    } catch (e) { onNotice((e as Error).message); }
  };
  if (!projects) return <p className="subtle">{error || 'Reading the public API…'}</p>;
  return (
    <div className="public-api" aria-label="Public API">
      {projects.map((p) => {
        const c = p.baseline ? apiChanges(p.api, p.baseline) : null;
        const breaking = c ? c.removed.length + c.changed.length : 0;
        return (
          <section key={p.project} className="public-api-project" aria-label={`Public API of ${p.project}`}>
            <h3>{p.project} <small className="meta">{p.api.length} public members · {p.hasBaseline ? p.baselineFile : 'no baseline yet'}</small></h3>
            <p role="status" className={breaking ? 'field-error' : 'subtle'}>{!c ? 'No baseline: save one to track changes.' : breaking ? `${breaking} breaking change${breaking === 1 ? '' : 's'} (removed or changed members).` : c.added.length ? `${c.added.length} new member${c.added.length === 1 ? '' : 's'}; nothing breaking.` : 'No changes since the baseline.'}</p>
            {c && (
              <ul className="public-api-changes">
                {c.removed.map((l) => <li key={`r${l}`} className="api-removed"><strong>Removed (breaking):</strong> <code>{l}</code></li>)}
                {c.changed.map((x) => <li key={`c${x.before}`} className="api-changed"><strong>Changed (breaking):</strong> <code>{x.before}</code> → <code>{x.after}</code></li>)}
                {c.added.map((l) => <li key={`a${l}`} className="api-added"><strong>Added:</strong> <code>{l}</code></li>)}
              </ul>
            )}
            <button className="button" onClick={() => void saveBaseline(p)}>{p.hasBaseline ? 'Update Baseline…' : 'Save Baseline…'}</button>
          </section>
        );
      })}
    </div>
  );
}
