import { useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, WrapText, Copy, X, ArrowDownToLine } from 'lucide-react';
import { api } from './api';
import { useBuild } from './build/store';
import { useTestRun } from './testing/store';
import { useDebug } from './debug/store';
import { useStudioLog } from './outputLog';
import { copyText, useLocalState } from './ui';

export type OutputSource = 'build' | 'tests' | 'debug' | 'language' | 'studio';
const SOURCES: { id: OutputSource; label: string }[] = [
  { id: 'build', label: 'Build' },
  { id: 'tests', label: 'Tests' },
  { id: 'debug', label: 'Debug' },
  { id: 'language', label: 'C# language service' },
  { id: 'studio', label: 'Studio' },
];

/**
 * Output window (Visual Studio): one pane, "Show output from" picks the source — Build, Tests, Debug, the C# language
 * service and the studio's own messages. Clear (per source), word wrap, copy, and auto-scroll that stops while you
 * read earlier lines.
 */
export default function OutputPanel({ source, onSource, onClose, onNotice }: { source: OutputSource; onSource: (s: OutputSource) => void; onClose: () => void; onNotice: (m: string) => void }) {
  const build = useBuild();
  const tests = useTestRun();
  const debug = useDebug();
  const studio = useStudioLog();
  const [language, setLanguage] = useState<string[]>([]);
  const [wrap, setWrap] = useLocalState('outputWrap', false);
  // Clear hides what was there (per source): the text length at the time of clearing.
  const [cleared, setCleared] = useState<Partial<Record<OutputSource, string>>>({});
  const pre = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => {
    if (source !== 'language') return;
    const load = () => api<{ lines: string[] }>('/output/language').then((r) => setLanguage(r.lines), () => {});
    void load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [source]);
  const full = useMemo(() => ({
    build: build.output ?? '',
    tests: tests.output ?? '',
    debug: debug.state.output ?? '',
    language: language.join('\n'),
    studio: studio.join('\n'),
  }), [build.output, tests.output, debug.state.output, language, studio]);
  const text = (() => { const all = full[source]; const mark = cleared[source]; return mark !== undefined && all.startsWith(mark) ? all.slice(mark.length).replace(/^\n/, '') : all; })();
  useEffect(() => { const p = pre.current; if (p && follow.current) p.scrollTop = p.scrollHeight; }, [text]);
  return (
    <section className="debug-panel output-panel" aria-label="Output">
      <div className="debug-toolbar" role="toolbar" aria-label="Output">
        <label className="output-source">Show output from:
          <select aria-label="Show output from" value={source} onChange={(e) => onSource(e.target.value as OutputSource)}>
            {SOURCES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <button className="icon-button" aria-label="Clear all" title="Clear all" onClick={() => setCleared({ ...cleared, [source]: full[source] })}><Eraser size={14} /></button>
        <button className="icon-button" aria-label="Toggle word wrap" title="Toggle word wrap" aria-pressed={wrap} onClick={() => setWrap(!wrap)}><WrapText size={14} /></button>
        <button className="icon-button" aria-label="Copy output" title="Copy" onClick={() => void copyText(text).then((ok) => onNotice(ok ? 'Output copied.' : 'Clipboard unavailable.'))}><Copy size={14} /></button>
        <button className="icon-button" aria-label="Scroll to end" title="Scroll to the end" onClick={() => { follow.current = true; const p = pre.current; if (p) p.scrollTop = p.scrollHeight; }}><ArrowDownToLine size={14} /></button>
        <span className="debug-spacer" />
        <button className="icon-button" aria-label="Close output" title="Close" onClick={onClose}><X size={14} /></button>
      </div>
      <pre
        ref={pre}
        className={`debug-output output-text ${wrap ? 'wrap' : ''}`}
        aria-label={`Output from ${SOURCES.find((s) => s.id === source)!.label}`}
        tabIndex={0}
        onScroll={(e) => { const p = e.currentTarget; follow.current = p.scrollTop + p.clientHeight >= p.scrollHeight - 4; }}
      >{text || 'No output yet.'}</pre>
    </section>
  );
}
