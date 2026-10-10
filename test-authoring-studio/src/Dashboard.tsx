import { BookOpen, Blocks, FileCode2, ScanLine, Braces, Wand2, Circle, Layers3, ArrowRight } from 'lucide-react';
import { Indicators, useProjectModel } from './ProjectModelTree';
import type { Index } from './types';
import { Button } from './radix';

export function ContextBar({ index, config, recordStatus, revision }: { index?: Index; config?: { repositoryRoot: string; targetProject: string }; recordStatus: string; revision?: string }) {
  const { model } = useProjectModel(revision);
  const project = model?.projects[0]?.split('/').pop()?.replace(/\.csproj$/, '') ?? model?.root ?? '…';
  const dictionaries = index?.stats?.dictionaries ?? 0;
  return (
    <div className="context-bar" aria-label="Project context">
      <span><strong>Active project</strong> {project}{model?.frameworks.length ? ` (${model.frameworks.join(', ')}` : ' ('}{model?.packages.some((p) => /playwright/i.test(p)) ? ' / Playwright C#)' : ')'}</span>
      <span><strong>Root</strong> {config?.repositoryRoot.split(/[\\/]/).slice(-2).join('/')}</span>
      <span><strong>Browser</strong> Chromium (headless: false) · {recordStatus === 'recording' ? 'recording' : 'idle'}</span>
      <span className={dictionaries ? 'ok' : 'warn'}><span className="status-dot" />{dictionaries ? `${dictionaries} dictionary fields indexed` : 'No dictionary XML found'}</span>
    </div>
  );
}

export default function Dashboard({ index, revision, onNavigate, recent = [], onSource }: { index?: Index; revision?: string; onNavigate: (tab: string) => void; recent?: string[]; onSource?: (file: string, line: number) => void }) {
  const { model } = useProjectModel(revision);
  const s = index?.stats;
  let draft: { featureFile?: string; area?: string; scenarioName?: string; section?: string; field?: string } | undefined;
  try { draft = JSON.parse(localStorage.getItem('tas:generator:draft') ?? 'null') ?? undefined; } catch { draft = undefined; }
  const tiles = [
    { label: 'Feature files', value: s?.features, icon: FileCode2, tab: 'Features' },
    { label: 'Scenarios', value: s?.scenarios, icon: Layers3, tab: 'Features' },
    { label: 'Step bindings', value: s?.steps, icon: BookOpen, tab: 'Step Catalog' },
    { label: 'Backgrounds', value: s?.backgrounds, icon: Blocks, tab: 'Backgrounds' },
    { label: 'Code selectors', value: s?.selectors, icon: ScanLine, tab: 'Selectors' },
    { label: 'Dictionary fields', value: s?.dictionaries, icon: Braces, tab: 'Dictionary Inspector' },
  ];
  return (
    <div className="dashboard">
      <div className="stat-grid">
        {tiles.map((t) => (
          <button key={t.label} className="panel stat-tile" onClick={() => onNavigate(t.tab)}>
            <t.icon size={18} />
            <strong>{t.value?.toLocaleString() ?? '–'}</strong>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {draft?.scenarioName && (
        <button className="panel continue-card" onClick={() => onNavigate('Test Generator')}>
          <span className="micro-label">CONTINUE WHERE YOU LEFT OFF</span>
          <strong>{draft.scenarioName}</strong>
          <span className="meta">{draft.area}/{draft.featureFile} · {draft.section} › {draft.field}</span>
          <ArrowRight size={16} />
        </button>
      )}
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading"><div><h2>Start authoring</h2></div></div>
          <div className="wizard-body quick-actions">
            <Button variant="primary" onClick={() => onNavigate('Test Generator')}><Wand2 size={15} />Generate a test from inputs</Button>
            <Button onClick={() => onNavigate('Recorder')}><Circle size={15} />Record a Playwright workflow</Button>
            <Button onClick={() => onNavigate('Dictionary Inspector')}><Braces size={15} />Inspect selector dictionaries</Button>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Recently opened</h2></div></div>
          <div className="wizard-body">
            {recent.length ? (
              <ul className="recent-list">{recent.map((f) => <li key={f}><button className="text-button" onClick={() => onSource?.(f, 1)}><FileCode2 size={13} />{f}</button></li>)}</ul>
            ) : (
              <p className="subtle">Files you open appear here.</p>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Project classification</h2></div><span className="badge">Rules §11</span></div>
          <div className="wizard-body"><Indicators model={model} /></div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Layers</h2></div><span className="badge">Rules §1–2</span></div>
          <div className="wizard-body">
            <ul className="layer-list">{model && Object.entries(model.layers).sort((a, b) => b[1] - a[1]).map(([l, n]) => <li key={l}><span>{l}</span><strong>{n}</strong></li>)}</ul>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Index diagnostics</h2></div><span className={`badge ${index?.diagnostics.length ? 'amber' : 'green'}`}>{index?.diagnostics.length ?? 0}</span></div>
          <div className="wizard-body">
            {index?.diagnostics.slice(0, 6).map((d) => <p className="subtle" key={d}>{d}</p>)}
            {!index?.diagnostics.length && <p className="subtle">No parse or regex diagnostics.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
