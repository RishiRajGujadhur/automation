import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Hash, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../api';
// tags panel imports

export type TagRow = { tag: string; scenarios: { file: string; feature: string; scenario: string; line: number }[] };

/** Tags window (Gherkin): every tag with its scenarios; a scenario opens at its line. */
export default function TagsPanel({ onOpen, onNotice, onClose }: { onOpen: (file: string, line: number, column: number) => void; onNotice: (m: string) => void; onClose: () => void }) {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const load = () => { api<TagRow[]>('/tags').then(setTags, (e) => onNotice((e as Error).message)); };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  // tags panel actions
  const q = query.trim().toLowerCase();
  const shown = tags.filter((t) => !q || t.tag.toLowerCase().includes(q));
  const toggle = (tag: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(tag)) n.delete(tag); else n.add(tag); return n; });
  return (
    <section className="debug-panel todo-panel tags-panel" aria-label="Tags">
      <div className="debug-toolbar" role="toolbar" aria-label="Tags">
        <strong className="todo-count"><Hash size={13} /> {tags.length} tag{tags.length === 1 ? '' : 's'}</strong>
        <label className="error-search"><Search size={12} /><input aria-label="Filter tags" placeholder="Filter tags" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        <button className="icon-button" aria-label="Refresh tags" title="Refresh" onClick={load}><RefreshCw size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close Tags" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <ul className="todo-list tag-list" aria-label="Tags and scenarios">
        {shown.map((t) => (
          <li key={t.tag}>
            <div className="tag-row">
              <button className="todo-item" aria-expanded={open.has(t.tag)} onClick={() => toggle(t.tag)}>
                {open.has(t.tag) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<strong>{t.tag}</strong> <small>{t.scenarios.length} scenario{t.scenarios.length === 1 ? '' : 's'}</small>
              </button>
              {/* tag actions */}
            </div>
            {open.has(t.tag) && (
              <ul>
                {t.scenarios.map((s) => <li key={`${s.file}:${s.line}`}><button className="todo-item" style={{ paddingLeft: 24 }} onClick={() => onOpen(s.file, s.line, 1)}>{s.scenario} <small>{s.feature} · {s.file.split('/').pop()}:{s.line}</small></button></li>)}
              </ul>
            )}
          </li>
        ))}
        {!shown.length && <li className="subtle">{tags.length ? 'No tag matches.' : 'No tags in the feature files.'}</li>}
      </ul>
      {/* tags panel previews */}
    </section>
  );
}
