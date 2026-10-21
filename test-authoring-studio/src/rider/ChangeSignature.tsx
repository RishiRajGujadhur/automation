import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { api } from '../api';
import { activeEditor } from '../editor/activeEditor';
import { applyRefactor, at } from './refactor400';

type Param = { index: number; name: string; type: string; unused: boolean };
/**
 * Change Signature (Rider Ctrl+F6, Visual Studio Ctrl+R, Ctrl+V): reorder, remove and rename the parameters of the
 * method at the caret; the declaration, overrides and every call change together.
 */
export default function ChangeSignature({ info, mode, onDone, onNotice }: { info: { name: string; parameters: Param[] }; mode: 'change' | 'reorder'; onDone: () => void; onNotice: (m: string) => void }) {
  const [rows, setRows] = useState(info.parameters.map((p) => ({ ...p, keep: true, newName: p.name })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const move = (i: number, d: -1 | 1) => { const n = [...rows]; [n[i], n[i + d]] = [n[i + d], n[i]]; setRows(n); };
  const preview = `${info.name.split('(')[0]}(${rows.filter((r) => r.keep).map((r) => `${r.type} ${r.newName}`).join(', ')})`;
  const apply = async () => {
    const a = activeEditor();
    if (!a) return;
    setBusy(true);
    try {
      const r = await api<{ title: string; changes: { file: string; text: string }[] }>('/csharp/op', { op: 'refactor', kind: 'changeSignature', file: a.file, source: a.view.state.doc.toString(), ...at(a.view), parameters: rows.filter((x) => x.keep).map((x) => ({ index: x.index, ...(x.newName !== x.name ? { name: x.newName } : {}) })) });
      // Close first: the diff of other files opens in the same window.
      onDone();
      await applyRefactor(a.view, a.file, r, onNotice);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="change-signature" aria-label={mode === 'reorder' ? 'Reorder Parameters' : 'Change Signature'}>
      <p className="subtle">{info.name}</p>
      <ol className="git-rebase-rows">
        {rows.map((r, i) => (
          <li key={r.index} className={`git-rebase-row ${r.keep ? '' : 'a-drop'}`}>
            <button className="icon-button" aria-label={`Move ${r.name} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
            <button className="icon-button" aria-label={`Move ${r.name} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
            <code>{r.type}</code>
            {mode === 'change' ? <input aria-label={`Name of parameter ${r.name}`} value={r.newName} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, newName: e.target.value.replace(/[^\w]/g, '') } : x)))} /> : <span className="git-subject">{r.name}</span>}
            {mode === 'change' && <label className="git-amend"><input type="checkbox" checked={!r.keep} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, keep: !e.target.checked } : x)))} aria-label={`Remove parameter ${r.name}`} />Remove{r.unused ? ' (unused)' : ''}</label>}
          </li>
        ))}
      </ol>
      <p className="meta" aria-label="New signature"><code>{preview}</code></p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="button-row"><button className="button primary" disabled={busy} onClick={() => void apply()}>Refactor</button><button className="button" onClick={onDone}>Cancel</button></div>
    </div>
  );
}
