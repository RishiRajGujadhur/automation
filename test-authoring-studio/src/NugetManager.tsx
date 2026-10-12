import { useEffect, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Package, Search, BadgeCheck, Loader, ArrowUpCircle } from 'lucide-react';
import { api } from './api';
import { Button } from './radix';
import { useConfirm } from './radix2';

type Installed = { id: string; version: string };
type Update = Installed & { latest: string };
type Found = { id: string; version: string; description: string; totalDownloads: number; authors: string[]; verified: boolean };
type Selected = { id: string; installed?: string; latest?: string; description?: string };
const downloads = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n));

/**
 * Manage NuGet Packages, like Visual Studio's: Browse (nuget.org search), Installed and Updates for one project, with
 * a details pane to pick a version and Install / Update / Uninstall.
 */
export default function NugetManager({ initialProject, onNotice, onChanged }: { initialProject?: string; onNotice: (m: string) => void; onChanged: () => void }) {
  const confirm = useConfirm();
  const [projects, setProjects] = useState<{ file: string; name: string }[]>([]);
  const [project, setProject] = useState(initialProject ?? '');
  const [tab, setTab] = useState('installed');
  const [installed, setInstalled] = useState<Installed[]>([]);
  const [updates, setUpdates] = useState<Update[]>();
  const [query, setQuery] = useState('');
  const [prerelease, setPrerelease] = useState(false);
  const [found, setFound] = useState<Found[]>([]);
  const [selected, setSelected] = useState<Selected>();
  const [versions, setVersions] = useState<string[]>([]);
  const [version, setVersion] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { api<{ projects: { file: string; name: string }[] }>('/solution').then((s) => { const real = s.projects.filter((p) => p.file.endsWith('.csproj')); setProjects(real); if (!project && real[0]) setProject(real[0].file); }, () => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const loadInstalled = () => project && api<Installed[]>(`/nuget/installed?project=${encodeURIComponent(project)}`).then(setInstalled, (e) => onNotice((e as Error).message));
  useEffect(() => { void loadInstalled(); setUpdates(undefined); setSelected(undefined); }, [project]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === 'updates' && project && !updates) api<Update[]>(`/nuget/updates?project=${encodeURIComponent(project)}`).then(setUpdates, () => setUpdates([])); }, [tab, project, updates]);
  useEffect(() => {
    if (tab !== 'browse') return;
    const t = setTimeout(() => api<Found[]>(`/nuget/search?q=${encodeURIComponent(query)}&prerelease=${prerelease}`).then(setFound, (e) => onNotice((e as Error).message)), 300);
    return () => clearTimeout(t);
  }, [tab, query, prerelease]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selected) return;
    api<string[]>(`/nuget/versions?id=${encodeURIComponent(selected.id)}&prerelease=${prerelease}`).then((v) => { setVersions(v); setVersion(v[0] ?? ''); }, () => setVersions([]));
  }, [selected?.id, prerelease]); // eslint-disable-line react-hooks/exhaustive-deps
  const select = (id: string, extra: Partial<Selected> = {}) => setSelected({ id, installed: installed.find((p) => p.id.toLowerCase() === id.toLowerCase())?.version, ...extra });
  const run = async (label: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(label);
    try { await fn(); onNotice(done); setUpdates(undefined); await loadInstalled(); onChanged(); } catch (e) { onNotice((e as Error).message.split('\n').slice(-3).join(' ')); } finally { setBusy(''); }
  };
  const install = () => selected && run('Installing…', () => api('/nuget/install', { project, id: selected.id, version }), `${selected.id} ${version} ${selected.installed ? 'updated' : 'installed'}.`);
  const uninstall = async () => {
    if (!selected?.installed || !(await confirm({ title: `Uninstall ${selected.id}?`, description: `Removes the package reference from ${project}.`, confirm: 'Uninstall', danger: true }))) return;
    await run('Uninstalling…', () => api('/nuget/uninstall', { project, id: selected.id, approved: true }), `${selected.id} uninstalled.`);
    setSelected(undefined);
  };
  const isInstalled = (id: string) => installed.find((p) => p.id.toLowerCase() === id.toLowerCase());
  const row = (key: string, id: string, right: React.ReactNode, sub?: string) => (
    <li key={key}>
      <button className={`nuget-row ${selected?.id === id ? 'active' : ''}`} onClick={() => select(id, { description: sub })}>
        <Package size={16} aria-hidden="true" />
        <span className="nuget-id">{id}{isInstalled(id) && tab === 'browse' && <BadgeCheck size={13} className="t-pass" aria-label="Installed" />}</span>
        <span className="nuget-right">{right}</span>
        {sub && <small>{sub}</small>}
      </button>
    </li>
  );

  return (
    <div className="nuget">
      <div className="nuget-top">
        <label>Project
          <select aria-label="Project" value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p.file} value={p.file}>{p.name}</option>)}
          </select>
        </label>
        <label className="nuget-pre"><input type="checkbox" checked={prerelease} onChange={(e) => setPrerelease(e.target.checked)} />Include prerelease</label>
        {busy && <span className="meta" role="status"><Loader size={12} className="spin" />{busy}</span>}
      </div>
      <div className="nuget-body">
        <Tabs.Root value={tab} onValueChange={(v) => { setTab(v); setSelected(undefined); }} className="nuget-tabs">
          <Tabs.List className="debug-tablist" aria-label="NuGet">
            <Tabs.Trigger value="browse">Browse</Tabs.Trigger>
            <Tabs.Trigger value="installed">Installed ({installed.length})</Tabs.Trigger>
            <Tabs.Trigger value="updates">Updates{updates?.length ? ` (${updates.length})` : ''}</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="browse">
            <label className="search-box"><Search size={14} /><input aria-label="Search nuget.org" placeholder="Search nuget.org" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus /></label>
            <ul className="nuget-list" aria-label="Search results">{found.map((f) => row(f.id, f.id, <>{f.version}<small>{downloads(f.totalDownloads)} downloads</small></>, f.description))}</ul>
          </Tabs.Content>
          <Tabs.Content value="installed">
            <ul className="nuget-list" aria-label="Installed packages">{installed.map((p) => row(p.id, p.id, p.version))}</ul>
            {!installed.length && <p className="meta">No packages in this project.</p>}
          </Tabs.Content>
          <Tabs.Content value="updates">
            {!updates ? <p className="meta"><Loader size={12} className="spin" /> Checking nuget.org…</p> : updates.length ? (
              <ul className="nuget-list" aria-label="Updates">{updates.map((u) => row(u.id, u.id, <>{u.version} → <strong>{u.latest}</strong></>))}</ul>
            ) : <p className="meta">All packages are up to date.</p>}
          </Tabs.Content>
        </Tabs.Root>
        <section className="nuget-details" aria-label="Package details">
          {selected ? (
            <>
              <h3><Package size={18} aria-hidden="true" />{selected.id}</h3>
              {selected.description && <p className="meta">{selected.description}</p>}
              <p>Installed: <strong>{selected.installed ?? 'not installed'}</strong></p>
              <label>Version
                <select aria-label="Version" value={version} onChange={(e) => setVersion(e.target.value)}>
                  {versions.map((v) => <option key={v} value={v}>{v}{v === versions[0] ? ' (latest)' : ''}{v === selected.installed ? ' (installed)' : ''}</option>)}
                </select>
              </label>
              <div className="nuget-actions">
                <Button variant="primary" disabled={!!busy || !version || version === selected.installed} onClick={() => void install()}>{selected.installed ? <><ArrowUpCircle size={14} />Update</> : 'Install'}</Button>
                {selected.installed && <Button variant="danger" disabled={!!busy} onClick={() => void uninstall()}>Uninstall</Button>}
              </div>
            </>
          ) : <p className="meta">Select a package.</p>}
        </section>
      </div>
    </div>
  );
}
