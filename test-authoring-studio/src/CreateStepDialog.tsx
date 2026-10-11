import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { FileCode2, X } from 'lucide-react';
import { api, type FilePreview } from './api';
import { Button, Select } from './radix';
import { Segmented } from './radix2';
import DiffApproval from './DiffApproval';
import type { Index } from './types';

import { CREATE_STEP_EVENT, type CreateStepRequest } from './editor/events';

type Scaffold = FilePreview & { line: number; method: string; pattern: string };

/**
 * Create a step definition for an unbound step: choose an existing step class (default: the one the feature
 * already uses) or a new file (default: <Feature>Steps.cs), preview the diff, approve, then open the method.
 */
export default function CreateStepDialog({ onOpen, onIndex, onNotice }: { onOpen: (file: string, line: number) => void; onIndex: (i: Index) => void; onNotice: (m: string) => void }) {
  const [req, setReq] = useState<CreateStepRequest>();
  const [files, setFiles] = useState<string[]>([]);
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [existing, setExisting] = useState('');
  const [newFile, setNewFile] = useState('Steps/NewSteps.cs');
  const [keyword, setKeyword] = useState('When');
  const [scaffold, setScaffold] = useState<Scaffold>();
  const [error, setError] = useState('');

  useEffect(() => {
    const h = async (e: Event) => {
      const r = (e as CustomEvent<CreateStepRequest>).detail;
      setReq(r); setScaffold(undefined); setError('');
      setKeyword(['Given', 'When', 'Then'].includes(r.keyword) ? r.keyword : 'When');
      const list = await api<string[]>('/steps/files').catch(() => [] as string[]);
      setFiles(list);
      let preferred = list[0] ?? '', convention = 'Steps/NewSteps.cs';
      if (r.featureFile) {
        const links = await api<{ stepFiles: { file: string }[]; convention: string }>(`/feature/links?file=${encodeURIComponent(r.featureFile)}`).catch(() => undefined);
        if (links?.stepFiles[0]) preferred = links.stepFiles[0].file;
        if (links?.convention) convention = links.convention;
      } else if (list[0]) convention = `${list[0].split('/').slice(0, -1).join('/') || 'Steps'}/NewSteps.cs`;
      setExisting(preferred); setNewFile(convention); setMode(list.length ? 'existing' : 'new');
    };
    window.addEventListener(CREATE_STEP_EVENT, h);
    return () => window.removeEventListener(CREATE_STEP_EVENT, h);
  }, []);

  const file = mode === 'existing' ? existing : newFile.trim();
  const preview = async () => {
    setError('');
    try { setScaffold(await api<Scaffold>('/steps/scaffold', { keyword, text: req!.text, file })); } catch (e) { setError((e as Error).message); }
  };

  return (
    <Dialog.Root open={!!req} onOpenChange={(o) => { if (!o) setReq(undefined); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="modal wide" aria-describedby={undefined}>
          <div className="modal-header">
            <Dialog.Title asChild><h2>Create step definition</h2></Dialog.Title>
            <Dialog.Close asChild><button className="icon-button" aria-label="Close"><X size={16} /></button></Dialog.Close>
          </div>
          {req && (
            <div className="modal-body form-stack">
              <code className="conv-out">{keyword} {req.text}</code>
              <div className="form-grid">
                <div className="field-label">
                  <span>KEYWORD</span>
                  <Segmented label="Keyword" size="small" value={keyword} onValueChange={(v) => { setKeyword(v); setScaffold(undefined); }} options={['Given', 'When', 'Then'].map((k) => ({ value: k, label: k }))} />
                </div>
                <div className="field-label">
                  <span>STEP FILE</span>
                  <Segmented label="Step file" size="small" value={mode} onValueChange={(m) => { setMode(m); setScaffold(undefined); }} options={[{ value: 'existing', label: `Existing (${files.length})` }, { value: 'new', label: 'New file' }]} />
                  {mode === 'existing'
                    ? files.length ? <Select ariaLabel="Existing step file" value={existing} onValueChange={(v) => { setExisting(v); setScaffold(undefined); }} options={files} /> : <span className="field-hint">No step files yet: choose New file.</span>
                    : <input aria-label="New step file" value={newFile} onChange={(e) => { setNewFile(e.target.value); setScaffold(undefined); }} />}
                </div>
              </div>
              {error && <p className="field-error" role="alert">{error}</p>}
              {!scaffold ? (
                <Button variant="primary" disabled={!/\.cs$/i.test(file)} onClick={preview}><FileCode2 size={14} />Preview</Button>
              ) : (
                <>
                  <p className="subtle">Adds <code>{scaffold.method}</code> bound to <code>{scaffold.pattern}</code>{scaffold.created ? ` in a new file ${scaffold.file}` : ` to ${scaffold.file}`}. It throws PendingStepException until you implement it.</p>
                  <DiffApproval preview={scaffold} height="220px" onApplied={(i) => { onIndex(i); setReq(undefined); onNotice(`Step definition added to ${scaffold.file}.`); onOpen(scaffold.file, scaffold.line); }} />
                </>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
