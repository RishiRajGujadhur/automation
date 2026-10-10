import { useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { oneDark } from '@codemirror/theme-one-dark';
import { FileCode2, Save, TriangleAlert, Check } from 'lucide-react';
import { api, type FilePreview } from './api';
import type { Index } from './types';
import { Button } from './radix';
import { labelled } from './editor/a11y';

/** Shows one previewed file diff; approval is the only write and consumes the one-time preview token. */
export default function DiffApproval({ preview, onApplied, height = '260px' }: { preview: FilePreview; onApplied?: (index: Index) => void; height?: string }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');
  return (
    <div className="diff-approval">
      <div className="info-box">
        <FileCode2 size={16} />
        {preview.file}
        {preview.created && <span className="badge green">new file</span>}
      </div>
      {preview.changes?.map((c) => (
        <div className="info-box" key={c}>
          <Check size={14} />
          {c}
        </div>
      ))}
      {preview.notes?.map((n) => (
        <div className="info-box" key={n}>
          <TriangleAlert size={14} />
          {n}
        </div>
      ))}
      <CodeMirror value={preview.diff} theme={oneDark} extensions={[StreamLanguage.define(diffMode), labelled(`Diff for ${preview.file}`, true)]} height={height} editable={false} />
      {error && <p role="alert" className="inline-error">{error}</p>}
      <Button
        variant="primary"
        disabled={state !== 'idle' || !preview.changed}
        onClick={async () => {
          setState('busy');
          setError('');
          try {
            const r = await api('/generation/apply', { id: preview.id, approved: true });
            setState('done');
            onApplied?.(r.index);
          } catch (e) {
            setError((e as Error).message);
            setState('idle');
          }
        }}
      >
        <Save size={15} />
        {state === 'done' ? 'Written' : `Approve and write ${preview.file.split('/').pop()}`}
      </Button>
    </div>
  );
}
