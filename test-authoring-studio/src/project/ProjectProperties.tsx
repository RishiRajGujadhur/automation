import { useEffect, useState, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { api, type FilePreview } from '../api';
import DiffApproval from '../DiffApproval';
import { featureOn } from '../features';
import { PAGES, type Field } from './pages';
import { relativeProjectPath } from '../solutionFormat';

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
  // Launch profiles (Debug page): Properties/launchSettings.json.
  type Profile = { commandName: string; commandLineArgs?: string; workingDirectory?: string; environmentVariables?: Record<string, string> };
  const [launch, setLaunch] = useState<{ file: string; profiles: Record<string, Profile> }>();
  const [profile, setProfile] = useState('');
  const [launchPreview, setLaunchPreview] = useState<FilePreview>();
  useEffect(() => { if (page !== 'debug' || launch) return; void api<{ file: string; profiles: Record<string, Profile> }>(`/project/launch?project=${encodeURIComponent(project)}`).then((l) => { setLaunch(l); setProfile(Object.keys(l.profiles)[0] ?? ''); }, (e) => onNotice((e as Error).message)); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  // Other projects of the solution (Project References page).
  const [others, setOthers] = useState<string[]>([]);
  useEffect(() => { void api<{ projects?: { file: string; missing?: boolean }[] }>('/solution').then((s) => setOthers((s.projects ?? []).filter((p) => /\.(cs|fs|vb)proj$/i.test(p.file) && !p.missing && p.file !== project).map((p) => p.file)), () => {}); }, [project]);
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
  customPages.usings = () => {
    const list = extra.usings ?? data?.usings ?? [];
    const update = (next: Using[]) => setExtra((x) => ({ ...x, usings: next }));
    return (
      <>
        <p className="subtle">Namespaces imported in every C# file of the project (<code>&lt;Using Include=… /&gt;</code>).</p>
        <ul className="pp-list" aria-label="Global usings">
          {list.map((u, i) => <li key={`${u.include}-${i}`}><code>{u.static ? 'static ' : ''}{u.alias ? `${u.alias} = ` : ''}{u.include}</code><button className="icon-button" aria-label={`Remove using ${u.include}`} onClick={() => update(list.filter((_, j) => j !== i))}>×</button></li>)}
          {!list.length && <li className="subtle">None.</li>}
        </ul>
        <form className="pp-add" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const include = String(f.get('ns') ?? '').trim(); if (!include || list.some((u) => u.include === include)) return; update([...list, { include, ...(f.get('static') ? { static: true } : {}) }]); e.currentTarget.reset(); }}>
          <input name="ns" aria-label="Namespace to add" placeholder="NUnit.Framework" spellCheck={false} />
          <label><input type="checkbox" name="static" /> static</label>
          <button className="button" type="submit">Add</button>
        </form>
      </>
    );
  };
  customPages.references = () => {
    const refs = extra.references ?? data?.references ?? [];
    const same = (a: string, b: string) => a.replace(/\//g, '\\').toLowerCase() === b.replace(/\//g, '\\').toLowerCase();
    return (
      <>
        <p className="subtle">Projects this one references (<code>&lt;ProjectReference&gt;</code>).</p>
        <ul className="pp-list" aria-label="Project references">
          {others.map((o) => { const rel = relativeProjectPath(project, o); const on = refs.some((r) => same(r, rel)); return <li key={o}><label><input type="checkbox" checked={on} aria-label={`Reference ${o}`} onChange={() => setExtra((x) => ({ ...x, references: on ? refs.filter((r) => !same(r, rel)) : [...refs, rel] }))} /> {o}</label><small className="subtle">{rel}</small></li>; })}
          {refs.filter((r) => !others.some((o) => same(relativeProjectPath(project, o), r))).map((r) => <li key={r}><span>{r} <small className="subtle">(not in the solution)</small></span><button className="icon-button" aria-label={`Remove reference ${r}`} onClick={() => setExtra((x) => ({ ...x, references: refs.filter((y) => y !== r) }))}>×</button></li>)}
          {!others.length && !refs.length && <li className="subtle">No other projects in the solution.</li>}
        </ul>
      </>
    );
  };
  customPages.debug = () => {
    if (!launch) return <p className="subtle">Loading…</p>;
    const names = Object.keys(launch.profiles);
    const cur = launch.profiles[profile];
    const put = (patch: Partial<Profile>) => { setLaunchPreview(undefined); setLaunch({ ...launch, profiles: { ...launch.profiles, [profile]: { ...cur, ...patch } } }); };
    const env = Object.entries(cur?.environmentVariables ?? {}).map(([k, v]) => `${k}=${v}`).join('\n');
    return (
      <>
        <p className="subtle">Launch profiles in <code>{launch.file}</code> (used by dotnet run and the debugger).</p>
        <div className="pp-add">
          <select aria-label="Launch profile" value={profile} onChange={(e) => setProfile(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}{!names.length && <option value="">(no profiles)</option>}</select>
          <button className="button" onClick={() => { const n = window.prompt('Profile name:', project.split('/').pop()!.replace(/\.\w+proj$/, '')); if (!n?.trim() || launch.profiles[n.trim()]) return; setLaunchPreview(undefined); setLaunch({ ...launch, profiles: { ...launch.profiles, [n.trim()]: { commandName: 'Project' } } }); setProfile(n.trim()); }}>New profile</button>
          {cur && <button className="button" onClick={() => { const rest = { ...launch.profiles }; delete rest[profile]; setLaunchPreview(undefined); setLaunch({ ...launch, profiles: rest }); setProfile(Object.keys(rest)[0] ?? ''); }}>Delete</button>}
        </div>
        {cur && <>
          <div className="pp-field"><label htmlFor="lp-cmd">Launch</label><select id="lp-cmd" aria-label="Launch" value={cur.commandName} onChange={(e) => put({ commandName: e.target.value })}>{[...new Set(['Project', 'Executable', 'IISExpress', cur.commandName])].map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="pp-field"><label htmlFor="lp-args">Command line arguments</label><input id="lp-args" aria-label="Command line arguments" value={cur.commandLineArgs ?? ''} onChange={(e) => put({ commandLineArgs: e.target.value || undefined })} /></div>
          <div className="pp-field"><label htmlFor="lp-wd">Working directory</label><input id="lp-wd" aria-label="Working directory" value={cur.workingDirectory ?? ''} onChange={(e) => put({ workingDirectory: e.target.value || undefined })} /></div>
          <div className="pp-field"><label htmlFor="lp-env">Environment variables</label><textarea id="lp-env" aria-label="Environment variables" rows={3} spellCheck={false} placeholder="NAME=value (one per line)" value={env} onChange={(e) => put({ environmentVariables: Object.fromEntries(e.target.value.split('\n').map((l) => /^\s*([^=\s]+)\s*=(.*)$/.exec(l)).filter((m): m is RegExpExecArray => !!m).map((m) => [m[1], m[2].trim()])) })} /></div>
        </>}
        <div className="pp-footer"><button className="button primary" onClick={() => void api<FilePreview>('/project/launch/preview', { project, profiles: launch.profiles }).then(setLaunchPreview, (e) => onNotice((e as Error).message))}>Preview launchSettings.json</button></div>
        {launchPreview && <DiffApproval preview={launchPreview} height="160px" onApplied={() => { setLaunchPreview(undefined); onNotice(`Saved ${launch.file}.`); }} />}
      </>
    );
  };
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
