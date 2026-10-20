import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { keepTab } from './files/tabs';
import {
  ChevronDown, ChevronRight, Folder, FolderOpen, FileCode2, FileText, FileCog, Braces, Plus, Search, X, Copy, ChevronsDownUp, ChevronsUpDown,
  Eye, Package, Boxes, Link2, LocateFixed, PencilLine, Files, Layers, SquareStack, Scissors, ClipboardPaste, Trash2, TextCursorInput, Focus, House, FilePlus, GitCompare,
} from 'lucide-react';
import { fileType } from './files/fileTypes';
import { featureOn } from './features';
import { RowMenu, copyText } from './ui';
import { api } from './api';
import { normalizeFeaturePath, parentFolders } from './featureTree';
import { UNSAVED_EVENT, unsavedFiles } from './editor/autosave';
import type { Feature } from './types';

export type SolutionNode = { kind: 'folder'; name: string; children: SolutionNode[] } | { kind: 'project'; name: string; file: string };
export type SolutionProject = { file: string; name: string; dir: string; packages?: string[]; frameworks?: string[]; references?: string[]; missing?: boolean; external?: boolean; legacy?: boolean; assemblies?: { name: string; hintPath?: string }[]; items?: string[] };
export type Solution = {
  name: string;
  solutionFile?: string | null;
  configurations?: string[];
  tree?: SolutionNode[];
  projects: SolutionProject[];
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
  onOpenFile: (file: string, line?: number, preview?: boolean) => void;
  onFolder: (folder: string) => void;
  onNew: (folder?: string) => void;
  onSource?: (file: string, line: number) => void;
  /** A folder opened in the browser (File System Access): its tree is built client-side instead of by the server. */
  browserSolution?: Solution;
  /** Explorer file operations (Rename, Paste of a Copy/Cut, Delete); the App applies them and refreshes. */
  onFileOp?: (op: FileOp) => Promise<void>;
  /** Project / Dependencies context menu: Manage NuGet Packages… */
  onManagePackages?: (project: string) => void;
  onNotice?: (message: string) => void;
  onConfirm?: (o: { title: string; description: string; confirm: string; danger?: boolean }) => Promise<boolean>;
};
export type FileOp = { kind: 'rename' | 'copy' | 'delete'; from: string; to?: string; folder?: boolean };
/** Select for Compare (VS Code / Rider): the first file of a two-file comparison. */
let compareLeft: string | null = null;
/** Asks RiderHost to show the difference of two files (detail: { left, right }). */
export const COMPARE_FILES_EVENT = 'tas:compare-files';
/** Explorer clipboard (Copy / Cut, then Paste on a folder or beside a file), kept while the app is open. */
let clipboard: { mode: 'copy' | 'cut'; path: string } | null = null;
/** Layers hidden until "Show all files" (build output and unclassified files). */
const HIDDEN_LAYERS = new Set(['Output', 'Other']);
const icon = (file: string) => (file.endsWith('.feature') ? FileText : file.endsWith('.xml') ? Braces : file.endsWith('.csproj') || file.endsWith('.json') || file.endsWith('.config') ? FileCog : FileCode2);

