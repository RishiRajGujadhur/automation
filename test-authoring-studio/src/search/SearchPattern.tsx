import { useState } from 'react';
import { api } from '../api';
import { OPEN_LOCATION_EVENT } from '../editor/links';

type Match = { file: string; line: number; text: string };
/** Search with Pattern (Rider's Structural Search and Replace): find a C# pattern with $placeholders$, replace with previews. */
export default function SearchPattern({ onNotice, onClose }: { onNotice: (m: string) => void; onClose: () => void }) {
  const [pattern, setPattern] = useState('$x$ == null');
  const [replace, setReplace] = useState('$x$ is null');
  const [matches, setMatches] = useState<Match[]>();
  const run = async (withReplace: boolean) => {
    try {
      const r = await api<{ matches: Match[]; previews: { id: string; changed: boolean }[] }>('/csharp/pattern', { pattern, ...(withReplace ? { replace } : {}) });
      setMatches(r.matches);
      if (withReplace) {
        if (!r.previews.length) { onNotice('Nothing to replace.'); return; }
        onClose();
        window.dispatchEvent(new CustomEvent('tas:project-previews', { detail: { title: `Replace with Pattern: ${r.previews.length} file${r.previews.length === 1 ? '' : 's'}`, previews: r.previews } }));
      }
    } catch (e) { onNotice((e as Error).message); }
  };
  return (
    <div className="project-props search-pattern" aria-label="Search with Pattern">
      <p className="subtle">C# with <code>$placeholders$</code>: each matches an expression; the same name twice matches the same text.</p>
      <div className="pp-field"><label htmlFor="ssr-find">Search pattern</label><input id="ssr-find" aria-label="Search pattern" spellCheck={false} value={pattern} onChange={(e) => setPattern(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run(false); }} /></div>
      <div className="pp-field"><label htmlFor="ssr-replace">Replace pattern</label><input id="ssr-replace" aria-label="Replace pattern" spellCheck={false} value={replace} onChange={(e) => setReplace(e.target.value)} /></div>
      <div className="pp-footer"><button className="button" onClick={() => void run(false)}>Find</button><button className="button primary" disabled={!replace.trim()} onClick={() => void run(true)}>Preview replace</button></div>
      {matches && <ul className="pp-list" aria-label="Pattern matches">{matches.map((m, i) => <li key={i}><button className="link-button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent(OPEN_LOCATION_EVENT, { detail: { text: `${m.file}:${m.line}`, file: m.file, line: m.line } })); }}>{m.file}:{m.line}</button> <code>{m.text}</code></li>)}{!matches.length && <li className="subtle">No matches.</li>}</ul>}
    </div>
  );
}
