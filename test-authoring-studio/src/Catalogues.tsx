import { useEffect, useState } from 'react';
import { Search, FileCode2, Copy, Plus, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { api, type Paged } from './api';
import type { Selector } from './types';

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
      <button className="button small" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - limit))}><ChevronLeft size={14} />Previous</button>
      <span>{data.items.length ? `${offset + 1}–${offset + data.items.length} of ${data.total.toLocaleString()}` : 'No results'}</span>
      <button className="button small" disabled={!data.hasNext} onClick={() => setOffset(offset + limit)}>Next<ChevronRight size={14} /></button>
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
        <label className="search-box"><Search size={16} /><input aria-label="Search Selectors" placeholder="Search selectors…" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} /></label>
        <select aria-label="Selector type" value={type} onChange={(e) => { setType(e.target.value); setOffset(0); }}>
          <option value="">All locator types</option>
          {['GetByTestId', 'GetByRole', 'GetByLabel', 'GetByText', 'Locator'].map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="catalog-grid" aria-busy={loading}>
        {data.items.map((s) => (
          <article className="panel catalog-card" key={s.id ?? `${s.file}:${s.line}`}>
            <div className="catalog-card-top">
              <span className="badge teal">{s.type}</span>
              <span className={`badge ${s.resolution === 'Static' ? 'green' : 'amber'}`}>{s.resolution}</span>
            </div>
            <h3>{s.owner}.{s.member}</h3>
            <code className="selector-code">{s.value}</code>
            <button className="source-link" onClick={() => onSource(s.file, s.line)}><FileCode2 size={13} />{s.file}:{s.line}</button>
            <div className="catalog-card-footer">
              <span>Existing repository selector</span>
              <button className="icon-button" aria-label="Copy selector" onClick={() => navigator.clipboard.writeText(s.value).then(() => onNotice('Selector copied.')).catch(() => onNotice('Clipboard unavailable.'))}><Copy size={15} /></button>
            </div>
          </article>
        ))}
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
        <label className="search-box"><Search size={16} /><input aria-label="Search Backgrounds" placeholder="Search backgrounds…" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} /></label>
      </div>
      {error && <p role="alert" className="inline-error">{error}</p>}
      <div className="catalog-grid" aria-busy={loading}>
        {data.items.map((b) => (
          <article className="panel catalog-card" key={`${b.file}:${b.line}`}>
            <div className="catalog-card-top"><span className="badge purple">BACKGROUND</span><span>{b.steps.length} steps</span></div>
            <h3>{b.name || b.file}</h3>
            {b.steps.map((s, i) => <p className="background-step" key={i}><Check size={13} /><code>{s.keyword} {s.text}</code></p>)}
            <button className="source-link" onClick={() => onSource(b.file, b.line)}>{b.file}:{b.line}</button>
            <button className="button tiny" onClick={() => onReuse(b)}><Plus size={14} />Reuse background</button>
          </article>
        ))}
        {!loading && !data.items.length && <div className="empty-state">No matching backgrounds.</div>}
      </div>
      <Pager offset={offset} limit={24} data={data} setOffset={setOffset} />
    </section>
  );
}
