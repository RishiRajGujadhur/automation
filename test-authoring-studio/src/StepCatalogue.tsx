import { useEffect, useState } from 'react';
import { Command } from 'cmdk';
import { Search, Plus, ChevronLeft, ChevronRight, FileCode2, GitBranch, Copy, Filter, X } from 'lucide-react';
import type { Binding } from './types';
import { useStepSearch } from './useStepSearch';
import { RowMenu, MenuHint, Highlight, copyText, useLocalState } from './ui';
import { Checkbox, Button } from './radix';

const tone = (k: string) => (k === 'Given' ? 'purple' : k === 'When' ? 'teal' : 'green');
/** Pattern with regex groups shown as readable placeholders. */
export function readablePattern(b: Binding) {
  let n = 0;
  return b.pattern.replace(/^\^|\$$/g, '').replace(/\((?:\.\*|\.\+|\[\^"\]\*)\)|\{[A-Za-z]*\}/g, () => `<${b.parameters[n++]?.name ?? 'value'}>`);
}

export default function StepCatalogue({ query, onQuery, onAdd, onInspect, onSource, onNotice, revision = '', compact = false }: { query: string; onQuery: (q: string) => void; onAdd: (b: Binding) => void; onInspect?: (b: Binding) => void; onSource?: (file: string, line: number) => void; onNotice?: (m: string) => void; revision?: string; compact?: boolean }) {
  const [offset, setOffset] = useState(0);
  const [keyword, setKeyword] = useLocalState('catalog:keyword', '');
  const [focused, setFocused] = useState(false);
  const [unused, setUnused] = useLocalState('catalog:unused', false);
  const limit = compact ? 8 : 24;
  const { data, loading, error } = useStepSearch(query, offset, limit, keyword, revision);
  useEffect(() => setOffset(0), [revision]);
  const update = (q: string) => { onQuery(q); setOffset(0); };
  const copy = async (text: string, what: string) => onNotice?.((await copyText(text)) ? `${what} copied.` : 'Clipboard unavailable.');
  const items = unused ? data.items.filter((b) => !b.usages) : data.items;
  return (
    <section className={`step-catalogue ${compact ? 'compact' : ''}`} aria-label="Step catalogue">
      <div className="catalog-toolbar">
        <Command shouldFilter={false} className="step-autocomplete" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false); }}>
          <div className="search-box">
            <Search size={16} />
            <Command.Input
              aria-label={compact ? 'Search steps to add' : 'Search Step Catalog'}
              placeholder="Search steps, actions, pages…  (Esc clears)"
              value={query}
              onValueChange={update}
              autoFocus={!compact}
              onFocus={() => setFocused(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  if (focused && query) update('');
                  setFocused(false);
                }
              }}
            />
          </div>
          <Command.List hidden={!focused || !query || loading} className="autocomplete-options" aria-label="Step suggestions">
            {data.items.slice(0, 5).map((b) => (
              <Command.Item key={b.id} value={b.id} onSelect={() => { update(b.pattern); setFocused(false); }}>
                {b.keyword} {b.pattern}
              </Command.Item>
            ))}
          </Command.List>
        </Command>
        <div className="segmented small" role="group" aria-label="Binding type">
          {['', 'Given', 'When', 'Then'].map((k) => (
            <button key={k || 'all'} className={keyword === k ? 'active' : ''} aria-pressed={keyword === k} onClick={() => { setKeyword(k); setOffset(0); }}>
              {k || 'All'}
            </button>
          ))}
        </div>
        {(query || keyword || unused) && (
          <Button variant="ghost" size="small" onClick={() => { update(''); setKeyword(''); setUnused(false); }} title="Clear search and filters">
            <X size={13} />
            Clear
          </Button>
        )}
        {!compact && (
          <Checkbox id="catalog-unused" checked={unused} onCheckedChange={setUnused} label="Unused only" title="Show only bindings no feature uses yet" />
        )}
      </div>
      <div className="search-summary" aria-live="polite">
        {loading ? 'Searching repository…' : error ? <span role="alert">{error}</span> : `${data.items.length ? `${offset + 1}–${offset + data.items.length} of ${data.total.toLocaleString()}` : 'No results'} · ${data.indexedTotal.toLocaleString()} indexed`}
        <span className="subtle">Right-click a step for more actions</span>
      </div>
      <div className={compact ? 'step-picker-results' : 'catalog-grid'} aria-busy={loading}>
        {!loading && !error && items.map((b) => (
          <RowMenu
            key={b.id}
            label={`Actions for ${b.pattern}`}
            items={[
              { label: 'Add to scenario', icon: Plus, onSelect: () => onAdd(b) },
              ...(onInspect ? [{ label: 'Inspect evidence', icon: GitBranch, onSelect: () => onInspect(b) }] : []),
              ...(onSource ? [{ label: 'Open source', icon: FileCode2, onSelect: () => onSource(b.file, b.line) }] : []),
              'separator',
              { label: 'Copy pattern', icon: Copy, onSelect: () => copy(b.pattern, 'Pattern') },
              { label: 'Copy as Gherkin', icon: Copy, onSelect: () => copy(`${b.keyword} ${readablePattern(b)}`, 'Gherkin step') },
              { label: 'Copy source location', icon: Copy, onSelect: () => copy(`${b.file}:${b.line}`, 'Location') },
              { label: `Show only ${b.keyword} steps`, icon: Filter, onSelect: () => { setKeyword(b.keyword); setOffset(0); } },
            ]}
          >
            <article className="panel catalog-card" data-menu-row tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onAdd(b); }}>
              <div className="catalog-card-top">
                <span className={`badge ${tone(b.keyword)}`}>{b.keyword}</span>
                <span className={b.usages ? '' : 'subtle'}>{b.usages ? `${b.usages} usages` : 'unused'}</span>
                {!compact && <MenuHint />}
              </div>
              <h3><Highlight text={b.pattern} query={query} /></h3>
              {!compact && b.parameters.length > 0 && (
                <div className="parameter-chips">{b.parameters.map((p) => <span key={p.name} className="badge">{p.name}: {p.type}</span>)}</div>
              )}
              <div className="catalog-card-footer">
                <span className="meta" title={`${b.file}:${b.line}`}>{b.className}</span>
                <Button size="tiny" onClick={() => onAdd(b)}><Plus size={13} />Add to scenario</Button>
              </div>
            </article>
          </RowMenu>
        ))}
        {!loading && !error && !items.length && (
          <div className="empty-state">
            <p>{unused && data.items.length ? 'Every result on this page is already used. Turn off Unused to see them.' : 'No matching steps. Try an action, a page name, or a shorter prefix.'}</p>
            <div className="chip-row">
              {['open', 'click', 'enter', 'search', 'should'].map((q) => <Button key={q} variant="ghost" size="tiny" onClick={() => { update(q); setKeyword(''); }}>{q}</Button>)}
            </div>
          </div>
        )}
      </div>
      <div className="pagination">
        <Button variant="ghost" size="small" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronLeft size={14} />Previous</Button>
        <span>Page {Math.floor(offset / limit) + 1}</span>
        <Button variant="ghost" size="small" disabled={loading || !data.hasNext} onClick={() => setOffset(offset + limit)}>Next<ChevronRight size={14} /></Button>
      </div>
    </section>
  );
}
