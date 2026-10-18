import { useEffect, useMemo, useState } from 'react';
import { CircleCheck, CircleX } from 'lucide-react';
import { api } from '../api';

type Info = { regex: string; cucumber: boolean; steps: { file: string; line: number; text: string }[]; error?: string };

/**
 * Check RegExp (Rider's Alt+Enter ▸ Check RegExp) for step definition patterns: a sample to test, the groups it
 * captures, and the feature steps the pattern matches. Cucumber expressions are converted like Reqnroll does.
 */
export default function CheckRegExp({ initial, onOpen }: { initial: string; onOpen: (file: string, line: number) => void }) {
  const [pattern, setPattern] = useState(initial);
  const [sample, setSample] = useState('');
  const [info, setInfo] = useState<Info>();
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => api<Info>('/steps/regex', { pattern }).then((r) => {
      if (!live) return;
      setInfo(r);
      setSample((s) => s || r.steps[0]?.text || '');
    }, (e) => live && setInfo({ regex: '', cucumber: false, steps: [], error: (e as Error).message })), 250);
    return () => { live = false; clearTimeout(t); };
  }, [pattern]);
  const test = useMemo(() => {
    if (!info || info.error) return null;
    try {
      // Step definitions match the whole step text (Reqnroll anchors them).
      const re = new RegExp(`^(?:${info.regex.replace(/^\^/, '').replace(/\$$/, '')})$`);
      const m = re.exec(sample);
      return { ok: !!m, groups: m ? m.slice(1) : [] };
    } catch (e) { return { error: (e as Error).message }; }
  }, [info, sample]);
  return (
    <div className="check-regexp">
      <label>Pattern {info?.cucumber && <small>(Cucumber expression)</small>}
        <input aria-label="Pattern" value={pattern} spellCheck={false} onChange={(e) => setPattern(e.target.value)} autoFocus />
      </label>
      {info?.cucumber && <p className="subtle">As a regular expression: <code>{info.regex}</code></p>}
      <label>Sample step text
        <input aria-label="Sample" value={sample} spellCheck={false} onChange={(e) => setSample(e.target.value)} placeholder="the user signs in as &quot;admin&quot;" />
      </label>
      {(info?.error || (test && 'error' in test)) && <p className="field-error" role="alert">{info?.error ?? (test as { error: string }).error}</p>}
      {test && 'ok' in test && (
        <div className={`regexp-result ${test.ok ? 'ok' : 'bad'}`} role="status">
          {test.ok ? <><CircleCheck size={14} /> Matches</> : <><CircleX size={14} /> No match</>}
          {test.ok && test.groups.length > 0 && (
            <ol aria-label="Groups">{test.groups.map((g, i) => <li key={i}><small>Group {i + 1}</small> <code>{g ?? '(none)'}</code></li>)}</ol>
          )}
        </div>
      )}
      {info && !info.error && (
        <section aria-label="Matching steps">
          <h4>{info.steps.length} step{info.steps.length === 1 ? '' : 's'} in features match</h4>
          <ul>
            {info.steps.slice(0, 50).map((s) => <li key={`${s.file}:${s.line}`}><button className="link-button" onClick={() => onOpen(s.file, s.line)}>{s.text}</button> <small>{s.file}:{s.line}</small></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
