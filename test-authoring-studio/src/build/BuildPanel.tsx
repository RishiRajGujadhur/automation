import { useEffect, useMemo, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { CircleX, TriangleAlert, Hammer, RotateCw, Eraser, Square, X, Loader, Search } from 'lucide-react';
import { IconButton } from '../radix2';
import { useLocalState } from '../ui';
import { useBuild, startBuild, cancelBuild } from './store';
import { api } from '../api';
import { errorRows, type ErrorScope } from './errorList';
import { useTabs } from '../files/tabs';
import { featureOn } from '../features';

/**
 * Visual Studio's Error List and Output (Build) windows, docked under the editor: Build / Rebuild / Clean with the
 * active configuration, errors and warnings with filters and search, double-click (or Enter) to go to the line.
 */
export default function BuildPanel({ onOpen, onNotice, onClose }: { onOpen: (file: string, line: number, column?: number) => void; onNotice: (m: string) => void; onClose: () => void }) {
  const b = useBuild();
  const [tab, setTab] = useLocalState('buildTab', 'errors');
  const [configuration, setConfiguration] = useLocalState('buildConfiguration', 'Debug');
  const [showErrors, setShowErrors] = useState(true);
  const [showWarnings, setShowWarnings] = useState(true);
  const [query, setQuery] = useState('');
  // Entire Solution / Open Documents / Current Document (Visual Studio's Error List scope).
  const [scope, setScope] = useLocalState<ErrorScope>('errorScope', 'solution');
  const tabs = useTabs();
  const output = useRef<HTMLPreElement>(null);
  // The solution's configurations (Debug, Release, …) for the configuration box.
  const [configurations, setConfigurations] = useState<string[]>([]);
  // Startup / build project: the whole solution, or one project of it.
  const [projects, setProjects] = useState<{ name: string; file: string }[]>([]);
  const [project, setProject] = useLocalState('buildProject', '');
  const [buildOnSave, setBuildOnSave] = useLocalState('buildOnSave', false);
  useEffect(() => { api<{ configurations?: string[]; projects?: { name: string; file: string; missing?: boolean }[] }>('/solution').then((r) => { setConfigurations(r.configurations ?? []); setProjects((r.projects ?? []).filter((p) => /\.csproj$/i.test(p.file) && !p.missing)); }, () => {}); }, []);
  const target = projects.some((p) => p.file === project) ? project : '';
  const configs = useMemo(() => [...new Set(configurations.map((c) => c.split('|')[0].trim()).concat(['Debug', 'Release']))], [configurations]);
  const errors = b.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = b.diagnostics.length - errors;
  const rows = errorRows(b.diagnostics, { errors: showErrors, warnings: showWarnings, query, scope: featureOn('error-list-scope') ? scope : 'solution', open: tabs.tabs.map((t) => t.file), current: tabs.active });
  // Output follows the build like Visual Studio's, unless scrolled up.
  useEffect(() => { const el = output.current; if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 60) el.scrollTop = el.scrollHeight; }, [b.output]);
  // A failed build brings the Error List forward.
  useEffect(() => { if (b.status === 'failed' && errors) setTab('errors'); }, [b.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = (action: 'build' | 'rebuild' | 'clean') => { setTab(action === 'clean' ? 'output' : tab); startBuild(action, configuration, target || undefined).catch((e) => onNotice((e as Error).message)); };
  const go = (i: number) => { const d = rows[i]; if (d?.file && d.line) onOpen(d.file, d.line, d.column); };
  const running = b.status === 'running';

  return (
    <section className="debug-panel build-panel" aria-label="Build">
      <div className="debug-toolbar" role="toolbar" aria-label="Build">
        <Hammer size={14} aria-hidden="true" />
        <span className={`debug-status ${b.status === 'succeeded' ? 'running' : b.status === 'failed' ? 'failed' : ''}`} role="status">
          {running && <Loader size={12} className="spin" />}
          {{ idle: 'Ready', running: `${b.action === 'clean' ? 'Cleaning' : 'Building'}…`, succeeded: `${b.action === 'clean' ? 'Clean' : 'Build'} succeeded`, failed: `${b.action === 'clean' ? 'Clean' : 'Build'} failed`, cancelled: 'Cancelled' }[b.status]}
          {b.durationMs !== undefined && b.status !== 'running' ? ` · ${(b.durationMs / 1000).toFixed(1)} s` : ''}
        </span>
        <select className="build-config" aria-label="Solution configuration" value={configuration} onChange={(e) => setConfiguration(e.target.value)} disabled={running}>
          {configs.map((c) => <option key={c}>{c}</option>)}
        </select>
        <label className="build-on-save" title="Build after saving a C# or project file"><input type="checkbox" checked={buildOnSave} onChange={(e) => setBuildOnSave(e.target.checked)} /> Build on save</label>
        {projects.length > 1 && (
          <select className="build-config" aria-label="Build project" value={target} onChange={(e) => setProject(e.target.value)} disabled={running}>
            <option value="">Entire solution</option>
            {projects.map((p) => <option key={p.file} value={p.file}>{p.name}</option>)}
          </select>
        )}
        <IconButton label="Build Solution" shortcut="Ctrl Shift B" disabled={running} onClick={() => run('build')}><Hammer size={14} /></IconButton>
        <IconButton label="Rebuild Solution" disabled={running} onClick={() => run('rebuild')}><RotateCw size={14} /></IconButton>
        <IconButton label="Clean Solution" disabled={running} onClick={() => run('clean')}><Eraser size={14} /></IconButton>
        <IconButton label="Cancel build" shortcut="Ctrl Break" disabled={!running} onClick={() => cancelBuild().catch(() => {})}><Square size={13} /></IconButton>
        <span className="toolbar-spacer" />
        {b.target && <span className="meta debug-target" title={b.target}>{b.target}</span>}
        <IconButton label="Close build windows" onClick={onClose}><X size={14} /></IconButton>
      </div>
      <Tabs.Root className="debug-tabs" value={tab} onValueChange={setTab}>
        <Tabs.List className="debug-tablist" aria-label="Build windows">
          <Tabs.Trigger value="errors">Error List{b.diagnostics.length ? ` (${b.diagnostics.length})` : ''}</Tabs.Trigger>
          <Tabs.Trigger value="output">Output</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="errors" className="debug-body">
          <div className="error-list-tools">
            <button className={`chip ${showErrors ? 'on' : ''}`} aria-pressed={showErrors} onClick={() => setShowErrors(!showErrors)}><CircleX size={12} className="sev-error" />{errors} Error{errors === 1 ? '' : 's'}</button>
            <button className={`chip ${showWarnings ? 'on' : ''}`} aria-pressed={showWarnings} onClick={() => setShowWarnings(!showWarnings)}><TriangleAlert size={12} className="sev-warning" />{warnings} Warning{warnings === 1 ? '' : 's'}</button>
            {featureOn('error-list-scope') && (
              <select className="build-config" aria-label="Error List scope" value={scope} onChange={(e) => setScope(e.target.value as ErrorScope)}>
                <option value="solution">Entire Solution</option>
                <option value="open">Open Documents</option>
                <option value="current">Current Document</option>
              </select>
            )}
            <label className="error-search"><Search size={12} /><input aria-label="Search Error List" placeholder="Search Error List" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
          </div>
          {rows.length ? (
            <div className="dbg-grid error-grid" role="grid" aria-label="Error List">
              <div className="dbg-row dbg-head" role="row"><span role="columnheader" /><span role="columnheader">Code</span><span role="columnheader">Description</span><span role="columnheader">Project</span><span role="columnheader">File</span><span role="columnheader">Line</span></div>
              {rows.map((d, i) => (
                <div key={i} className={`dbg-row error-row ${d.file ? 'navigable' : ''}`} role="row" tabIndex={0} onDoubleClick={() => go(i)} onKeyDown={(e) => { if (e.key === 'Enter') go(i); }} title={d.file ? 'Double-click to go to the line' : undefined}>
                  <span role="gridcell">{d.severity === 'error' ? <CircleX size={13} className="sev-error" aria-label="Error" /> : <TriangleAlert size={13} className="sev-warning" aria-label="Warning" />}</span>
                  <span role="gridcell">{d.code}</span>
                  <span role="gridcell" className="error-message" title={d.message}>{d.message}</span>
                  <span role="gridcell">{d.project ?? ''}</span>
                  <span role="gridcell" title={d.file}>{d.file?.split('/').pop() ?? ''}</span>
                  <span role="gridcell">{d.line ?? ''}</span>
                </div>
              ))}
            </div>
          ) : <p className="subtle debug-empty">{b.status === 'idle' ? 'Build the solution (Ctrl+Shift+B) to see errors and warnings.' : running ? 'Building…' : 'No errors or warnings.'}</p>}
        </Tabs.Content>
        <Tabs.Content value="output" className="debug-body">
          <pre className="debug-output" ref={output} aria-label="Build output">{b.output || 'No build output yet.'}</pre>
        </Tabs.Content>
      </Tabs.Root>
    </section>
  );
}