/** Folder tree of a project's files, shown relative to the project folder (`prefix`), as in Visual Studio. */
function buildTree(files: { file: string; layer: string }[], prefix = ''): Node[] {
  const roots: Node[] = [];
  for (const { file, layer } of files) {
    const parts = (prefix ? file.slice(prefix.length + 1) : file).split('/');
    let children = roots;
    parts.forEach((name, i) => {
      const p = (prefix ? `${prefix}/` : '') + parts.slice(0, i + 1).join('/');
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
/** Reveal the active file in the Explorer (Select In ▸ Explorer). */
export const SELECT_IN_EXPLORER = 'tas:select-in-explorer';

export default function SolutionExplorer({ features, revision, activeFile, query, activeFolder, onQuery, onSelect, onOpenFile, onFolder, onNew, onSource, browserSolution, onFileOp: fileOpProp, onManagePackages, onNotice, onConfirm }: Props) {
  // After a rename, copy or delete the tree reloads itself too (not only when the index revision changes).
  const loads = useRef(0);
  const loadSolution = () => { const n = ++loads.current; api<Solution>('/solution').then((s) => { if (n === loads.current) setSolution(s); }).catch(() => {}); };
  const onFileOp = fileOpProp && (async (op: FileOp) => { await fileOpProp(op); if (!browserSolution) loadSolution(); });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [clip, setClip] = useState(clipboard);
  const setClipboard = (c: typeof clipboard) => { clipboard = c; setClip(c); };
  const dirOf = (p: string) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
  const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);
  const paste = async (folder: string) => {
    if (!clip || !onFileOp) return;
    const to = join(folder, clip.path.split('/').pop()!);
    if (clip.mode === 'cut') { if (to !== clip.path) await onFileOp({ kind: 'rename', from: clip.path, to }); setClipboard(null); }
    else await onFileOp({ kind: 'copy', from: clip.path, to });
  };
  const commitRename = async (path: string, name: string, folder: boolean) => {
    setRenaming(null);
    const next = name.trim();
    if (!next || next === path.split('/').pop() || !onFileOp) return;
    if (/[\\/:*?"<>|]/.test(next)) return;
    await onFileOp({ kind: 'rename', from: path, to: join(dirOf(path), next), folder });
  };
  /** Inline rename box, as in Visual Studio (F2): the name is selected without its extension. */
  const renameBox = (path: string, folder: boolean) => (
    <input
      className="se-rename"
      aria-label={`New name for ${path.split('/').pop()}`}
      defaultValue={path.split('/').pop()}
      autoFocus
      onFocus={(e) => { const v = e.currentTarget.value; const dot = folder ? -1 : v.lastIndexOf('.'); e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.currentTarget.value = path.split('/').pop()!; e.currentTarget.blur(); } }}
      onBlur={(e) => void commitRename(path, e.currentTarget.value, folder)}
    />
  );
  /** Add ▸ New File… (Visual Studio's Add New Item; Rider's New ▸ File): a name, or a sub/path, in the folder. */
  const newFile = async (folder: string) => {
    const name = window.prompt(`New file in ${folder || 'the repository root'} (a name, or sub/folder/name):`, '')?.trim().replace(/\\/g, '/');
    if (!name) return;
    const file = join(folder, name);
    try { await api('/file/create', { file, source: '' }); loadSolution(); onOpenFile(file); }
    catch (e) { onNotice?.((e as Error).message); }
  };
  /** Edit entries shared by file and folder context menus. */
  const editItems = (path: string, folder: boolean) => onFileOp ? [
    'separator' as const,
    { label: 'Cut', icon: Scissors, shortcut: 'Ctrl X', onSelect: () => setClipboard({ mode: 'cut', path }) },
    { label: 'Copy', icon: Copy, shortcut: 'Ctrl C', onSelect: () => setClipboard({ mode: 'copy', path }) },
    { label: 'Paste', icon: ClipboardPaste, shortcut: 'Ctrl V', disabled: !clip, onSelect: () => void paste(folder ? path : dirOf(path)) },
    'separator' as const,
    { label: 'Rename', icon: TextCursorInput, shortcut: 'F2', onSelect: () => setRenaming(path) },
    { label: 'Delete', icon: Trash2, shortcut: 'Del', onSelect: () => void onFileOp({ kind: 'delete', from: path, folder }) },
  ] : [];
  /** F2, Delete, Ctrl+C / Ctrl+X / Ctrl+V on a focused Explorer row. */
  const rowKeys = (path: string, folder: boolean) => (e: React.KeyboardEvent) => {
    if (!onFileOp) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'F2') { e.preventDefault(); setRenaming(path); }
    else if (e.key === 'Delete') { e.preventDefault(); void onFileOp({ kind: 'delete', from: path, folder }); }
    else if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); setClipboard({ mode: 'copy', path }); }
    else if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); setClipboard({ mode: 'cut', path }); }
    else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); void paste(folder ? path : dirOf(path)); }
  };
  const [serverSolution, setSolution] = useState<Solution>();
  const [cmpLeft, setCmpLeft] = useState(compareLeft);
  // Add ▸ New Project / Existing Project; Remove from Solution (files stay on disk).
  const [adding, setAdding] = useState<{ kind: 'new'; template: string; name: string; folder: string } | { kind: 'existing'; path: string } | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const afterProjects = (message: string) => { loadSolution(); onNotice?.(message); };
  const addProject = async () => {
    if (!adding) return;
    setAddBusy(true);
    try {
      const r = adding.kind === 'new'
        ? await api<{ project: string }>('/solution/projects/new', { template: adding.template, name: adding.name, folder: adding.folder })
        : await api<{ project: string }>('/solution/projects/add', { path: adding.path });
      setAdding(null);
      afterProjects(`Added ${r.project} to the solution.`);
    } catch (e) {
      onNotice?.((e as Error).message);
    } finally {
      setAddBusy(false);
    }
  };
  const removeProject = async (file: string, name: string) => {
    if (onConfirm && !(await onConfirm({ title: `Remove ${name}?`, description: `${name} will be removed from the solution. Its files stay on disk.`, confirm: 'Remove', danger: true }))) return;
    try { await api('/solution/projects/remove', { project: file, approved: true }); afterProjects(`Removed ${name} from the solution.`); }
    catch (e) { onNotice?.((e as Error).message); }
  };
  const solution = browserSolution ?? serverSolution;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [openNests, setOpenNests] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  // Scope to This (Visual Studio): the tree shows one folder only, until Home.
  const [scope, setScope] = useState('');
  const [pending, setPending] = useState<string[]>(unsavedFiles);
  const tree = useRef<HTMLElement>(null);
  // Only the latest request wins: an answer for an older revision can arrive after a newer one.
  useEffect(() => { if (!browserSolution) loadSolution(); }, [revision, browserSolution]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = () => setPending(unsavedFiles()); window.addEventListener(UNSAVED_EVENT, h); return () => window.removeEventListener(UNSAVED_EVENT, h); }, []);

  // Real projects (a .csproj, also one at the repository root); '.' stands for "no project file".
  const projectDirs = useMemo(() => (solution?.projects ?? []).filter((p) => p.file !== '.').map((p) => p.dir), [solution]);
  // Files listed by classic projects (others in their folders show only with Show All Files).
  const listed = useMemo(() => (solution?.projects ?? []).filter((p) => p.legacy && p.items).map((p) => ({ dir: p.dir, items: new Set(p.items!.map((i) => i.toLowerCase())) })), [solution]);
  const listedByProject = (file: string) => {
    let owner: { dir: string; items: Set<string> } | undefined;
    for (const p of listed) if ((p.dir === '' || file.startsWith(`${p.dir}/`)) && (!owner || p.dir.length > owner.dir.length)) owner = p;
    const deeper = projectDirs.some((d) => d.length > (owner?.dir.length ?? -1) && file.startsWith(`${d}/`));
    return !owner || deeper || owner.items.has(file.toLowerCase());
  };
  const inProject = (file: string) => projectDirs.some((d) => d === '' || file.startsWith(`${d}/`));
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
      // Inside a real project folder every file shows (as in Visual Studio); only build output stays hidden.
      (showAll || !HIDDEN_LAYERS.has(x.layer) || (x.layer === 'Other' && inProject(x.file))) &&
      // Classic (.NET Framework) projects list their files: only those show, like Visual Studio (Show All Files: all).
      (showAll || listedByProject(x.file)) &&
      (!pendingOnly || pending.includes(x.file)) &&
      (!scope || x.file.startsWith(`${scope}/`)) &&
      terms.every((t) => `${x.file} ${featureName.get(x.file) ?? ''}`.toLowerCase().includes(t)));
  }, [solution, features, query, showAll, pendingOnly, pending, projectDirs, listed, scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const searching = !!query.trim() || pendingOnly;
  // Files per project (deepest project folder wins); files outside every project are "Miscellaneous Files".
  const projects = useMemo(() => solution?.projects ?? [], [solution]);
  const byProject = useMemo(() => {
    const dirs = projects.map((p) => p.dir);
    const owner = (f: string) => { let best: string | undefined; for (const d of dirs) if ((d === '' || f.startsWith(`${d}/`)) && (best === undefined || d.length > best.length)) best = d; return best; };
    const groups = new Map<string | undefined, { file: string; layer: string }[]>();
    for (const f of files) { const d = owner(f.file); groups.set(d, [...(groups.get(d) ?? []), f]); }
    return new Map([...groups].map(([d, list]) => [d, buildTree(list, d ?? '')]));
  }, [files, projects]);
  const nodes = useMemo(() => [...byProject.values()].flat(), [byProject]);
  const [openDeps, setOpenDeps] = useState<Set<string>>(new Set());
  const featureByPath = useMemo(() => new Map(features.map((f) => [normalizeFeaturePath(f.file), f])), [features]);
  const toggle = (p: string, open?: boolean) => setCollapsed((prev) => { const next = new Set(prev); if (open ?? next.has(p)) next.delete(p); else next.add(p); return next; });
  const allFolders = () => { const s = new Set<string>(); const walk = (ns: Node[]) => ns.forEach((n) => { if (n.kind === 'folder') { s.add(n.path); walk(n.children); } }); walk(nodes); return s; };
  const collapseAll = () => setCollapsed(allFolders());
  const activeFileRef = useRef(activeFile);
  activeFileRef.current = activeFile;
  const sync = () => {
    if (!activeFile) return;
    const f = normalizeFeaturePath(activeFile);
    setCollapsed((prev) => { const next = new Set(prev); parentFolders(f).forEach((p) => next.delete(p)); for (const k of [...next]) if (k.startsWith('@')) next.delete(k); return next; });
    requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(f)}"]`)?.scrollIntoView({ block: 'center' }));
  };
  // Select In ▸ Explorer (Rider, Alt+F1): reveal and select the active file.
  const syncRef = useRef(sync);
  syncRef.current = sync;
  useEffect(() => {
    const h = () => { syncRef.current(); requestAnimationFrame(() => requestAnimationFrame(() => tree.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(normalizeFeaturePath(activeFileRef.current ?? ''))}"] button, [data-path="${CSS.escape(normalizeFeaturePath(activeFileRef.current ?? ''))}"]`)?.focus())); };
    window.addEventListener(SELECT_IN_EXPLORER, h);
    return () => window.removeEventListener(SELECT_IN_EXPLORER, h);
  }, []);
  // Opening a file reveals it (like Visual Studio's "Track Active Item").
  useEffect(() => { if (activeFile) setCollapsed((prev) => { const next = new Set(prev); parentFolders(normalizeFeaturePath(activeFile)).forEach((p) => next.delete(p)); return next; }); }, [activeFile]);

  const open = (file: string) => {
    const feature = featureByPath.get(file);
    if (feature) onSelect(feature);
    else onOpenFile(file, undefined, true);
  };
  const isActive = (p: string) => !!activeFile && normalizeFeaturePath(activeFile) === p;
  const fileRow = (path: string, name: string, depth: number, extra?: { linked?: boolean; note?: string }) => {
    const Icon = extra?.linked ? Link2 : fileType(path).icon;
    const kids = !extra?.linked ? solution?.nesting[path] ?? [] : [];
    const expanded = kids.length > 0 && openNests.has(path); // nested files start collapsed, as in Visual Studio
    const unsaved = pending.includes(path);
    return (
      <RowMenu key={(extra?.linked ? 'link:' : '') + path} items={[
        { label: 'Open', icon: FileCode2, onSelect: () => open(path) },
        ...(onSource ? [{ label: 'View source', icon: Eye, onSelect: () => onSource(path, 1) }] : []),
        { label: 'Copy path', icon: Copy, onSelect: () => copyText(path) },
        ...(featureOn('explorer-compare') ? [{ label: 'Select for Compare', icon: GitCompare, onSelect: () => { compareLeft = path; setCmpLeft(path); onNotice?.(`Selected ${path.split('/').pop()} for compare.`); } }, ...(cmpLeft && cmpLeft !== path ? [{ label: `Compare with ${cmpLeft.split('/').pop()}`, icon: GitCompare, onSelect: () => window.dispatchEvent(new CustomEvent(COMPARE_FILES_EVENT, { detail: { left: cmpLeft, right: path } })) }] : [])] : []),
        ...(path.endsWith('.feature') ? ['separator' as const, { label: 'New feature beside this', icon: Plus, onSelect: () => onNew(path.split('/').slice(0, -1).join('/')) }] : []),
        ...(extra?.linked ? [] : editItems(path, false)),
      ]}>
        <li className={extra?.linked ? 'nested-link' : undefined}>
          <div className="se-row">
            {kids.length > 0 ? (
              <button className="se-twisty" aria-label={`${expanded ? 'Collapse' : 'Expand'} nested files of ${name}`} aria-expanded={expanded} onClick={() => setOpenNests((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; })} style={{ marginLeft: 4 + depth * 12 }}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : <span className="se-twisty-space" style={{ marginLeft: 4 + depth * 12 }} />}
            {renaming === path && !extra?.linked ? renameBox(path, false) : <button
              className={`explorer-file ${isActive(path) && !extra?.linked ? 'selected' : ''} ${clip?.mode === 'cut' && clip.path === path ? 'cut' : ''}`}
              onKeyDown={extra?.linked ? undefined : rowKeys(path, false)}
              data-path={extra?.linked ? undefined : path}
              title={extra?.note ? `${path} · ${extra.note}` : path}
              aria-current={isActive(path) && !extra?.linked ? 'page' : undefined}
              onClick={() => open(path)}
              onDoubleClick={() => keepTab(path)}
            >
              <Icon size={14} aria-hidden="true" style={{ color: extra?.linked ? undefined : fileType(path).color }} />
              <span>{name}</span>
              {extra?.note && <small>{extra.note}</small>}
            </button>}
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
            ...(featureOn('find-in-folder') ? [{ label: 'Find in Folder…', icon: Search, onSelect: () => window.dispatchEvent(new CustomEvent('tas:find-in-folder', { detail: n.path })) }] : []),
            ...(featureOn('explorer-new-file') && !browserSolution ? [{ label: 'New File…', icon: FilePlus, onSelect: () => void newFile(n.path) }] : []),
            ...(featureOn('explorer-scope') ? [{ label: 'Scope to This', icon: Focus, onSelect: () => setScope(n.path) }] : []),
            ...editItems(n.path, true),
          ]}>
            <li>
              <div className={`explorer-folder-row ${activeFolder === n.path ? 'active-folder' : ''}`}>
                {renaming === n.path ? <span className="explorer-folder" style={{ paddingLeft: 4 + depth * 12 }}><Folder size={14} />{renameBox(n.path, true)}</span> : <button className={`explorer-folder ${clip?.mode === 'cut' && clip.path === n.path ? 'cut' : ''}`} style={{ paddingLeft: 4 + depth * 12 }} title={n.path} aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${n.path}`} aria-expanded={expanded}
                  onKeyDown={rowKeys(n.path, true)}
                  onClick={() => { onFolder(n.path); if (!searching) toggle(n.path); }}>
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                  <span>{n.name}</span>
                  <small>{n.count}</small>
                </button>}
                {isFeatureFolder && <button className="folder-add icon-button" aria-label={`New feature in ${n.path}`} title={`New feature in ${n.path}`} onClick={() => onNew(n.path)}><Plus size={13} /></button>}
              </div>
              {expanded && render(n.children, depth + 1)}
            </li>
          </RowMenu>
        );
      })}
    </>
  );
  /** One project: name, Dependencies (frameworks, packages, project references; collapsed by default) and its files. */
  const projectRow = (p: SolutionProject, depth: number) => {
    const key = `@project:${p.file}`;
    const open = searching || !collapsed.has(key);
    const deps = openDeps.has(p.file) && !searching;
    const refs = p.references ?? [];
    const count = (p.packages?.length ?? 0) + refs.length + (p.frameworks?.length ?? 0) + (p.assemblies?.length ?? 0);
    const pad = 4 + depth * 12;
    return (
      <li key={key}>
        <RowMenu label={`Project ${p.name}`} items={[
          ...(p.file.endsWith('.csproj') && !browserSolution ? [{ label: 'Edit Project File', icon: FileCog, onSelect: () => onOpenFile(p.file) }] : []),
          ...(onManagePackages && p.file.endsWith('.csproj') ? [{ label: 'Manage NuGet Packages…', icon: Package, onSelect: () => onManagePackages(p.file) }] : []),
          { label: 'Copy project path', icon: Copy, onSelect: () => copyText(p.file) },
          ...(solution?.solutionFile && !browserSolution && p.file.endsWith('.csproj') ? ['separator' as const, { label: 'Remove from Solution', icon: Trash2, onSelect: () => void removeProject(p.file, p.name) }] : []),
        ]}>
        <div className="explorer-folder-row" data-menu-row>
          <button className="explorer-folder se-project" style={{ paddingLeft: pad }} aria-label={`${open ? 'Collapse' : 'Expand'} project ${p.name}`} aria-expanded={open} onClick={() => toggle(key)} title={p.missing ? `${p.file} (not found)` : p.file}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Boxes size={14} /><span>{p.name}</span>{p.missing ? <small>(unavailable)</small> : p.external && <small title="This project is outside the opened folder; it is part of the solution, so its files are indexed and editable here.">(outside the folder)</small>}
          </button>
        </div>
        </RowMenu>
        {open && (
          <ul className="folder-children">
            {!searching && (
              <li>
                <div className="explorer-folder-row">
                  <button className="explorer-folder" style={{ paddingLeft: pad + 12 }} aria-label={`${deps ? 'Collapse' : 'Expand'} ${p.legacy ? 'References' : 'Dependencies'}`} aria-expanded={deps} onClick={() => setOpenDeps((prev) => { const n = new Set(prev); if (n.has(p.file)) n.delete(p.file); else n.add(p.file); return n; })}>
                    {deps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Package size={14} /><span>{p.legacy ? 'References' : 'Dependencies'}</span><small>{count}</small>
                  </button>
                </div>
                {deps && (
                  <ul className="folder-children se-deps">
                    {(p.frameworks ?? []).map((f) => <li key={`f:${f}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 36 }} title="Framework"><Layers size={13} /><span>{f}</span></div></li>)}
                    {(p.packages ?? []).map((x) => <li key={`p:${x}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 36 }} title="NuGet package"><Package size={13} /><span>{x}</span></div></li>)}
                    {(p.assemblies ?? []).map((a) => <li key={`a:${a.name}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 36 }} title={a.hintPath ? `Assembly: ${a.hintPath}` : 'Framework assembly'}><FileCog size={13} /><span>{a.name}</span></div></li>)}
                    {refs.map((r) => <li key={`r:${r}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 36 }} title={`Project reference: ${r}`}><Boxes size={13} /><span>{r.split('/').pop()!.replace(/\.\w+proj$/i, '')}</span></div></li>)}
                  </ul>
                )}
              </li>
            )}
            {items(byProject.get(p.dir) ?? [], depth + 1)}
          </ul>
        )}
      </li>
    );
  };
  /** Solution folders (virtual, from the .sln/.slnx) and projects, in the solution's own order. */
  const solutionNodes = (ns: SolutionNode[], depth: number, trail = ''): ReactNode => ns.map((n) => {
    if (n.kind === 'project') { const p = projects.find((x) => x.file === n.file); return p ? projectRow(p, depth) : null; }
    const key = `@sf:${trail}/${n.name}`;
    const open = searching || !collapsed.has(key);
    return (
      <li key={key}>
        <div className="explorer-folder-row">
          <button className="explorer-folder se-solution-folder" style={{ paddingLeft: 4 + depth * 12 }} aria-label={`${open ? 'Collapse' : 'Expand'} solution folder ${n.name}`} aria-expanded={open} onClick={() => toggle(key)}>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}{open ? <FolderOpen size={14} /> : <Folder size={14} />}<span>{n.name}</span>
          </button>
        </div>
        {open && <ul className="folder-children">{solutionNodes(n.children, depth + 1, `${trail}/${n.name}`)}</ul>}
      </li>
    );
  });
  const misc = byProject.get(undefined) ?? [];
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
      {scope && <div className="se-scope" aria-label="Explorer scope"><Focus size={12} aria-hidden="true" /><span title={scope}>Scoped to <strong>{scope}</strong></span><button className="icon-button" aria-label="Home (show the whole solution)" title="Home" onClick={() => setScope('')}><House size={13} /></button></div>}
      <div className="explorer-summary" role="status">
        {pendingOnly ? `${files.length} file${files.length === 1 ? '' : 's'} with unsaved changes` : query.trim() ? `${files.length} matching file${files.length === 1 ? '' : 's'}` : `${features.length} feature file${features.length === 1 ? '' : 's'} · ${files.length} file${files.length === 1 ? '' : 's'}`}
      </div>
      <nav className="folder-tree se-tree" ref={tree} aria-label="Solution">
        <ul className="folder-children">
          <li>
            <RowMenu label="Solution" items={solution?.solutionFile && !browserSolution ? [
              { label: 'Add New Project…', icon: Plus, onSelect: () => setAdding({ kind: 'new', template: 'nunit', name: '', folder: '' }) },
              { label: 'Add Existing Project…', icon: Boxes, onSelect: () => setAdding({ kind: 'existing', path: '' }) },
            ] : []}>
            <div className="se-row se-solution" data-menu-row><Layers size={14} aria-hidden="true" /><span title={solution?.solutionFile ?? undefined}>Solution '{solution?.name ?? '…'}' ({projects.length} project{projects.length === 1 ? '' : 's'})</span></div>
            </RowMenu>
            {adding && (
              <form className="se-add-project" aria-label={adding.kind === 'new' ? 'Add New Project' : 'Add Existing Project'} onSubmit={(e) => { e.preventDefault(); void addProject(); }}>
                {adding.kind === 'new' ? (
                  <>
                    <select aria-label="Project template" value={adding.template} onChange={(e) => setAdding({ ...adding, template: e.target.value })}>
                      <option value="nunit">NUnit Test Project</option>
                      <option value="xunit">xUnit Test Project</option>
                      <option value="mstest">MSTest Test Project</option>
                      <option value="classlib">Class Library</option>
                      <option value="console">Console App</option>
                    </select>
                    <input aria-label="Project name" placeholder="Project name" autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
                    <input aria-label="Project folder" placeholder="Folder (optional), e.g. tests" value={adding.folder} onChange={(e) => setAdding({ ...adding, folder: e.target.value })} />
                  </>
                ) : (
                  <input aria-label="Project file path" placeholder="Path of a .csproj" autoFocus value={adding.path} onChange={(e) => setAdding({ ...adding, path: e.target.value })} />
                )}
                <div className="se-add-actions">
                  <button className="button primary" type="submit" disabled={addBusy}>{addBusy ? 'Adding…' : 'Add'}</button>
                  <button className="button" type="button" onClick={() => setAdding(null)}>Cancel</button>
                </div>
              </form>
            )}
            <ul className="folder-children">
              {solutionNodes(solution?.tree ?? projects.map((p) => ({ kind: 'project' as const, name: p.name, file: p.file })), 0)}
              {misc.length > 0 && (
                <li>
                  <div className="explorer-folder-row">
                    <button className="explorer-folder se-solution-folder" aria-label={`${!collapsed.has('@misc') || searching ? 'Collapse' : 'Expand'} Miscellaneous Files`} aria-expanded={!collapsed.has('@misc') || searching} onClick={() => toggle('@misc')} title="Files that belong to no project in the solution">
                      {!collapsed.has('@misc') || searching ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Folder size={14} /><span>Miscellaneous Files</span><small>{misc.length}</small>
                    </button>
                  </div>
                  {(!collapsed.has('@misc') || searching) && render(misc, 1)}
                </li>
              )}
            </ul>
          </li>
        </ul>
      </nav>
      {!files.length && <p className="explorer-empty">{pendingOnly ? 'No unsaved changes.' : query.trim() ? 'Nothing matches your search.' : 'No files yet.'}</p>}
      <button className="new-feature" onClick={() => onNew()}><Plus size={15} />New feature</button>
    </section>
  );
}
