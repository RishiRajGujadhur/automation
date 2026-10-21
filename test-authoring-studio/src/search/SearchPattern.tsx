import { useState } from 'react';
import { api } from '../api';
import { OPEN_LOCATION_EVENT } from '../editor/links';
import { useLocalState } from '../ui';
import { featureOn } from '../features';

type Match = { file: string; line: number; text: string };
type Template = { name: string; pattern: string; replace: string; builtIn?: boolean };
/** Structural Search and Replace templates (Rider's SSR patterns catalogue): common C# and test rewrites. */
export const BUILT_IN_TEMPLATES: Template[] = [
  { name: 'Null check: == null → is null', pattern: '$x$ == null', replace: '$x$ is null', builtIn: true },
  { name: 'Null check: != null → is not null', pattern: '$x$ != null', replace: '$x$ is not null', builtIn: true },
  { name: 'Count() > 0 → Any()', pattern: '$x$.Count() > 0', replace: '$x$.Any()', builtIn: true },
  { name: 'Count() == 0 → !Any()', pattern: '$x$.Count() == 0', replace: '!$x$.Any()', builtIn: true },
  { name: 'String.Empty comparison → IsNullOrEmpty', pattern: '$x$ == string.Empty', replace: 'string.IsNullOrEmpty($x$)', builtIn: true },
  { name: 'NUnit: Assert.AreEqual → Assert.That', pattern: 'Assert.AreEqual($expected$, $actual$)', replace: 'Assert.That($actual$, Is.EqualTo($expected$))', builtIn: true },
  { name: 'NUnit: Assert.IsTrue → Assert.That', pattern: 'Assert.IsTrue($condition$)', replace: 'Assert.That($condition$, Is.True)', builtIn: true },
  { name: 'NUnit: Assert.IsNull → Assert.That', pattern: 'Assert.IsNull($value$)', replace: 'Assert.That($value$, Is.Null)', builtIn: true },
  { name: 'Playwright: WaitForTimeout (find)', pattern: '$page$.WaitForTimeoutAsync($ms$)', replace: '', builtIn: true },
  { name: 'Task.Result (blocking, find)', pattern: '$task$.Result', replace: '', builtIn: true },
];

/** Search with Pattern (Rider's Structural Search and Replace): find a C# pattern with $placeholders$, replace with previews. */
export default function SearchPattern({ onNotice, onClose }: { onNotice: (m: string) => void; onClose: () => void }) {
  const [pattern, setPattern] = useState('$x$ == null');
  const [replace, setReplace] = useState('$x$ is null');
  const [matches, setMatches] = useState<Match[]>();
  // Saved templates (Rider: Save Template), kept in this browser.
  const [saved, setSaved] = useLocalState<Template[]>('ssrTemplates', []);
  const templates = featureOn('ssr-templates') ? [...saved, ...BUILT_IN_TEMPLATES] : [];
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
  const save = () => {
    const name = window.prompt('Template name:', pattern)?.trim();
    if (!name) return;
    setSaved([{ name, pattern, replace }, ...saved.filter((t) => t.name !== name)]);
    onNotice(`Template "${name}" saved.`);
  };
  return (
    <div className="project-props search-pattern" aria-label="Search with Pattern">
      <p className="subtle">C# with <code>$placeholders$</code>: each matches an expression; the same name twice matches the same text.</p>
      {featureOn('ssr-templates') && (
        <div className="pp-field">
          <label htmlFor="ssr-template">Template</label>
          <span className="button-row">
            <select id="ssr-template" aria-label="Template" value="" onChange={(e) => { const t = templates.find((x) => x.name === e.target.value); if (t) { setPattern(t.pattern); setReplace(t.replace); setMatches(undefined); } }}>
              <option value="">Choose a template…</option>
              {saved.length > 0 && <optgroup label="Saved">{saved.map((t) => <option key={`s-${t.name}`} value={t.name}>{t.name}</option>)}</optgroup>}
              <optgroup label="Built-in">{BUILT_IN_TEMPLATES.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}</optgroup>
            </select>
            <button className="button" onClick={save}>Save as Template…</button>
            {saved.some((t) => t.pattern === pattern && t.replace === replace) && <button className="button" onClick={() => setSaved(saved.filter((t) => !(t.pattern === pattern && t.replace === replace)))}>Delete Template</button>}
          </span>
        </div>
      )}
      <div className="pp-field"><label htmlFor="ssr-find">Search pattern</label><input id="ssr-find" aria-label="Search pattern" spellCheck={false} value={pattern} onChange={(e) => setPattern(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void run(false); }} /></div>
      <div className="pp-field"><label htmlFor="ssr-replace">Replace pattern</label><input id="ssr-replace" aria-label="Replace pattern" spellCheck={false} value={replace} onChange={(e) => setReplace(e.target.value)} /></div>
      <div className="pp-footer"><button className="button" onClick={() => void run(false)}>Find</button><button className="button primary" disabled={!replace.trim()} onClick={() => void run(true)}>Preview replace</button></div>
      {matches && <ul className="pp-list" aria-label="Pattern matches">{matches.map((m, i) => <li key={i}><button className="link-button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent(OPEN_LOCATION_EVENT, { detail: { file: m.file, line: m.line, text: `${m.file}:${m.line}` } })); }}>{m.file}:{m.line}</button> <code>{m.text}</code></li>)}{!matches.length && <li className="subtle">No matches.</li>}</ul>}
    </div>
  );
}
