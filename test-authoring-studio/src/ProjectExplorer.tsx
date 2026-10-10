import { useEffect, useState } from 'react';
import { Folder, FileCode2, ArrowUp } from 'lucide-react';
import ProjectModelTree, { Indicators, useProjectModel } from './ProjectModelTree';

export default function ProjectExplorer({ revision, onSource }: { revision?: string; onSource: (file: string, line: number) => void }) {
  const [folder, setFolder] = useState('.');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ items: { file: string; name: string; directory: boolean }[]; hasNext: boolean; total: number }>({ items: [], hasNext: false, total: 0 });
  const [error, setError] = useState('');
  const { model } = useProjectModel(revision);
  useEffect(() => {
    const c = new AbortController();
    fetch('/api/project/files?' + new URLSearchParams({ folder, offset: String(offset), limit: '40' }), { signal: c.signal })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw Error(body.error);
        setData(body);
        setError('');
      })
      .catch((e) => { if (!c.signal.aborted) setError(e.message); });
    return () => c.abort();
  }, [folder, offset, revision]);
  return (
    <div className="explorer-layout">
      <section className="panel">
        <div className="panel-heading"><div><h2>Project model</h2></div><span className="badge">Layers §1–3</span></div>
        <div className="wizard-body">
          <Indicators model={model} />
          <ProjectModelTree model={model} onSource={onSource} />
        </div>
      </section>
      <section className="panel project-browser">
        <div className="panel-heading">
          <h2>{folder === '.' ? 'Repository root' : folder}</h2>
          <button className="button tiny" disabled={folder === '.'} onClick={() => { setFolder(folder.split('/').slice(0, -1).join('/') || '.'); setOffset(0); }}><ArrowUp size={14} />Parent folder</button>
        </div>
        {error && <p role="alert" className="inline-error">{error}</p>}
        <div className="project-files">
          {data.items.map((e) => (
            <button key={e.file} onClick={() => { if (e.directory) { setFolder(e.file); setOffset(0); } else onSource(e.file, 1); }}>
              {e.directory ? <Folder size={17} /> : <FileCode2 size={17} />}
              <span>{e.name}</span>
              <small>{e.directory ? 'Folder' : 'View source'}</small>
            </button>
          ))}
        </div>
        <div className="pagination">
          <button className="button small" disabled={!offset} onClick={() => setOffset(offset - 40)}>Previous</button>
          <span>{data.total} entries</span>
          <button className="button small" disabled={!data.hasNext} onClick={() => setOffset(offset + 40)}>Next</button>
        </div>
      </section>
    </div>
  );
}
