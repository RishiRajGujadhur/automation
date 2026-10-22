import { useFileDecorations, decoratedFiles } from './files/decorations';
import { explorerDeco, explorerSettings } from './vscode/explorer';
import { openInputBox } from './quickinput/store';
import { treeIndent } from './vscode/workbenchLayout';
import { nestFiles } from './files/fileNesting';
import { globMatcher } from './files/glob';
import { files as files_ } from './vscode/files';
import { useSettings } from './vscode/settings';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { keepTab, useTabs } from './files/tabs';
import { fileSource } from './files/provider';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileCode2, FileText, FileCog, Braces, Plus, Search, X, Copy, ChevronsDownUp, ChevronsUpDown, Eye, Package, Boxes, Link2, LocateFixed, PencilLine, Files, Layers, SquareStack, Scissors, ClipboardPaste, Trash2, TextCursorInput, Focus, House, FilePlus, GitCompare, BookOpen, Crosshair, Columns2, SquareTerminal } from 'lucide-react';
import { fileType } from './files/fileTypes';
import { featureOn } from './features';
import { RowMenu, copyText } from './ui';
import { api } from './api';
import { normalizeFeaturePath, parentFolders } from './featureTree';
import { UNSAVED_EVENT, unsavedFiles } from './editor/autosave';
import { GIT_CHANGED_EVENT, FILE_SAVED_EVENT } from './editor/events';
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

