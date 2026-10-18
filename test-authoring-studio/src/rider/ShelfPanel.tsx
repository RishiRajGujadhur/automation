import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../api';
import { FILES_CHANGED_EVENT, GIT_CHANGED_EVENT, SAVE_ALL_EVENT } from '../editor/events';

type Shelf = { ref: string; message: string; date: string; files: string[] };

/**
 * Shelf tool window (Rider): shelve the uncommitted changes under a name (they leave the working tree), and unshelve
 * them later — keeping or removing the shelf. Shelves are Git stashes, so other Git tools see them too.
 */
export default function ShelfPanel({ onOpen, onNotice, onClose }: { onOpen: (file: string) => void; onNotice: (m: string) => void; onClose: () => void }) {
  const [list, setList] = useState<Shelf[]>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string>();
  const load = () => api<Shelf[]>('/git/shelves').then(setList, (e) => onNotice((e as Error).message));
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changed = (files: string[]) => { window.dispatchEvent(new CustomEvent(FILES_CHANGED_EVENT, { detail: files })); window.dispatchEvent(new Event(GIT_CHANGED_EVENT)); };
  const run = async (fn: () => Promise<{ output: string; shelves: Shelf[]; files?: string[] }>, done: string) => {
    setBusy(true);
    try { const r = await fn(); setList(r.shelves); changed(r.files ?? []); onNotice(done); } catch (e) { onNotice((e as Error).message); } finally { setBusy(false); }
  };
  const shelveNow = async () => {
    const message = name.trim() || `Shelved ${new Date().toLocaleString()}`;
    // Unsaved editor changes go to disk first, so they are shelved too.
    window.dispatchEvent(new Event(SAVE_ALL_EVENT));
    await new Promise((r) => setTimeout(r, 400));
    const before = (await api<Shelf[]>('/git/shelves').catch(() => []))[0]?.files;
    await run(async () => { const r = await api<{ output: string; shelves: Shelf[] }>('/git/shelve', { message }); return { ...r, files: r.shelves[0]?.files ?? before ?? [] }; }, `Shelved: ${message}`);
    setName('');
  };
  return (
    <section className="debug-panel todo-panel shelf-panel" aria-label="Shelf">
      <div className="debug-toolbar" role="toolbar" aria-label="Shelf">
        <input className="shelf-name" aria-label="Shelf name" placeholder="Name for the changes to shelve" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void shelveNow(); }} />
        <button className="button" disabled={busy} onClick={() => void shelveNow()}><Archive size={13} /> Shelve Changes</button>
        <button className="icon-button" aria-label="Refresh shelf" title="Refresh" onClick={() => void load()}><RefreshCw size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Shelf" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <ul className="todo-list" aria-label="Shelved changes">
        {list?.map((s) => (
          <li key={s.ref} className="shelf-item">
            <div className="shelf-head">
              <strong>{s.message}</strong> <small>{new Date(s.date).toLocaleString()} · {s.files.length} file{s.files.length === 1 ? '' : 's'}</small>
              <span className="debug-spacer" />
              <button className="button" disabled={busy} aria-label={`Unshelve ${s.message}`} onClick={() => void run(() => api('/git/unshelve', { ref: s.ref, remove: true }), `Unshelved: ${s.message}`)}><ArchiveRestore size={13} /> Unshelve</button>
              <button className="button" disabled={busy} aria-label={`Unshelve ${s.message} and keep it`} onClick={() => void run(() => api('/git/unshelve', { ref: s.ref, remove: false }), `Applied (kept on the shelf): ${s.message}`)}>Apply, keep</button>
              {confirm === s.ref
                ? <button className="button danger" onClick={() => { setConfirm(undefined); void run(() => api('/git/shelf/delete', { ref: s.ref }), `Deleted shelf: ${s.message}`); }}>Delete for good</button>
                : <button className="icon-button" aria-label={`Delete ${s.message}`} title="Delete" onClick={() => setConfirm(s.ref)}><Trash2 size={13} /></button>}
            </div>
            <ul>{s.files.map((f) => <li key={f}><button className="todo-item" onClick={() => onOpen(f)}>{f}</button></li>)}</ul>
          </li>
        ))}
        {list && !list.length && <li className="subtle">Nothing on the shelf. Shelve your uncommitted changes to put them aside.</li>}
      </ul>
    </section>
  );
}
