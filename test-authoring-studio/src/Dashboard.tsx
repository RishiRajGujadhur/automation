import { BookOpen, Blocks, FileCode2, ScanLine, Braces, Wand2, Circle, Layers3, ArrowRight } from 'lucide-react';
import { Indicators, useProjectModel } from './ProjectModelTree';
import type { Index } from './types';
import { Button } from './radix';
import * as Popover from '@radix-ui/react-popover';
import { useEffect, useState } from 'react';
import { CircleCheck, CircleDashed, Info } from 'lucide-react';
import { Meter, usePrefs } from './radix2';
import { milestones, doneMilestones } from './progress';
import Card from './Card';

export function ContextBar({ index, config, recordStatus, revision }: { index?: Index; config?: { repositoryRoot: string; targetProject: string }; recordStatus: string; revision?: string }) {
  const { model } = useProjectModel(revision);
  const project = model?.projects[0]?.split('/').pop()?.replace(/\.csproj$/, '') ?? model?.root ?? '…';
  const dictionaries = index?.stats?.dictionaries ?? 0;
  return (
    <div className="context-bar" aria-label="Project context">
      <Popover.Root>
        <Popover.Trigger asChild>
          <button className="context-trigger"><strong>Active project</strong> {project}{model?.frameworks.length ? ` (${model.frameworks.join(', ')}` : ' ('}{model?.packages.some((p) => /playwright/i.test(p)) ? ' / Playwright C#)' : ')'}<Info size={12} /></button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="popover" sideOffset={6} collisionPadding={12}>
            <span className="micro-label">PROJECTS</span>
            <ul>{(model?.projects ?? []).map((x) => <li key={x}><code>{x}</code></li>)}{!model?.projects.length && <li className="subtle">No .csproj found.</li>}</ul>
            <span className="micro-label">PACKAGES</span>
            <ul>{(model?.packages ?? []).map((x) => <li key={x}>{x}</li>)}{!model?.packages.length && <li className="subtle">None detected.</li>}</ul>
            <Popover.Arrow className="tooltip-arrow" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <span><strong>Root</strong> {config?.repositoryRoot.split(/[\\/]/).slice(-2).join('/')}</span>
      <span><strong>Browser</strong> Chromium (headless: false) · {recordStatus === 'recording' ? 'recording' : 'idle'}</span>
      <span className={dictionaries ? 'ok' : 'warn'}><span className="status-dot" />{dictionaries ? `${dictionaries} dictionary fields indexed` : 'No dictionary XML found'}</span>
    </div>
  );
}

export default function Dashboard({ index, revision, onNavigate, recent = [], onSource }: { index?: Index; revision?: string; onNavigate: (tab: string) => void; recent?: string[]; onSource?: (file: string, line: number) => void }) {
  const { model } = useProjectModel(revision);
  const s = index?.stats;
  const { prefs } = usePrefs();
  const [done, setDone] = useState(doneMilestones);
  useEffect(() => {
    const h = () => setDone(doneMilestones());
    window.addEventListener('tas:milestones', h);
    return () => window.removeEventListener('tas:milestones', h);
  }, []);
  const targets: Record<string, string> = { generator: 'Test Generator', dictionary: 'Dictionary Inspector', record: 'Recorder', validate: 'Test Generator', save: 'Test Generator' };
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
      {prefs.showStats && <div className="stat-grid">
        {tiles.map((t) => (
          <button key={t.label} className="panel stat-tile" onClick={() => onNavigate(t.tab)}>
            <t.icon size={18} />
            {t.value === undefined ? <span className="skeleton skeleton-number" aria-hidden="true" /> : <strong>{t.value.toLocaleString()}</strong>}
            <span>{t.label}</span>
          </button>
        ))}
      </div>}
      {draft?.scenarioName && (
        <button className="panel continue-card" onClick={() => onNavigate('Test Generator')}>
          <span className="micro-label">CONTINUE WHERE YOU LEFT OFF</span>
          <strong>{draft.scenarioName}</strong>
          <span className="meta">{draft.area}/{draft.featureFile} · {draft.section} › {draft.field}</span>
          <ArrowRight size={16} />
        </button>
      )}
      {done.size < milestones.length && (
        <Card id="dash-getting-started" className="checklist" label="Getting started" title="Getting started" badge={<span className="subtle">{done.size} of {milestones.length} done</span>}>
          <div className="checklist-head">
            <Meter value={done.size} max={milestones.length} label="Getting started" tone="purple" />
          </div>
          <ul>
            {milestones.map((m) => (
              <li key={m.id} className={done.has(m.id) ? 'done' : ''}>
                {done.has(m.id) ? <CircleCheck size={15} /> : <CircleDashed size={15} />}
                {targets[m.id] && !done.has(m.id) ? <button className="text-button" onClick={() => onNavigate(targets[m.id])}>{m.label}</button> : <span>{m.label}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="dashboard-grid">
        <Card id="dash-start-authoring" title="Start authoring">
          <div className="wizard-body quick-actions">
            <Button variant="primary" onClick={() => onNavigate('Test Generator')}><Wand2 size={15} />Generate a test from inputs</Button>
            <Button onClick={() => onNavigate('Recorder')}><Circle size={15} />Record a Playwright workflow</Button>
            <Button onClick={() => onNavigate('Dictionary Inspector')}><Braces size={15} />Inspect selector dictionaries</Button>
          </div>
        </Card>
        {!!recent.length && <Card id="dash-recently-opened" title="Recently opened">
          <div className="wizard-body">
            <ul className="recent-list">{recent.map((f) => <li key={f}><button className="text-button" onClick={() => onSource?.(f, 1)}><FileCode2 size={13} />{f}</button></li>)}</ul>
          </div>
        </Card>}
        <Card id="dash-project-classification" title="Project classification">
          <div className="wizard-body"><Indicators model={model} /></div>
        </Card>
        <Card id="dash-layers" title="Layers">
          <div className="wizard-body">
            <ul className="layer-list">{model && Object.entries(model.layers).sort((a, b) => b[1] - a[1]).map(([l, n]) => <li key={l}><span>{l}</span><strong>{n}</strong></li>)}</ul>
          </div>
        </Card>
        {!!index?.diagnostics.length && <Card id="dash-index-diagnostics" title="Index diagnostics" badge={<span className="badge amber">{index.diagnostics.length}</span>}>
          <div className="wizard-body">
            {index.diagnostics.slice(0, 6).map((d) => <p className="subtle" key={d}>{d}</p>)}
          </div>
        </Card>}
      </div>
    </div>
  );
}
