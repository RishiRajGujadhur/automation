import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, X, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from './api';
import { fileType } from './files/fileTypes';

type Todo = { file: string; line: number; column: number; kind: string; text: string };
const KINDS = ['TODO', 'FIXME', 'HACK', 'BUG'] as const;

/** TODO tool window (JetBrains Rider): TODO / FIXME / HACK / BUG comments across the solution, grouped by file. */
export default function TodoPanel({ onOpen, onClose }: { onOpen: (file: string, line: number, column: number) => void; onClose: () => void }) {
  const [todos, setTodos] = useState<Todo[]>();
  const [kinds, setKinds] = useState<string[]>([...KINDS]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const load = () => api<Todo[]>('/todos').then(setTodos, () => setTodos([]));
  useEffect(() => { void load(); }, []);
  const groups = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const t of todos ?? []) if (kinds.includes(t.kind)) map.set(t.file, [...(map.get(t.file) ?? []), t]);
    return [...map];
  }, [todos, kinds]);
  const count = groups.reduce((n, [, l]) => n + l.length, 0);
  return (
    <section className="debug-panel todo-panel" aria-label="TODO">
      <div className="debug-toolbar" role="toolbar" aria-label="TODO">
        <strong className="todo-count">{todos ? `${count} item${count === 1 ? '' : 's'} in ${groups.length} file${groups.length === 1 ? '' : 's'}` : 'Searching…'}</strong>
        {KINDS.map((k) => (
          <label key={k} className="todo-kind"><input type="checkbox" checked={kinds.includes(k)} onChange={(e) => setKinds(e.target.checked ? [...kinds, k] : kinds.filter((x) => x !== k))} /> {k}</label>
        ))}
        <button className="icon-button" aria-label="Refresh TODO" title="Refresh" onClick={() => void load()}><RefreshCw size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close TODO" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <ul className="todo-list" aria-label="TODO items">
        {groups.map(([file, items]) => {
          const open = !closed.has(file);
          const t = fileType(file);
          return (
            <li key={file}>
              <button className="todo-file" aria-expanded={open} onClick={() => setClosed((c) => { const n = new Set(c); if (n.has(file)) n.delete(file); else n.add(file); return n; })}>
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<t.icon size={13} style={{ color: t.color }} /> {file} <small>{items.length}</small>
              </button>
              {open && (
                <ul>
                  {items.map((it) => (
                    <li key={`${it.line}:${it.column}`}>
                      <button className="todo-item" onClick={() => onOpen(it.file, it.line, it.column)}>
                        <span className={`todo-tag ${it.kind.toLowerCase()}`}>{it.kind}</span> {it.text || '(no text)'} <small>({it.line}, {it.column})</small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {todos && !count && <li className="subtle">No TODO comments.</li>}
      </ul>
    </section>
  );
}
