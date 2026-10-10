import { useMemo } from 'react';
import { BookOpenText, Printer } from 'lucide-react';
import { Button } from '../radix';
import { useAlgorithms } from '../radix2';
import { useLocalState } from '../ui';
import { livingDocsHtml, livingDocsMarkdown, type DocFeature } from '../algorithms/docs';
import { rollupTree, type Status } from '../algorithms/tags';
import { loadRuns } from './ResultsTool';
import { AlgoGate, Empty, ResultActions, type ToolProps } from './shared';

/** F9: living documentation with the latest imported status per scenario. */
export default function DocsTool({ corpus, onNotice }: ToolProps) {
  const { on } = useAlgorithms();
  const [title, setTitle] = useLocalState('design:docs:title', 'Living documentation');
  const latest = useMemo(() => {
    const runs = loadRuns().sort((a, b) => a.at - b.at);
    const m = new Map<string, Status>();
    runs.forEach((r) => r.results.forEach((x) => m.set(x.name.trim().toLowerCase(), x.outcome)));
    return m;
  }, []);
  const features: DocFeature[] = useMemo(() => (corpus?.features ?? []).map((f) => ({
    file: f.file, name: f.name, tags: f.tags,
    scenarios: f.scenarios.map((s) => ({ name: s.name, keyword: s.keyword, tags: s.tags ?? [], steps: s.steps.map((st) => ({ keyword: st.keyword.trim(), text: st.text })), status: latest.get(s.name.trim().toLowerCase()) ?? 'unknown' })),
  })), [corpus, latest]);
  const html = useMemo(() => (features.length ? livingDocsHtml(features, title) : ''), [features, title]);
  const md = useMemo(() => livingDocsMarkdown(features, title), [features, title]);
  const tree = on('status-rollup') ? rollupTree(features.flatMap((f) => f.scenarios.map((s) => ({ path: `${f.file}/${s.name}`, status: s.status })))) : new Map();
  if (!corpus) return <p className="subtle">Loading features…</p>;
  return (
    <AlgoGate ids={['living-docs']}>
      <div className="design-tool">
        <section className="panel" aria-labelledby="docs-head">
          <div className="design-head"><h2 id="docs-head"><BookOpenText size={16} aria-hidden="true" /> Living documentation</h2><span className="badge">{features.length} features · {latest.size ? `${latest.size} results` : 'no results imported'}</span></div>
          <label className="field"><span className="micro-label">TITLE</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          {!latest.size && <p className="subtle">Import a report in <b>Results & flakiness</b> to show pass/fail next to each scenario.</p>}
          <ResultActions text={html} file="living-docs.html" type="text/html" onNotice={onNotice}>
            <Button size="small" onClick={() => { const blob = new Blob([md], { type: 'text/markdown' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'living-docs.md'; a.click(); }}>Download md</Button>
            <Button size="small" disabled={!html} onClick={() => { const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); w.focus(); w.print(); } else onNotice('Pop-up blocked: download the HTML and print it instead.'); }}><Printer size={13} aria-hidden="true" />Print</Button>
          </ResultActions>
          {tree.size > 0 && (
            <ul className="rollup-list">{[...tree].filter(([k]) => k.split('/').length <= 3 && !k.endsWith('.feature')).slice(0, 20).map(([k, v]) => <li key={k}><span className={`badge ${v.status === 'passed' ? 'green' : v.status === 'failed' ? 'red' : 'muted'}`}>{v.status}</span> {k} <span className="meta">✓{v.counts.passed} ✗{v.counts.failed} ·{v.counts.unknown}</span></li>)}</ul>
          )}
          {html ? <iframe className="docs-preview" title="Living documentation preview" srcDoc={html} sandbox="" /> : <Empty title="No features" />}
        </section>
      </div>
    </AlgoGate>
  );
}
