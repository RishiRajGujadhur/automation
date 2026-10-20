import { useEffect, useState } from 'react';
import { api, type FilePreview } from '../api';
import DiffApproval from '../DiffApproval';

type Item = { action: string; copy: 'Never' | 'Always' | 'PreserveNewest' };
const ACTIONS = ['None', 'Content', 'EmbeddedResource', 'Compile', 'AdditionalFiles'];
const COPY: [Item['copy'], string][] = [['Never', 'Do not copy'], ['PreserveNewest', 'Copy if newer'], ['Always', 'Copy always']];

/** File Properties (Visual Studio): Build Action and Copy to Output Directory, written to the project file after approval. */
export default function FileItemProperties({ project, file, onNotice }: { project: string; file: string; onNotice: (m: string) => void }) {
  const [item, setItem] = useState<Item>();
  const [loaded, setLoaded] = useState<Item>();
  const [preview, setPreview] = useState<FilePreview>();
  const q = `project=${encodeURIComponent(project)}&file=${encodeURIComponent(file)}`;
  useEffect(() => { void api<Item>(`/project/item?${q}`).then((i) => { setItem(i); setLoaded(i); }, (e) => onNotice((e as Error).message)); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return <p className="subtle">Loading…</p>;
  const changed = item.action !== loaded?.action || item.copy !== loaded?.copy;
  return (
    <div className="project-props file-item-props" aria-label={`Properties of ${file}`}>
      <p className="subtle pp-file">{file} · {project}</p>
      <div className="pp-field"><label htmlFor="fi-action">Build Action</label><select id="fi-action" aria-label="Build Action" value={item.action} onChange={(e) => { setPreview(undefined); setItem({ ...item, action: e.target.value }); }}>{[...new Set([...ACTIONS, item.action])].map((a) => <option key={a}>{a}</option>)}</select></div>
      <div className="pp-field"><label htmlFor="fi-copy">Copy to Output Directory</label><select id="fi-copy" aria-label="Copy to Output Directory" value={item.copy} onChange={(e) => { setPreview(undefined); setItem({ ...item, copy: e.target.value as Item['copy'] }); }}>{COPY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="pp-footer"><button className="button primary" disabled={!changed} onClick={() => void api<FilePreview>('/project/item/preview', { project, file, ...item }).then(setPreview, (e) => onNotice((e as Error).message))}>Preview changes</button></div>
      {preview && <DiffApproval preview={preview} height="140px" onApplied={() => { setLoaded(item); setPreview(undefined); onNotice(`${file.split('/').pop()}: Build Action ${item.action}, ${COPY.find((c) => c[0] === item.copy)![1].toLowerCase()}.`); }} />}
    </div>
  );
}
