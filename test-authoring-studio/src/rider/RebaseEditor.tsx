import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { api } from '../api';

type Row = { hash: string; subject: string; message: string; action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop' };
const ACTIONS: Row['action'][] = ['pick', 'reword', 'squash', 'fixup', 'drop'];

/**
 * Interactive Rebase (Rider's Interactively Rebase from Here): the commits from the selected one up to HEAD, oldest
 * first; each can be picked, reworded, squashed or fixed up into the one above, or dropped, and moved up or down.
 */
export default function RebaseEditor({ base, onDone, onCancel, onNotice }: { base: string; onDone: () => void; onCancel: () => void; onNotice: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // A late answer (an effect run twice, a slow server) must not undo what was already changed in the list.
  useEffect(() => {
    let alive = true;
    api<{ hash: string; subject: string; message: string }[]>(`/git/rebase?base=${base}`).then((l) => { if (alive) setRows((now) => now ?? l.map((c) => ({ ...c, action: 'pick' }))); }, (e) => setError((e as Error).message));
    return () => { alive = false; };
  }, [base]);
  if (!rows) return <p className="subtle">{error || 'Loading commits…'}</p>;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) => { const next = [...rows]; [next[i], next[i + d]] = [next[i + d], next[i]]; setRows(next); };
  // A squash gets the messages of the commits it joins as its starting text.
  const choose = (i: number, action: Row['action']) => {
    if (action === 'squash') { let k = i - 1; while (k > 0 && (rows[k].action === 'squash' || rows[k].action === 'fixup' || rows[k].action === 'drop')) k--; set(i, { action, message: `${rows[k]?.message ?? ''}\n\n${rows[i].message}`.trim() }); }
    else set(i, { action });
  };
  const start = async () => {
    setBusy(true);
    try {
      const r = await api<{ head: string }>('/git/rebase', { base, steps: rows.map((r) => ({ hash: r.hash, action: r.action, ...(r.action === 'reword' || r.action === 'squash' ? { message: r.message } : {}) })) });
      onNotice(`Rebased: ${r.head}`);
      onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="git-rebase" aria-label="Interactive Rebase">
      <p className="git-commit-head"><strong>Interactive Rebase</strong> · {rows.length} commit{rows.length === 1 ? '' : 's'}, oldest first</p>
      <ol className="git-rebase-rows">
        {rows.map((r, i) => (
          <li key={r.hash} className={`git-rebase-row a-${r.action}`}>
            <select aria-label={`Action for ${r.subject}`} value={r.action} onChange={(e) => choose(i, e.target.value as Row['action'])}>
              {ACTIONS.map((a) => <option key={a} value={a} disabled={i === 0 && (a === 'squash' || a === 'fixup')}>{a}</option>)}
            </select>
            <button className="icon-button" aria-label={`Move ${r.subject} up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
            <button className="icon-button" aria-label={`Move ${r.subject} down`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
            <code>{r.hash.slice(0, 7)}</code> <span className="git-subject">{r.subject}</span>
            {(r.action === 'reword' || r.action === 'squash') && <textarea aria-label={`Message for ${r.subject}`} rows={2} value={r.message} onChange={(e) => set(i, { message: e.target.value })} />}
          </li>
        ))}
      </ol>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="button-row">
        <button className="button primary" disabled={busy} onClick={() => void start()}>Start Rebasing</button>
        <button className="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