/** The search terms marked in a name (QOL-50). */
function markQuery(name: string, query: string) {
  const t = query.trim().toLowerCase().split(/\s+/).find((w) => w && name.toLowerCase().includes(w));
  if (!t) return name;
  const at = name.toLowerCase().indexOf(t);
  return <>{name.slice(0, at)}<mark className="list-match">{name.slice(at, at + t.length)}</mark>{name.slice(at + t.length)}</>;
}
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
  const settingsVersion = useSettings();
  // workbench.tree.indent (W59): the indent of each tree level.
  const IND = treeIndent();
  // Problems of the open files (W92): file names coloured with a count; folders take the colour of what they hold.
  const deco = useFileDecorations();
  const folderDeco = (folder: string) => { let w = false; for (const f of decoratedFiles()) if (f.startsWith(`${folder}/`)) { const d = deco(f); if (d.errors) return 'se-folder-deco deco-error'; if (d.warnings) w = true; } return w ? 'se-folder-deco deco-warning' : ''; };
  // After a rename, copy or delete the tree reloads itself too (not only when the index revision changes).
  const loads = useRef(0);
  const loadSolution = () => { const n = ++loads.current; api<Solution>('/solution').then((s) => { if (n === loads.current) setSolution(s); }).catch(() => {}); };
  const onFileOp = fileOpProp && (async (op: FileOp) => { await fileOpProp(op); if (!browserSolution) loadSolution(); });
  const [renaming, setRenaming] = useState<string | null>(null);
  // Drag a file onto a folder to move it (QOL-50).
  const [dropOn, setDropOn] = useState<string | null>(null);
  // Hovering a dragged file over a collapsed folder opens it (QOL-50).
  const hoverOpen = useRef(0);
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
    // A file that already exists just opens (QOL-50).
    catch (e) { if (featureOn('new-file-existing') && /already exists/.test((e as Error).message)) { onOpenFile(file); onNotice?.(`${file} already exists; opened it.`); } else onNotice?.((e as Error).message); }
  };
  /** New File… in VS Code's input box: the path is checked as it is typed (W91 / W108). */
  const newFileBox = (folder: string) => openInputBox({
    prompt: `New file in ${folder || 'the workspace root'} (a name, or sub/folder/name)`,
    value: folder ? `${folder}/` : '',
    validate: (v) => { const n = v.trim(); if (!n || n.endsWith('/')) return 'A file or folder name must be provided.'; if (/^\s|\s$/.test(v.split('/').pop() ?? '')) return 'Leading or trailing whitespace detected in file or folder name.'; if (/[<>:"|?*]/.test(n)) return `The name **${n}** is not valid as a file or folder name. Please choose a different name.`; if (n.split(/[\\/]/).includes('..')) return 'The path cannot leave the workspace.'; return undefined; },
    accept: async (v) => {
      const file = v.trim().replace(/\\/g, '/');
      try { await api('/file/create', { file, source: '' }); loadSolution(); onOpenFile(file); }
      catch (e) { if (/already exists/.test((e as Error).message)) { onOpenFile(file); onNotice?.(`${file} already exists; opened it.`); } else onNotice?.((e as Error).message); }
    },
  });
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
  // Git status colours (VS Code): modified, added, untracked and conflicted files (QOL-50).
  const [gitFiles, setGitFiles] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    if (browserSolution || !featureOn('explorer-git')) return;
    const load = () => { api<{ repo: boolean; files: { file: string; status: string }[] }>('/git/status').then((s) => setGitFiles(new Map(s.repo ? s.files.map((f) => [f.file, f.status] as [string, string]) : [])), () => {}); };
    load();
    const t = setInterval(load, 15_000);
    window.addEventListener(GIT_CHANGED_EVENT, load);
    window.addEventListener(FILE_SAVED_EVENT, load);
    return () => { clearInterval(t); window.removeEventListener(GIT_CHANGED_EVENT, load); window.removeEventListener(FILE_SAVED_EVENT, load); };
  }, [browserSolution, revision]);
  // Copy actions say what they copied (QOL-50).
  const copied = (text: string) => void copyText(text).then((ok) => { if (featureOn('copy-feedback')) onNotice?.(ok ? `Copied ${text}` : 'Clipboard unavailable.'); });
  // Copy Full Path (Visual Studio): the repository folder on disk plus the item's path.
  const copyFull = (p: string) => void api<{ config: { repositoryRoot: string } }>('/workspace').then((w) => { const sep = w.config.repositoryRoot.includes('\\') ? '\\' : '/'; return copyText(`${w.config.repositoryRoot.replace(/[\\/]+$/, '')}${sep}${p.replaceAll('/', sep)}`); }).then((ok) => onNotice?.(ok ? 'Copied the full path.' : 'Clipboard unavailable.'), (e) => onNotice?.((e as Error).message));
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
  // Collapsed folders are remembered per workspace (QOL-50).
  const collapsedKey = () => { const s = fileSource(); return `tas:explorerCollapsed:${s.kind === 'browser' ? `browser:${s.name}` : s.root ?? ''}`; };
  const [collapsed, setCollapsed] = useState<Set<string>>(() => { try { return featureOn('explorer-remember') ? new Set(JSON.parse(localStorage.getItem(collapsedKey()) ?? '[]') as string[]) : new Set(); } catch { return new Set(); } });
  useEffect(() => { if (featureOn('explorer-remember')) try { localStorage.setItem(collapsedKey(), JSON.stringify([...collapsed].filter((k) => !k.startsWith('@')))); } catch { /* storage blocked */ } }, [collapsed]); // eslint-disable-line react-hooks/exhaustive-deps
  const [openNests, setOpenNests] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(false);
  // Open Files filter (Visual Studio's Solution Explorer filter): only the files open in editor tabs.
  const [openOnly, setOpenOnly] = useState(false);
  const openTabs = useTabs();
  const openSet = useMemo(() => new Set(openTabs.tabs.map((t) => normalizeFeaturePath(t.file))), [openTabs]);
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
  const [findMode, setFindMode] = useState<'filter' | 'highlight'>(() => { try { return localStorage.getItem('tas:explorerFindMode') === 'highlight' ? 'highlight' : 'filter'; } catch { return 'filter'; } });
  useEffect(() => { try { localStorage.setItem('tas:explorerFindMode', findMode); } catch { /* storage blocked */ } }, [findMode]);
  const patternNest = useMemo(() => nestFiles((solution?.files ?? []).map((f) => f.file)), [solution, settingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const files = useMemo(() => {
    const list = [...(solution?.files ?? [])];
    for (const f of features) { const p = normalizeFeaturePath(f.file); if (!list.some((x) => x.file === p)) list.push({ file: p, layer: 'Feature' }); }
    const codeBehind = new Set(Object.values(solution?.nesting ?? {}).flat().filter((n) => n.kind === 'code-behind').map((n) => n.file));
    // explorer.fileNesting (W95): children sit under their parent file.
    for (const kids of patternNest.values()) for (const k of kids) codeBehind.add(k);
    // Find's highlight mode (W98) shows every file and marks the matches instead of filtering.
    const terms = findMode === 'highlight' ? [] : query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const featureName = new Map(features.map((f) => [normalizeFeaturePath(f.file), f.name]));
    // files.exclude (W100): hidden unless Show All Files is on.
    const excluded = Object.entries(files_.exclude() ?? {}).filter(([, on]) => on).map(([g]) => globMatcher(g));
    return list.filter((x) =>
      (showAll || !excluded.some((m) => m(x.file))) &&
      !codeBehind.has(x.file) && // nested under its feature instead
      !x.file.endsWith('.csproj') && // the project node stands for it
      // Inside a real project folder every file shows (as in Visual Studio); only build output stays hidden.
      (showAll || !HIDDEN_LAYERS.has(x.layer) || (x.layer === 'Other' && inProject(x.file))) &&
      // Classic (.NET Framework) projects list their files: only those show, like Visual Studio (Show All Files: all).
      (showAll || listedByProject(x.file)) &&
      (!pendingOnly || pending.includes(x.file)) &&
      (!openOnly || openSet.has(x.file)) &&
      (!scope || x.file.startsWith(`${scope}/`)) &&
      terms.every((t) => `${x.file} ${featureName.get(x.file) ?? ''}`.toLowerCase().includes(t)));
  }, [solution, features, query, showAll, pendingOnly, pending, projectDirs, listed, scope, openOnly, openSet, patternNest, findMode, settingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const searching = !!query.trim() || pendingOnly || openOnly;
  // Files per project (deepest project folder wins); files outside every project are "Miscellaneous Files".
  const projects = useMemo(() => solution?.projects ?? [], [solution]);
  // The SDK-style C# project a file belongs to (the deepest project folder containing it).
  const ownerProject = (file: string) => projects.filter((p) => /\.(cs|fs|vb)proj$/i.test(p.file) && !p.legacy && (p.dir === '' || p.dir === '.' || file.startsWith(`${p.dir}/`))).sort((a, b) => b.dir.length - a.dir.length)[0]?.file;
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
  // Track Active Item can be turned off (Visual Studio's option; Rider's 'Always Select Opened File').
  const [track, setTrack] = useState(() => { try { return localStorage.getItem('tas:explorerTrack') !== 'false'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('tas:explorerTrack', String(track)); } catch { /* storage blocked */ } }, [track]);
  // explorer.autoReveal (W96): the active file's folders open and (unless focusNoScroll) it scrolls into view; false leaves the tree alone.
  useEffect(() => {
    const reveal = explorerSettings.autoReveal();
    if (!activeFile || reveal === 'false' || !(track || !featureOn('explorer-track'))) return;
    setCollapsed((prev) => { const next = new Set(prev); parentFolders(normalizeFeaturePath(activeFile)).forEach((p) => next.delete(p)); return next; });
    if (reveal === 'true') { const f = normalizeFeaturePath(activeFile); setTimeout(() => tree.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(f)}"]`)?.scrollIntoView({ block: 'nearest' }), 80); }
  }, [activeFile]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Keyboard in the Explorer tree (QOL-50): arrows, Home / End, type to select, Enter. */
  const typed = useRef({ text: '', at: 0 });
  // How many files a folder holds (its tooltip) (QOL-50).
  const folderCount = (dir: string) => files.filter((f) => f.file.startsWith(`${dir}/`)).length;
  // The Explorer's scroll position comes back after a reload (QOL-50), once the tree has rows.
  const scrollSave = useRef(0);
  const scrollRestored = useRef(false);
  useEffect(() => {
    if (scrollRestored.current || !featureOn('explorer-scroll') || !tree.current || !files.length) return;
    scrollRestored.current = true;
    const top = Number(sessionStorage.getItem(collapsedKey().replace('Collapsed', 'Scroll')) ?? 0);
    if (top) requestAnimationFrame(() => { if (tree.current) tree.current.scrollTop = top; });
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const treeKeys = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (!tree.current || !t.matches('.explorer-file, .explorer-folder') || e.ctrlKey || e.metaKey || e.altKey) return;
    const rows = [...tree.current.querySelectorAll<HTMLElement>('.explorer-file, .explorer-folder')].filter((r) => r.offsetParent !== null);
    const i = rows.indexOf(t);
    const focus = (r?: HTMLElement) => { if (r) { e.preventDefault(); r.focus(); r.scrollIntoView({ block: 'nearest' }); } };
    if (e.key === 'ArrowDown') return focus(rows[i + 1]);
    if (e.key === 'ArrowUp') return focus(rows[i - 1]);
    if (e.key === 'Home') return focus(rows[0]);
    if (e.key === 'End') return focus(rows[rows.length - 1]);
    if (e.key === 'ArrowRight' && t.matches('.explorer-folder')) { e.preventDefault(); if (t.getAttribute('aria-expanded') === 'false') t.click(); else focus(rows[i + 1]); return; }
    if (e.key === 'ArrowLeft') {
      if (t.matches('.explorer-folder') && t.getAttribute('aria-expanded') === 'true') { e.preventDefault(); t.click(); return; }
      // The folder this row is in.
      const parent = t.closest('ul.folder-children')?.closest('li')?.querySelector<HTMLElement>(':scope > .explorer-folder-row .explorer-folder, :scope > div > .explorer-folder');
      return focus(parent ?? undefined);
    }
    if (e.key.length === 1 && e.key.trim() && featureOn('explorer-type-select')) {
      const now = Date.now();
      typed.current = { text: now - typed.current.at < 700 ? typed.current.text + e.key.toLowerCase() : e.key.toLowerCase(), at: now };
      const q = typed.current.text;
      const order = [...rows.slice(i + (q.length === 1 ? 1 : 0)), ...rows.slice(0, i + (q.length === 1 ? 1 : 0))];
      return focus(order.find((r) => (r.textContent ?? '').trim().toLowerCase().startsWith(q)));
    }
    if (e.key === 'Enter' && t.matches('.explorer-file') && featureOn('explorer-enter')) {
      e.preventDefault();
      const path = t.dataset.path;
      if (!path) return;
      open(path);
      // The editor mounts (and loads the file) a moment later: keep trying for up to 2 s.
      const focusEditor = (tries = 0) => { const ed = document.querySelector<HTMLElement>(path.endsWith('.feature') ? '.gherkin-editor .cm-content' : `[aria-label="Source of ${CSS.escape(path)}"]`); if (ed && ed.offsetParent !== null) ed.focus(); else if (tries < 40) setTimeout(() => focusEditor(tries + 1), 50); };
      setTimeout(() => { keepTab(path); focusEditor(); });
      return;
    }
    /* tree keys */
  };
  const open = (file: string) => {
    const feature = featureByPath.get(file);
    if (feature) onSelect(feature);
    else onOpenFile(file, undefined, true);
  };
  const isActive = (p: string) => !!activeFile && normalizeFeaturePath(activeFile) === p;
  const fileRow = (path: string, name: string, depth: number, extra?: { linked?: boolean; note?: string }) => {
    const Icon = extra?.linked ? Link2 : fileType(path).icon;
    const kids: { file: string; kind: 'steps' | 'code-behind' | 'nested'; steps?: number }[] = !extra?.linked ? [...(solution?.nesting[path] ?? []), ...(patternNest.get(path) ?? []).map((f) => ({ file: f, kind: 'nested' as const }))] : [];
    const expanded = kids.length > 0 && openNests.has(path); // nested files start collapsed, as in Visual Studio
    const unsaved = pending.includes(path);
    return (
      <RowMenu key={(extra?.linked ? 'link:' : '') + path} items={[
        { label: 'Open', icon: FileCode2, onSelect: () => open(path) },
        ...(onSource ? [{ label: 'View source', icon: Eye, onSelect: () => onSource(path, 1) }] : []),
        { label: 'Copy path', icon: Copy, onSelect: () => copied(path) },
        ...(featureOn('exclude-from-project') && !browserSolution && !/\.(cs|fs|vb)proj$/i.test(path) && ownerProject(path) ? [{ label: 'Exclude From Project…', icon: FileCog, onSelect: () => window.dispatchEvent(new CustomEvent('tas:file-item', { detail: { project: ownerProject(path)!, file: path, exclude: true } })) }] : []),
        ...(featureOn('file-build-action') && !browserSolution && !/\.(cs|fs|vb)proj$/i.test(path) && ownerProject(path) ? [{ label: 'Build Action…', icon: FileCog, onSelect: () => window.dispatchEvent(new CustomEvent('tas:file-item', { detail: { project: ownerProject(path)!, file: path } })) }] : []),
        ...(featureOn('open-to-side') && !path.endsWith('.feature') && !browserSolution ? [{ label: 'Open to the Side', icon: Columns2, onSelect: () => window.dispatchEvent(new CustomEvent('tas:open-split', { detail: path })) }] : []),
        ...(featureOn('explorer-copy-name') ? [{ label: 'Copy file name', icon: Copy, onSelect: () => copied(path.split('/').pop()!) }] : []),
        ...(featureOn('copy-full-path') && !browserSolution ? [{ label: 'Copy Full Path', icon: Copy, onSelect: () => copyFull(path) }] : []),
        ...(featureOn('explorer-compare') ? [{ label: 'Select for Compare', icon: GitCompare, onSelect: () => { compareLeft = path; setCmpLeft(path); onNotice?.(`Selected ${path.split('/').pop()} for compare.`); } }, ...(cmpLeft && cmpLeft !== path ? [{ label: `Compare with ${cmpLeft.split('/').pop()}`, icon: GitCompare, onSelect: () => window.dispatchEvent(new CustomEvent(COMPARE_FILES_EVENT, { detail: { left: cmpLeft, right: path } })) }] : [])] : []),
        ...(path.endsWith('.feature') ? ['separator' as const, { label: 'New feature beside this', icon: Plus, onSelect: () => onNew(path.split('/').slice(0, -1).join('/')) }] : []),
        ...(extra?.linked ? [] : editItems(path, false)),
      ]}>
        <li className={extra?.linked ? 'nested-link' : undefined}>
          <div className="se-row">
            {kids.length > 0 ? (
              <button className="se-twisty" aria-label={`${expanded ? 'Collapse' : 'Expand'} nested files of ${name}`} aria-expanded={expanded} onClick={() => setOpenNests((prev) => { const next = new Set(prev); if (next.has(path)) next.delete(path); else next.add(path); return next; })} style={{ marginLeft: 4 + depth * IND }}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
            ) : <span className="se-twisty-space" style={{ marginLeft: 4 + depth * IND }} />}
            {renaming === path && !extra?.linked ? renameBox(path, false) : <button
              className={`explorer-file ${isActive(path) && !extra?.linked ? 'selected' : ''} ${clip?.mode === 'cut' && clip.path === path ? 'cut' : ''}`}
              onKeyDown={extra?.linked ? undefined : rowKeys(path, false)}
              draggable={featureOn('drag-path')} onDragStart={(e) => { e.dataTransfer.setData('text/plain', path); e.dataTransfer.setData('application/x-tas-path', path); e.dataTransfer.effectAllowed = 'copyMove'; }} data-path={extra?.linked ? undefined : path}
              title={extra?.note ? `${path} · ${extra.note}` : path}
              aria-current={isActive(path) && !extra?.linked ? 'page' : undefined}
              onClick={(e) => { if ((e.ctrlKey || e.metaKey) && featureOn('ctrl-click-side') && !path.endsWith('.feature') && !browserSolution) { window.dispatchEvent(new CustomEvent('tas:open-split', { detail: path })); return; } open(path); }}
              onDoubleClick={() => keepTab(path)}
              onAuxClick={(e) => { if (e.button === 1 && featureOn('explorer-middle-click')) { e.preventDefault(); open(path); setTimeout(() => keepTab(path)); } }}
            >
              <Icon size={14} aria-hidden="true" style={{ color: extra?.linked ? undefined : fileType(path).color }} />
              <span className={explorerDeco.colors() ? `se-deco ${(() => { const d = deco(path); return d.errors ? 'deco-error' : d.warnings ? 'deco-warning' : ''; })()}` : undefined}>{featureOn('explorer-search-mark') ? markQuery(name, query) : name}</span>
              {extra?.note && <small>{extra.note}</small>}
              {/* VS Code's problem badge (W92): the file's errors and warnings. */}
              {explorerDeco.badges() && (() => { const d = deco(path); const n = d.errors + d.warnings; return n ? <span className={`se-problems ${d.errors ? 'deco-error' : 'deco-warning'}`} aria-label={`${d.errors} errors, ${d.warnings} warnings`}>{n > 9 ? '9+' : n}</span> : null; })()}
            </button>}
            {gitFiles.has(path) && !extra?.linked && <span className={`se-git se-git-${gitFiles.get(path) === '?' ? 'u' : gitFiles.get(path)!.toLowerCase()}`} title={{ M: 'Modified', A: 'Added', D: 'Deleted', R: 'Renamed', U: 'Conflict', '?': 'Untracked' }[gitFiles.get(path)!] ?? 'Changed'} aria-label={`Git: ${{ M: 'modified', A: 'added', D: 'deleted', R: 'renamed', U: 'conflict', '?': 'untracked' }[gitFiles.get(path)!] ?? 'changed'}`}>{gitFiles.get(path) === '?' ? 'U' : gitFiles.get(path)}</span>}
            {unsaved && <span className="se-dirty" role="img" title="Unsaved changes" aria-label={`${name} has unsaved changes`}>●</span>}
          </div>
          {expanded && (
            <ul className="folder-children">
              {kids.map((k) => fileRow(k.file, k.file.split('/').pop()!, depth + 1, k.kind === 'nested' ? undefined : k.kind === 'code-behind' ? { note: 'generated' } : { linked: true, note: `${k.steps} step${k.steps === 1 ? '' : 's'}` }))}
            </ul>
          )}
        </li>
      </RowMenu>
    );
  };
  // workbench.tree.renderIndentGuides (W59): a guide line down each folder's children, under its twisty.
  const render = (ns: Node[], depth: number): ReactNode => <ul className="folder-children" style={depth > 0 ? { '--guide-x': `${10 + (depth - 1) * IND}px` } as React.CSSProperties : undefined}>{items(ns, depth)}</ul>;
  // explorer.compactFolders (W93): a folder holding only one folder shares its row ("a/b/c").
  const compact = (n: Node): Node => {
    if (n.kind !== 'folder' || !explorerSettings.compactFolders() || searching) return n;
    let cur = n, name = n.name;
    while (cur.children.length === 1 && cur.children[0].kind === 'folder') { cur = cur.children[0] as typeof cur; name = `${name}/${cur.name}`; }
    return cur === n ? n : { ...cur, name };
  };
  // explorer.sortOrder (W94): folders first (default), mixed, files first, or by type (extension).
  const sortNodes = (ns: Node[]) => {
    const order = explorerSettings.sortOrder();
    const byName = (a: Node, b: Node) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    const ext = (n: Node) => (n.kind === 'file' && n.name.includes('.') ? n.name.slice(n.name.lastIndexOf('.') + 1).toLowerCase() : '');
    const folderRank = (n: Node) => (n.kind === 'folder' ? 0 : 1);
    return [...ns].sort((a, b) =>
      order === 'mixed' ? byName(a, b)
        : order === 'filesFirst' ? folderRank(b) - folderRank(a) || byName(a, b)
          : order === 'type' ? folderRank(a) - folderRank(b) || ext(a).localeCompare(ext(b)) || byName(a, b)
            : folderRank(a) - folderRank(b) || byName(a, b));
  };
  const items = (ns: Node[], depth: number): ReactNode => (
    <>
      {sortNodes(ns).map(compact).map((n) => {
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
            { label: 'Copy folder path', icon: Copy, onSelect: () => copied(n.path) },
            ...(featureOn('copy-full-path') && !browserSolution ? [{ label: 'Copy Full Path', icon: Copy, onSelect: () => copyFull(n.path) }] : []),
            ...(featureOn('open-in-terminal') && !browserSolution ? [{ label: 'Open in Terminal', icon: SquareTerminal, onSelect: () => void api<{ config: { repositoryRoot: string } }>('/workspace').then((w) => { const sep = w.config.repositoryRoot.includes('\\') ? '\\' : '/'; window.dispatchEvent(new CustomEvent('tas:terminal-in', { detail: `${w.config.repositoryRoot.replace(/[\\/]+$/, '')}${sep}${n.path.replaceAll('/', sep)}` })); }, (e) => onNotice?.((e as Error).message)) }] : []),
            ...(featureOn('find-in-folder') ? [{ label: 'Find in Folder…', icon: Search, onSelect: () => window.dispatchEvent(new CustomEvent('tas:find-in-folder', { detail: n.path })) }] : []),
            ...(featureOn('explorer-new-file') && !browserSolution ? [{ label: 'New File…', icon: FilePlus, onSelect: () => void newFile(n.path) }] : []),
            ...(featureOn('explorer-scope') ? [{ label: 'Scope to This', icon: Focus, onSelect: () => setScope(n.path) }] : []),
            ...editItems(n.path, true),
          ]}>
            <li>
              <div className={`explorer-folder-row ${activeFolder === n.path ? 'active-folder' : ''} ${dropOn === n.path ? 'drop-target' : ''}`}
                onDragOver={(e) => { if (onFileOp && featureOn('drag-move') && e.dataTransfer.types.includes('application/x-tas-path')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropOn(n.path); if (!expanded && featureOn('drag-expand') && !hoverOpen.current) hoverOpen.current = window.setTimeout(() => { toggle(n.path, true); hoverOpen.current = 0; }, 600); } }}
                onDragLeave={() => { setDropOn(null); clearTimeout(hoverOpen.current); hoverOpen.current = 0; }}
                onDrop={(e) => { setDropOn(null); const from = e.dataTransfer.getData('application/x-tas-path'); if (!from || !onFileOp || !featureOn('drag-move')) return; e.preventDefault(); const to = join(n.path, from.split('/').pop()!); if (to === from || dirOf(from) === n.path) return; void (!explorerSettings.confirmDragAndDrop() ? Promise.resolve(true) : onConfirm ? onConfirm({ title: `Move ${from.split('/').pop()}?`, description: `${from} moves to ${n.path}/.`, confirm: 'Move' }) : Promise.resolve(window.confirm(`Move ${from} to ${n.path}/?`))).then((ok) => { if (ok) void onFileOp({ kind: 'rename', from, to }); }); }}>
                {renaming === n.path ? <span className="explorer-folder" style={{ paddingLeft: 4 + depth * IND }}><Folder size={14} />{renameBox(n.path, true)}</span> : <button className={`explorer-folder ${clip?.mode === 'cut' && clip.path === n.path ? 'cut' : ''} ${explorerDeco.colors() ? folderDeco(n.path) : ''}`} style={{ paddingLeft: 4 + depth * IND }} title={featureOn('folder-count') ? `${n.path} · ${folderCount(n.path)} file${folderCount(n.path) === 1 ? '' : 's'}` : n.path} aria-label={`${expanded ? 'Collapse' : 'Expand'} folder ${n.path}`} aria-expanded={expanded}
                  onKeyDown={rowKeys(n.path, true)}
                  onClick={() => { onFolder(n.path); if (!searching) toggle(n.path); }}>
                  {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                  <span>{n.name}</span>
                  {featureOn('explorer-git') && [...gitFiles.keys()].some((f) => f.startsWith(`${n.path}/`)) && <span className="se-git-dot" title="Contains changed files" aria-label="Contains changed files">●</span>}
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
    const pad = 4 + depth * IND;
    return (
      <li key={key}>
        <RowMenu label={`Project ${p.name}`} items={[
          ...(p.file.endsWith('.csproj') && !browserSolution ? [{ label: 'Edit Project File', icon: FileCog, onSelect: () => onOpenFile(p.file) }] : []),
          ...(p.file.endsWith('.csproj') && !browserSolution && featureOn('user-secrets') ? [{ label: 'Manage User Secrets', icon: FileCog, onSelect: () => window.dispatchEvent(new CustomEvent('tas:user-secrets', { detail: p.file })) }] : []),
          ...(p.file.endsWith('.csproj') && !browserSolution && featureOn('project-properties') ? [{ label: 'Properties', icon: FileCog, onSelect: () => window.dispatchEvent(new CustomEvent('tas:project-properties', { detail: p.file })) }] : []),
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
                  <button className="explorer-folder" style={{ paddingLeft: pad + IND }} aria-label={`${deps ? 'Collapse' : 'Expand'} ${p.legacy ? 'References' : 'Dependencies'}`} aria-expanded={deps} onClick={() => setOpenDeps((prev) => { const n = new Set(prev); if (n.has(p.file)) n.delete(p.file); else n.add(p.file); return n; })}>
                    {deps ? <ChevronDown size={12} /> : <ChevronRight size={12} />}<Package size={14} /><span>{p.legacy ? 'References' : 'Dependencies'}</span><small>{count}</small>
                  </button>
                </div>
                {deps && (
                  <ul className="folder-children se-deps">
                    {(p.frameworks ?? []).map((f) => <li key={`f:${f}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 3 * IND }} title="Framework"><Layers size={13} /><span>{f}</span></div></li>)}
                    {(p.packages ?? []).map((x) => <li key={`p:${x}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 3 * IND }} title="NuGet package"><Package size={13} /><span>{x}</span></div></li>)}
                    {(p.assemblies ?? []).map((a) => <li key={`a:${a.name}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 3 * IND }} title={a.hintPath ? `Assembly: ${a.hintPath}` : 'Framework assembly'}><FileCog size={13} /><span>{a.name}</span></div></li>)}
                    {refs.map((r) => <li key={`r:${r}`}><div className="se-row se-leaf" style={{ paddingLeft: pad + 3 * IND }} title={`Project reference: ${r}`}><Boxes size={13} /><span>{r.split('/').pop()!.replace(/\.\w+proj$/i, '')}</span></div></li>)}
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
          <button className="explorer-folder se-solution-folder" style={{ paddingLeft: 4 + depth * IND }} aria-label={`${open ? 'Collapse' : 'Expand'} solution folder ${n.name}`} aria-expanded={open} onClick={() => toggle(key)}>
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
    <section className="feature-explorer solution-explorer" aria-label="Explorer" onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); e.currentTarget.querySelector<HTMLInputElement>('input[aria-label="Search Explorer"]')?.select(); } }}>
      {/* The tour spotlights the heading, not the whole (tall) tree, so its buttons stay on screen on phones. */}
      <div className="sidebar-heading" data-tour="explorer">
        <span>EXPLORER</span>
        <div className="se-tools">
          {tool('Sync with Active Document', LocateFixed, sync)}
          {featureOn('explorer-track') && tool(track ? 'Track Active Item: on' : 'Track Active Item: off', Crosshair, () => setTrack(!track), track)}
          {tool(pendingOnly ? 'Show all changes filter off' : 'Pending changes filter', PencilLine, () => setPendingOnly(!pendingOnly), pendingOnly)}
          {featureOn('explorer-open-filter') && tool(openOnly ? 'Open files filter off' : 'Open files filter', BookOpen, () => setOpenOnly(!openOnly), openOnly)}
          {/* VS Code's Explorer title actions (W91): New File…, Refresh Explorer, Collapse Folders. */}
          {!browserSolution && <button className="icon-button se-tool" aria-label="New File…" title="New File…" onClick={() => newFileBox(activeFile && activeFile.includes('/') ? activeFile.slice(0, activeFile.lastIndexOf('/')) : '')}><span className="codicon codicon-new-file" aria-hidden="true" /></button>}
          <button className="icon-button se-tool" aria-label="Refresh Explorer" title="Refresh Explorer" onClick={() => { loadSolution(); onNotice?.('Explorer refreshed.'); }}><span className="codicon codicon-refresh" aria-hidden="true" /></button>
          {tool('Collapse all folders', ChevronsDownUp, collapseAll)}
          {tool('Show all files', showAll ? Files : SquareStack, () => setShowAll(!showAll), showAll)}
          {tool('New feature', Plus, () => onNew(), undefined, { 'data-tour': 'new-feature' })}
        </div>
      </div>
      <label className="search-box">
        <Search size={14} />
        <input aria-label="Search Explorer" placeholder="Search Explorer (Ctrl+;)" value={query} onChange={(e) => onQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.stopPropagation(); onQuery(''); } }} />
        {query && <button className="icon-button" aria-label="Clear search" onClick={() => onQuery('')}><X size={13} /></button>}
        {/* VS Code's tree find (W98): filter the tree (default) or only highlight what matches. */}
        <button className={`icon-button find-mode ${findMode === 'filter' ? 'on' : ''}`} aria-label={findMode === 'filter' ? 'Find mode: filter' : 'Find mode: highlight'} aria-pressed={findMode === 'filter'} title={findMode === 'filter' ? 'Filter (click to only highlight)' : 'Highlight (click to filter)'} onClick={() => setFindMode(findMode === 'filter' ? 'highlight' : 'filter')}><span className="codicon codicon-list-filter" aria-hidden="true" /></button>
      </label>
      {scope && <div className="se-scope" aria-label="Explorer scope"><Focus size={12} aria-hidden="true" /><span title={scope}>Scoped to <strong>{scope}</strong></span><button className="icon-button" aria-label="Home (show the whole solution)" title="Home" onClick={() => setScope('')}><House size={13} /></button></div>}
      <div className="explorer-summary" role="status">
        {pendingOnly ? `${files.length} file${files.length === 1 ? '' : 's'} with unsaved changes` : query.trim() ? `${files.length} matching file${files.length === 1 ? '' : 's'}` : `${features.length} feature file${features.length === 1 ? '' : 's'} · ${files.length} file${files.length === 1 ? '' : 's'}`}
      </div>
      <nav className="folder-tree se-tree" ref={tree} aria-label="Solution" onKeyDown={treeKeys} onScroll={(e) => { if (featureOn('explorer-scroll')) { const top = e.currentTarget.scrollTop; clearTimeout(scrollSave.current); scrollSave.current = window.setTimeout(() => { try { sessionStorage.setItem(collapsedKey().replace('Collapsed', 'Scroll'), String(top)); } catch { /* storage blocked */ } }, 200); } }}>
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
