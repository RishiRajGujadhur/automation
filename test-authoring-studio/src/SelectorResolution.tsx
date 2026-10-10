import { useEffect, useState } from 'react';
import { Globe, ScanSearch } from 'lucide-react';
import { api, type Verification } from './api';
import type { DictionaryEntry } from './types';

const rankLabel = (type: string, value: string) => {
  const t = type.toLowerCase();
  if (t === 'testid') return 'Priority 1 · test id';
  if (t.startsWith('ariarole.')) return 'Priority 2 · role + name';
  if (t === 'text') return 'Priority 3 · text';
  if (t === 'css') return /^#[\w-]+$/.test(value) ? 'Priority 4 · CSS id' : 'Priority 5 · CSS';
  if (t === 'xpath') return 'Priority 6 · XPath';
  return 'Unsupported';
};
const verdict: Record<string, [string, string]> = {
  verified: ['green', 'Browser verified · 1 match'],
  multiple: ['amber', 'Browser · multiple matches'],
  none: ['red', 'Browser · no match'],
  unsupported: ['muted', 'Not testable'],
  error: ['red', 'Browser error'],
};

/**
 * Selectors in dictionary document order. Static preview badges are always shown; browser badges only
 * appear after an explicit verification run, so the two are never confused.
 */
export default function SelectorResolution({ entry, defaultUrl = '' }: { entry: DictionaryEntry; defaultUrl?: string }) {
  const [url, setUrl] = useState(defaultUrl);
  const [result, setResult] = useState<Verification>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setResult(undefined); setError(''); }, [entry.id]);
  const firstSupported = entry.selectors.find((s) => s.supported);
  const firstVerified = result?.results.findIndex((r) => r.status === 'verified') ?? -1;
  return (
    <div className="selector-resolution">
      <ol className="selector-order">
        {entry.selectors.map((s, i) => {
          const v = result?.results[i];
          return (
            <li key={i} className={result ? (i === firstVerified ? 'resolved' : '') : s === firstSupported ? 'resolved' : ''}>
              <span className="order-index">{i + 1}</span>
              <span className={`badge ${s.supported ? 'teal' : 'amber'}`}>{s.type}</span>
              <code>{s.value}</code>
              <small>
                <span className="badge muted">Static · {rankLabel(s.type, s.value)}</span>
                {!result && s === firstSupported && <span className="badge purple">First supported</span>}
                {v && <span className={`badge ${verdict[v.status][0]}`}>{verdict[v.status][1]}{v.status === 'verified' && v.visible === false ? ' (hidden)' : ''}</span>}
                {result && i === firstVerified && <span className="badge green">Resolves here</span>}
                {s.warnings.map((w) => <span key={w} className="badge amber">{w}</span>)}
                {v?.error && <span className="subtle">{v.error}</span>}
              </small>
            </li>
          );
        })}
      </ol>
      <div className="verify-row">
        <label className="search-box">
          <Globe size={15} />
          <input aria-label="Verification page URL" placeholder="Page URL (uses the live recording page when open)" value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <button
          className="button small"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              setResult(await api<Verification>('/dictionary/verify', { selectors: entry.selectors.map(({ type, value }) => ({ type, value })), url: url || undefined }));
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <ScanSearch size={14} />
          {busy ? 'Verifying…' : 'Verify in browser'}
        </button>
      </div>
      {result ? (
        <p className="subtle">Verified against {result.url} ({result.source}). Counts reflect that page's current state only.</p>
      ) : (
        <p className="subtle">Static preview: order and support are read from XML; nothing has been tested in a browser yet.</p>
      )}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </div>
  );
}
