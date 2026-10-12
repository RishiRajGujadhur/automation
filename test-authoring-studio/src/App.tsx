import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import SolutionExplorer from './SolutionExplorer';
import StudioTour, { type TourDestination } from './StudioTour';
import { featureDirectory } from './featureTree';
import Dashboard, { ContextBar } from './Dashboard';
import TestGenerator, { type GeneratorSeed } from './TestGenerator';
import DictionaryInspector from './DictionaryInspector';
import ProjectExplorer from './ProjectExplorer';
import TestDesign, { designTools } from './TestDesign';
import ActivityBar from './ActivityBar';
import CreateStepDialog from './CreateStepDialog';
import CodeEditor from './editor/CodeEditor';
import { readDraft, sha256, useAutoSave, unsavedFiles, editedThisSession } from './editor/autosave';
import EditorTabs, { EditorActions } from './files/EditorTabs';
import OpenSolution from './OpenSolution';
import StartWindow from './StartWindow';
import NugetManager from './NugetManager';
import BuildPanel from './build/BuildPanel';
import TestExplorer from './testing/TestExplorer';
import SearchView from './search/SearchView';
import GitView from './git/GitView';
import StatusBarItems from './StatusBarItems';
import GoToAll from './search/GoToAll';
import { runTests, getTestRun, discoverTests, useTestRun, outcomeOf, combine, type DiscoveredTest } from './testing/store';
import type { RunMark } from './editor/runGutter';
import { useBuild, startBuild, cancelBuild, getBuild } from './build/store';
import { useTabs, openTab, closeTab, closeAll as closeAllTabs, kindOf, cycleTab, getTabs, reloadTabs, movedPath, deletedPath } from './files/tabs';
import { useFileSource, setFileSource, fileSource } from './files/provider';
import { fsaSupported, pickFolder, restoreFolder, closeFolder as closeBrowserFolder, lastFolderName } from './files/fsa';
import { browserSolution } from './files/browserSolution';
import type { Solution, FileOp } from './SolutionExplorer';
import { renamePath, copyPath, deletePath } from './files/provider';
import { SAVE_ALL_EVENT } from './editor/events';
import { snapshot } from './algorithms/registry';
import { desktop, type DesktopMenuCommand } from './desktop';
import StepCatalogue from './StepCatalogue';
import SearchPalette from './SearchPalette';
import RecordingDictionary from './RecordingDictionary';
import { SelectorCatalogue, BackgroundCatalogue } from './Catalogues';
import { api } from './api';
import { useLocalState, RowMenu, copyText } from './ui';
import { timeAgo, useNow } from './time';
import { WorkspaceForm, RecordForm, NewFeatureForm, ParametersForm, RunForm } from './forms';
import { Select, Checkbox, Button, Dropdown } from './radix';
import * as Dialog from '@radix-ui/react-dialog';
import * as Toast from '@radix-ui/react-toast';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { IconButton, IndeterminateProgress, Separator, Switch, Segmented, usePrefs, useConfirm, haptic, withTransition, Meter } from './radix2';
import { markDone } from './progress';
import StudioSettings from './StudioSettings';
import SidebarResizer, { SIDEBAR_DEFAULT } from './SidebarResizer';
import GherkinEditor from './editor/GherkinEditor';
import { xmlExtensions } from './editor/xml';
import { labelled } from './editor/a11y';
import AppMenu, { AppMenuButton } from './AppMenu';
import '@fontsource-variable/dm-sans';
import '@fontsource/ibm-plex-mono/400.css';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { useEditorTheme } from './themes';
import { gherkin } from '@codemirror/legacy-modes/mode/gherkin';
import { diff as diffMode } from '@codemirror/legacy-modes/mode/diff';
import { motion, AnimatePresence } from 'motion/react';
import {
  Layers3,
  FileCode2,
  BookOpen,
  Blocks,
  ScanLine,
  Circle,
  Settings2,
  ChevronDown,
  ChevronRight,
  Folder,
  Search,
  Plus,
  ArrowUpRight,
  Check,
  CheckCheck,
  TriangleAlert,
  Play,
  Pause,
  Square,
  Trash2,
  RefreshCw,
  MousePointer2,
  Globe,
  TextCursorInput,
  CornerDownLeft,
  ArrowRight,
  GitBranch,
  Code2,
  Save,
  X,
  Copy,
  ArrowUp,
  ArrowDown,
  ShieldCheck,
  ExternalLink,
  PanelLeftClose,
  Terminal,
  Braces,
  Sparkles,
  Compass,
  LayoutDashboard,
  Wand2,
  FolderTree,
  Keyboard,
  Command as CommandIcon,
  SlidersHorizontal,
  Link2,
  Maximize2,
  PanelLeft,
  FlaskConical,
  FolderOpen,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Index, Feature, Binding, Action, Match } from './types';
import './tailwind.css';
import './styles.scss';
import './explorer.scss';
import './generator.scss';
import './modern.scss';
import './layout.scss';
import './theme.scss';
import './design.scss';
import './vscode.scss';
import './debug/debug.scss';
import './files/editor-area.scss';
import DebugPanel from './debug/DebugPanel';
import { useDebug, startDebugging, debugControl, isLive, getSnapshot, clearBreakpoints, BREAKPOINT_SETTINGS_EVENT } from './debug/store';
import { Bug, GitCompareArrows, Database, Settings, Layers, Hammer, TestTubeDiagonal, GitBranch as GitBranchIcon } from 'lucide-react';

