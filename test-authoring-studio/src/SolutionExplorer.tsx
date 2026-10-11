import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ChevronDown, ChevronRight, Folder, FolderOpen, FileCode2, FileText, FileCog, Braces, Plus, Search, X, Copy, ChevronsDownUp, ChevronsUpDown,
  Eye, Package, Boxes, Link2, LocateFixed, PencilLine, Files, Layers, SquareStack,
} from 'lucide-react';
import { RowMenu, copyText } from './ui';
import { api } from './api';
import { normalizeFeaturePath, parentFolders } from './featureTree';
import { UNSAVED_EVENT, unsavedFiles } from './editor/autosave';
import type { Feature } from './types';

export type Solution = {
  name: string;
  projects: { file: string; name: string; dir: string }[];
  packages: string[];
  frameworks: string[];
  files: { file: string; layer: string }[];
  nesting: Record<string, { file: string; kind: 'steps' | 'code-behind'; steps?: number }[]>;
};
type Node =
  | { kind: 'folder'; name: string; path: string; children: Node[]; count: number }
  | { kind: 'file'; name: string; path: string; layer: string };
type Props = {
  features: Feature[];
  revision?: string;
  activeFile?: string;
  query: string;
  activeFolder: string;
  onQuery: (q: string) => void;
  onSelect: (feature: Feature) => void;
  onOpenFile: (file: string, line?: number) => void;
  onFolder: (folder: string) => void;
  onNew: (folder?: string) => void;
  onSource?: (file: string, line: number) => void;
  /** A folder opened in the browser (File System Access): its tree is built client-side instead of by the server. */
  browserSolution?: Solution;
};
/** Layers hidden until "Show all files" (build output and unclassified files). */
const HIDDEN_LAYERS = new Set(['Output', 'Other']);
const icon = (file: string) => (file.endsWith('.feature') ? FileText : file.endsWith('.xml') ? Braces : file.endsWith('.csproj') || file.endsWith('.json') || file.endsWith('.config') ? FileCog : FileCode2);

function buildTree(files: { file: string; layer: string }[]): Node[] {
  const roots: Node[] = [];
  for (const { file, layer } of files) {
    const parts = file.split('/');
    let children = roots;
    parts.forEach((name, i) => {
      const p = parts.slice(0, i + 1).join('/');
      if (i === parts.length - 1) { children.push({ kind: 'file', name, path: p, layer }); return; }
      let folder = children.find((n): n is Extract<Node, { kind: 'folder' }> => n.kind === 'folder' && n.path === p);
      if (!folder) { folder = { kind: 'folder', name, path: p, children: [], count: 0 }; children.push(folder); }
      folder.count++;
      children = folder.children;
    });
  }
  const sort = (ns: Node[]) => { ns.sort((a, b) => (a.kind !== b.kind ? (a.kind === 'folder' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true }))); ns.forEach((n) => n.kind === 'folder' && sort(n.children)); };
  sort(roots);
  return roots;
}

/**
 * Solution Explorer modelled on Visual Studio's: Solution → project(s) → Dependencies → folders → files,
 * with file nesting (a feature shows the step files its steps bind to, and its generated code-behind),
 * Sync with Active Document, a pending-changes filter, Collapse All, Show All Files and search (Ctrl+;).
 */
