import { useMemo, useState } from 'react';
import { clipboardHistory, removeClipboard } from './clipboardRing';

/** Paste from History (Rider, Ctrl+Shift+V): pick an earlier copied text; type to filter, Enter pastes, Delete forgets it. */
export default function PasteHistory({ onPaste }: { onPaste: (text: string) => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [version, setVersion] = useState(0);
  const items = useMemo(() => {
    const q = query.toLowerCase();
    return clipboardHistory().filter((t) => !q || t.toLowerCase().includes(q));
  }, [query, version]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = items[index];
  return (
    <div className="goto-all paste-history">
      <input
        autoFocus
        aria-label="Filter clipboard history"
        placeholder="Paste from history (Ctrl+Shift+V)"
        value={query}
        spellCheck={false}
        onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(items.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
          else if (e.key === 'Enter' && current) { e.preventDefault(); onPaste(current); }
          else if (e.key === 'Delete' && current && !query) { e.preventDefault(); removeClipboard(current); setVersion((v) => v + 1); }
        }}
      />
      <ul className="goto-results" role="listbox" aria-label="Clipboard history">
        {items.map((t, i) => (
          <li key={t} role="option" aria-selected={i === index} className={i === index ? 'active' : ''} onMouseEnter={() => setIndex(i)} onMouseDown={(e) => { e.preventDefault(); onPaste(t); }}>
            <span className="goto-label"><code>{t.trim().split('\n')[0].slice(0, 120)}</code></span>
            {t.includes('\n') && <small>{t.split('\n').length} lines</small>}
          </li>
        ))}
        {!items.length && <li className="goto-empty">Nothing copied yet. Text you copy or cut in the editors shows up here.</li>}
      </ul>
      {current?.includes('\n') && <pre className="paste-preview" aria-label="Preview">{current.slice(0, 2000)}</pre>}
    </div>
  );
}