const demo: Action[] = [
  { id: 'd1', action: 'goto', url: 'https://www.google.com/' },
  { id: 'd2', action: 'fill', target: { role: 'combobox', name: 'Search' }, value: 'Dayforce.com' },
  { id: 'd3', action: 'press', target: { name: 'Search' }, key: 'Enter' },
  { id: 'd4', action: 'click', target: { role: 'link', description: 'first search result' } },
];
// Primary destinations stay visible; reference pages live in the "More" menu and the Ctrl/Cmd+K palette.
const tabs = [
  { name: 'Dashboard', icon: LayoutDashboard, shortcut: 'Alt+1' },
  { name: 'Test Generator', icon: Wand2, shortcut: 'Alt+2' },
  { name: 'Features', icon: FileCode2, shortcut: 'Alt+3' },
  { name: 'Dictionary Inspector', icon: Braces, shortcut: 'Alt+4' },
] as const;
const moreTabs = [
  { name: 'Test Design', icon: FlaskConical },
  { name: 'Step Catalog', icon: BookOpen },
  { name: 'Backgrounds', icon: Blocks },
  { name: 'Selectors', icon: ScanLine },
  { name: 'Project Explorer', icon: FolderTree },
  { name: 'Config', icon: Settings2 },
] as const;
const NO_MARKS: RunMark[] = [];
const shortcuts: [string, string][] = [
  ['Ctrl/Cmd + K', 'Command palette: go to any page or add a step'],
  ['Alt + 1…4', 'Main pages in navigation order (Basic: Dashboard, Test Generator, Recorder)'],
  ['Alt + 5', 'Test Design (Advanced mode)'],
  ['Ctrl/Cmd + Shift + A', 'Switch between Basic and Advanced mode'],
  ['/', 'Search feature files'],
  ['?', 'Show this shortcut list'],
  ['Ctrl/Cmd + .', 'Focus mode (hide navigation chrome)'],
  ['Ctrl/Cmd + B', 'Show or hide the feature explorer'],
  ['Swipe a notification', 'Dismiss it (touch)'],
  ['Ctrl/Cmd + S', 'Test Generator: preview save'],
  ['Ctrl/Cmd + Enter', 'Test Generator: run validation'],
  ['Esc', 'Clear a search box, close a dialog or menu'],
  ['↑ / ↓', 'Move through dictionary fields'],
  ['Right-click empty space', 'Studio menu: Step Catalog, Backgrounds, Selectors, Project Explorer, Config and common actions'],
  ['Right-click a card or row', 'Actions for that item'],
  ['F12', 'Go to the C# definition of the step under the cursor'],
  ['F9', 'Toggle a breakpoint on the cursor line (.feature or .cs); or click the left margin'],
  ['F5', 'Start debugging the open feature / Continue'],
  ['Shift + F5', 'Stop debugging'],
  ['Ctrl + Shift + F5', 'Restart debugging'],
  ['F10 / F11 / Shift + F11', 'Step Over / Step Into / Step Out'],
  ['Ctrl + Shift + F9', 'Delete all breakpoints'],
];
const headings: Record<string, string> = {
  Dashboard: 'Repository health, classification and entry points.',
  'Test Generator': 'Inputs, dictionary match, locator flow and the validation gate in one place.',
  'Dictionary Inspector': 'XML selector dictionaries in document order, with optional browser verification.',
  'Project Explorer': 'Repository files by architectural layer.',
  'Test Design': 'Deterministic test-design algorithms: combinatorial Examples, flows, suite optimization, smells, flakiness and living docs.',
  Config: 'Workspace configuration for scanning and authoring.',
};
function Icon({ icon: Icon, className = '' }: { icon: LucideIcon; className?: string }) {
  return <Icon size={18} strokeWidth={1.7} className={`animated-icon ${className}`} />;
}
function Badge({ children, tone = 'muted' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export default function App() {
  const editorTheme = useEditorTheme();
  const [index, setIndexRaw] = useState<Index>();
  // Index answers can arrive out of order (a slow scan finishing after a newer one): keep the most recently activated.
  const setIndex = useCallback((next: Index | undefined | ((p: Index | undefined) => Index | undefined)) => setIndexRaw((prev) => {
    const value = typeof next === 'function' ? next(prev) : next;
    if (value && prev?.scannedAt && value.scannedAt && value.scannedAt < prev.scannedAt) return prev;
    return value;
  }), []);
  const [config, setConfig] = useState<any>();
  const { prefs: startPrefs } = usePrefs();
  const [tab, setTab] = useLocalState('tab', startPrefs.mode === 'advanced' ? 'Features' : 'Dashboard');
  const [view, setView] = useLocalState('view', 'recorder');
  const [feature, setFeature] = useState<Feature>();
  const [source, setSource] = useState('');
  const [query, setQuery] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [modal, setModal] = useState<string>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [actions, setActions] = useState<Action[]>(demo);
  const [selected, setSelected] = useState('d2');
  const [matches, setMatches] = useState<Match[]>([]);
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [recordStatus, setRecordStatus] = useState('demo');
  // Same origin as the UI (proxied to the API), so it follows the configured ports.
  const [url, setUrl] = useState(`${location.origin}/api/demo`);
  const [lastTrace, setLastTrace] = useState<string | null>(null);
  const [preview, setPreview] = useState<any>();
  const [draftName, setDraftName] = useState('Search for Dayforce');
  const [newFile, setNewFile] = useState('Features/NewFeature.feature');
  const [draftSteps, setDraftSteps] = useState<{ keyword: string; text: string }[]>([]);
  const [binding, setBinding] = useState<Binding>();
  const [params, setParams] = useState<Record<string, string>>({});
  const [sourcePeek, setSourcePeek] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [validation, setValidation] = useState<any>();
  const [outline, setOutline] = useState(false);
  const [examples, setExamples] = useState('| searchText |\n| Dayforce.com |');
  const [runProject, setRunProject] = useState('');
  const [runFilter, setRunFilter] = useState('');
  const [execution, setExecution] = useState({ status: 'idle', output: '' });
  const [guideOpen, setGuideOpen] = useState(false);
  const [mobileExplorer, setMobileExplorer] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [designKey, setDesignKey] = useState(0);
  // Source file open in the code editor (Features → code view); line to reveal.
  // Open editors (tabs). `codeFile` is the single file of earlier versions, opened as a tab once.
  const [codeFile, setCodeFile] = useLocalState<{ file: string; line?: number } | null>('codeFile', null);
  const openEditors = useTabs();
  const activeEditor = openEditors.tabs.find((t) => t.file === openEditors.active);
  const featureTabActive = activeEditor?.kind === 'feature';
  // Line to reveal per code tab (a new object each request, so asking again for the same line still jumps).
  const [codeLines, setCodeLines] = useState<Record<string, { line: number; column?: number } | undefined>>({});
  // F12 on a step: open its C# binding in the code editor; unbound steps say so.
  const goToDefinition = async (keyword: string, text: string) => {
    try {
      const [r] = await api<{ status: string; binding: { file: string; line: number } | null }[]>('/steps/match', { steps: [{ keyword, text }] });
      if (r?.binding) editFile(r.binding.file, r.binding.line);
      else setNotice(r?.status === 'Ambiguous' ? 'More than one binding matches this step.' : 'No step definition yet. Use “Create step definition” to add one.');
    } catch (e) { setNotice((e as Error).message); }
  };
  const editFile = (file: string, line?: number, column?: number) => {
    const kind = kindOf(file);
    if (line) setCodeLines((l) => ({ ...l, [file]: { line, column } }));
    openTab(file, kind);
    setTab('Features');
    setView(kind === 'code' ? 'code' : 'editor');
    setModal(undefined);
  };
  // File ▸ Open Folder…: the desktop app opens the folder natively and indexes it; a browser opens it with the
  // File System Access API (read and write in place, no upload) — indexing then needs the folder's path.
  const fileSrc = useFileSource();
  const [browserSol, setBrowserSol] = useState<Solution>();
  const [browserFolderName, setBrowserFolderName] = useState<string>();
  useEffect(() => { if (fsaSupported()) lastFolderName().then(setBrowserFolderName, () => {}); }, [fileSrc]);
  const enterBrowserFolder = async (name: string, announce = true) => {
    setFileSource({ kind: 'browser', name });
    reloadTabs();
    setBrowserSol(await browserSolution(name));
    if (announce) { setTab('Features'); setView('editor'); setNotice(`Opened ${name} from your disk. Files open and save in place. For step bindings and debugging, use File ▸ Index Folder with Studio Server….`); }
  };
  const leaveBrowserFolder = async () => { if (fileSource().kind !== 'browser') return; await closeBrowserFolder(); setBrowserSol(undefined); };
  /** A solution, project or folder was opened (Open Project/Solution, Start Window). */
  const solutionOpened = async (r: { config: { repositoryRoot: string; solution?: string }; index: Index }) => {
    await leaveBrowserFolder();
    setFileSource({ kind: 'server', root: r.config.repositoryRoot });
    reloadTabs();
    setIndex(r.index);
    setConfig(r.config as typeof config);
    setActiveFolder(undefined);
    setQuery('');
    setModal(undefined);
    setTab('Features');
    setView('editor');
  };
  const openFolder = async () => {
    if (desktop?.pickFolder) {
      const folder = await desktop.pickFolder('Open Folder');
      if (folder) work(async () => {
        const r = await api('/workspace', { ...config, repositoryRoot: folder });
        setFileSource({ kind: 'server', root: r.config.repositoryRoot }); reloadTabs();
        setIndex(r.index); setConfig(r.config); setActiveFolder(undefined); setQuery('');
        setNotice(`Opened ${folder}.`);
      });
      return;
    }
    if (!fsaSupported()) { setNotice('This browser cannot open local folders directly (the File System Access API needs Chrome, Edge or Opera). Enter the folder path instead.'); setModal('settings'); return; }
    try { await enterBrowserFolder(await pickFolder()); } catch (e) { if ((e as DOMException).name !== 'AbortError') setNotice((e as Error).message); }
  };
  const reopenBrowserFolder = async () => { const name = await restoreFolder(true); if (name) await enterBrowserFolder(name); else setNotice('The folder is no longer available. Use File ▸ Open Folder….'); };
  const closeFolder = async () => { await leaveBrowserFolder(); setFileSource({ kind: 'server', root: config?.repositoryRoot }); reloadTabs(); setNotice('Folder closed. Showing the indexed repository.'); };
  /** Save All: every open editor with unsaved edits writes itself (editors listen for this event). */
  const saveAll = () => window.dispatchEvent(new Event(SAVE_ALL_EVENT));
  useEffect(() => { const h = () => { if (feature && featureAuto.dirty) void featureAuto.save(); }; window.addEventListener(SAVE_ALL_EVENT, h); return () => window.removeEventListener(SAVE_ALL_EVENT, h); });
  // Editor keys (VS Code): Ctrl+F4 / Ctrl+W (desktop) close, Ctrl+PageDown/PageUp switch tabs, Ctrl+Alt+S save all,
  // Ctrl+S outside an editor saves the active one.
  const editorKeys = useRef<(e: KeyboardEvent) => void>(() => {});
  editorKeys.current = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (!desktop && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); setModal('solution'); return; }
    if (e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); showSearch(false); return; }
    if (e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') { e.preventDefault(); showSearch(true); return; }
    if (!e.shiftKey && !e.altKey && (e.key.toLowerCase() === 't' || e.key.toLowerCase() === 'p')) { e.preventDefault(); setModal('goto'); return; }
    if (e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') { e.preventDefault(); if (getBuild().status !== 'running') runBuild('build'); return; }
    if (e.key === 'Pause' || e.key === 'Cancel') { if (getBuild().status === 'running') { e.preventDefault(); void cancelBuild(); } return; }
    const active = getTabs().active;
    if (e.key === 'F4' || (desktop && e.key.toLowerCase() === 'w' && !e.shiftKey)) { if (active) { e.preventDefault(); void closeEditor(active); } }
    else if (e.key === 'PageDown' || e.key === 'PageUp') { e.preventDefault(); cycleTab(e.key === 'PageDown' ? 1 : -1); }
    else if (e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveAll(); }
    else if (e.key.toLowerCase() === 's' && !e.altKey && !e.shiftKey && !(e.target as HTMLElement | null)?.closest?.('.cm-editor') && tab === 'Features' && active) { e.preventDefault(); if (featureTabActive) saveFeature(); else saveAll(); }
  };
  useEffect(() => { const h = (e: KeyboardEvent) => editorKeys.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  /** Explorer Rename / Paste (copy or move) / Delete: applied on disk (server or browser folder), then tabs follow. */
  const fileOp = async (op: FileOp) => {
    const name = op.from.split('/').pop();
    try {
      if (op.kind === 'delete') {
        if (!(await confirm({ title: `Delete ${name}?`, description: op.folder ? `The folder ${op.from} and everything in it will be deleted from disk.` : `${op.from} will be deleted from disk.`, confirm: 'Delete', danger: true }))) return;
        await deletePath(op.from);
        deletedPath(op.from);
      } else if (op.kind === 'rename') {
        await renamePath(op.from, op.to!);
        movedPath(op.from, op.to!);
        if (feature && (feature.file === op.from || feature.file.startsWith(`${op.from}/`))) setFeature(undefined);
      } else {
        const created = await copyPath(op.from, op.to!);
        if (!op.folder) editFile(created);
      }
      if (fileSource().kind === 'browser') setBrowserSol(await browserSolution((fileSource() as { name: string }).name));
      // The Explorer reloads its tree right away; the re-index (a few seconds) lands when it is done.
      else api<Index>('/scan', {}).then(setIndex, (e) => setNotice((e as Error).message));
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  /** Closing a tab with unsaved edits keeps them (hot exit) after a confirmation. */
  const closeEditor = async (file: string) => {
    if (unsavedFiles().includes(file) && !(await confirm({ title: `Close ${file.split('/').pop()}?`, description: 'It has unsaved changes. They stay in this browser and come back when you reopen the file; press Ctrl+S first to write them to disk.', confirm: 'Close' }))) return;
    closeTab(file);
  };
  // Debugger: the debug windows dock under the editor while a session runs (or when opened).
  const debug = useDebug();
  const [debugOpen, setDebugOpen] = useLocalState('debugOpen', false);
  const debugLive = isLive(debug.state.status);
  // Right-click a breakpoint: the Breakpoints window opens on its settings.
  const [bpSettings, setBpSettings] = useState<string | null>(null);
  useEffect(() => { const h = (e: Event) => { setDebugOpen(true); setBpSettings(`${(e as CustomEvent<string>).detail}#${Date.now()}`); }; window.addEventListener(BREAKPOINT_SETTINGS_EVENT, h); return () => window.removeEventListener(BREAKPOINT_SETTINGS_EVENT, h); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const showDebug = debugOpen || debugLive;
  // Build ▸ Build / Rebuild / Clean: the Error List and Output dock under the editor like the debug windows.
  const build = useBuild();
  const [buildOpen, setBuildOpen] = useLocalState('buildOpen', false);
  const showBuild = buildOpen || build.status === 'running';
  // One docked bottom panel (as in Visual Studio / VS Code): Build and Debug windows share it as tabs.
  const [dockTab, setDockTab] = useLocalState<'build' | 'debug'>('dockTab', 'build');
  useEffect(() => { if (build.status === 'running') setDockTab('build'); }, [build.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (debugLive) setDockTab('debug'); }, [debugLive]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (debugOpen) setDockTab('debug'); }, [debugOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (buildOpen) setDockTab('build'); }, [buildOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const dockShows = showBuild && showDebug ? dockTab : showBuild ? 'build' : showDebug ? 'debug' : null;
  // Side bar view: the Explorer or the Test Explorer (activity bar, Test menu).
  // Manage NuGet Packages (project from the Explorer, else the first project).
  const [nugetProject, setNugetProject] = useState<string>();
  const openNuget = (project?: string) => { setNugetProject(project); setModal('nuget'); };
  const [sidebarView, setSidebarView] = useLocalState<'explorer' | 'tests' | 'search' | 'git'>('sidebarView', 'explorer');
  const showGit = () => { setTab('Features'); if (view !== 'code' && view !== 'editor') setView('editor'); setSidebarView('git'); setPrefs({ sidebar: true }); };
  // Find in Files (Ctrl+Shift+F) / Replace in Files (Ctrl+Shift+H): the Search view; the key re-focuses it.
  const [searchKey, setSearchKey] = useState({ n: 0, replace: false });
  const showSearch = (replace = false) => { setTab('Features'); if (view !== 'code' && view !== 'editor') setView('editor'); setSidebarView('search'); setPrefs({ sidebar: true }); setSearchKey((k) => ({ n: k.n + 1, replace })); };
  const showTests = () => { setTab('Features'); if (view !== 'code' && view !== 'editor') setView('editor'); setSidebarView('tests'); setPrefs({ sidebar: true }); };
  // Run / debug glyphs in the editors: discovered tests (refreshed with the index and after each run) and outcomes.
  const testRun = useTestRun();
  const [discovered, setDiscovered] = useState<DiscoveredTest[]>([]);
  const runFinished = testRun.status === 'done' || testRun.status === 'failed' ? testRun.version : 0;
  useEffect(() => { if (tab === 'Features' && fileSource().kind === 'server') discoverTests().then((r) => setDiscovered(r.tests), () => {}); }, [index?.revision, runFinished, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // Per file, recomputed only when tests, results or the index change (editors re-apply marks on a new array).
  const marksByFile = useMemo(() => {
    const map = new Map<string, RunMark[]>();
    for (const t of discovered) map.set(t.file, [...(map.get(t.file) ?? []), { line: t.line, outcome: outcomeOf(t, testRun), label: t.name }]);
    for (const [file, marks] of map) {
      const f = index?.features.find((x) => x.file === file);
      if (f) marks.push({ line: f.line, outcome: combine(discovered.filter((t) => t.file === file).map((t) => outcomeOf(t, testRun))), label: `Feature: ${f.name}` });
    }
    return map;
  }, [discovered, testRun, index]);
  const marksFor = (file: string) => marksByFile.get(file) ?? NO_MARKS;
  /** Click on a glyph: run (or debug) the test on that line; on a Feature line, every scenario of the file. */
  const runLine = (file: string, line: number, debug: boolean) => {
    const at = discovered.filter((t) => t.file === file && t.line === line);
    const all = discovered.filter((t) => t.file === file);
    const which = at.length ? at : all;
    if (!which.length) return;
    if (debug) { if (at.length === 1) debugTest(at[0]); else if (file.endsWith('.feature')) debugFeature(); else debugTest(which[0]); return; }
    runTests(which).catch((e) => setNotice((e as Error).message));
  };
  const debugTest = (t: DiscoveredTest) => {
    setDebugOpen(true);
    setTab('Features');
    if (view !== 'code' && view !== 'editor') setView('editor');
    startDebugging({ project: t.projectFile, filter: t.filter }).catch((e) => setNotice((e as Error).message));
  };
  const runBuild = (action: 'build' | 'rebuild' | 'clean') => {
    setTab('Features');
    if (view !== 'code' && view !== 'editor') setView('editor');
    setBuildOpen(true);
    let configuration = 'Debug';
    try { configuration = JSON.parse(localStorage.getItem('tas:buildConfiguration') ?? '"Debug"'); } catch { /* default */ }
    startBuild(action, configuration).catch((e) => setNotice((e as Error).message));
  };
  const debugFeature = (scenario?: string) => {
    if (!feature) { setNotice('Open a saved feature file to debug it.'); return; }
    setDebugOpen(true);
    startDebugging({ file: feature.file, scenario }).catch((e) => setNotice((e as Error).message));
  };
  // Open the file the debugger stopped in (a .feature step or C#), at the stopped line.
  const openAt = (file: string, line: number) => {
    if (file.endsWith('.feature')) {
      setTab('Features'); setView('editor');
      if (feature?.file !== file) void loadFeature(file);
    } else editFile(file, line);
  };
  const stopKey = debug.state.status === 'paused' ? `${debug.state.version}:${debug.state.frames[debug.frameIndex]?.id}` : '';
  useEffect(() => {
    const f = debug.state.status === 'paused' ? debug.state.frames[debug.frameIndex] : undefined;
    if (f?.file) openAt(f.file, f.line);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopKey]);
  // The editors give up the debug windows' height (vscode.scss reads --debug-h).
  useEffect(() => { document.documentElement.style.setProperty('--debug-h', showDebug && tab === 'Features' ? '260px' : '0px'); }, [showDebug, tab]);
  const debugKeys = useRef<(e: KeyboardEvent) => void>(() => {});
  debugKeys.current = (e) => {
    const s = getSnapshot().state.status;
    const act = (a: Parameters<typeof debugControl>[0]) => { e.preventDefault(); debugControl(a).catch((x) => setNotice((x as Error).message)); };
    if (e.key === 'F5' && e.shiftKey && e.ctrlKey) { e.preventDefault(); menuRef.current('debug', 'restart'); return; }
    if (e.key === 'F9' && e.shiftKey && e.ctrlKey) { e.preventDefault(); clearBreakpoints(); return; }
    if (e.key === 'F5' && e.shiftKey && !e.ctrlKey) { if (isLive(s)) act('stop'); else e.preventDefault(); }
    else if (e.key === 'F5' && !e.ctrlKey) { if (s === 'paused') act('continue'); else if (!isLive(s) && feature && tab === 'Features') { e.preventDefault(); debugFeature(); } }
    // Ctrl+F10 is Run To Cursor (handled by the editor).
    else if (e.key === 'F10' && !e.ctrlKey && !e.metaKey && s === 'paused') act('next');
    else if (e.key === 'F11' && e.shiftKey && s === 'paused') act('stepOut');
    else if (e.key === 'F11' && s === 'paused') act('stepIn');
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => debugKeys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  const [generatorSeed, setGeneratorSeed] = useState<GeneratorSeed>();
  const [edges, setEdges] = useState<Index['callEdges']>([]);
  const revision = index?.revision;
  const modeRef = useRef('basic');
  const [recent, setRecent] = useLocalState<string[]>('recent', []);
  const [recentPages, setRecentPages] = useLocalState<string[]>('recentPages', []);
  const [recentUrls, setRecentUrls] = useLocalState<string[]>('recentUrls', []);
  const [online, setOnline] = useState(true);
  const { prefs, setPrefs } = usePrefs();
  const basic = prefs.mode !== 'advanced';
  modeRef.current = prefs.mode;
  // Basic mode: Dashboard, Test Generator and the Playwright Recorder. Advanced: every page.
  const navTabs = basic ? tabs.filter((t) => t.name === 'Dashboard' || t.name === 'Test Generator') : tabs;
  const onRecorder = tab === 'Features' && view === 'recorder';
  const hiddenInBasic = basic && !['Dashboard', 'Test Generator'].includes(tab) && !onRecorder;
  // VS Code-style shell (activity bar, slim title bar, full-height editor) unless the classic tab layout is chosen.
  const vscode = prefs.layout !== 'classic';
  const featureViewSwitch = (
    <ToggleGroup.Root type="single" className="segmented" aria-label="Feature view" value={view === 'code' ? 'editor' : view} onValueChange={(v) => { if (v) withTransition(() => setView(v)); }}>
      {[
        { id: 'editor', icon: Code2, label: 'Editor' },
        { id: 'builder', icon: Blocks, label: 'Builder' },
        { id: 'recorder', icon: Circle, label: 'Recorder' },
      ].map((v) => (
        <ToggleGroup.Item key={v.id} value={v.id} className="segmented-item" aria-label={v.label}>
          <v.icon size={14} aria-hidden="true" />
          {v.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
  const setMode = (mode: 'basic' | 'advanced') => {
    setPrefs({ mode });
    setNotice(mode === 'advanced' ? 'Advanced mode: every page is in the navigation.' : 'Basic mode: Dashboard, Test Generator and Playwright Recorder. Other pages stay reachable from Ctrl/Cmd+K.');
  };
  const confirm = useConfirm();
  const [sidebarWidth, setSidebarWidth] = useLocalState('sidebarWidth', SIDEBAR_DEFAULT);
  const [toastKey, setToastKey] = useState(0);
  useEffect(() => { if (notice) setToastKey((k) => k + 1); }, [notice]);
  useEffect(() => { if (index) markDone('scan'); }, [index]);
  useEffect(() => { if (tab === 'Test Generator') markDone('generator'); if (tab === 'Dictionary Inspector') markDone('dictionary'); }, [tab]);
  // Deep links: #/<tab>[/<view>] is shareable and drives back/forward.
  const initialHash = useRef(location.hash);
  const hashSynced = useRef(false);
  const slug = (t: string) => t.toLowerCase().replace(/\s+/g, '-');
  useEffect(() => {
    const fromHash = (hash = location.hash) => {
      const [, t, v] = hash.split('/');
      const all = [...tabs, ...moreTabs].map((x) => x.name);
      const match = all.find((x) => slug(x) === t);
      if (match) { setTab(match); if (v && ['editor', 'builder', 'recorder', 'code'].includes(v)) setView(v); }
    };
    // Use the hash captured at first render: StrictMode re-runs effects after the sync effect below has rewritten it.
    fromHash(initialHash.current);
    const onPop = () => fromHash();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const next = `#/${slug(tab)}${tab === 'Features' ? '/' + view : ''}`;
    if (location.hash === next) return;
    // The first sync replaces (no extra history entry); later page changes push so Back works.
    if (!hashSynced.current) { hashSynced.current = true; if (!initialHash.current) history.replaceState(null, '', next); return; }
    history.pushState(null, '', next);
  }, [tab, view]);
  // Glass header once content scrolls under it.
  useEffect(() => {
    const h = () => { const y = Math.max(window.scrollY, document.querySelector('.main-content')?.scrollTop ?? 0); document.documentElement.dataset.scrolled = String(y > 8); };
    document.addEventListener('scroll', h, true);
    return () => document.removeEventListener('scroll', h, true);
  }, []);
  const [undo, setUndo] = useState<{ run: () => void }>();
  const [showTop, setShowTop] = useState(false);
  const now = useNow(30000);
  // Feature editor buffer: auto save + hot exit (see editor/autosave.ts). Unsaved = differs from what is on disk.
  const [featureBase, setFeatureBase] = useState<{ file: string; source: string; hash: string }>();
  const [featureRestore, setFeatureRestore] = useState<string | null>(null);
  // Feature ↔ C#: step files this feature binds to (for the editor menu and the explorer's file nesting).
  const [featureLinks, setFeatureLinks] = useState<{ stepFiles: { file: string; steps: number }[]; convention: string; conventionExists: boolean; codeBehind: string | null; stepFolders: string[] }>();
  useEffect(() => { setFeatureLinks(undefined); if (feature?.file) api(`/feature/links?file=${encodeURIComponent(feature.file)}`).then(setFeatureLinks).catch(() => {}); }, [feature?.file, revision]);
  useEffect(() => { let live = true; setFeatureBase(undefined); if (feature) sha256(feature.source).then((hash) => live && setFeatureBase({ file: feature.file, source: feature.source, hash })); return () => { live = false; }; }, [feature]);
  const featureAuto = useAutoSave({ file: feature?.file, value: source, loaded: featureBase });
  // Ctrl+S / the save icon write the feature straight to disk; a new (unsaved) feature goes through the diff.
  // Saving is quiet (the tab's ● and the status show it); only failures are announced.
  const saveFeature = () => { if (feature) void featureAuto.save().then((ok) => { if (!ok) setNotice('Not saved: see the editor status.'); }); else previewChange(); };
  // The active tab drives the editor area: a feature tab loads into the feature editor, a code tab shows its editor.
  useEffect(() => {
    const t = activeEditor;
    if (!t) return;
    if (t.kind === 'code') { if (tab === 'Features' && view === 'editor') setView('code'); return; }
    if (tab === 'Features' && view === 'code') setView('editor');
    if (feature?.file === t.file || (!feature && newFile === t.file)) return;
    if (index?.features.some((f) => f.file === t.file)) loadFeature(t.file).catch((e) => setNotice((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openEditors.active, index?.revision]);
  // A new, not yet saved feature draft gets its own tab.
  useEffect(() => { if (!feature && newFile && source && tab === 'Features') openTab(newFile, 'feature'); }, [feature, newFile, !!source, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = feature ? featureAuto.dirty : !!source && source !== '';
  const pageDescription =
    tab === 'Features'
      ? view === 'recorder'
        ? 'Turn browser interactions into reusable, repository-aware tests.'
        : 'Assemble tests from the capabilities your project already contains.'
      : (headings[tab] ?? 'Discover existing automation, with evidence from your repository.');
  const pageTitle = tab === 'Features' ? (view === 'recorder' ? 'Playwright recorder' : view === 'builder' ? 'Scenario builder' : (feature?.name ?? 'Feature editor')) : tab;
  useEffect(() => {
    document.title = `${dirty ? '● ' : ''}${pageTitle} · TestAuthoring Studio`;
  }, [pageTitle, dirty]);
  useEffect(() => {
    const name = tab === 'Features' ? ({ recorder: 'Playwright Recorder', builder: 'Scenario Builder', editor: 'Feature Editor' } as Record<string, string>)[view] ?? tab : tab;
    setRecentPages((r) => [name, ...r.filter((x) => x !== name)].slice(0, 5));
  }, [tab, view, setRecentPages]);
  // Warn before leaving with unsaved editor changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
  // Local API heartbeat: surfaces a stopped dev server instead of opaque fetch errors.
  useEffect(() => {
    const ping = () => document.visibilityState === 'hidden' ? undefined : fetch('/api/health').then((r) => setOnline(r.ok)).catch(() => setOnline(false));
    const t = setInterval(ping, 15000);
    window.addEventListener('focus', ping);
    return () => { clearInterval(t); window.removeEventListener('focus', ping); };
  }, []);
  useEffect(() => {
    const h = (e: Event) => setShowTop(((e.target as HTMLElement).scrollTop ?? 0) > 500 || window.scrollY > 500);
    document.addEventListener('scroll', h, true);
    return () => document.removeEventListener('scroll', h, true);
  }, []);
  const previousView = useRef({ tab, view, mobileExplorer });
  const navigateTour = useCallback((destination: TourDestination) => {
    if (destination.tab) setTab(destination.tab);
    if (destination.view) setView(destination.view);
    setMobileExplorer(!!destination.explorer);
  }, []);
  const finishTour = useCallback(() => {
    setGuideOpen(false);
    setTab(previousView.current.tab);
    setView(previousView.current.view);
    setMobileExplorer(previousView.current.mobileExplorer);
    requestAnimationFrame(() => document.getElementById('guide-me')?.focus());
  }, []);
  const beginFeature = (folder = activeFolder ?? featureDirectory(feature?.file)) => {
    setNewFile(`${folder ? `${folder}/` : ''}NewFeature.feature`);
    setModal('new');
  };
  const work = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    work(async () => {
      const data = await api('/workspace');
      // A browser folder from the last session comes back without a prompt when the browser still allows it.
      const browserFolder = fsaSupported() ? await restoreFolder(false).catch(() => undefined) : undefined;
      if (browserFolder) await enterBrowserFolder(browserFolder, false);
      else { setFileSource({ kind: 'server', root: data.config.repositoryRoot }); reloadTabs(); }
      // The single code file of earlier versions becomes a tab.
      if (codeFile) { openTab(codeFile.file, 'code'); setCodeFile(null); }
      setIndex(data.index);
      setConfig(data.config);
      // Open editors come back as they were; a first visit opens the first feature.
      if (!getTabs().tabs.length && !browserFolder && data.index.features[0]) await loadFeature(data.index.features[0].file);
      setMatches(await api('/recording/match', { actions: demo }));
    });
  }, []);
  useEffect(() => {
    if (!['recording', 'paused'].includes(recordStatus)) return;
    const timer = setInterval(() => {
      api('/recording')
        .then((r) => {
          setActions(r.actions);
          setRecordStatus(r.status);
        })
        .catch(() => {});
    }, 1000);
    return () => clearInterval(timer);
  }, [recordStatus]);
  useEffect(() => {
    if (execution.status !== 'running') return;
    const timer = setInterval(
      () =>
        api('/execution')
          .then(setExecution)
          .catch(() => {}),
      1500,
    );
    return () => clearInterval(timer);
  }, [execution.status]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if (e.altKey && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        const n = Number(e.key);
        if (modeRef.current !== 'advanced') {
          if (n === 1) setTab('Dashboard');
          if (n === 2) setTab('Test Generator');
          if (n === 3) { setTab('Features'); setView('recorder'); }
        } else setTab(tabs[n - 1].name);
      }
      if (e.altKey && e.key === '5' && modeRef.current === 'advanced') { e.preventDefault(); setTab('Test Design'); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setPrefs({ mode: modeRef.current === 'advanced' ? 'basic' : 'advanced' });
      }
      // Ctrl+; searches Solution Explorer (Visual Studio); "/" too.
      if ((e.ctrlKey || e.metaKey) && e.key === ';') {
        e.preventDefault();
        setMobileExplorer(true);
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[aria-label="Search Explorer"]')?.focus());
      }
      if (!typing && !e.ctrlKey && !e.metaKey && e.key === '/') {
        e.preventDefault();
        setMobileExplorer(true);
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[aria-label="Search Explorer"]')?.focus());
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        setPrefs({ focus: !document.documentElement.dataset.focus || document.documentElement.dataset.focus === 'false' });
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !typing) {
        e.preventDefault();
        setPrefs({ sidebar: document.documentElement.dataset.sidebar === 'false' });
      }
      if (!typing && e.key === '?') {
        e.preventDefault();
        setModal('shortcuts');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  // Desktop app (window.desktop): native menu commands, taskbar progress and run-finished notifications.
  const menuRef = useRef<(c: DesktopMenuCommand, arg?: unknown) => void>(() => {});
  menuRef.current = (c, arg) => {
    // Preference changes from the native View menu (and first-run OS defaults). Only known keys pass.
    if (c === 'set-pref' && arg && typeof arg === 'object') {
      const allowed = ['theme', 'accent', 'density', 'textSize', 'motion', 'contrast', 'mode', 'layout', 'algorithmPreset'] as const;
      const patch = Object.fromEntries(Object.entries(arg as Record<string, unknown>).filter(([k, v]) => (allowed as readonly string[]).includes(k) && typeof v === 'string'));
      // Switching to Custom starts from what the current preset enables.
      if (patch.algorithmPreset === 'custom' && prefs.algorithmPreset !== 'custom') Object.assign(patch, { algorithms: snapshot({ preset: prefs.algorithmPreset, overrides: prefs.algorithms }) });
      if (Object.keys(patch).length) setPrefs(patch as Partial<typeof prefs>);
      return;
    }
    if (c === 'debug' && typeof arg === 'string') {
      const st = getSnapshot().state.status;
      if (arg === 'start') { if (st === 'paused') void debugControl('continue').catch((e) => setNotice((e as Error).message)); else if (!isLive(st)) debugFeature(); }
      else if (arg === 'restart') { const t = getSnapshot().state.target; void (async () => { if (isLive(st)) await debugControl('stop').catch(() => {}); if (t) await startDebugging({ project: t.project, filter: t.filter }).catch((e) => setNotice((e as Error).message)); else debugFeature(); })(); }
      else if (arg === 'toggleBreakpoint') { const ed = document.querySelector<HTMLElement>('.cm-editor.cm-focused .cm-content') ?? document.querySelector<HTMLElement>('.code-editor .cm-content, .gherkin-editor .cm-content'); ed?.focus(); ed?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F9', bubbles: true, cancelable: true })); }
      else if (arg === 'deleteAllBreakpoints') clearBreakpoints();
      else if (arg === 'windows') { setTab('Features'); if (view !== 'code') setView('editor'); setDebugOpen(true); }
      else if (['stop', 'pause', 'continue', 'next', 'stepIn', 'stepOut'].includes(arg)) void debugControl(arg as Parameters<typeof debugControl>[0]).catch((e) => setNotice((e as Error).message));
      return;
    }
    if (c === 'open-folder') { void openFolder(); return; }
    if (c === 'open-solution') { setModal('solution'); return; }
    if (c === 'build' || c === 'rebuild' || c === 'clean') { runBuild(c); return; }
    if (c === 'cancel-build') { void cancelBuild(); return; }
    if (c === 'test-explorer') { showTests(); return; }
    if (c === 'find-in-files') { showSearch(false); return; }
    if (c === 'replace-in-files') { showSearch(true); return; }
    if (c === 'go-to-all') { setModal('goto'); return; }
    if (c === 'git-changes') { showGit(); return; }
    if (c === 'nuget') { openNuget(); return; }
    if (c === 'run-all-tests') { showTests(); runTests('all').catch((e) => setNotice((e as Error).message)); return; }
    if (c === 'build-windows') { setTab('Features'); if (view !== 'code' && view !== 'editor') setView('editor'); setBuildOpen(true); return; }
    if (c === 'save') { if (featureTabActive) saveFeature(); else saveAll(); return; }
    if (c === 'save-all') { saveAll(); return; }
    if (c === 'close-editor') { const a = getTabs().active; if (a) void closeEditor(a); return; }
    if (c === 'close-all-editors') { closeAllTabs(); return; }
    if (c === 'diagnostics') { setModal('diagnostics'); return; }
    if (c === 'run-tests') { setModal('run'); return; }
    if (c === 'continue-draft') { setTab('Test Generator'); return; }
    if (c === 'design-tool' && typeof arg === 'string') { try { localStorage.setItem('tas:design:tool', JSON.stringify(arg)); } catch { /* storage blocked */ } setDesignKey((k) => k + 1); setTab('Test Design'); return; }
    if (c === 'palette') setPaletteOpen(true);
    else if (c === 'preferences') setModal('preferences');
    else if (c === 'shortcuts') setModal('shortcuts');
    else if (c === 'workspace-settings') setModal('settings');
    else if (c === 'new-feature') beginFeature();
    else if (c === 'record') { setTab('Features'); setView('recorder'); setModal('record'); }
    else if (c === 'tour') setGuideOpen(true);
    else if (c === 'toggle-mode') setPrefs({ mode: prefs.mode === 'advanced' ? 'basic' : 'advanced' });
    else if (c === 'toggle-explorer') setPrefs({ sidebar: !prefs.sidebar });
    else if (c === 'focus-mode') setPrefs({ focus: !prefs.focus });
    else if (c === 'repository-changed' && !busy) api<Index>('/scan', {}).then((i) => {
      const a = index?.stats, b = i.stats;
      setIndex(i);
      setNotice('Files changed on disk. Repository index refreshed.');
      if (a && b && (a.features !== b.features || a.scenarios !== b.scenarios || a.steps !== b.steps)) desktop?.notify('Repository changed', `Now ${b.features} features · ${b.scenarios} scenarios · ${b.steps} step bindings.`);
    }).catch(() => {});
  };
  useEffect(() => desktop?.onMenu((c, arg) => menuRef.current(c, arg)), []);
  useEffect(() => { const h = (e: Event) => setNotice(String((e as CustomEvent).detail)); window.addEventListener('tas:desktop-notice', h); return () => window.removeEventListener('tas:desktop-notice', h); }, []);
  useEffect(() => { desktop?.setProgress(busy || execution.status === 'running' ? 2 : -1); }, [busy, execution.status]);
  const lastRun = useRef(execution.status);
  useEffect(() => {
    if (lastRun.current === 'running' && execution.status !== 'running') desktop?.notify(`Test run ${execution.status}`, runFilter ? `Filter: ${runFilter}` : 'dotnet test finished.');
    lastRun.current = execution.status;
  }, [execution.status, runFilter]);
  const current = matches.find((m) => m.action.id === selected);
  const selectedAction = actions.find((a) => a.id === selected);
  const acceptedCount = Object.keys(accepted).length;
  const openSource = (file: string, line: number) =>
    work(async () => {
      setRecent((r) => [file, ...r.filter((f) => f !== file)].slice(0, 8));
      const r = await api(`/source?file=${encodeURIComponent(file)}`);
      setSourcePeek(r.source);
      setSourceTitle(`${file}:${line}`);
      setModal('source');
    });
  const loadFeature = async (file: string) => {
    const full = await api<Feature>(`/feature?file=${encodeURIComponent(file)}`);
    choose(full);
  };
  const select = async (f: Feature) => {
    if (dirty && f.file !== feature?.file && !(await confirm({ title: 'Discard unsaved changes?', description: `Your edits to ${feature?.file ?? newFile} have not been saved. Opening ${f.file} will discard them.`, confirm: 'Discard and open', danger: true }))) return;
    work(() => loadFeature(f.file));
  };
  const navigate = (name: string) => withTransition(() => navigateNow(name));
  const navigateNow = (name: string) => {
    const views: Record<string, string> = { 'Playwright Recorder': 'recorder', Recorder: 'recorder', 'Scenario Builder': 'builder', 'Feature Editor': 'editor' };
    if (views[name]) {
      setTab('Features');
      setView(views[name]);
    } else setTab(name);
  };
  const choose = (f: Feature) => {
    setFeature(f);
    openTab(f.file, 'feature');
    const draft = readDraft(f.file);
    const changed = draft !== null && draft !== f.source;
    // Edited earlier in this session (then another tab was opened): bring the buffer back without asking.
    if (changed && editedThisSession(f.file)) { setSource(draft); setFeatureRestore(null); } else { setSource(f.source); setFeatureRestore(changed ? draft : null); }
    setValidation(undefined);
    setPreview(undefined);
    setActiveFolder(featureDirectory(f.file));
  };
  const match = () =>
    work(async () => {
      setMatches(await api('/recording/match', { actions }));
      setNotice('Matching complete. Review candidates before accepting.');
    });
  const addBinding = (b: Binding) => {
    setBinding(b);
    setParams(Object.fromEntries(b.parameters.map((p) => [p.name, ''])));
    setModal('parameters');
  };
  const addStep = (input: Record<string, string> = params) => {
    if (!binding) return;
    const params_ = input;
    let n = 0;
    const values = binding.parameters.filter((p) => p.type !== 'Table').map((p) => params_[p.name]);
    let text = binding.pattern
      .replace(/^\^|\$$/g, '')
      // Cucumber optional text "item(s)" → "items" (only for expression-style patterns, before values go in).
      .replace(binding.expression === 'Cucumber' ? /\(([^()|]+)\)/g : /$^/, '$1')
      .replace(/\(\.\*\)|\(\.\+\)|\(\[\^"\]\*\)|\(\\d\+\)|\{[A-Za-z]*\}/g, (m) => (m === '{string}' ? `"${values[n++] ?? ''}"` : (values[n++] ?? '')));
    if (n < values.length) {
      setError('This pattern needs manual editing in the feature editor.');
    }
    const tableParam = binding.parameters.find((p) => p.type === 'Table');
    if (tableParam && params_[tableParam.name])
      text +=
        '\n' +
        params_[tableParam.name]
          .split('\n')
          .map((line) => '      ' + line)
          .join('\n');
    setDraftSteps((s) => [...s, { keyword: binding.keyword, text }]);
    setModal(undefined);
    setNotice('Existing step added to the scenario builder.');
  };
  const draftSource = () =>
    `Feature: ${feature?.name ?? 'New feature'}\n\n  ${outline ? 'Scenario Outline' : 'Scenario'}: ${draftName}\n${draftSteps.map((s) => `    ${s.keyword} ${s.text}`).join('\n')}\n${
      outline
        ? '    Examples:\n' +
          examples
            .split('\n')
            .map((line) => '      ' + line)
            .join('\n') +
          '\n'
        : ''
    }`;
  const previewChange = (text = source, file = feature?.file ?? newFile) =>
    work(async () => {
      const p = await api('/generation/preview', { file, source: text });
      setPreview(p);
      setModal('preview');
    });
  const acceptAllTop = () => {
    const next = { ...accepted };
    let n = 0;
    for (const m of matches) if (m.candidates[0] && !next[m.action.id]) { next[m.action.id] = `${m.candidates[0].binding.keyword} ${m.candidates[0].text}`; n++; }
    setAccepted(next);
    if (n) haptic();
    setNotice(n ? `Accepted the top match for ${n} action${n === 1 ? '' : 's'}. Review before applying.` : 'No unaccepted matches.');
  };
  const applyRecording = () => {
    const steps = actions.flatMap((a) => (accepted[a.id] ? [accepted[a.id]] : []));
    if (!steps.length) {
      setNotice('Accept at least one candidate or proposal first.');
      return;
    }
    const text = `${source.trimEnd()}\n\n  Scenario: Recorded workflow\n${steps.map((s) => `    ${s}`).join('\n')}\n`;
    setSource(text);
    setView('editor');
    setNotice('Accepted steps added to the editor. Preview changes to save.');
  };
  const formatAction = (a: Action) =>
    a.action === 'goto'
      ? `goto("${a.url}")`
      : a.action === 'fill'
        ? `fill(${a.target?.role ?? 'field'}, "${a.value}")`
        : a.action === 'press'
          ? `press("${a.key}")`
          : `click("${a.target?.description ?? a.target?.name ?? 'element'}")`;
  const matched = matches.filter((m) => m.candidates.length).length;
  const menuProps = {
    pages: basic ? [] : moreTabs.map((t) => ({ ...t })),
    primary: navTabs.map((t, i) => ({ name: t.name, icon: t.icon, hint: `Alt+${i + 1}` })),
    active: tab,
    onNavigate: navigate,
    commands: [
        { label: basic ? 'Switch to Advanced mode' : 'Switch to Basic mode', icon: SlidersHorizontal, run: () => setMode(basic ? 'advanced' : 'basic'), shortcut: 'Ctrl Shift A' },
        { label: 'Command palette', icon: CommandIcon, run: () => setPaletteOpen(true), shortcut: 'Ctrl K' },
        { label: 'Start a recording', icon: Circle, run: () => { setTab('Features'); setView('recorder'); setModal('record'); } },
        { label: 'New feature', icon: Plus, run: () => beginFeature() },
        { label: 'Rescan repository', icon: RefreshCw, disabled: busy, run: () => work(async () => { setIndex(await api('/scan', {})); setNotice('Repository index refreshed.'); }) },
        { label: 'Workspace settings', icon: Settings2, run: () => setModal('settings') },
        { label: 'Keyboard shortcuts', icon: Keyboard, run: () => setModal('shortcuts'), shortcut: '?' },
        { label: 'Preferences', icon: SlidersHorizontal, run: () => setModal('preferences') },
        { label: 'Copy link to this page', icon: Link2, run: () => copyText(location.href).then((ok) => setNotice(ok ? 'Link copied.' : 'Clipboard unavailable.')) },
        { label: prefs.focus ? 'Exit focus mode' : 'Focus mode', icon: Maximize2, run: () => setPrefs({ focus: !prefs.focus }), shortcut: 'Ctrl .' },
        { label: prefs.sidebar ? 'Hide explorer' : 'Show explorer', icon: PanelLeft, run: () => setPrefs({ sidebar: !prefs.sidebar }), shortcut: 'Ctrl B' },
      ],
  };
  return (
    <AppMenu {...menuProps}>
    <div className="studio-shell">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to main content</a>
      {/* Text inputs and editors keep the browser's native menu (copy/paste/spellcheck). */}
      <div
        style={{ display: 'contents' }}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement).closest('input, textarea, select, .cm-editor, [contenteditable="true"], pre, code')) e.stopPropagation();
        }}
      >
      <CreateStepDialog onOpen={(file, line) => editFile(file, line)} onIndex={setIndex} onNotice={setNotice} />
      <SearchPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={navigate}
        onAdd={(b) => addBinding(b)}
        revision={revision}
        recentPages={recentPages}
        commands={[
          { label: 'Rescan repository', run: () => work(async () => { setIndex(await api('/scan', {})); setNotice('Repository index refreshed.'); }) },
          { label: 'Start a recording', run: () => { setTab('Features'); setView('recorder'); setModal('record'); } },
          { label: 'Create a new feature', run: () => beginFeature() },
          { label: 'Open workspace settings', run: () => setModal('settings') },
          { label: 'Show keyboard shortcuts', run: () => setModal('shortcuts'), shortcut: '?' },
          { label: 'Show index diagnostics', run: () => setModal('diagnostics') },
          { label: 'Start the guided tour', run: () => setGuideOpen(true) },
          { label: 'Preferences', run: () => setModal('preferences') },
          { label: 'Toggle focus mode', run: () => setPrefs({ focus: !prefs.focus }), shortcut: 'Ctrl .' },
          { label: 'Copy link to this page', run: () => copyText(location.href).then((ok) => setNotice(ok ? 'Link copied.' : 'Clipboard unavailable.')) },
          ...designTools.map((d) => ({ label: `Test Design: ${d.label}`, run: () => { try { localStorage.setItem('tas:design:tool', JSON.stringify(d.id)); } catch { /* storage blocked */ } setDesignKey((k) => k + 1); setTab('Test Design'); } })),
        ]}
      />
      {busy && <IndeterminateProgress label="Working" />}
      {!online && (
        <div className="offline-banner" role="alert">
          <TriangleAlert size={15} /> Local API is not responding. Is <code>npm run dev</code> still running?
          <Button size="tiny" onClick={() => fetch('/api/health').then((r) => setOnline(r.ok)).catch(() => setOnline(false))}>Retry</Button>
        </div>
      )}
      {showTop && (
        <button className="back-to-top icon-button" aria-label="Back to top" onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); document.querySelectorAll('.main-content, .app-body').forEach((el) => el.scrollTo({ top: 0, behavior: 'smooth' })); }}>
          <ArrowUp size={16} />
        </button>
      )}
      {guideOpen && <StudioTour onNavigate={navigateTour} onFinish={finishTour} />}
      <header className="app-header">
        <div className="brand">
          <span className="brand-word" aria-label="TestAuthoring Studio">
            <span className="brand-accent">TestAuthoring</span>
            <span className="brand-light"> Studio</span>
          </span>
          <Badge tone="purple">LOCAL</Badge>
        </div>
        {/* VS Code style File menu (the desktop app has the native one). */}
        {!desktop && (
          <Dropdown
            label="File"
            className="menubar"
            trigger={<button className="menubar-item" aria-label="File menu">File</button>}
            entries={[
              { label: 'New Feature', icon: Plus, onSelect: () => beginFeature() },
              'separator' as const,
              { label: 'Open Project/Solution…', icon: Layers, shortcut: 'Ctrl Shift O', onSelect: () => setModal('solution') },
              { label: 'Open Folder…', icon: FolderOpen, onSelect: () => void openFolder() },
              ...(fileSrc.kind !== 'browser' && browserFolderName ? [{ label: `Reopen ${browserFolderName} (from disk)`, icon: Folder, onSelect: () => void reopenBrowserFolder() }] : []),
              { label: 'Index Folder with Studio Server…', icon: Database, onSelect: () => setModal('settings') },
              'separator' as const,
              { label: 'Save', icon: Save, shortcut: 'Ctrl S', disabled: !openEditors.active, onSelect: () => (featureTabActive ? saveFeature() : saveAll()) },
              { label: 'Save All', shortcut: 'Ctrl Alt S', onSelect: saveAll },
              'separator' as const,
              { label: 'Close Editor', shortcut: 'Ctrl F4', disabled: !openEditors.active, onSelect: () => { if (openEditors.active) void closeEditor(openEditors.active); } },
              { label: 'Close All Editors', disabled: !openEditors.tabs.length, onSelect: () => closeAllTabs() },
              'separator' as const,
              { label: 'Git Changes', icon: GitBranchIcon, onSelect: showGit },
              ...(fileSrc.kind === 'browser' ? [{ label: 'Close Folder', onSelect: () => void closeFolder() }] : []),
              'separator' as const,
              { label: 'Preferences…', icon: Settings, shortcut: 'Ctrl ,', onSelect: () => setModal('preferences') },
            ]}
          />
        )}
        {!desktop && (
          <Dropdown
            label="Edit"
            className="menubar"
            trigger={<button className="menubar-item" aria-label="Edit menu">Edit</button>}
            entries={[
              { label: 'Go to All…', icon: Search, shortcut: 'Ctrl T', onSelect: () => setModal('goto') },
              'separator' as const,
              { label: 'Find in Files', icon: Search, shortcut: 'Ctrl Shift F', onSelect: () => showSearch(false) },
              { label: 'Replace in Files', shortcut: 'Ctrl Shift H', onSelect: () => showSearch(true) },
            ]}
          />
        )}
        {!desktop && (
          <Dropdown
            label="Build"
            className="menubar"
            trigger={<button className="menubar-item" aria-label="Build menu">Build</button>}
            entries={[
              { label: 'Build Solution', icon: Hammer, shortcut: 'Ctrl Shift B', disabled: build.status === 'running', onSelect: () => runBuild('build') },
              { label: 'Rebuild Solution', disabled: build.status === 'running', onSelect: () => runBuild('rebuild') },
              { label: 'Clean Solution', disabled: build.status === 'running', onSelect: () => runBuild('clean') },
              'separator' as const,
              { label: 'Manage NuGet Packages…', onSelect: () => openNuget() },
              'separator' as const,
              { label: 'Cancel', shortcut: 'Ctrl Break', disabled: build.status !== 'running', onSelect: () => void cancelBuild() },
              'separator' as const,
              { label: showBuild ? 'Hide Error List and Output' : 'Error List and Output', onSelect: () => setBuildOpen(!buildOpen) },
            ]}
          />
        )}
        {!desktop && (
          <Dropdown
            label="Test"
            className="menubar"
            trigger={<button className="menubar-item" aria-label="Test menu">Test</button>}
            entries={[
              { label: 'Run All Tests', icon: Play, disabled: getTestRun().status === 'running', onSelect: () => { showTests(); runTests('all').catch((e) => setNotice((e as Error).message)); } },
              { label: 'Test Explorer', icon: TestTubeDiagonal, onSelect: showTests },
            ]}
          />
        )}
        <nav className="workspace-breadcrumb page-heading" aria-label="Breadcrumb">
          <span className="header-divider" aria-hidden="true" />
          <ol>
            <li>
              <button className="crumb" onClick={() => setModal('settings')} title="Workspace settings">
                <Folder size={14} aria-hidden="true" />
                {fileSrc.kind === 'browser' ? fileSrc.name : (index?.workspace ?? 'Loading workspace')}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </li>
            {tab !== pageTitle && <li className="crumb-section"><ChevronRight size={12} aria-hidden="true" />{tab}</li>}
            <li aria-current="page">
              <ChevronRight size={12} aria-hidden="true" />
              <h1 title={pageTitle}>
                <span className="page-title-text">{pageTitle}</span>
                {tab === 'Features' && view === 'editor' && dirty && <span className="dirty-dot" role="img" aria-label="Unsaved changes" title="Unsaved changes (Ctrl/Cmd+S to preview)" />}
              </h1>
            </li>
          </ol>
        </nav>
        {vscode && (
          <button className="command-center" onClick={() => setPaletteOpen(true)} aria-label="Search pages, commands and steps (Ctrl+K)">
            <Search size={13} aria-hidden="true" />
            <span>{index?.workspace ?? 'Search'}</span>
            <kbd>Ctrl K</kbd>
          </button>
        )}
        {vscode && tab === 'Features' && featureViewSwitch}
        {vscode && !basic && <AppMenuButton {...menuProps} />}
        <Button
          id="guide-me" className="guide-button"
          disabled={!index || busy}
          onClick={() => {
            previousView.current = { tab, view, mobileExplorer };
            setModal(undefined);
            setGuideOpen(true);
          }}
        >
          <Compass size={16} className="animated-icon" />
          Guide me
        </Button>
        <IconButton
          className="explorer-toggle"
          label="Toggle feature explorer"
          aria-expanded={mobileExplorer}
          aria-controls="feature-sidebar"
          onClick={() => setMobileExplorer((open) => !open)}
        >
          <Folder size={19} />
        </IconButton>
        {!vscode && (
          <IconButton
            label="Preferences"
            onClick={() => setModal('preferences')}
          >
            <SlidersHorizontal size={18} />
          </IconButton>
        )}
        {!vscode && (
          <IconButton
            data-tour="workspace"
            label="Workspace settings"
            onClick={() => setModal('settings')}
          >
            <Settings2 size={19} />
          </IconButton>
        )}
      </header>
      {!vscode && <nav className="main-nav">
        <NavigationMenu.Root className="nav-root" aria-label="Main">
        <NavigationMenu.List className="nav-tabs">
          {navTabs.map((t, i) => (
            <NavigationMenu.Item key={t.name}>
            <NavigationMenu.Link asChild active={tab === t.name}>
            <button
              key={t.name}
              className={`nav-tab ${tab === t.name ? 'active' : ''}`}
              title={`${t.name} (Alt+${i + 1})`}
              onClick={() => withTransition(() => {
                setTab(t.name);
                setCatalogQuery('');
              })}
            >
              <Icon icon={t.icon} />
              {t.name}
              {t.name === 'Dictionary Inspector' && !!index?.stats?.dictionaries && (
                <span className="nav-count">{index.stats.dictionaries}</span>
              )}
            </button>
            </NavigationMenu.Link>
            </NavigationMenu.Item>
          ))}
          {!basic && moreTabs.filter((t) => t.name === tab).map((t) => (
            <NavigationMenu.Item key={t.name}>
              <button className="nav-tab active" aria-current="page">
                <Icon icon={t.icon} />
                {t.name}
              </button>
            </NavigationMenu.Item>
          ))}
          {!basic && <NavigationMenu.Item><AppMenuButton {...menuProps} /></NavigationMenu.Item>}
        </NavigationMenu.List>
        </NavigationMenu.Root>
        <button
          className={`recorder-tab ${view === 'recorder' && tab === 'Features' ? 'selected' : ''}`}
          onClick={() => {
            setTab('Features');
            setView('recorder');
          }}
        >
          <span className="record-dot" />
          Playwright Recorder<Badge>β</Badge>
        </button>
        <div className="nav-trailing">
          {tab === 'Features' ? featureViewSwitch : <span className="local-state"><span aria-hidden="true" />Local workspace</span>}
        </div>
      </nav>}
      <div className="app-body">
        {vscode && (
          <ActivityBar
            active={tab === 'Features' && view === 'recorder' ? 'Recorder' : tab === 'Features' && sidebarView === 'tests' ? 'Testing' : tab === 'Features' && sidebarView === 'search' ? 'Search' : tab === 'Features' && sidebarView === 'git' ? 'Git' : tab}
            basic={basic}
            sidebarOpen={prefs.sidebar}
            onSelect={(id) => withTransition(() => { if (id === 'Testing') { showTests(); return; } if (id === 'Search') { showSearch(); return; } if (id === 'Git') { showGit(); return; } if (id === 'Features') setSidebarView('explorer'); if (id === 'Recorder') { setTab('Features'); setView('recorder'); } else { setTab(id); if (id === 'Features' && view === 'recorder') setView('editor'); if (id === 'Features') setPrefs({ sidebar: true }); } setCatalogQuery(''); })}
            onToggleSidebar={() => setPrefs({ sidebar: !prefs.sidebar })}
            onPreferences={() => setModal('preferences')}
            onWorkspace={() => setModal('settings')}
            onMore={() => setMode('advanced')}
          />
        )}
        {mobileExplorer && (
          <button
            className="explorer-backdrop"
            aria-label="Close feature explorer"
            onClick={() => setMobileExplorer(false)}
          />
        )}
        <aside id="feature-sidebar" className={`sidebar ${mobileExplorer ? 'mobile-open' : ''}`} style={{ width: sidebarWidth }}>
          {tab === 'Features' && sidebarView === 'git' ? (
            <GitView onOpen={(file) => editFile(file)} onNotice={setNotice} onChanged={() => { api('/scan', {}).then(setIndex, () => {}); }} />
          ) : tab === 'Features' && sidebarView === 'search' ? (
            <SearchView key={searchKey.n} initialReplace={searchKey.replace} onOpen={(file, line, column) => editFile(file, line, column)} onNotice={setNotice} onChanged={() => { api('/scan', {}).then(setIndex, () => {}); }} />
          ) : tab === 'Features' && sidebarView === 'tests' ? (
            <TestExplorer revision={revision} onOpen={(file, line) => editFile(file, line)} onDebug={debugTest} onNotice={setNotice} />
          ) : <SolutionExplorer
            key={index?.workspace + ':' + config?.repositoryRoot}
            features={fileSrc.kind === 'browser' ? [] : (index?.features ?? [])}
            browserSolution={fileSrc.kind === 'browser' ? browserSol : undefined}
            onFileOp={fileOp}
            onManagePackages={openNuget}
            revision={revision}
            activeFile={openEditors.active ?? feature?.file}
            onOpenFile={(file, line) => { editFile(file, line); setMobileExplorer(false); }}
            query={query}
            activeFolder={activeFolder ?? featureDirectory(feature?.file)}
            onQuery={setQuery}
            onFolder={setActiveFolder}
            onNew={beginFeature}
            onSource={openSource}
            onSelect={(f) => {
              select(f);
              setTab('Features');
              setMobileExplorer(false);
            }}
          />}
          <div className="sidebar-bottom">
            <div className="index-status">
              <div className="index-icon">
                <ShieldCheck size={18} />
              </div>
              <div>
                <strong>Repository indexed</strong>
                <span>
                  {index?.stats?.steps ?? 0} steps · {index?.stats?.selectors ?? 0} selectors ·{' '}
                  {index?.stats?.dictionaries ?? 0} fields
                </span>
                {index?.scannedAt && <span className="scanned-at" title={new Date(index.scannedAt).toLocaleString()}>Scanned {timeAgo(index.scannedAt, now)}</span>}
              </div>
              <IconButton
                className={busy ? 'spin' : ''}
                label="Rescan repository"
                onClick={() =>
                  work(async () => {
                    setIndex(await api('/scan', {}));
                    setNotice('Repository index refreshed.');
                  })
                }
              >
                <RefreshCw size={15} />
              </IconButton>
            </div>
            <div className="repo-path">
              <Folder size={13} />
              <span title={config?.repositoryRoot}>{config?.repositoryRoot ?? 'Connecting…'}</span>
            </div>
          </div>
        </aside>
        {prefs.sidebar && !prefs.focus && (
          <SidebarResizer width={sidebarWidth} onWidth={setSidebarWidth} onCollapse={() => { setPrefs({ sidebar: false }); setSidebarWidth(SIDEBAR_DEFAULT); setNotice('Explorer hidden. Press Ctrl/Cmd+B to show it again.'); }} label="Resize feature explorer" />
        )}
        <main className="main-content" id="main" tabIndex={-1} aria-describedby="page-description">
          <p id="page-description" className="sr-only">{pageDescription}</p>
          {hiddenInBasic && (
            <div className="mode-banner" role="status">
              <span><strong>{pageTitle}</strong> is an Advanced page. It is hidden from the navigation in Basic mode.</span>
              <Button size="tiny" variant="soft" onClick={() => setMode('advanced')}>Switch to Advanced</Button>
              <Button size="tiny" variant="ghost" onClick={() => setTab('Dashboard')}>Back to Dashboard</Button>
            </div>
          )}
          {['Dashboard', 'Test Generator'].includes(tab) && (
            <ContextBar index={index} config={config} recordStatus={recordStatus} revision={revision} />
          )}
          {error && (
            <div role="alert" className="error-banner">
              <TriangleAlert size={17} />
              <span>{error}</span>
              <button onClick={() => copyText(error).then((ok) => ok && setNotice('Error copied.'))} aria-label="Copy error" title="Copy error">
                <Copy size={15} />
              </button>
              <button onClick={() => setError('')} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {tab === 'Features' && view === 'recorder' && (
            <>
              <div className="recording-toolbar">
                <div className="recording-state">
                  <span className={`record-dot ${recordStatus === 'recording' ? 'pulsing' : ''}`} />
                  <strong>
                    {recordStatus === 'demo'
                      ? 'Example recording'
                      : recordStatus === 'recording'
                        ? 'Live recording'
                        : recordStatus === 'paused'
                          ? 'Recording paused'
                          : 'Recording stopped'}
                  </strong>
                  <span className="toolbar-separator" />
                  <span className="subtle">{actions.length} actions captured</span>
                  {lastTrace && (
                    <a className="button tiny ghost" href={`/api/traces/${encodeURIComponent(lastTrace)}`} download>
                      Download trace
                    </a>
                  )}
                </div>
                <div className="toolbar-buttons">
                  {['recording', 'paused'].includes(recordStatus) ? (
                    <>
                      <Button
                        size="small"
                        onClick={() =>
                          work(async () => {
                            const r = await api('/recording/pause', {
                              resume: recordStatus === 'paused',
                            });
                            setRecordStatus(r.status);
                          })
                        }
                      >
                        <Icon icon={recordStatus === 'paused' ? Play : Pause} />
                        {recordStatus === 'paused' ? 'Resume' : 'Pause'}
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          work(async () => {
                            const r = await api<{ trace: string | null }>('/recording/stop', {});
                            setRecordStatus('stopped');
                            setLastTrace(r.trace);
                            if (r.trace) setNotice(`Trace saved: ${r.trace}`);
                          })
                        }
                      >
                        <Square size={13} />
                        Stop
                      </Button>
                    </>
                  ) : (
                    <Button size="small" onClick={() => setModal('record')}>
                      <Play size={14} />
                      Start recording
                    </Button>
                  )}
                  <IconButton
                    className="clear-button"
                    label="Clear recording"
                    onClick={async () =>
                      actions.length && (await confirm({ title: 'Clear this recording?', description: `All ${actions.length} captured actions and their accepted matches will be removed.`, confirm: 'Clear recording', danger: true })) &&
                      work(async () => {
                        await api('/recording/clear', {});
                        setActions([]);
                        setMatches([]);
                        setAccepted({});
                        setRecordStatus((status) =>
                          ['recording', 'paused'].includes(status) ? status : 'idle',
                        );
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </div>
              </div>
              <div className="recorder-grid">
                <section className="panel actions-panel">
                  <div className="panel-heading">
                    <div>
                      <Icon icon={Layers3} />
                      <h2>Recorded actions</h2>
                      <Badge>{actions.length}</Badge>
                    </div>
                  </div>
                  <div
                    className="action-list"
                    onKeyDown={(e) => {
                      if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
                      e.preventDefault();
                      const i = actions.findIndex((x) => x.id === selected);
                      const next = actions[Math.min(actions.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))];
                      if (next) {
                        setSelected(next.id);
                        requestAnimationFrame(() => document.querySelectorAll<HTMLElement>('.action-card')[actions.indexOf(next)]?.focus());
                      }
                    }}
                  >
                    {actions.map((a, i) => {
                      const acceptedAction = !!accepted[a.id];
                      const hasMatch = matches.find((m) => m.action.id === a.id)?.candidates.length;
                      const AIcon = {
                        goto: Globe,
                        fill: TextCursorInput,
                        press: CornerDownLeft,
                        click: MousePointer2,
                      }[a.action];
                      const playwright =
                        a.action === 'goto'
                          ? `await page.GotoAsync(${JSON.stringify(a.url)});`
                          : `await page.${a.target?.testId ? `GetByTestId(${JSON.stringify(a.target.testId)})` : a.target?.role && a.target?.name ? `GetByRole(AriaRole.${a.target.role[0].toUpperCase() + a.target.role.slice(1)}, new() { Name = ${JSON.stringify(a.target.name)} })` : `GetByText(${JSON.stringify(a.target?.name ?? a.target?.description ?? '')})`}.${a.action === 'fill' ? `FillAsync(${JSON.stringify(a.value ?? '')})` : a.action === 'press' ? `PressAsync(${JSON.stringify(a.key)})` : 'ClickAsync()'};`;
                      return (
                        <RowMenu key={a.id} items={[
                          ...(hasMatch && !acceptedAction ? [{ label: 'Accept top match', icon: Check, onSelect: () => { const c = matches.find((m) => m.action.id === a.id)!.candidates[0]; setAccepted({ ...accepted, [a.id]: `${c.binding.keyword} ${c.text}` }); } }] : []),
                          ...(acceptedAction ? [{ label: 'Undo acceptance', icon: X, onSelect: () => { const { [a.id]: _, ...rest } = accepted; setAccepted(rest); } }] : []),
                          ...(!hasMatch && a.action !== 'goto' ? [
                            { label: 'Propose a step', icon: Plus, onSelect: () => { setSelected(a.id); setModal('proposal'); } },
                            { label: 'Propose dictionary entries', icon: Braces, onSelect: () => setModal('dictionary') },
                          ] : []),
                          { label: 'Search steps for this target', icon: Search, onSelect: () => { setCatalogQuery(a.target?.name ?? a.target?.description ?? ''); setTab('Step Catalog'); } },
                          'separator' as const,
                          { label: 'Copy as Playwright C#', icon: Copy, onSelect: () => copyText(playwright).then((ok) => setNotice(ok ? 'Playwright code copied.' : 'Clipboard unavailable.')) },
                          { label: 'Remove action', icon: Trash2, danger: true, onSelect: () => { const before = actions, beforeAccepted = accepted; setActions(actions.filter((x) => x.id !== a.id)); const { [a.id]: _, ...rest } = accepted; setAccepted(rest); setNotice('Action removed.'); haptic([8, 40, 8]); setUndo({ run: () => { setActions(before); setAccepted(beforeAccepted); } }); } },
                        ]}>
                        <motion.button
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className={`action-card ${selected === a.id ? 'selected' : ''}`}
                          onClick={() => setSelected(a.id)}
                        >
                          <span className="action-number">{String(i + 1).padStart(2, '0')}</span>
                          <span className={`action-icon ${a.action}`}>
                            <Icon icon={AIcon} />
                          </span>
                          <span className="action-detail">
                            <span className="action-type">
                              {
                                {
                                  goto: 'Navigate',
                                  fill: 'Fill input',
                                  press: 'Press key',
                                  click: 'Click element',
                                }[a.action]
                              }
                            </span>
                            <code title={formatAction(a)}>{formatAction(a)}</code>
                            <span
                              className={`action-status ${acceptedAction ? 'green' : hasMatch ? 'teal' : 'amber'}`}
                            >
                              {acceptedAction ? (
                                <CheckCheck size={12} />
                              ) : hasMatch ? (
                                <Check size={12} />
                              ) : (
                                <Circle size={10} />
                              )}{' '}
                              {acceptedAction
                                ? 'Accepted'
                                : hasMatch
                                  ? 'Match available'
                                  : 'Needs review'}
                            </span>
                          </span>
                          <ChevronRight size={14} className="action-chevron" />
                        </motion.button>
                        </RowMenu>
                      );
                    })}
                    {!actions.length && (
                      <div className="empty-state">
                        <MousePointer2 size={32} />
                        <h3>Capture your first workflow</h3>
                        <p>Launch a browser and interact with your application.</p>
                        <Button onClick={() => setModal('record')}>
                          Start recording
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="action-footer">
                    <ShieldCheck size={14} />
                    <span>Recorded locally. Sensitive fields are redacted.</span>
                  </div>
                </section>
                <div className="right-column">
                  <section className="panel matcher-panel">
                    <div className="panel-heading">
                      <div>
                        <Icon icon={GitBranch} />
                        <h2>Repository action matcher</h2>
                      </div>
                    </div>
                    <div className="matcher-content">
                      {selectedAction && (
                        <>
                          <div className="match-summary">
                            <div>
                              <span className="micro-label">SELECTED ACTION</span>
                              <h3>
                                {selectedAction.action === 'fill'
                                  ? 'Fill the search field'
                                  : selectedAction.action === 'goto'
                                    ? 'Navigate to a page'
                                    : selectedAction.action === 'press'
                                      ? 'Press a keyboard key'
                                      : 'Open a search result'}
                              </h3>
                            </div>
                            <Badge tone={current?.candidates.length ? 'green' : 'amber'}>
                              {current?.candidates.length ? (
                                <>
                                  <Check size={12} />
                                  Candidates found
                                </>
                              ) : (
                                <>
                                  <TriangleAlert size={12} />
                                  No match
                                </>
                              )}
                            </Badge>
                          </div>
                          {current?.candidates.length ? (
                            <div className="candidate-list">
                              {current.candidates.map((c, i) => (
                                <div
                                  className={`candidate ${accepted[selected] === `${c.binding.keyword} ${c.text}` ? 'accepted' : ''}`}
                                  key={c.binding.id}
                                >
                                  <div className="candidate-top">
                                    <span className="candidate-label">
                                      {i === 0 ? 'BEST CANDIDATE' : 'ALTERNATIVE'}
                                    </span>
                                    <span className="confidence">
                                      {Math.round(c.score * 100)}% <span>confidence</span>
                                    </span>
                                  </div>
                                  <div className="confidence-track">
                                    <span style={{ width: `${c.score * 100}%` }} />
                                  </div>
                                  <code className="binding-code">
                                    <span>{c.binding.keyword}</span> {c.binding.pattern}
                                  </code>
                                  <div className="binding-meta">
                                    <Braces size={13} />
                                    <span>
                                      {c.binding.parameters
                                        .map(
                                          (p) =>
                                            `${p.name}: ${selectedAction.value ?? selectedAction.key ?? p.type}`,
                                        )
                                        .join(', ') || 'No parameters'}
                                    </span>
                                  </div>
                                  <button
                                    className="source-link"
                                    onClick={() => openSource(c.binding.file, c.binding.line)}
                                  >
                                    <FileCode2 size={13} />
                                    {c.binding.file}:{c.binding.line}
                                    <ArrowUpRight size={12} />
                                  </button>
                                  <div className="candidate-bottom">
                                    <span title={c.reasons.join('\n')}>
                                      <ShieldCheck size={13} />
                                      {c.reasons.length} evidence signals
                                    </span>
                                    <Button
                                      size="tiny"
                                      variant={accepted[selected] === `${c.binding.keyword} ${c.text}` ? 'success' : 'soft'}
                                      onClick={() =>
                                        setAccepted({
                                          ...accepted,
                                          [selected]: `${c.binding.keyword} ${c.text}`,
                                        })
                                      }
                                    >
                                      <Check size={13} />
                                      {accepted[selected] === `${c.binding.keyword} ${c.text}`
                                        ? 'Accepted'
                                        : 'Accept match'}
                                    </Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="unmatched-card">
                              <div className="unmatched-icon">
                                <Sparkles size={22} />
                              </div>
                              <h3>A new capability may be needed</h3>
                              <p>
                                No strong existing binding was found. Review the step catalog and
                                selectors before adding a proposal.
                              </p>
                              <Button
                               
                                onClick={() => {
                                  setTab('Step Catalog');
                                  setCatalogQuery(selectedAction.target?.name ?? '');
                                }}
                              >
                                Search existing steps
                                <ArrowRight size={14} />
                              </Button>
                              <button className="text-button" onClick={() => setModal('proposal')}>
                                <Plus size={14} />
                                Propose a step
                              </button>
                              <button className="text-button" onClick={() => setModal('dictionary')}>
                                <Braces size={14} />
                                Propose dictionary entries
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {!selectedAction && (
                        <div className="empty-state">
                          Select an action to inspect repository matches.
                        </div>
                      )}
                    </div>
                  </section>
                  <section className="panel diff-panel">
                    <div className="panel-heading">
                      <div>
                        <Icon icon={Code2} />
                        <h2>Gherkin preview</h2>
                      </div>
                      <Badge tone="green">+{acceptedCount} steps</Badge>
                    </div>
                    <div className="mini-code">
                      <div className="code-line">
                        <span>1</span>
                        <code>
                          <b>Scenario:</b> Recorded workflow
                        </code>
                      </div>
                      {Object.values(accepted).map((s, i) => (
                        <div className="code-line added" key={i}>
                          <span>{i + 2}</span>
                          <code>+ {s}</code>
                        </div>
                      ))}
                      {!acceptedCount && (
                        <div className="preview-hint">
                          Accept a match to add it to your scenario.
                        </div>
                      )}
                    </div>
                    <div className="diff-caption">
                      <Circle size={10} />
                      Changes are previewed before writing to your repository.
                    </div>
                  </section>
                </div>
              </div>
              <div className="bottom-actions">
                <span>
                  <span className="status-dot" />
                  {matched} actions with candidates<span className="muted-separator">/</span>
                  {acceptedCount} accepted
                </span>
                <div>
                  <Button disabled={busy || !actions.length} onClick={match}>
                    <RefreshCw size={15} />
                    Match all actions
                  </Button>
                  <Button variant="ghost" disabled={!matches.some((m) => m.candidates.length && !accepted[m.action.id])} onClick={acceptAllTop} title="Accept the highest-ranked match for every action without one">
                    <CheckCheck size={15} />
                    Accept all top matches
                  </Button>
                  <Button
                   
                    onClick={() => {
                      setView('builder');
                      setDraftSteps(
                        Object.values(accepted).map((s) => ({
                          keyword: s.split(' ')[0],
                          text: s.slice(s.indexOf(' ') + 1),
                        })),
                      );
                    }}
                  >
                    <Plus size={16} />
                    Create scenario
                  </Button>
                  <Button
                    variant="primary"
                    disabled={!acceptedCount}
                    onClick={applyRecording}
                  >
                    <CheckCheck size={16} />
                    Apply to editor
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </div>
            </>
          )}
          {tab === 'Features' && (view === 'code' || view === 'editor') && (
            <div className="editor-area">
            <EditorTabs onClose={closeEditor}>
            {!openEditors.tabs.length && (
              <StartWindow onOpenSolution={() => setModal('solution')} onOpenFolder={() => void openFolder()} onOpened={solutionOpened} onNotice={setNotice} />
            )}
            {featureTabActive && (
            <section className="panel editor-panel">
              <h2 className="sr-only">{feature?.file ?? newFile}</h2>
              <EditorActions>
                {feature && featureAuto.state !== 'saved' && <span className={`save-state ${featureAuto.state}`} role="status">{featureAuto.state === 'dirty' ? '● Unsaved' : featureAuto.state === 'saving' ? 'Saving…' : featureAuto.error}</span>}
                {feature && (
                  <Dropdown
                    label="Debug"
                    align="end"
                    trigger={<Button size="tiny" variant="ghost" className="icon-only" aria-label="Debug" title="Debug" disabled={debugLive}><Bug size={14} /></Button>}
                    entries={[
                      { label: 'Start Debugging (F5)', icon: Bug, onSelect: () => debugFeature() },
                      ...feature.scenarios.map((sc) => ({ label: `Debug scenario: ${sc.name}`, onSelect: () => debugFeature(sc.name) })),
                      'separator' as const,
                      { label: showDebug ? 'Hide debug windows' : 'Show debug windows', onSelect: () => setDebugOpen(!debugOpen) },
                    ]}
                  />
                )}
                {feature && (
                  <Dropdown
                    label="Step definitions"
                    align="end"
                    trigger={<Button size="tiny" variant="ghost" className="icon-only" aria-label="Step definitions" title="Step definitions"><Braces size={14} /></Button>}
                    entries={[
                      ...(featureLinks?.stepFiles ?? []).map((s) => ({ label: `${s.file} (${s.steps})`, icon: FileCode2, onSelect: () => editFile(s.file) })),
                      ...(featureLinks?.codeBehind ? [{ label: `${featureLinks.codeBehind} (generated)`, icon: FileCode2, onSelect: () => editFile(featureLinks.codeBehind!) }] : []),
                      ...(!featureLinks?.stepFiles.length && !featureLinks?.codeBehind ? [{ label: 'No step definitions yet', onSelect: () => {}, disabled: true }] : []),
                      'separator' as const,
                      { label: 'Go to definition of current step (F12)', onSelect: () => setNotice('Put the cursor on a step and press F12.') },
                    ]}
                  />
                )}
                <IconButton label="Validate" shortcut="Ctrl Enter" onClick={() => work(async () => { setValidation(await api('/scenario/validate', { source })); setNotice('Syntax is valid. Binding results are shown below.'); })}><Check size={14} /></IconButton>
                <IconButton label="Run tests" onClick={() => { setRunProject(config.targetProject.endsWith('.csproj') ? config.targetProject : ''); setRunFilter('FullyQualifiedName~' + (feature?.scenarios[0]?.name ?? '').replace(/\s/g, '')); setModal('run'); }}><Play size={14} /></IconButton>
                <IconButton label="Review changes (diff)" onClick={() => previewChange()}><GitCompareArrows size={14} /></IconButton>
                <IconButton label={feature ? 'Save' : 'Save new feature…'} shortcut="Ctrl S" disabled={!!feature && !featureAuto.dirty} onClick={saveFeature}><Save size={14} /></IconButton>
              </EditorActions>
              {featureRestore !== null && feature && (
                <div className="info-box restore-box" role="status">
                  <TriangleAlert size={14} /> Unsaved changes to {feature.file} from an earlier session were kept.
                  <Button size="tiny" onClick={() => { setSource(featureRestore); setFeatureRestore(null); }}>Restore</Button>
                  <Button size="tiny" variant="ghost" onClick={() => setFeatureRestore(null)}>Discard</Button>
                </div>
              )}
              <GherkinEditor
                file={feature?.file}
                runMarks={feature ? marksFor(feature.file) : undefined}
                onRunLine={(line, debug) => feature && runLine(feature.file, line, debug)}
                onDefinition={(s) => goToDefinition(s.keyword, s.text)}
                height={vscode ? '100%' : undefined}
                value={source}
                onChange={setSource}
                onNotice={setNotice}
                onPreview={() => previewChange()}
                onSave={saveFeature}
                onValidate={() =>
                  work(async () => {
                    setValidation(await api('/scenario/validate', { source }));
                    setNotice('Syntax is valid. Binding results are shown below.');
                  })
                }
                onRun={() => {
                  setRunProject(config.targetProject.endsWith('.csproj') ? config.targetProject : '');
                  setRunFilter('FullyQualifiedName~' + (feature?.scenarios[0]?.name ?? '').replace(/\s/g, ''));
                  setModal('run');
                }}
              />
              {validation && (
                <div className="validation-results">
                  {validation.scenarios
                    .flatMap((s: any) => s.steps)
                    .map((s: any, i: number) => (
                      <div key={i}>
                        <Badge tone={s.status === 'Matched' ? 'green' : 'amber'}>{s.status}</Badge>
                        <code>
                          {s.keyword} {s.text}
                        </code>
                      </div>
                    ))}
                </div>
              )}
            </section>
          )}
            {openEditors.tabs.filter((t) => t.kind === 'code').map((t) => (
              <CodeEditor key={t.file} file={t.file} reveal={codeLines[t.file]} onOpen={editFile} runMarks={marksFor(t.file)} onRunLine={(line, debug) => runLine(t.file, line, debug)} active={t.file === openEditors.active} onNotice={setNotice} onIndex={setIndex} />
            ))}
            </EditorTabs>
            </div>
          )}
          {tab === 'Features' && (view === 'code' || view === 'editor') && showBuild && showDebug && (
            <div className="dock-tabs" role="tablist" aria-label="Panel">
              <button role="tab" aria-selected={dockShows === 'build'} onClick={() => setDockTab('build')}>Build</button>
              <button role="tab" aria-selected={dockShows === 'debug'} onClick={() => setDockTab('debug')}>Debug</button>
            </div>
          )}
          {tab === 'Features' && (view === 'code' || view === 'editor') && dockShows === 'build' && (
            <BuildPanel onOpen={(file, line, column) => editFile(file, line, column)} onNotice={setNotice} onClose={() => setBuildOpen(false)} />
          )}
          {tab === 'Features' && (view === 'code' || view === 'editor') && dockShows === 'debug' && (
            <DebugPanel editingRequest={bpSettings?.split('#')[0] ?? null} editingNonce={bpSettings} onOpen={openAt} onNotice={setNotice} onClose={() => { setDebugOpen(false); if (debugLive) setNotice('The session keeps running. Stop it with Shift+F5.'); }} />
          )}
          {tab === 'Features' && view === 'builder' && (
            <div className="builder-grid">
              <section className="panel builder-panel">
                <div className="panel-heading">
                  <div>
                    <Blocks size={18} />
                    <h2>Scenario steps</h2>
                  </div>
                  <Badge>{draftSteps.length}</Badge>
                </div>
                <div className="builder-content">
                  <label className="field-label">
                    SCENARIO NAME
                    <input value={draftName} onChange={(e) => setDraftName(e.target.value)} />
                  </label>
                  {draftSteps.map((s, i) => (
                    <div className="builder-step" key={i}>
                      <span className="step-index">{i + 1}</span>
                      <Select
                        ariaLabel={`Step ${i + 1} keyword`}
                        value={s.keyword}
                        options={['Given', 'When', 'Then', 'And', 'But']}
                        onValueChange={(v) => setDraftSteps(draftSteps.map((x, j) => (j === i ? { ...x, keyword: v } : x)))}
                      />
                      <input
                        aria-label={`Step ${i + 1} text`}
                        value={s.text}
                        onChange={(e) =>
                          setDraftSteps(
                            draftSteps.map((s, j) =>
                              j === i ? { ...s, text: e.target.value } : s,
                            ),
                          )
                        }
                      />
                      <button
                        className="icon-button"
                        aria-label="Move step up"
                        disabled={!i}
                        onClick={() => {
                          const next = [...draftSteps];
                          [next[i - 1], next[i]] = [next[i], next[i - 1]];
                          setDraftSteps(next);
                        }}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="Remove step"
                        onClick={() => setDraftSteps(draftSteps.filter((_, j) => i !== j))}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  {!draftSteps.length && (
                    <div className="empty-state">
                      <Blocks size={30} />
                      <p>Add an existing step to begin your scenario.</p>
                    </div>
                  )}
                  <Checkbox id="outline-toggle" className="outline-toggle" checked={outline} onCheckedChange={setOutline} label="Scenario Outline with examples" />
                  {outline && (
                    <label className="field-label">
                      EXAMPLES TABLE
                      <textarea
                        rows={4}
                        value={examples}
                        onChange={(e) => setExamples(e.target.value)}
                        placeholder="| searchText |"
                      />
                    </label>
                  )}
                  <Button
                    className="dashed"
                    onClick={() => {
                      setTab('Step Catalog');
                      setCatalogQuery('');
                    }}
                  >
                    <Plus size={16} />
                    Add existing step
                  </Button>
                  <button className="text-button" onClick={() => setTab('Backgrounds')}>
                    Browse reusable backgrounds
                    <ArrowRight size={13} />
                  </button>
                </div>
              </section>
              <section className="panel builder-preview">
                <div className="panel-heading">
                  <div>
                    <Code2 size={18} />
                    <h2>Generated Gherkin</h2>
                  </div>
                </div>
                <CodeMirror
                  value={draftSource()}
                  theme={editorTheme}
                  height={vscode ? '100%' : '340px'}
                  extensions={[StreamLanguage.define(gherkin), labelled('Generated Gherkin preview', true)]}
                  editable={false}
                />
                <div className="editor-bottom">
                  <Button
                    variant="primary"
                    disabled={!draftSteps.length}
                    onClick={() => {
                      setSource(draftSource());
                      setView('editor');
                    }}
                  >
                    Open in editor
                    <ArrowRight size={15} />
                  </Button>
                </div>
              </section>
            </div>
          )}
          {tab === 'Dashboard' && <Dashboard index={index} revision={revision} onNavigate={navigate} recent={recent} onSource={openSource} />}
          {tab === 'Test Generator' && (
            <TestGenerator
              revision={revision}
              seed={generatorSeed}
              onSource={openSource}
              onNotice={setNotice}
              onSearchSteps={(q) => { setCatalogQuery(q); setTab('Step Catalog'); }}
              onIndex={(i) => {
                setIndex(i);
                setNotice('Approved changes saved to the repository.');
              }}
              onExport={(text, file) => {
                setFeature(undefined);
                setNewFile(file);
                setSource(text);
                setTab('Features');
                setView('editor');
                setNotice(`Exported to the editor as ${file}. Preview changes to save.`);
              }}
            />
          )}
          {tab === 'Step Catalog' && (
            <StepCatalogue
              query={catalogQuery}
              onQuery={setCatalogQuery}
              revision={revision}
              onAdd={addBinding}
              onSource={openSource}
              onNotice={setNotice}
              onInspect={(b) => {
                setBinding(b);
                setEdges([]);
                setModal('details');
                api(`/step?id=${encodeURIComponent(b.id)}`)
                  .then((r) => setEdges(r.edges))
                  .catch(() => {});
              }}
            />
          )}
          {tab === 'Backgrounds' && (
            <BackgroundCatalogue
              revision={revision}
              onSource={openSource}
              onReuse={(b) => {
                setSource(
                  `Feature: ${feature?.name ?? 'New feature'}\n\n  Background: ${b.name}\n${b.steps.map((s) => `    ${s.keyword} ${s.text}`).join('\n')}\n\n  Scenario: ${draftName}\n${draftSteps.map((s) => `    ${s.keyword} ${s.text}`).join('\n')}\n`,
                );
                setTab('Features');
                setView('editor');
              }}
            />
          )}
          {tab === 'Selectors' && <SelectorCatalogue revision={revision} onSource={openSource} onNotice={setNotice} />}
          {tab === 'Dictionary Inspector' && (
            <DictionaryInspector
              revision={revision}
              onSource={openSource}
              onGenerate={(e) => {
                setGeneratorSeed({ page: e.page, section: e.section, field: e.field, fieldType: e.fieldType, file: e.file });
                setTab('Test Generator');
              }}
            />
          )}
          {tab === 'Project Explorer' && <ProjectExplorer revision={revision} onSource={openSource} />}
          {tab === 'Test Design' && (
            <TestDesign
              key={designKey}
              revision={revision}
              onNotice={setNotice}
              onSource={openSource}
              onOpenDraft={(text, file) => { setFeature(undefined); setNewFile(file); setSource(text); setTab('Features'); setView('editor'); setNotice(`Opened in the editor as ${file}. Preview changes to save.`); }}
            />
          )}
          {tab === 'Config' && config && (
            <section className="panel config-summary">
              <div className="panel-heading"><div><h2>Workspace</h2></div><Button size="small" onClick={() => setModal('settings')}><Settings2 size={14} />Edit workspace settings</Button></div>
              <dl>
                <dt>Repository root</dt><dd>{config.repositoryRoot}</dd>
                <dt>Target project</dt><dd>{config.targetProject}</dd>
                <dt>Feature patterns</dt><dd>{config.featurePatterns.join(', ')}</dd>
                <dt>Source patterns</dt><dd>{config.sourcePatterns.join(', ')}</dd>
                <dt>Dictionary XML patterns</dt><dd>{config.selectorPatterns.join(', ')}</dd>
                <dt>Reference scope</dt><dd>{config.referenceScope}</dd>
                <dt>Ignored directories</dt><dd>{config.ignoredDirectories.join(', ')}</dd>
              </dl>
            </section>
          )}
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Main (mobile)">
        {navTabs.map((t) => (
          <button key={t.name} className={tab === t.name ? 'active' : ''} aria-current={tab === t.name ? 'page' : undefined} onClick={() => navigate(t.name)}>
            <t.icon size={20} />
            <span>{t.name.replace('Dictionary Inspector', 'Dictionary').replace('Test Generator', 'Generator')}</span>
          </button>
        ))}
        {basic ? (
          <button className={onRecorder ? 'active' : ''} aria-current={onRecorder ? 'page' : undefined} onClick={() => { setTab('Features'); setView('recorder'); }}>
            <Circle size={20} />
            <span>Recorder</span>
          </button>
        ) : null}
        <AppMenuButton {...menuProps} />
      </nav>
      <footer className="status-bar">
        <span>
          <span className="status-dot" />
          {busy ? 'Working…' : 'Ready'}
          <span className="muted-separator">│</span>
          <Folder size={12} />
          {index?.workspace ?? 'No repository'}
          {execution.status === 'running' && (<><Separator vertical /><span className="status-run">Running tests</span><Meter value={60} label="Test run" tone="purple" /></>)}
        </span>
        <span className="status-right">
          <StatusBarItems repository={config?.repositoryRoot} onGit={showGit} onErrors={() => { setTab('Features'); if (view !== 'code' && view !== 'editor') setView('editor'); setBuildOpen(true); try { localStorage.setItem('tas:buildTab', '"errors"'); } catch { /* storage blocked */ } }} />
          <button onClick={() => setModal('diagnostics')}>
            <TriangleAlert size={12} />
            {index?.diagnostics.length ?? 0} diagnostics
          </button>
        </span>
      </footer>
      <Toast.Provider swipeDirection={typeof window !== 'undefined' && matchMedia('(max-width: 640px)').matches ? 'down' : 'right'} duration={6000}>
        <Toast.Root
          key={toastKey}
          className="toast"
          open={!!notice}
          onOpenChange={(open) => { if (!open) { setNotice(''); setUndo(undefined); } }}
        >
          <Check size={17} />
          <Toast.Description>{notice}</Toast.Description>
          {undo && (
            <Toast.Action asChild altText="Undo the last change">
              <Button size="tiny" onClick={() => { undo.run(); setUndo(undefined); setNotice('Restored.'); }}>
                Undo
              </Button>
            </Toast.Action>
          )}
          <Toast.Close className="toast-close" aria-label="Dismiss notification"><X size={14} /></Toast.Close>
        </Toast.Root>
        <Toast.Viewport className="toast-viewport" />
      </Toast.Provider>
      <Dialog.Root open={!!modal} onOpenChange={(open) => { if (!open) setModal(undefined); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          {modal && (
            <Dialog.Content
              className={`modal ${['preview', 'source', 'settings', 'dictionary'].includes(modal) ? 'wide' : ''} ${modal === 'preferences' ? 'settings-modal' : ''}`}
              aria-describedby={undefined}
            >
              <div className="sheet-handle" aria-hidden="true" />
              <div className={`modal-header ${modal === 'preferences' ? 'sr-only' : ''}`}>
                <Dialog.Title asChild><h2>
                  {
                    {
                      settings: 'Workspace settings',
                      solution: 'Open Project/Solution',
                      goto: 'Go to All',
                      nuget: 'Manage NuGet Packages',
                      record: 'Record a browser workflow',
                      new: 'Create a feature',
                      parameters: 'Configure step parameters',
                      preview: 'Review repository changes',
                      source: sourceTitle,
                      diagnostics: 'Index diagnostics',
                      proposal: 'Propose a missing step',
                      run: 'Run repository tests',
                      details: 'Binding evidence',
                      dictionary: 'Recorded fields → dictionary & page object',
                      shortcuts: 'Keyboard shortcuts',
                      preferences: 'Preferences',
                    }[modal]
                  }
                </h2></Dialog.Title>
                <Dialog.Close className="icon-button" aria-label="Close dialog">
                  <X size={19} />
                </Dialog.Close>
              </div>
              <div className={modal === 'preferences' ? 'settings-body' : 'modal-body'}>
                {modal === 'nuget' && (
                  <NugetManager initialProject={nugetProject} onNotice={setNotice} onChanged={() => { api('/scan', {}).then(setIndex, () => {}); }} />
                )}
                {modal === 'goto' && (
                  <GoToAll features={index?.features ?? []} onOpen={(file, line, column) => editFile(file, line, column)} onClose={() => setModal(undefined)} />
                )}
                {modal === 'solution' && (
                  <OpenSolution root={config?.repositoryRoot} onOpened={solutionOpened} />
                )}
                {modal === 'settings' && config && (
                  <WorkspaceForm
                    initial={config}
                    onSubmit={async (values) => {
                      const r = await api('/workspace', values);
                      await leaveBrowserFolder();
                      setFileSource({ kind: 'server', root: r.config.repositoryRoot });
                      reloadTabs();
                      setIndex(r.index);
                      setConfig(r.config);
                      setActiveFolder(undefined);
                      setQuery('');
                      if (r.index.features[0]) await loadFeature(r.index.features[0].file);
                      else { setFeature(undefined); setSource(''); }
                      setMatches([]);
                      setAccepted({});
                      setModal(undefined);
                      setNotice('Workspace indexed.');
                    }}
                  />
                )}
                {modal === 'record' && (
                  <RecordForm
                    initialUrl={url}
                    recentUrls={recentUrls}
                    onSubmit={async (u) => {
                      await api('/recording/start', { url: u });
                      markDone('record');
                      setUrl(u);
                      setRecentUrls((r) => [u, ...r.filter((x) => x !== u)].slice(0, 8));
                      setRecordStatus('recording');
                      setActions([]);
                      setMatches([]);
                      setAccepted({});
                      setModal(undefined);
                    }}
                  />
                )}
                {modal === 'new' && (
                  <NewFeatureForm
                    initialFile={newFile}
                    existing={index?.features.map((f) => f.file) ?? []}
                    folders={[...new Set(index?.features.map((f) => f.file.split('/').slice(0, -1).join('/')).filter(Boolean) ?? [])]}
                    onSubmit={({ file, name }) => {
                      setNewFile(file);
                      setFeature(undefined);
                      setSource(`Feature: ${name}\n\n  Scenario: New scenario\n    Given the browser is started\n`);
                      setTab('Features');
                      setView('editor');
                      setModal(undefined);
                      setNotice(`Draft created for ${file}. Preview changes to save.`);
                    }}
                  />
                )}
                {modal === 'parameters' && binding && (
                  <ParametersForm binding={binding} onSubmit={(values) => addStep(values)} />
                )}
                {modal === 'preview' && preview && (
                  <>
                    <div className="info-box">
                      <FileCode2 size={16} />
                      {preview.file}
                    </div>
                    {preview.notes?.map((note: string, i: number) => (
                      <div className="info-box" key={i}>
                        <TriangleAlert size={14} />
                        {note}
                      </div>
                    ))}
                    <CodeMirror
                      value={preview.diff}
                      theme={editorTheme}
                      extensions={[StreamLanguage.define(diffMode), labelled(`Diff for ${preview.file}`, true)]}
                      height="360px"
                      editable={false}
                    />
                    <p className="subtle">
                      Approval writes this exact preview to your repository. No commit is created.
                    </p>
                    <Button
                      variant="primary"
                      disabled={busy || !preview.changed}
                      onClick={() =>
                        work(async () => {
                          const r = await api('/generation/apply', {
                            id: preview.id,
                            approved: true,
                          });
                          setIndex(r.index);
                          if (r.index.features.some((f: Feature) => f.file === preview.file))
                            await loadFeature(preview.file);
                          setModal(undefined);
                          setNotice('Approved changes saved to the repository.');
                          markDone('save');
                        })
                      }
                    >
                      <Save size={16} />
                      Approve and write file
                    </Button>
                  </>
                )}
                {modal === 'source' && /.(cs|xml)(:d+)?$/.test(sourceTitle) && (
                  <div className="button-row">
                    <Button size="small" variant="primary" onClick={() => editFile(sourceTitle.replace(/:d+$/, ''), Number(/:(d+)$/.exec(sourceTitle)?.[1]) || undefined)}><FileCode2 size={13} />Edit in studio</Button>
                  </div>
                )}
                {modal === 'source' && desktop && (
                  <div className="button-row desktop-source-actions">
                    <Button size="small" onClick={() => desktop!.openInEditor(sourceTitle.replace(/:\d+$/, ''), Number(/:(\d+)$/.exec(sourceTitle)?.[1]) || undefined).catch((e) => setNotice((e as Error).message))}><ExternalLink size={13} />Open in default editor</Button>
                    <Button size="small" variant="ghost" onClick={() => desktop!.reveal(sourceTitle.replace(/:\d+$/, '')).catch((e) => setNotice((e as Error).message))}><FolderOpen size={13} />Show in folder</Button>
                    <Button size="small" variant="ghost" onClick={() => desktop!.copyPath(sourceTitle.replace(/:\d+$/, '')).then(() => setNotice('Full path copied.'), (e) => setNotice((e as Error).message))}><Copy size={13} />Copy full path</Button>
                  </div>
                )}
                {modal === 'source' && (
                  <CodeMirror
                    value={sourcePeek}
                    theme={editorTheme}
                    extensions={[
                      ...(sourceTitle.includes('.xml:')
                        ? xmlExtensions(true)
                        : [StreamLanguage.define(sourceTitle.includes('.feature:') ? gherkin : csharp)]),
                      labelled(`Source of ${sourceTitle}`, true),
                    ]}
                    height="460px"
                    editable={false}
                  />
                )}
                {modal === 'diagnostics' && (
                  <>
                    {index?.diagnostics.length ? (
                      index.diagnostics.map((d, i) => (
                        <div className="info-box" key={i}>
                          <TriangleAlert size={17} />
                          {d}
                        </div>
                      ))
                    ) : (
                      <p>No diagnostics.</p>
                    )}
                    <p className="subtle">
                      Unresolved relationships are retained explicitly; the scanner does not infer
                      runtime behavior.
                    </p>
                  </>
                )}
                {modal === 'proposal' && (
                  <>
                    <p className="subtle">
                      This adds an unmatched Gherkin proposal. A binding implementation is still
                      required before the step can execute.
                    </p>
                    <label className="field-label">
                      PROPOSED STEP
                      <input
                        id="proposal-text"
                        defaultValue={`the user ${selectedAction?.action === 'click' ? 'opens' : 'interacts with'} ${selectedAction?.target?.description ?? selectedAction?.target?.name ?? 'the element'}`}
                      />
                    </label>
                    <Button
                      variant="primary"
                      onClick={() => {
                        const value = (document.getElementById('proposal-text') as HTMLInputElement)
                          .value;
                        setAccepted({ ...accepted, [selected]: `When ${value}` });
                        setModal(undefined);
                        setNotice(
                          'Unmatched proposal added. Implement its binding before running.',
                        );
                      }}
                    >
                      Accept wording proposal
                      <ArrowRight size={15} />
                    </Button>
                    <Button
                     
                      style={{ marginLeft: 8 }}
                      onClick={() =>
                        work(async () => {
                          const wording = (
                            document.getElementById('proposal-text') as HTMLInputElement
                          ).value;
                          const p = await api('/generation/proposal', {
                            action: selectedAction,
                            wording,
                            file: 'Generated/RecordedWorkflowSteps.cs',
                          });
                          setPreview(p);
                          setModal('preview');
                        })
                      }
                    >
                      <Code2 size={15} />
                      Preview C# scaffold
                    </Button>
                  </>
                )}
                {modal === 'preferences' && <StudioSettings onNotice={setNotice} onWorkspace={() => setModal('settings')} shortcuts={shortcuts} onClose={() => setModal(undefined)} />}
                {modal === 'shortcuts' && (
                  <dl className="shortcut-list">
                    {shortcuts.map(([k, d]) => (
                      <React.Fragment key={k}>
                        <dt><kbd>{k}</kbd></dt>
                        <dd>{d}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
                {modal === 'dictionary' && (
                  <RecordingDictionary
                    actions={actions.filter((a) => !matches.find((m) => m.action.id === a.id)?.candidates.length)}
                    onIndex={(i) => {
                      setIndex(i);
                      setNotice('Approved changes saved to the repository.');
                    }}
                  />
                )}
                {modal === 'details' && binding && index && (
                  <>
                    <Badge tone="purple">{binding.keyword}</Badge>
                    <h3>{binding.pattern}</h3>
                    <p className="subtle">{binding.method}</p>
                    <button
                      className="source-link"
                      onClick={() => openSource(binding.file, binding.line)}
                    >
                      {binding.file}:{binding.line}
                      <ArrowUpRight size={13} />
                    </button>
                    <h4 className="detail-heading">Existing usages</h4>
                    {binding.examples.map((example, i) => (
                      <div className="info-box" key={i}>
                        <Code2 size={14} />
                        {example}
                      </div>
                    ))}
                    {!binding.examples.length && <p className="subtle">No feature usages found.</p>}
                    <h4 className="detail-heading">Static call relationships</h4>
                    {edges.map((edge, i) => (
                      <div className="evidence-edge" key={i}>
                        <Badge tone={edge.resolution === 'Resolved' ? 'green' : 'amber'}>
                          {edge.resolution}
                        </Badge>
                        <code>
                          {edge.from}
                          <br />↓ {edge.to}
                        </code>
                      </div>
                    ))}
                    {!edges.length && (
                      <p className="subtle">No method calls discovered.</p>
                    )}
                    <Button variant="primary" onClick={() => addBinding(binding)}>
                      <Plus size={15} />
                      Add existing step
                    </Button>
                  </>
                )}
                {modal === 'run' && (
                  <>
                    <RunForm
                      initial={{ project: runProject, filter: runFilter }}
                      running={execution.status === 'running'}
                      projects={config?.targetProject?.endsWith('.csproj') ? [config.targetProject] : []}
                      onSubmit={async (v) => {
                        setRunProject(v.project);
                        setRunFilter(v.filter);
                        setExecution(await api('/execution', { project: v.project, filter: v.filter, approved: true }));
                      }}
                    />
                    <Badge tone={execution.status === 'passed' ? 'green' : 'amber'}>{execution.status}</Badge>
                    {execution.output && <pre className="run-output">{execution.output}</pre>}
                  </>
                )}
              </div>
            </Dialog.Content>
          )}
        </Dialog.Portal>
      </Dialog.Root>
      </div>
    </div>
    </AppMenu>
  );
}
