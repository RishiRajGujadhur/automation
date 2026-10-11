import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import { Button } from '../radix';
import { IconButton } from '../radix2';
import type { Index } from '../types';

type Preview = { binding: { before: string; after: string }; steps: { file: string; line: number; before: string; after: string }[]; unmatched: number };

/**
 * Rename Step: edit a step definition's pattern; every feature line bound to it is previewed (before → after,
 * parameter values kept) and written with the attribute on Apply.
 */
export default function RenameStep({ file, line, pattern, beforeApply, onDone, onClose, onNotice }: { file: string; line: number; pattern: string; beforeApply: () => Promise<boolean>; onDone: (written: string[], index: Index) => void; onClose: () => void; onNotice: (m: string) => void }) {
  const [value, setValue] = useState(pattern);
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value.trim() === pattern) { setPreview(undefined); setError(''); return; }
    const t = setTimeout(() => api<Preview>('/steps/rename', { file, line, newPattern: value }).then((p) => { setPreview(p); setError(''); }, (e) => { setPreview(undefined); setError((e as Error).message); }), 300);
    return () => clearTimeout(t);
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = async () => {
    setBusy(true);
    try {
      if (!(await beforeApply())) return;
      const r = await api<{ written: string[]; steps: number; index: Index }>('/steps/rename', { file, line, newPattern: value, apply: true });
      onNotice(`Renamed the step: ${r.steps} feature line${r.steps === 1 ? '' : 's'} updated in ${r.written.length - 1} file${r.written.length === 2 ? '' : 's'}.`);
      onDone(r.written, r.index);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <section className="rename-step" aria-label="Rename Step" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      <div className="rename-step-head">
        <strong>Rename Step</strong>
        <IconButton label="Close Rename Step" onClick={onClose}><X size={13} /></IconButton>
      </div>
      <input aria-label="Step pattern" value={value} onChange={(e) => setValue(e.target.value)} autoFocus spellCheck={false} onKeyDown={(e) => { if (e.key === 'Enter' && preview && !busy) void apply(); }} />
      {error && <p className="field-error" role="alert">{error}</p>}
      {preview && (
        <>
          <ul className="rename-step-list" aria-label="Changes">
            <li><code className="before">{preview.binding.before}</code><code className="after">{preview.binding.after}</code></li>
            {preview.steps.map((s) => <li key={`${s.file}:${s.line}`}><span className="meta">{s.file}:{s.line}</span><code className="before">{s.before}</code><code className="after">{s.after}</code></li>)}
          </ul>
          {preview.unmatched > 0 && <p className="meta">{preview.unmatched} bound line{preview.unmatched === 1 ? '' : 's'} could not be re-worded (pattern did not match the text) and stay as they are.</p>}
          <Button variant="primary" disabled={busy} onClick={() => void apply()}>Apply ({preview.steps.length + 1} change{preview.steps.length ? 's' : ''})</Button>
        </>
      )}
    </section>
  );
}
