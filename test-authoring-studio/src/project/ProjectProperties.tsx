import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { api, type FilePreview } from '../api';
import DiffApproval from '../DiffApproval';
import { featureOn } from '../features';
import { PAGES, type Field } from './pages';

type Using = { include: string; static?: boolean; alias?: string };
type Props = { all: Record<string, string>; byConfig: Record<string, Record<string, string>>; events: { pre: string; post: string }; usings: Using[]; references: string[] };
/** Edits outside the property groups: build events, global usings, project references. */
type Extra = { events?: { pre?: string; post?: string }; usings?: Using[]; references?: string[] };

/**
 * Project Properties (Visual Studio 2026): the property pages of a .csproj. Edits are collected, then previewed as a
 * diff of the project file and written only when approved.
 */
export default function ProjectProperties({ project, onNotice }: { project: string; onNotice: (m: string) => void }) {
  const pages = PAGES.filter((p) => featureOn(p.feature));
  const [page, setPage] = useState(pages[0]?.id ?? '');
  const [config, setConfig] = useState('');
  const [data, setData] = useState<Props>();
  const [edits, setEdits] = useState<Record<string, string | null>>({});
  const [preview, setPreview] = useState<FilePreview>();
  const [extra, setExtraState] = useState<Extra>({});
  const setExtra = (f: (e: Extra) => Extra) => { setPreview(undefined); setExtraState(f); };
  const count = Object.keys(edits).length + Object.keys(extra).length;
  // Evaluated values (Visual Studio shows the effective value): SDK defaults, Directory.Build.props, imports.
  const [evaluated, setEvaluated] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!featureOn('pp-evaluated') || !data) return;
    let live = true;
    void api<Record<string, string>>('/project/properties/evaluate', { project, names: pages.flatMap((p) => p.fields.map((f) => f.name)), ...(config ? { configuration: config } : {}) }).then((r) => { if (live) setEvaluated(r); }, () => {});
    return () => { live = false; };
  }, [data, config]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = () => api<Props>(`/project/properties?project=${encodeURIComponent(project)}`).then(setData, (e) => onNotice((e as Error).message));
  useEffect(() => { void load(); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  const stored = (name: string) => (config ? data?.byConfig[config]?.[name] : data?.all[name]);
  const value = (name: string) => (name in edits ? edits[name] ?? '' : stored(name) ?? '');
  const set = (name: string, v: string | null) => { setPreview(undefined); setEdits((e) => { const next = { ...e }; if ((v ?? null) === (stored(name) ?? null) || (v === '' && stored(name) === undefined)) delete next[name]; else next[name] = v === '' ? null : v; return next; }); };
  const current = pages.find((p) => p.id === page) ?? pages[0];
  const field = (f: Field) => {
    const id = `pp-${f.name}`;
    const v = value(f.name);
    const input = f.kind === 'bool'
      ? <input id={id} type="checkbox" aria-label={f.label} checked={v.toLowerCase() === (f.on ?? 'true')} onChange={(e) => set(f.name, e.target.checked ? f.on ?? 'true' : f.off ?? 'false')} />
      : f.kind === 'select'
        ? <select id={id} aria-label={f.label} value={v} onChange={(e) => set(f.name, e.target.value)}><option value="">(not set)</option>{[...new Set([...(f.options ?? []), ...(v ? [v] : [])])].map((o) => <option key={o} value={o}>{o}</option>)}</select>
        : <input id={id} aria-label={f.label} value={v} placeholder={f.placeholder} spellCheck={false} onChange={(e) => set(f.name, e.target.value)} />;
    return (
      <div key={f.name} className={`pp-field ${f.name in edits ? 'changed' : ''}`}>
        <label htmlFor={id}>{f.label}</label>
        <div className="pp-input">
          {input}
          {(stored(f.name) !== undefined || f.name in edits) && <button className="icon-button" aria-label={`Reset ${f.label}`} title="Remove from the project file (use the default)" onClick={() => set(f.name, null)}><RotateCcw size={12} /></button>}
        </div>
        {featureOn('pp-evaluated') && stored(f.name) === undefined && !(f.name in edits) && evaluated[f.name] ? <small className="pp-evaluated" title="The value the build uses (SDK default, Directory.Build.props or an import)">Effective: {evaluated[f.name]}</small> : null}
        {f.help && <small className="subtle">{f.help}</small>}
      </div>
    );
  };
  const save = async () => {
    try { setPreview(await api<FilePreview>('/project/properties/preview', { project, set: edits, ...(config ? { config } : {}), ...extra })); } catch (e) { onNotice((e as Error).message); }
  };
  const customPages: Record<string, () => ReactNode> = {};
  customPages.events = () => (
    <>
      {(['pre', 'post'] as const).map((k) => (
        <div key={k} className={`pp-field ${extra.events?.[k] !== undefined ? 'changed' : ''}`}>
          <label htmlFor={`pp-${k}`}>{k === 'pre' ? 'Pre-build event' : 'Post-build event'}</label>
          <textarea id={`pp-${k}`} aria-label={k === 'pre' ? 'Pre-build event' : 'Post-build event'} rows={3} spellCheck={false} value={extra.events?.[k] ?? data?.events[k] ?? ''} onChange={(e) => { const v = e.target.value; setExtra((x) => ({ ...x, events: { ...x.events, [k]: v } })); }} />
          <small className="subtle">{k === 'pre' ? 'Runs before the build (an Exec in a PreBuild target).' : 'Runs after a successful build. Macros such as $(TargetDir) work.'}</small>
        </div>
      ))}
    </>
  );
  // custom pages

  if (!pages.length) return <p className="subtle">Turn on Project Properties in Settings ▸ Features.</p>;
  return (
    <div className="project-props" aria-label={`Properties of ${project}`}>
      <div className="pp-head">
        <p className="subtle pp-file">{project}</p>
        {featureOn('pp-configurations') && <label className="pp-config">Configuration <select aria-label="Configuration" value={config} onChange={(e) => { setConfig(e.target.value); setEdits({}); setPreview(undefined); }}><option value="">All configurations</option>{[...new Set(['Debug', 'Release', ...Object.keys(data?.byConfig ?? {})])].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>}
      </div>
      <div className="pp-body">
        <nav className="pp-nav" aria-label="Property pages">
          {pages.map((p) => <button key={p.id} className={p.id === current?.id ? 'active' : ''} aria-current={p.id === current?.id ? 'page' : undefined} onClick={() => setPage(p.id)}>{p.title}</button>)}
        </nav>
        <section className="pp-page" aria-label={current?.title}>
          {!data ? <p className="subtle">Loading…</p> : current?.custom ? customPages[current.id]?.() : current?.fields.map(field)}
        </section>
      </div>
      <div className="pp-footer">
        <small className="subtle">{count ? `${count} change${count === 1 ? '' : 's'}` : 'No changes'}</small>
        <button className="button" disabled={!count} onClick={() => { setEdits({}); setExtraState({}); setPreview(undefined); }}>Discard</button>
        <button className="button primary" disabled={!count} onClick={() => void save()}>Preview changes</button>
      </div>
      {preview && <DiffApproval preview={preview} height="180px" onApplied={() => { setEdits({}); setExtraState({}); setPreview(undefined); void load(); onNotice(`Saved the properties of ${project.split('/').pop()}.`); window.dispatchEvent(new Event('tas:rescan')); }} />}
    </div>
  );
}
