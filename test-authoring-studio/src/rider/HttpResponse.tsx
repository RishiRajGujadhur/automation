import { useState } from 'react';
import { Loader, X, Copy } from 'lucide-react';
import { copyText } from '../ui';

export type HttpResult = { request: { method: string; url: string }; loading?: boolean; error?: string; status?: number; statusText?: string; ms?: number; headers?: Record<string, string>; body?: string; truncated?: boolean };

/** The response of an .http request: status, time, headers and the body (JSON pretty-printed). */
export default function HttpResponse({ result, onClose }: { result: HttpResult; onClose: () => void }) {
  const [tab, setTab] = useState<'body' | 'headers'>('body');
  let body = result.body ?? '';
  if (/json/i.test(result.headers?.['content-type'] ?? '')) { try { body = JSON.stringify(JSON.parse(body), null, 2); } catch { /* as is */ } }
  const ok = result.status !== undefined && result.status < 400;
  return (
    <section className="references-panel http-response" aria-label="Response">
      <div className="references-head">
        <strong>{result.request.method} {result.request.url}</strong>
        {result.loading && <span className="meta"><Loader size={12} className="spin" /> Sending…</span>}
        {result.status !== undefined && <span className={`http-status ${ok ? 'ok' : 'bad'}`} role="status">{result.status} {result.statusText}</span>}
        {result.ms !== undefined && <span className="meta">{result.ms} ms</span>}
        <span className="http-tabs" role="tablist" aria-label="Response parts">
          <button role="tab" aria-selected={tab === 'body'} onClick={() => setTab('body')}>Body</button>
          <button role="tab" aria-selected={tab === 'headers'} onClick={() => setTab('headers')}>Headers</button>
        </span>
        <button className="icon-button" aria-label="Copy response" title="Copy" onClick={() => void copyText(body)}><Copy size={13} /></button>
        <button className="icon-button" aria-label="Close response" title="Close" onClick={onClose}><X size={13} /></button>
      </div>
      {result.error && <p className="field-error" role="alert">{result.error}</p>}
      {tab === 'body' && result.body !== undefined && <pre className="http-body" aria-label="Response body">{body}{result.truncated ? '\n… (truncated)' : ''}</pre>}
      {tab === 'headers' && result.headers && <pre className="http-body" aria-label="Response headers">{Object.entries(result.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}</pre>}
    </section>
  );
}
