import { useEffect, useRef, useState } from 'react';
import { Circle, Square, Braces, X } from 'lucide-react';
import { api } from './api';
import { Button } from './radix';
import RecordingDictionary from './RecordingDictionary';
import { useLocalState } from './ui';
import type { Action, Index, Match } from './types';

/** Recorded action → Gherkin line: an existing step when the match is confident, proposed wording otherwise. */
export function actionToStep(m: Match, first: boolean, threshold = 0.6) {
  const top = m.candidates[0];
  if (top && top.score >= threshold) return `${top.binding.keyword === 'Given' && !first ? 'And' : top.binding.keyword} ${top.text}`;
  const a: Action = m.action;
  const name = a.target?.name ?? a.target?.testId ?? a.target?.description ?? 'element';
  const kind = a.target?.role ? ` ${a.target.role}` : '';
  switch (a.action) {
    case 'goto': return `${first ? 'Given' : 'And'} the user opens "${a.url ?? ''}"`;
    case 'fill': return `When the user enters "${a.sensitive ? '<secret>' : a.value ?? ''}" in the "${name}"${kind || ' field'}`;
    case 'press': return `When the user presses "${a.key ?? ''}"${a.target?.name ? ` in the "${a.target.name}"${kind}` : ''}`;
    case 'click': return `When the user clicks the "${name}"${kind}`;
  }
}

/**
 * Record steps with Playwright from the Test Generator. Recorded actions are appended to the scenario as Gherkin
 * (the step check then flags lines with no binding), and selectors from the recording can be added to an
 * existing or new dictionary file.
 */
export default function GeneratorRecorder({ onLines, onIndex, onNotice, onClose, continuing = false }: { continuing?: boolean; onLines: (lines: string[]) => void; onIndex: (i: Index) => void; onNotice?: (m: string) => void; onClose: () => void }) {
  const [url, setUrl] = useLocalState('generator:recordUrl', `${location.origin}/api/demo`);
  const [status, setStatus] = useState<'idle' | 'recording' | 'stopping'>('idle');
  const [count, setCount] = useState(0);
  const [actions, setActions] = useState<Action[]>();
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  useEffect(() => () => clearInterval(timer.current), []);

  const start = async () => {
    setError(''); setActions(undefined);
    try {
      await api('/recording/clear', {});
      await api('/recording/start', { url });
      setStatus('recording');
      timer.current = setInterval(() => api<{ actions: Action[] }>('/recording').then((r) => setCount(r.actions.length)).catch(() => {}), 1000);
    } catch (e) { setError((e as Error).message); }
  };
  const stop = async () => {
    clearInterval(timer.current);
    setStatus('stopping');
    try {
      await api('/recording/stop', {});
      const { actions: recorded } = await api<{ actions: Action[] }>('/recording');
      setActions(recorded);
      if (!recorded.length) { onNotice?.('Nothing was recorded.'); return; }
      const matches = await api<Match[]>('/recording/match', { actions: recorded });
      const lines = matches.map((m, i) => actionToStep(m, i === 0 && !continuing));
      onLines(lines);
      const reused = matches.filter((m) => (m.candidates[0]?.score ?? 0) >= 0.6).length;
      onNotice?.(`${lines.length} steps added: ${reused} reuse existing bindings, ${lines.length - reused} need a binding.`);
    } catch (e) { setError((e as Error).message); }
    finally { setStatus('idle'); }
  };

  return (
    <section className="generator-recorder" aria-label="Record steps with Playwright">
      <div className="recorder-row">
        <input aria-label="Start URL" value={url} onChange={(e) => setUrl(e.target.value)} disabled={status !== 'idle'} placeholder="https://…" />
        {status === 'idle' ? (
          <Button size="small" variant="primary" onClick={start} disabled={!/^https?:\/\//.test(url)}><Circle size={12} fill="currentColor" />Record</Button>
        ) : (
          <Button size="small" variant="danger" onClick={stop} disabled={status === 'stopping'}><Square size={12} fill="currentColor" />{status === 'stopping' ? 'Stopping…' : `Stop (${count})`}</Button>
        )}
        <button className="icon-button" aria-label="Close recorder" onClick={onClose}><X size={14} /></button>
      </div>
      {status === 'recording' && <p className="subtle">Chromium is open. Use the page; each click, fill and key press becomes a step. Stop when done.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {actions && actions.length > 0 && (
        <details className="recorder-selectors" open>
          <summary><Braces size={13} /> Selectors from this recording</summary>
          <RecordingDictionary actions={actions} onIndex={onIndex} compact />
        </details>
      )}
    </section>
  );
}