export default function SolutionExplorer({ features, revision, activeFile, query, activeFolder, onQuery, onSelect, onOpenFile, onFolder, onNew, onSource, browserSolution }: Props) {
  const [serverSolution, setSolution] = useState<Solution>();
  const solution = browserSolution ?? serverSolution;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['@deps']));
  const [openNests, setOpenNests] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [pending, setPending] = useState<string[]>(unsavedFiles);
  const tree = useRef<HTMLElement>(null);
  useEffect(() => { if (!browserSolution) api<Solution>('/solution').then(setSolution).catch(() => {}); }, [revision, browserSolution]);
  useEffect(() => { const h = () => setPending(unsavedFiles()); window.addEventListener(UNSAVED_EVENT, h); return () => window.removeEventListener(UNSAVED_EVENT, h); }, []);

  // Files: the solution model plus any indexed feature it does not know yet (e.g. just created).
  const files = useMemo(() => {
    const list = [...(solution?.files ?? [])];
    for (const f of features) { const p = normalizeFeaturePath(f.file); if (!list.some((x) => x.file === p)) list.push({ file: p, layer: 'Feature' }); }
    const codeBehind = new Set(Object.values(solution?.nesting ?? {}).flat().filter((n) => n.kind === 'code-behind').map((n) => n.file));
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const featureName = new Map(features.map((f) => [normalizeFeaturePath(f.file), f.name]));
    return list.filter((x) =>
      !codeBehind.has(x.file) && // nested under its feature instead
      !x.file.endsWith('.csproj') && // the project node stands for it
      (showAll || !HIDDEN_LAYERS.has(x.layer)) &&
      (!pendingOnly || pending.includes(x.file)) &&
      terms.every((t) => `${x.file} ${featureName.get(x.file) ?? ''}`.toLowerCase().includes(t)));
  }, [solution, features, query, showAll, pendingOnly, pending]);
  const searching = !!query.trim() || pendingOnly;
  const nodes = useMemo(() => buildTree(files), [files]);
  const featureByPath = useMemo(() => new Map(features.map((f) => [normalizeFeaturePath(f.file), f])), [features]);
  const toggle = (p: string, open?: boolean) => setCollapsed((prev) => { const next = new Set(prev); if (open ?? next.has(p)) next.delete(p); else next.add(p); return next; });
  const allFolders = () => { const s = new Set<string>(['@deps']); const walk = (ns: Node[]) => ns.forEach((n) => { if (n.kind === 'folder') { s.add(n.path); walk(n.children); } }); walk(nodes); return s; };
  const collapseAll = () => setCollapsed(allFolders());
  const sync = () => {
    if (!activeFile) return;
    const f = normalizeFeaturePath(activeFile);
    setCollapsed((prev) => { const next = new Set(prev); parentFolders(f).forEach((p) => next.delete(p)); next.delete('@project'); return next; });
    requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(f)}"]`)?.scrollIntoView({ block: 'center' }));
  };
  // Opening a file reveals it (like Visual Studio's "Track Active Item").
  useEffect(() => { if (activeFile) setCollapsed((prev) => { const next = new Set(prev); parentFolders(normalizeFeaturePath(activeFile)).forEach((p) => next.delete(p)); return next; }); }, [activeFile]);

  const open = (file: string) => {
    const feature = featureByPath.get(file);
    if (feature) onSelect(feature);
    else onOpenFile(file);
  };
  const isActive = (p: string) => !!activeFile && normalizeFeaturePath(activeFile) === p;
  const fileRow = (path: string, name: string, depth: number, extra?: { linked?: boolean; note?: string }) => {
    const Icon = extra?.linked ? Link2 : icon(path);
    const kids = !extra?.linked ? solution?.nesting[path] ?? [] : [];
    const expanded = kids.length > 0 && openNests.has(path); // nested files start collapsed, as in Visual Studio
    const unsaved = pending.includes(path);
    return (
      <RowMenu key={(extra?.linked ? 'link:' : '') + path} items={[
        { label: 'Open', icon: FileCode2, onSelect: () => open(path) },
        ...(onSource ? [{ label: 'View source', icon: Eye, onSelect: () => onSource(path, 1) }] : []),
        { label: 'Copy path', icon: Copy, onSelect: () => copyText(path) },
        ...(path.endsWith('.feature') ? ['separator' as const, { label: 'New feature beside this', icon: Plus, onSelect: () => onNew(path.split('/').slice(0, -1).join('/')) }] : []),
      ]}>
        <li className={extra?.linked ? 'nested-link' : undefined}>
          <div className="se-row">
            {kids.length > 0 ? (
              <button className="se-twisty" aria-label={`${expanded ? 'Collapse' : 'Expand'} nested files of ${name}`} aria-expanded={expanded} onClick={() => setOpenNests((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; })} style={{ marginLeft: 4 + depth * 12 }}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : <span className="se-twisty-space" style={{ marginLeft: 4 + depth * 12 }} />}
            <button
              className={`explorer-file ${isActive(path) && !extra?.linked ? 'selected' : ''}`}
              data-path={extra?.linked ? undefined : path}
              title={extra?.note ? `${path} · ${extra.note}` : path}
              aria-current={isActive(path) && !extra?.linked ? 'page' : undefined}
              onClick={() => open(path)}
            >
              <Icon size={14} aria-hidden="true" />
              <span>{name}</span>
              {extra?.note && <small>{extra.note}</small>}
            </button>
            {unsaved && <span className="se-dirty" role="img" title="Unsaved changes" aria-label={`${name} has unsaved changes`}>●</span>}
          </div>
          {expanded && (
            <ul className="folder-children">
              {kids.map((k) => fileRow(k.file, k.kind === 'code-behind' ? k.file.split('/').pop()! : k.file.split('/').pop()!, depth + 1, k.kind === 'code-behind' ? { note: 'generated' } : { linked: true, note: `${k.steps} step${k.steps === 1 ? '' : 's'}` }))}
            </ul>
          )}
        </li>
      </RowMenu>
    );
  };
  const render = (ns: Node[], depth: number): ReactNode => <ul className="folder-children">{items(ns, depth)}</ul>;
  const items = (ns: Node[], depth: number): ReactNode => (
    <>
      {ns.map((n) => {
        if (n.kind === 'file') return fileRow(n.path, n.name, depth);
        const expanded = searching || !collapsed.has(n.path);
        const isFeatureFolder = n.path.split('/')[0].toLowerCase() === 'features' || n.children.some((c) => c.kind === 'file' && c.name.endsWith('.feature'));
        return (
          <RowMenu key={n.path} items={[
            ...(isFeatureFolder ? [{ label: 'New feature here', icon: Plus, onSelect: () => onNew(n.path) }] : []),
            { label: expanded ? 'Collapse' : 'Expand', icon: expanded ? ChevronsDownUp : ChevronsUpDown, onSelect: () => toggle(n.path) },
            { label: 'Collapse all folders', icon: ChevronsDownUp, onSelect: collapseAll },
            { label: 'Expand all folders', icon: ChevronsUpDown, onSelect: () => setCollapsed(new Set()) },
            'separator' as const,
            { label: 'Copy folder path', icon: Copy, onSelect: () => copyText(n.path) },
          ]}>
            <li>
              <div className={`explorer-folder-row ${activeFolder === n.path ? 'active-folder' : ''}`}>
                <button className="explorer-folder" style={{ paddingLeft: 4 + depth * 12 }} title={n.path} aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${n.path}`} aria-expanded={expanded}
                  onClick={() => { onFolder(n.path); if (!searching) toggle(n.path); }}>
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                  <span>{n.name}</span>
                  <small>{n.count}</small>
                </button>
                {isFeatureFolder && <button className="folder-add icon-button" aria-label={`New feature in ${n.path}`} title={`New feature in ${n.path}`} onClick={() => onNew(n.path)}><Plus size={13} /></button>}
              </div>
              {expanded && render(n.children, depth + 1)}
            </li>
          </RowMenu>
        );
      })}
    </>
  );
  const project = solution?.projects[0];
  const projectOpen = !collapsed.has('@project');
  const depsOpen = !collapsed.has('@deps');
  const tool = (label: string, Icon: typeof Plus, onClick: () => void, pressed?: boolean, extra: Record<string, string> = {}) => (
    // Native titles (not Radix tooltips): a tooltip that opens on focus would cover the guided tour's buttons.
    <button className={`icon-button ${pressed ? 'pressed' : ''}`} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick} {...extra}><Icon size={14} /></button>
  );
  return (
    <section className="feature-explorer solution-explorer" aria-label="Explorer">
      {/* The tour spotlights the heading, not the whole (tall) tree, so its buttons stay on screen on phones. */}
      <div className="sidebar-heading" data-tour="explorer">
        <span>EXPLORER</span>
        <div className="se-tools">
          {tool('Sync with Active Document', LocateFixed, sync)}
          {tool(pendingOnly ? 'Show all changes filter off' : 'Pending changes filter', PencilLine, () => setPendingOnly(!pendingOnly), pendingOnly)}
          {tool('Collapse all folders', ChevronsDownUp, collapseAll)}
          {tool('Show all files', showAll ? Files : SquareStack, () => setShowAll(!showAll), showAll)}
          {tool('New feature', Plus, () => onNew(), undefined, { 'data-tour': 'new-feature' })}
        </div>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input aria-label="Search Explorer" placeholder="Search Explorer (Ctrl+;)" value={query} onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); onQuery(''); } }} />
        {query && <button className="icon-button" aria-label="Clear search" onClick={() => onQuery('')}><X size={13} /></button>}
      </label>
      <div className="explorer-summary" role="status">
        {pendingOnly ? `${files.length} file${files.length === 1 ? '' : 's'} with unsaved changes` : query.trim() ? `${files.length} matching files` : `${features.length} feature files · ${files.length} files`}
      </div>
      <nav className="folder-tree se-tree" ref={tree} aria-label="Solution">
        <ul className="folder-children">
          <li>
            <div className="se-row se-solution"><Layers size={14} aria-hidden="true" /><span>Solution '{solution?.name ?? '…'}' ({solution?.projects.length ?? 0} project{solution?.projects.length === 1 ? '' : 's'})</span></div>
            {project && (
              <ul className="folder-children">
                <li>
                  <div className="explorer-folder-row">
                    <button className="explorer-folder se-project" aria-label={`${projectOpen ? 'Collapse' : 'Expand'} project ${project.name}`} aria-expanded={projectOpen} onClick={() => toggle('@project')} title={project.file}>
                      {projectOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Boxes size={14} /><span>{project.name}</span>
                    </button>
                  </div>
                  {projectOpen && (
                    <ul className="folder-children">
                      {!searching && (
                        <li>
                          <div className="explorer-folder-row">
                            <button className="explorer-folder" style={{ paddingLeft: 16 }} aria-label={`${depsOpen ? 'Collapse' : 'Expand'} Dependencies`} aria-expanded={depsOpen} onClick={() => toggle('@deps')}>
                              {depsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Package size={14} /><span>Dependencies</span><small>{solution?.packages.length ?? 0}</small>
                            </button>
                          </div>
                          {depsOpen && (
                            <ul className="folder-children se-deps">
                              {solution?.frameworks.map((f) => <li key={f}><div className="se-row se-leaf" style={{ paddingLeft: 40 }}><Boxes size={13} /><span>{f}</span></div></li>)}
                              {solution?.packages.map((p) => <li key={p}><div className="se-row se-leaf" style={{ paddingLeft: 40 }}><Package size={13} /><span>{p}</span></div></li>)}
                            </ul>
                          )}
                        </li>
                      )}
                      {items(nodes, 1)}
                    </ul>
                  )}
                </li>
              </ul>
            )}
            {!project && render(nodes, 0)}
          </li>
        </ul>
      </nav>
      {!files.length && <p className="explorer-empty">{pendingOnly ? 'No unsaved changes.' : query.trim() ? 'Nothing matches your search.' : 'No files yet.'}</p>}
      <button className="new-feature" onClick={() => onNew()}><Plus size={15} />New feature</button>
    </section>
  );
}
