import { useMemo, useState } from 'react';
import { recentFiles, recentLocations, type NavLocation } from './navHistory';
import { fileType } from './files/fileTypes';

/**
 * Recent Files (Ctrl+E) and Recent Locations (Ctrl+Shift+E), as in JetBrains Rider: type to filter, ↑ / ↓, Enter.
 * Locations show the line of code you were on.
 */
export default function RecentPopup({ mode, onMode, onOpen }: { mode: 'files' | 'locations'; onMode: (m: 'files' | 'locations') => void; onOpen: (loc: { file: string; line?: number; column?: number }) => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: (NavLocation | { file: string; line?: undefined; column?: undefined; text?: undefined })[] = mode === 'files' ? recentFiles().map((file) => ({ file })) : recentLocations();
    return list.filter((i) => !q || `${i.file} ${i.text ?? ''}`.toLowerCase().includes(q)).slice(0, 50);
  }, [mode, query]);
  const go = (i: number) => { const it = items[i]; if (it) onOpen(it); };
  return (
    <div className="goto-all recent-popup">
      <div className="goto-filters" role="radiogroup" aria-label="Recent">
        <button role="radio" aria-checked={mode === 'files'} className={mode === 'files' ? 'on' : ''} onClick={() => onMode('files')}>Recent Files</button>
        <button role="radio" aria-checked={mode === 'locations'} className={mode === 'locations' ? 'on' : ''} onClick={() => onMode('locations')}>Recent Locations</button>
      </div>
      <input
        autoFocus
        aria-label={mode === 'files' ? 'Filter recent files' : 'Filter recent locations'}
        placeholder={mode === 'files' ? 'Recent files (Ctrl+E)' : 'Recent locations (Ctrl+Shift+E)'}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); go(index); }
          else if (e.key.toLowerCase() === 'e' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onMode(mode === 'files' ? 'locations' : 'files'); }
        }}
        spellCheck={false}
      />
      <ul className="goto-results" role="listbox" aria-label={mode === 'files' ? 'Recent files' : 'Recent locations'}>
        {items.map((it, i) => {
          const t = fileType(it.file);
          return (
            <li key={`${it.file}:${it.line ?? ''}`} role="option" aria-selected={i === index} className={i === index ? 'active' : ''} onMouseEnter={() => setIndex(i)} onMouseDown={(e) => { e.preventDefault(); go(i); }}>
              <t.icon size={14} style={{ color: t.color }} aria-hidden="true" />
              <span className="goto-label">{it.file.split('/').pop()}{it.line ? `:${it.line}` : ''}</span>
              <small>{it.text ? <code>{it.text}</code> : it.file}</small>
            </li>
          );
        })}
        {!items.length && <li className="goto-empty">{mode === 'files' ? 'No recent files yet.' : 'No recent locations yet.'}</li>}
      </ul>
    </div>
  );
}
