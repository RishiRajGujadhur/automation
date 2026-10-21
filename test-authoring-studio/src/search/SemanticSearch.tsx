import { useState } from 'react';
import { api } from '../api';
import { OPEN_LOCATION_EVENT } from '../editor/links';
import { useLocalState } from '../ui';

type Hit = { name: string; kind: string; type?: string; file: string; line: number };
const EXAMPLES = ['kind:method attr:Given', 'kind:method returns:Task async:false', 'kind:class implements:IDisposable', 'kind:property type:ILocator', 'kind:method params:0 static:true', 'in:Fixtures.Steps kind:method name:*Login*'];
/**
 * Semantic Search: symbols of the solution found by what they are (kind, type, attributes, modifiers, parameters,
 * namespace, base types), from the language service.
 */
export default function SemanticSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useLocalState('semanticQuery', 'kind:method attr:Given');
  const [hits, setHits] = useState<Hit[]>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = (q = query) => {
    if (!q.trim()) return;
    setBusy(true);
    api<Hit[]>(`/csharp/semantic-search?q=${encodeURIComponent(q.trim())}`).then((r) => { setHits(r); setError(''); }, (e) => setError((e as Error).message)).finally(() => setBusy(false));
  };
  return (
    <div className="project-props semantic-search" aria-label="Semantic Search">
      <p className="subtle">Find symbols by what they are: <code>kind:</code> <code>returns:</code> <code>type:</code> <code>attr:</code> <code>param:</code> <code>params:</code> <code>static:</code> <code>async:</code> <code>abstract:</code> <code>access:</code> <code>in:</code> <code>implements:</code> <code>inherits:</code>; other words match the name (<code>*</code> wildcards).</p>
      <div className="pp-field"><label htmlFor="sem-q">Query</label><input id="sem-q" aria-label="Semantic query" spellCheck={false} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') run(); }} autoFocus /></div>
      <div className="button-row">{EXAMPLES.map((x) => <button key={x} className="link-button" onClick={() => { setQuery(x); run(x); }}>{x}</button>)}</div>
      <div className="pp-footer"><button className="button primary" disabled={busy} onClick={() => run()}>Search</button></div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {hits && (
        <ul className="pp-list" aria-label="Semantic search results">
          {hits.map((h) => <li key={`${h.file}:${h.line}:${h.name}`}><button className="link-button" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent(OPEN_LOCATION_EVENT, { detail: { file: h.file, line: h.line, text: `${h.file}:${h.line}` } })); }}>{h.name}</button> <small className="meta">{h.kind}{h.type ? ` · ${h.type}` : ''} · {h.file}:{h.line}</small></li>)}
          {!hits.length && <li className="subtle">No symbols match.</li>}
        </ul>
      )}
    </div>
  );
}
