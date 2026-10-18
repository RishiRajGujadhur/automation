import { useMemo, useState, type ReactNode } from 'react';

export type ListItem = { key: string; label: string; detail?: string; icon?: ReactNode; indent?: number };

/** A filterable list for Rider popups (live templates, surround with, file structure…): type, ↑ / ↓, Enter. */
export default function ListPopup({ label, placeholder, empty, items, onPick, initial = 0 }: { label: string; placeholder: string; empty: string; items: ListItem[]; onPick: (key: string) => void; initial?: number }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(initial);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => !q || `${i.label} ${i.detail ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);
  return (
    <div className="goto-all">
      <input
        autoFocus
        aria-label={`Filter ${label.toLowerCase()}`}
        placeholder={placeholder}
        value={query}
        spellCheck={false}
        onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(shown.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter' && shown[index]) { e.preventDefault(); onPick(shown[index].key); }
        }}
      />
      <ul className="goto-results" role="listbox" aria-label={label}>
        {shown.map((it, i) => (
          <li key={it.key} role="option" aria-selected={i === index} className={i === index ? 'active' : ''} style={it.indent ? { paddingLeft: 8 + it.indent * 14 } : undefined} onMouseEnter={() => setIndex(i)} onMouseDown={(e) => { e.preventDefault(); onPick(it.key); }} ref={i === index ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}>
            {it.icon}
            <span className="goto-label">{it.label}</span>
            {it.detail && <small>{it.detail}</small>}
          </li>
        ))}
        {!shown.length && <li className="goto-empty">{empty}</li>}
      </ul>
    </div>
  );
}
