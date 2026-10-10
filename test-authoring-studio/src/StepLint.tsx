import { useEffect, useRef, useState } from 'react';
import { CircleCheck, CircleAlert, CircleHelp, Lightbulb } from 'lucide-react';
import { api, type Paged } from './api';
import { readablePattern } from './StepCatalogue';
import type { Binding } from './types';

type Line = { keyword: string; resolved: string; text: string };
type Status = { status: 'Matched' | 'Ambiguous' | 'Unmatched'; binding: { pattern: string; file: string; line: number } | null };

/**
 * Live per-line binding status under the scenario textarea, plus suggestions for the line the caret is on.
 * Clicking a suggestion replaces that line with the existing step's wording.
 */
export default function StepLint({ steps, activeLine, onReplace, onSource, revision }: { steps: Line[]; activeLine: number; onReplace: (index: number, text: string) => void; onSource: (file: string, line: number) => void; revision?: string }) {
  const [status, setStatus] = useState<Status[]>([]);
  const [suggestions, setSuggestions] = useState<Binding[]>([]);
  const key = JSON.stringify(steps.map((s) => [s.resolved, s.text]));
  useEffect(() => {
    const c = new AbortController();
    const t = setTimeout(() => api<Status[]>('/steps/match', { steps: steps.map((s) => ({ keyword: s.resolved, text: s.text })) }, c.signal).then(setStatus).catch(() => {}), 300);
    return () => { clearTimeout(t); c.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);
  const current = steps[activeLine];
  const currentStatus = status[activeLine]?.status;
  const lastQuery = useRef('');
  useEffect(() => {
    if (!current || currentStatus === 'Matched') { setSuggestions([]); return; }
    const q = current.text.replace(/"[^"]*"/g, ' ').trim();
    if (q.length < 3 || q === lastQuery.current) return;
    lastQuery.current = q;
    const c = new AbortController();
    const t = setTimeout(() => api<Paged<Binding>>('/steps?' + new URLSearchParams({ q, keyword: current.resolved, limit: '4' }), undefined, c.signal).then((r) => setSuggestions(r.items)).catch(() => {}), 250);
    return () => { clearTimeout(t); c.abort(); };
  }, [current, currentStatus]);
  if (!steps.length) return null;
  const matched = status.filter((s) => s.status === 'Matched').length;
  return (
    <div className="step-lint" aria-label="Step binding status">
      <ol>
        {steps.map((s, i) => {
          const st = status[i];
          const Icon = st?.status === 'Matched' ? CircleCheck : st?.status === 'Ambiguous' ? CircleAlert : CircleHelp;
          return (
            <li key={i} className={`${st?.status?.toLowerCase() ?? ''} ${i === activeLine ? 'active' : ''}`}>
              <Icon size={13} />
              <span className="kw">{s.keyword}</span>
              <span className="txt">{s.text}</span>
              {st?.binding ? (
                <button className="meta link" onClick={() => onSource(st.binding!.file, st.binding!.line)} title={st.binding.pattern}>{st.binding.file.split('/').pop()}:{st.binding.line}</button>
              ) : (
                <span className="meta">{st?.status === 'Ambiguous' ? 'ambiguous' : st ? 'needs binding' : '…'}</span>
              )}
            </li>
          );
        })}
      </ol>
      <div className="lint-footer">
        <span>{status.length ? `${matched}/${steps.length} steps reuse existing bindings` : 'Checking bindings…'}</span>
      </div>
      {suggestions.length > 0 && current && (
        <div className="suggestions" role="list" aria-label="Step suggestions">
          <span className="micro-label"><Lightbulb size={12} /> EXISTING STEPS FOR LINE {activeLine + 1}</span>
          {suggestions.map((b) => (
            <button key={b.id} role="listitem" className="suggestion" onClick={() => onReplace(activeLine, `${current.keyword} ${readablePattern(b)}`)} title="Replace this line with the existing step">
              <span className="badge muted">{b.keyword}</span>
              {readablePattern(b)}
              <span className="meta">{b.usages} uses</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
