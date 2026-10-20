import { useEffect, useState } from 'react';
import { api } from '../api';

/** A compact diff of `before` → `after`: the changed lines with `context` lines around them. Pure, for the unit tests. */
export function changedLines(before: string, after: string, context = 2, max = 40): { kind: ' ' | '-' | '+'; text: string }[] {
  const a = before.replace(/\r\n/g, '\n').split('\n'), b = after.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let ea = a.length, eb = b.length;
  while (ea > start && eb > start && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  if (start === ea && start === eb) return [];
  const out: { kind: ' ' | '-' | '+'; text: string }[] = [];
  for (let i = Math.max(0, start - context); i < start; i++) out.push({ kind: ' ', text: a[i] });
  for (let i = start; i < ea; i++) out.push({ kind: '-', text: a[i] });
  for (let i = start; i < eb; i++) out.push({ kind: '+', text: b[i] });
  for (let i = ea; i < Math.min(a.length, ea + context); i++) out.push({ kind: ' ', text: a[i] });
  return out.length > max ? [...out.slice(0, max), { kind: ' ', text: `… ${out.length - max} more lines` }] : out;
}

type Preview = { title: string; changes: { file: string; before: string; text: string }[] };
/** Quick Actions preview (Visual Studio's lightbulb preview): what the highlighted action would change. */
export function QuickPreview({ file, actionId, source }: { file: string; actionId: string; source: string }) {
  const [p, setP] = useState<Preview | { error: string }>();
  useEffect(() => {
    setP(undefined);
    const t = setTimeout(() => { api<Preview>('/csharp/previewAction', { file, actionId }).then(setP, (e) => setP({ error: (e as Error).message })); }, 180);
    return () => clearTimeout(t);
  }, [file, actionId]);
  if (!p) return <div className="cm-quick-preview" aria-label="Preview" aria-busy="true"><span className="meta">Preview…</span></div>;
  if ('error' in p) return <div className="cm-quick-preview" aria-label="Preview"><span className="meta">{p.error}</span></div>;
  const mine = p.changes.find((c) => c.file === file);
  const others = p.changes.filter((c) => c.file !== file);
  const lines = mine ? changedLines(source, mine.text) : [];
  return (
    <div className="cm-quick-preview" aria-label={`Preview of ${p.title}`}>
      {lines.length ? <pre>{lines.map((l, i) => <div key={i} className={`diff-${l.kind === '+' ? 'add' : l.kind === '-' ? 'del' : 'ctx'}`}>{l.kind} {l.text}</div>)}</pre> : <span className="meta">No change in this file.</span>}
      {others.length > 0 && <span className="meta">Also changes {others.map((o) => o.file).join(', ')}</span>}
    </div>
  );
}
