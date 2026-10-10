import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { oneDark } from '@codemirror/theme-one-dark';
import { Search, Wand2 } from 'lucide-react';
import { api, type Paged } from './api';
import SelectorResolution from './SelectorResolution';
import type { DictionaryEntry } from './types';

export default function DictionaryInspector({ revision = '', compact = false, onSource, onGenerate }: { revision?: string; compact?: boolean; onSource?: (file: string, line: number) => void; onGenerate?: (entry: DictionaryEntry) => void }) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<DictionaryEntry>>({ items: [], total: 0, hasNext: false });
  const [selected, setSelected] = useState<DictionaryEntry>();
  const [error, setError] = useState('');
  const [source, setSource] = useState('');
  const [value, setValue] = useState('');
  const [action, setAction] = useState('fill');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        api<Paged<DictionaryEntry>>('/dictionaries?' + new URLSearchParams({ q: query, offset: String(offset), limit: '12' }), undefined, controller.signal)
          .then((body) => { setData(body); setError(''); })
          .catch((e) => { if (!controller.signal.aborted) setError(e.message); }),
      180,
    );
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, offset, revision]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setSource('');
    api('/source?file=' + encodeURIComponent(selected.file), undefined, controller.signal)
      .then((r) => { if (!controller.signal.aborted) setSource(r.source ?? ''); })
      .catch(() => {});
    return () => controller.abort();
  }, [selected]);
  const candidate = selected?.selectors.find((s) => s.supported);
  const code = candidate?.code
    ? `${action === 'visible' ? 'await Expect(' + candidate.code + ').ToBeVisibleAsync()' : `await ${candidate.code}.${action === 'click' ? 'ClickAsync()' : `FillAsync(${JSON.stringify(value)})`}`};`
    : 'No supported locator is available.';
  return (
    <section className="dictionary-inspector">
      <div className="catalog-toolbar">
        <label className="search-box">
          <Search size={16} />
          <input aria-label="Search dictionary" placeholder="Page, section, field, selector or file…" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} />
        </label>
        <span className="badge">{data.total.toLocaleString()} fields</span>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="dictionary-grid">
        <div className="dictionary-fields">
          {data.items.map((e) => (
            <button key={e.id} className={`dictionary-field ${selected?.id === e.id ? 'selected' : ''}`} onClick={() => setSelected(e)}>
              <strong>{e.page || 'Unnamed page'} / {e.section} / {e.field}</strong>
              <span>{e.fieldType} · {e.selectors.length} selectors</span>
              <small>{e.file}:{e.line}</small>
            </button>
          ))}
          {!data.items.length && <p className="subtle">No Page → Section → Field XML entries match. Configure dictionary XML patterns in Config.</p>}
          <div className="pagination">
            <button className="button tiny" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 12))}>Previous</button>
            <span>{data.items.length ? `${offset + 1}–${offset + data.items.length}` : ''}</span>
            <button className="button tiny" disabled={!data.hasNext} onClick={() => setOffset(offset + 12)}>Next</button>
          </div>
        </div>
        <div>
          {selected ? (
            <>
              <div className="inspector-heading">
                <h3>Selector resolution</h3>
                {onSource && <button className="text-button" onClick={() => onSource(selected.file, selected.line)}>{selected.file}:{selected.line}</button>}
                {onGenerate && <button className="button tiny" onClick={() => onGenerate(selected)}><Wand2 size={13} />Use in Test Generator</button>}
              </div>
              <SelectorResolution entry={selected} />
              <div className="locator-inputs">
                <select aria-label="Locator action" value={action} onChange={(e) => setAction(e.target.value)}>
                  <option value="fill">Fill</option>
                  <option value="click">Click</option>
                  <option value="visible">Verify visible</option>
                </select>
                {action === 'fill' && <input aria-label="Test data value" placeholder="Test data value" value={value} onChange={(e) => setValue(e.target.value)} />}
              </div>
              <CodeMirror value={code} theme={oneDark} extensions={[StreamLanguage.define(csharp)]} editable={false} />
              {!compact && (
                <>
                  <h3>Dictionary source</h3>
                  <CodeMirror value={source} theme={oneDark} height="260px" extensions={[StreamLanguage.define(xml)]} editable={false} />
                </>
              )}
            </>
          ) : (
            <div className="empty-state">Select a dictionary field to inspect its selector order and locator code.</div>
          )}
        </div>
      </div>
    </section>
  );
}
