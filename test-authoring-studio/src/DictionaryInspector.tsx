import { useEffect, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { useEditorTheme } from './themes';
import { Search, Wand2, Copy, FileCode2 } from 'lucide-react';
import { RowMenu, Highlight, CopyButton, Collapsible, arrowNav, copyText, clearOnEscape, useLocalState } from './ui';
import { api, type Paged } from './api';
import SelectorResolution from './SelectorResolution';
import type { DictionaryEntry } from './types';
import { Select, Checkbox, Button } from './radix';
import * as Tabs from '@radix-ui/react-tabs';
import { useLocalState as useTabState } from './ui';
import { xmlExtensions } from './editor/xml';
import { labelled } from './editor/a11y';
const dictXml = xmlExtensions(true);

export default function DictionaryInspector({ revision = '', compact = false, onSource, onGenerate }: { revision?: string; compact?: boolean; onSource?: (file: string, line: number) => void; onGenerate?: (entry: DictionaryEntry) => void }) {
  const editorTheme = useEditorTheme();
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Paged<DictionaryEntry>>({ items: [], total: 0, hasNext: false });
  const [loaded, setLoaded] = useState(false);
  const [detailTab, setDetailTab] = useTabState('dictionary:tab', 'resolution');
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
          .then((body) => { setData(body); setError(''); setLoaded(true); })
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
        <Checkbox id="dict-warnings-only" checked={warningsOnly} onCheckedChange={setWarningsOnly} label="Needs attention" title="Show only fields with brittle, XPath or unsupported selectors" />
        <span className="badge">{data.total.toLocaleString()} fields</span>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="dictionary-grid">
        <div className="dictionary-fields" role="group" aria-label="Dictionary fields" onKeyDown={arrowNav}>
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
              <button data-nav-item aria-pressed={selected?.id === e.id} className={`dictionary-field ${selected?.id === e.id ? 'selected' : ''}`} onClick={() => setSelected(e)} onFocus={() => setSelected(e)}>
                <strong><Highlight text={`${e.section} / ${e.field}`} query={query} /></strong>
                <span>{e.page || 'Unnamed page'} · {e.fieldType} · {e.selectors.length} selector{e.selectors.length === 1 ? '' : 's'}{e.selectors.some((x) => x.warnings.length) ? ' · ⚠' : ''}</span>
              </button>
            </RowMenu>
          ))}
          {!visible.length && <p className="subtle">{warningsOnly && data.items.length ? 'No fields with warnings on this page.' : ''}</p>}
          {!loaded && Array.from({ length: 6 }, (_, i) => <span key={i} className="skeleton skeleton-row" aria-hidden="true" />)}
          {loaded && !data.items.length && <p className="subtle">No Page → Section → Field XML entries match. Configure dictionary XML patterns in Config.</p>}
          <div className="pagination">
            <Button variant="ghost" size="tiny" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 12))}>Previous</Button>
            <span>{data.items.length ? `${offset + 1}–${offset + data.items.length}` : ''}</span>
            <Button variant="ghost" size="tiny" disabled={!data.hasNext} onClick={() => setOffset(offset + 12)}>Next</Button>
          </div>
        </div>
        <div>
          {selected ? (
            <>
              <div className="inspector-heading">
                <h3>{selected.section} / {selected.field}</h3>
                <span className="meta">{selected.page} · {selected.file}:{selected.line}</span>
                {onGenerate && <Button variant="primary" size="tiny" onClick={() => onGenerate(selected)}><Wand2 size={13} />Use in Test Generator</Button>}
              </div>
              <Tabs.Root value={detailTab} onValueChange={setDetailTab} className="detail-tabs">
                <Tabs.List className="tabs-list" aria-label="Field details">
                  <Tabs.Trigger value="resolution" className="tabs-trigger">Resolution</Tabs.Trigger>
                  <Tabs.Trigger value="code" className="tabs-trigger">Locator code</Tabs.Trigger>
                  {!compact && <Tabs.Trigger value="source" className="tabs-trigger">Source</Tabs.Trigger>}
                </Tabs.List>
                <Tabs.Content value="resolution" className="tabs-content">
              <SelectorResolution entry={selected} />
                </Tabs.Content>
                <Tabs.Content value="code" className="tabs-content">
              <div className="locator-inputs">
                <Select ariaLabel="Locator action" value={action} onValueChange={setAction} options={[{ value: 'fill', label: 'Fill' }, { value: 'click', label: 'Click' }, { value: 'visible', label: 'Verify visible' }]} />
                {action === 'fill' && <input aria-label="Test data value" placeholder="Test data value" value={value} onChange={(e) => setValue(e.target.value)} />}
              </div>
              <div className="code-with-copy">
                <CodeMirror value={code} theme={editorTheme} extensions={[StreamLanguage.define(csharp), labelled('Locator code', true)]} editable={false} />
                <CopyButton text={code} label="Copy locator code" />
              </div>
                </Tabs.Content>
                {!compact && (
                  <Tabs.Content value="source" className="tabs-content">
                    <CodeMirror value={source} theme={editorTheme} height="320px" extensions={[...dictXml, labelled(`Dictionary source ${selected.file}`, true)]} editable={false} />
                  </Tabs.Content>
                )}
              </Tabs.Root>
            </>
          ) : (
            <div className="empty-state">Select a dictionary field to inspect its selector order and locator code.</div>
          )}
        </div>
      </div>
    </section>
  );
}
