import { useEffect, useState } from 'react';
import { Copy, FileCode2 } from 'lucide-react';
import { api, type FilePreview } from './api';
import DiffApproval from './DiffApproval';
import { Button } from './radix';
import { copyText } from './ui';
import type { Index } from './types';

type Unbound = { keyword: string; text: string; line: number; arg?: 'table' | 'docString' };
const pascal = (s: string) => s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'New';

/**
 * Define Steps… (Reqnroll for Visual Studio): skeleton step definitions for the feature's unbound steps. Choose the
 * steps, a class name and a file; Create previews the new (or extended) file, or copy the methods to the clipboard.
 */
// The folder most step definitions live in (new step files go there).
const folderOf = (files: string[]) => { const counts = new Map<string, number>(); for (const f of files) { const d = f.split('/').slice(0, -1).join('/'); counts.set(d, (counts.get(d) ?? 0) + 1); } return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Steps'; };

export default function DefineSteps({ feature, onApplied, onNotice }: { feature: string; onApplied: (index: Index, file: string) => void; onNotice: (m: string) => void }) {
  const [steps, setSteps] = useState<Unbound[]>();
  const [stepFiles, setStepFiles] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState<number[]>([]);
  const [className, setClassName] = useState('');
  const [file, setFile] = useState('');
  const [preview, setPreview] = useState<FilePreview & { count: number }>();
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ feature: string; steps: Unbound[]; files: string[] }>(`/steps/unbound?file=${encodeURIComponent(feature)}`).then((r) => {
      setSteps(r.steps); setName(r.feature); setChosen(r.steps.map((s) => s.line)); setStepFiles(r.files);
      const folder = folderOf(r.files);
      const cls = `${pascal(r.feature)}Steps`; setClassName(cls); setFile(`${folder ? `${folder}/` : ''}${cls}.cs`);
    }, (e) => setError((e as Error).message));
  }, [feature]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setPreview(undefined), [chosen, className, file]);
  const body = () => ({ feature, lines: chosen, file: file.trim(), className: className.trim() });
  const run = async (copy: boolean) => {
    setError('');
    try {
      const r = await api<FilePreview & { count: number; methods: string }>('/steps/define', body());
      if (copy) { onNotice((await copyText(r.methods)) ? `${r.count} method${r.count === 1 ? '' : 's'} copied.` : 'Clipboard unavailable.'); return; }
      setPreview(r);
    } catch (e) { setError((e as Error).message); }
  };
  if (!steps) return <p className="subtle">{error || 'Finding unbound steps…'}</p>;
  if (!steps.length) return <p className="subtle">Every step of {name} has a step definition.</p>;
  return (
    <div className="define-steps">
      <p className="subtle">{steps.length} step{steps.length === 1 ? '' : 's'} of <strong>{name}</strong> without a step definition.</p>
      <ul aria-label="Unbound steps">
        {steps.map((s) => (
          <li key={s.line}>
            <label>
              <input type="checkbox" checked={chosen.includes(s.line)} onChange={(e) => setChosen(e.target.checked ? [...chosen, s.line] : chosen.filter((l) => l !== s.line))} />
              <code>{s.keyword} {s.text}</code>
              {s.arg && <small>{s.arg === 'table' ? 'data table' : 'doc string'}</small>}
              <small>line {s.line}</small>
            </label>
          </li>
        ))}
      </ul>
      <div className="form-grid">
        <label className="field">CLASS NAME<input aria-label="Class name" value={className} onChange={(e) => setClassName(e.target.value)} spellCheck={false} /></label>
        <label className="field">FILE<input aria-label="Step definition file" value={file} onChange={(e) => setFile(e.target.value)} list="define-step-files" spellCheck={false} /></label>
        <datalist id="define-step-files">{stepFiles.map((f) => <option key={f} value={f} />)}</datalist>
      </div>
      <p className="field-hint">An existing file gets the methods appended to its [Binding] class.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!preview ? (
        <div className="define-actions">
          <Button variant="primary" disabled={!chosen.length || !className.trim() || !file.trim()} onClick={() => void run(false)}><FileCode2 size={15} /> Create…</Button>
          <Button variant="ghost" disabled={!chosen.length} onClick={() => void run(true)}><Copy size={15} /> Copy methods to clipboard</Button>
        </div>
      ) : (
        <DiffApproval preview={preview} height="300px" onApplied={(index) => onApplied(index, preview.file)} />
      )}
    </div>
  );
}
