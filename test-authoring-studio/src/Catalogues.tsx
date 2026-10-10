import { useEffect, useState } from 'react';
import { Search, FileCode2, Copy, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type Paged } from './api';
import type { Selector } from './types';
import { RowMenu, MenuHint, Highlight, copyText, clearOnEscape } from './ui';
import { Select, Button } from './radix';

type Background = { name: string; file: string; line: number; steps: { keyword: string; text: string }[] };

function usePaged<T>(route: string, query: string, offset: number, limit: number, revision = '', extra: Record<string, string> = {}) {
  const [data, setData] = useState<Paged<T>>({ items: [], total: 0, hasNext: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const key = JSON.stringify(extra);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    const t = setTimeout(() =>
      api<Paged<T>>(`${route}?` + new URLSearchParams({ q: query, offset: String(offset), limit: String(limit), ...extra }), undefined, c.signal)
        .then((d) => { setData(d); setError(''); })
        .catch((e) => { if (!c.signal.aborted) setError(e.message); })
        .finally(() => { if (!c.signal.aborted) setLoading(false); }), query ? 180 : 0);
    return () => { clearTimeout(t); c.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, query, offset, limit, revision, key]);
  return { data, loading, error };
}
function Pager({ offset, limit, data, setOffset }: { offset: number; limit: number; data: Paged<unknown>; setOffset: (n: number) => void }) {
  return (
    <div className="pagination">
      <Button variant="ghost" size="small" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronLeft size={14} />Previous</Button>
      <span>{data.items.length ? `${offset + 1}–${offset + data.items.length} of ${data.total.toLocaleString()}` : 'No results'}</span>
      <Button variant="ghost" size="small" disabled={!data.hasNext} onClick={() => setOffset(offset + limit)}>Next<ChevronRight size={14} /></Button>
    </div>
  );
}

export function SelectorCatalogue({ revision, onSource, onNotice }: { revision?: string; onSource: (f: string, l: number) => void; onNotice: (m: string) => void }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, loading, error } = usePaged<Selector>('/selectors', query, offset, 24, revision, { type });
  return (
    <section aria-label="Selector catalogue">
      <div className="catalog-toolbar">
        <label className="search-box"><Search size={16} /><input aria-label="Search Selectors" placeholder="Search selectors…" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} onKeyDown={clearOnEscape(query, setQuery)} /></label>
        <Select ariaLabel="Selector type" value={type} onValueChange={(v) => { setType(v); setOffset(0); }} options={[{ value: '', label: 'All locator types' }, 'GetByTestId', 'GetByRole', 'GetByLabel', 'GetByText', 'Locator']} />
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="catalog-grid" aria-busy={loading}>
        {data.items.map((s) => {
          const copy = async (t: string, what: string) => onNotice((await copyText(t)) ? `${what} copied.` : 'Clipboard unavailable.');
          return (
            <RowMenu
              key={s.id ?? `${s.file}:${s.line}`}
              items={[
                { label: 'Copy selector', icon: Copy, onSelect: () => copy(s.value, 'Selector') },
                { label: 'Copy owner.member', icon: Copy, onSelect: () => copy(`${s.owner}.${s.member}`, 'Member') },
                { label: 'Open source', icon: FileCode2, onSelect: () => onSource(s.file, s.line) },
                'separator',
                { label: `Show only ${s.type}`, icon: Search, onSelect: () => { setType(s.type); setOffset(0); } },
                { label: `Search ${s.owner}`, icon: Search, onSelect: () => { setQuery(s.owner); setOffset(0); } },
              ]}
            >
              <article className="panel catalog-card" data-menu-row>
                <div className="catalog-card-top">
                  <span className="badge teal">{s.type}</span>
                  {s.resolution !== 'Static' && <span className="badge amber" title="Selector value is computed at runtime">Dynamic</span>}
                  <MenuHint />
                </div>
                <h3><Highlight text={`${s.owner}.${s.member}`} query={query} /></h3>
                <code className="selector-code">{s.value}</code>
                <div className="catalog-card-footer">
                  <span className="meta">{s.file.split('/').pop()}:{s.line}</span>
                  <button className="icon-button" aria-label="Copy selector" onClick={() => copy(s.value, 'Selector')}><Copy size={15} /></button>
                </div>
              </article>
            </RowMenu>
          );
        })}
        {!loading && !data.items.length && <div className="empty-state">No matching selectors.</div>}
      </div>
      <Pager offset={offset} limit={24} data={data} setOffset={setOffset} />
    </section>
  );
}

export function BackgroundCatalogue({ revision, onSource, onReuse }: { revision?: string; onSource: (f: string, l: number) => void; onReuse: (b: Background) => void }) {
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const { data, loading, error } = usePaged<Background>('/backgrounds', query, offset, 24, revision);
  return (
    <section aria-label="Background catalogue">
      <div className="catalog-toolbar">
        <label className="search-box"><Search size={16} /><input aria-label="Search Backgrounds" placeholder="Search backgrounds…" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} onKeyDown={clearOnEscape(query, setQuery)} /></label>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="catalog-grid" aria-busy={loading}>
        {data.items.map((b) => (
          <RowMenu
            key={`${b.file}:${b.line}`}
            items={[
              { label: 'Reuse background', icon: Plus, onSelect: () => onReuse(b) },
              { label: 'Open source', icon: FileCode2, onSelect: () => onSource(b.file, b.line) },
              { label: 'Copy steps', icon: Copy, onSelect: () => copyText(b.steps.map((s) => `${s.keyword} ${s.text}`).join('\n')) },
            ]}
          >
            <article className="panel catalog-card" data-menu-row>
              <div className="catalog-card-top"><span className="badge purple">BACKGROUND</span><span>{b.steps.length} steps</span><MenuHint /></div>
              <h3><Highlight text={b.name || b.file.split('/').pop() || b.file} query={query} /></h3>
              {b.steps.slice(0, 3).map((s, i) => <p className="background-step" key={i}><Check size={13} /><code>{s.keyword} {s.text}</code></p>)}
              {b.steps.length > 3 && <p className="subtle">+{b.steps.length - 3} more steps</p>}
              <div className="catalog-card-footer">
                <span className="meta">{b.file}</span>
                <Button size="tiny" onClick={() => onReuse(b)}><Plus size={14} />Reuse</Button>
              </div>
            </article>
          </RowMenu>
        ))}
        {!loading && !data.items.length && <div className="empty-state">No matching backgrounds.</div>}
      </div>
      <Pager offset={offset} limit={24} data={data} setOffset={setOffset} />
    </section>
  );
}
