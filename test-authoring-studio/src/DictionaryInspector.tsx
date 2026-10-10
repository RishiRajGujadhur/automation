import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { oneDark } from '@codemirror/theme-one-dark';
import { Search, Wand2, Copy, FileCode2 } from 'lucide-react';
import { RowMenu, Highlight, CopyButton, Collapsible, arrowNav, copyText, clearOnEscape, useLocalState } from './ui';
import { api, type Paged } from './api';
import SelectorResolution from './SelectorResolution';
import type { DictionaryEntry } from './types';

export default function DictionaryInspector({ revision = '', compact = false, onSource, onGenerate }: { revision?: string; compact?: boolean; onSource?: (file: string, line: number) => void; onGenerate?: (entry: DictionaryEntry) => void }) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<DictionaryEntry>>({ items: [], total: 0, hasNext: false });
  const [selected, setSelectedState] = useState<DictionaryEntry>();
  const [selectedId, setSelectedId] = useLocalState('dictionary:selected', '');
  const [warningsOnly, setWarningsOnly] = useLocalState('dictionary:warnings', false);
  const setSelected = (e: DictionaryEntry) => { setSelectedState(e); setSelectedId(e.id); };
  // Restore the last inspected field when it is on the current page of results.
  useEffect(() => {
    if (!selected && selectedId) { const hit = data.items.find((e) => e.id === selectedId); if (hit) setSelectedState(hit); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const visible = warningsOnly ? data.items.filter((e) => e.selectors.some((x) => x.warnings.length) || !e.selectors.some((x) => x.supported)) : data.items;
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
          <input aria-label="Search dictionary" placeholder="Page, section, field, selector or file…" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} onKeyDown={clearOnEscape(query, setQuery)} />
        </label>
        <button className={`button small ghost ${warningsOnly ? 'active' : ''}`} aria-pressed={warningsOnly} onClick={() => setWarningsOnly(!warningsOnly)} title="Show only fields with brittle, XPath or unsupported selectors">Needs attention</button>
        <span className="badge">{data.total.toLocaleString()} fields</span>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="dictionary-grid">
        <div className="dictionary-fields" role="listbox" aria-label="Dictionary fields" onKeyDown={arrowNav}>
          {visible.map((e) => (
            <RowMenu
              key={e.id}
              items={[
                ...(onGenerate ? [{ label: 'Use in Test Generator', icon: Wand2, onSelect: () => onGenerate(e) }] : []),
                ...(onSource ? [{ label: 'Open dictionary source', icon: FileCode2, onSelect: () => onSource(e.file, e.line) }] : []),
                'separator' as const,
                { label: 'Copy Section/Field path', icon: Copy, onSelect: () => copyText(`${e.section}/${e.field}`) },
                { label: 'Copy first locator', icon: Copy, disabled: !e.selectors.some((x) => x.code), onSelect: () => copyText(e.selectors.find((x) => x.code)?.code ?? '') },
                { label: 'Copy field XML', icon: Copy, onSelect: () => copyText(`<Field XRefCode="${e.field}" Type="${e.fieldType}">\n${e.selectors.map((x) => `  <Selector Type="${x.type}">${x.value}</Selector>`).join('\n')}\n</Field>`) },
                { label: `Show all fields in ${e.section}`, icon: Search, onSelect: () => { setQuery(e.section); setOffset(0); } },
              ]}
            >
              <button data-nav-item role="option" aria-selected={selected?.id === e.id} className={`dictionary-field ${selected?.id === e.id ? 'selected' : ''}`} onClick={() => setSelected(e)} onFocus={() => setSelected(e)}>
                <strong><Highlight text={`${e.section} / ${e.field}`} query={query} /></strong>
                <span>{e.page || 'Unnamed page'} · {e.fieldType} · {e.selectors.length} selector{e.selectors.length === 1 ? '' : 's'}{e.selectors.some((x) => x.warnings.length) ? ' · ⚠' : ''}</span>
              </button>
            </RowMenu>
          ))}
          {!visible.length && <p className="subtle">{warningsOnly && data.items.length ? 'No fields with warnings on this page.' : ''}</p>}
          {!data.items.length && <p className="subtle">No Page → Section → Field XML entries match. Configure dictionary XML patterns in Config.</p>}
          <div className="pagination">
            <button className="button tiny ghost" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 12))}>Previous</button>
            <span>{data.items.length ? `${offset + 1}–${offset + data.items.length}` : ''}</span>
            <button className="button tiny ghost" disabled={!data.hasNext} onClick={() => setOffset(offset + 12)}>Next</button>
          </div>
        </div>
        <div>
          {selected ? (
            <>
              <div className="inspector-heading">
                <h3>{selected.section} / {selected.field}</h3>
                <span className="meta">{selected.page} · {selected.file}:{selected.line}</span>
                {onGenerate && <button className="button tiny primary" onClick={() => onGenerate(selected)}><Wand2 size={13} />Use in Test Generator</button>}
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
              <div className="code-with-copy">
                <CodeMirror value={code} theme={oneDark} extensions={[StreamLanguage.define(csharp)]} editable={false} />
                <CopyButton text={code} label="Copy locator code" />
              </div>
              {!compact && (
                <Collapsible id="dictionary-source" title="Dictionary source" summary={selected.file} defaultOpen={false}>
                  <CodeMirror value={source} theme={oneDark} height="260px" extensions={[StreamLanguage.define(xml)]} editable={false} />
                </Collapsible>
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
