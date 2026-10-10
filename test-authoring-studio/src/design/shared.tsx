import { useEffect, useState, type ReactNode } from 'react';
import { Power, Upload, Download, Copy } from 'lucide-react';
import { api } from '../api';
import type { Binding, Feature } from '../types';
import { useAlgorithms } from '../radix2';
import { Button, Select } from '../radix';
import { algorithmById } from '../algorithms/registry';
import { copyText, useLocalState } from '../ui';
import type { QFeature } from '../algorithms/quality';

export type Corpus = { revision?: string; features: Feature[]; bindings: Binding[] };
export type ToolProps = { corpus?: Corpus; onNotice: (m: string) => void; onSource: (file: string, line: number) => void; onOpenDraft: (source: string, file: string) => void };

let cache: { revision?: string; promise: Promise<Corpus> } | undefined;
/** Whole feature corpus for client-side analysis; cached per index revision. */
export function useCorpus(revision?: string) {
  const [corpus, setCorpus] = useState<Corpus>();
  const [error, setError] = useState('');
  useEffect(() => {
    if (!cache || cache.revision !== revision) cache = { revision, promise: api<Corpus>('/design/corpus') };
    let live = true;
    cache.promise.then((c) => live && setCorpus(c)).catch((e) => { cache = undefined; if (live) setError((e as Error).message); });
    return () => { live = false; };
  }, [revision]);
  return { corpus, error };
}

/** Q5: replaces a tool (or part of one) with an explanation when a required algorithm is off. */
export function AlgoGate({ ids, children, compact }: { ids: string[]; children: ReactNode; compact?: boolean }) {
  const { on, set } = useAlgorithms();
  const off = ids.filter((id) => !on(id));
  if (!off.length) return <>{children}</>;
  return (
    <div className={`algo-off ${compact ? 'compact' : ''}`} role="status">
      <Power size={15} aria-hidden="true" />
      <span>{off.map((id) => algorithmById.get(id)?.name ?? id).join(', ')} {off.length === 1 ? 'is' : 'are'} turned off in Settings → Algorithms.</span>
      <Button size="small" onClick={() => set(Object.fromEntries(off.map((id) => [id, true])))}>Turn on</Button>
    </div>
  );
}

/** Q23: picks one enabled algorithm from a list, remembering the choice. */
export function AlgoPicker({ id, label, options, value, onChange }: { id: string; label: string; options: string[]; value?: string; onChange?: (v: string) => void }) {
  const { on } = useAlgorithms();
  const enabled = options.filter(on);
  const [stored, setStored] = useLocalState(`design:pick:${id}`, enabled[0] ?? '');
  const current = value ?? stored;
  const effective = enabled.includes(current) ? current : enabled[0] ?? '';
  useEffect(() => { if (effective !== current) { setStored(effective); onChange?.(effective); } }, [effective, current, setStored, onChange]);
  if (!enabled.length) return <AlgoGate ids={options.slice(0, 1)}>{null}</AlgoGate>;
  return (
    <label className="algo-picker">
      <span className="micro-label">{label}</span>
      <Select ariaLabel={label} value={effective} onValueChange={(v) => { setStored(v); onChange?.(v); }} options={enabled.map((x) => ({ value: x, label: algorithmById.get(x)?.name ?? x }))} />
    </label>
  );
}
export function usePicked(id: string, options: string[]) {
  const { on } = useAlgorithms();
  const [stored] = useLocalState(`design:pick:${id}`, '');
  const enabled = options.filter(on);
  return enabled.includes(stored) ? stored : enabled[0] ?? '';
}

/** Q11: save text as a file. */
export function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Q10/Q11: copy and download buttons for a text result. */
export function ResultActions({ text, file, type, onNotice, children }: { text: string; file: string; type?: string; onNotice: (m: string) => void; children?: ReactNode }) {
  return (
    <div className="button-row result-actions">
      <Button size="small" disabled={!text} onClick={() => copyText(text).then((ok) => onNotice(ok ? 'Copied to the clipboard.' : 'Clipboard unavailable.'))}><Copy size={13} aria-hidden="true" />Copy</Button>
      <Button size="small" disabled={!text} onClick={() => download(file, text, type)}><Download size={13} aria-hidden="true" />Download {file.split('.').pop()}</Button>
      {children}
    </div>
  );
}

/** Q17: drop a file or pick one; hands back its text. */
export function DropZone({ accept, label, onText }: { accept: string; label: string; onText: (text: string, name: string) => void }) {
  const [over, setOver] = useState(false);
  const read = (f?: File) => f && f.text().then((t) => onText(t, f.name));
  return (
    <label className={`drop-zone ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); read(e.dataTransfer.files[0]); }}>
      <Upload size={16} aria-hidden="true" />
      <span>{label}</span>
      <input type="file" accept={accept} className="sr-only" onChange={(e) => { read(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="design-empty"><strong>{title}</strong>{children && <p className="subtle">{children}</p>}</div>;
}

type CukeExamples = { tableHeader?: { cells: { value: string }[] } };
/** Index feature → light model used by the quality checks. */
export const toQFeature = (f: Feature): QFeature => ({
  file: f.file,
  name: f.name,
  scenarios: f.scenarios.map((s) => ({ name: s.name, keyword: s.keyword, line: s.line, tags: s.tags, steps: s.steps.map((st) => ({ keyword: st.keyword.trim(), text: st.text, line: st.line })), examplesHeader: (s.examples as CukeExamples[]).flatMap((e) => e.tableHeader?.cells.map((c) => c.value) ?? []) })),
});
export const allSteps = (c?: Corpus) => (c?.features ?? []).flatMap((f) => [...f.backgrounds.flatMap((b) => b.steps.map((s) => ({ ...s, file: f.file, scenario: b.name || 'Background' }))), ...f.scenarios.flatMap((sc) => sc.steps.map((s) => ({ ...s, file: f.file, scenario: sc.name })))]);
export const pct = (x: number) => `${Math.round(x * 100)}%`;
