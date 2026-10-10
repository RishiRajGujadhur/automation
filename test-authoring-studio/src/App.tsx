import React, { useEffect, useState, useCallback, useRef } from 'react';
import FeatureExplorer from './FeatureExplorer';
import StudioTour, { type TourDestination } from './StudioTour';
import { featureDirectory } from './featureTree';
import Dashboard, { ContextBar } from './Dashboard';
import TestGenerator, { type GeneratorSeed } from './TestGenerator';
import DictionaryInspector from './DictionaryInspector';
import ProjectExplorer from './ProjectExplorer';
import StepCatalogue from './StepCatalogue';
import SearchPalette from './SearchPalette';
import RecordingDictionary from './RecordingDictionary';
import { SelectorCatalogue, BackgroundCatalogue } from './Catalogues';
import { api } from './api';
import { useLocalState, RowMenu, copyText } from './ui';
import { timeAgo, useNow } from './time';
import { WorkspaceForm, RecordForm, NewFeatureForm, ParametersForm, RunForm } from './forms';
import { Select, Checkbox, Button } from './radix';
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
  { name: 'Step Catalog', icon: BookOpen },
  { name: 'Backgrounds', icon: Blocks },
  { name: 'Selectors', icon: ScanLine },
  { name: 'Project Explorer', icon: FolderTree },
  { name: 'Config', icon: Settings2 },
] as const;
const shortcuts: [string, string][] = [
  ['Ctrl/Cmd + K', 'Command palette: go to any page or add a step'],
  ['Alt + 1…4', 'Dashboard, Test Generator, Features, Dictionary Inspector'],
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
];
const headings: Record<string, string> = {
  Dashboard: 'Repository health, classification and entry points.',
  'Test Generator': 'Inputs, dictionary match, locator flow and the validation gate in one place.',
  'Dictionary Inspector': 'XML selector dictionaries in document order, with optional browser verification.',
  'Project Explorer': 'Repository files by architectural layer.',
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
  const [index, setIndex] = useState<Index>();
  const [config, setConfig] = useState<any>();
  const [tab, setTab] = useLocalState('tab', 'Features');
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
  const [generatorSeed, setGeneratorSeed] = useState<GeneratorSeed>();
  const [edges, setEdges] = useState<Index['callEdges']>([]);
  const revision = index?.revision;
  const [recent, setRecent] = useLocalState<string[]>('recent', []);
  const [recentPages, setRecentPages] = useLocalState<string[]>('recentPages', []);
  const [recentUrls, setRecentUrls] = useLocalState<string[]>('recentUrls', []);
  const [online, setOnline] = useState(true);
  const { prefs, setPrefs } = usePrefs();
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
      if (match) { setTab(match); if (v && ['editor', 'builder', 'recorder'].includes(v)) setView(v); }
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
  const saveRef = useRef<() => void>(() => {});
  const dirty = !!source && source !== (feature?.source ?? '');
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
      setIndex(data.index);
      setConfig(data.config);
      if (data.index.features[0]) await loadFeature(data.index.features[0].file);
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
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && document.querySelector('.editor-panel')) {
        e.preventDefault();
        saveRef.current();
      }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;
      if (e.altKey && /^[1-4]$/.test(e.key)) {
        e.preventDefault();
        setTab(tabs[Number(e.key) - 1].name);
      }
      if (!typing && !e.ctrlKey && !e.metaKey && e.key === '/') {
        e.preventDefault();
        setMobileExplorer(true);
        requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[aria-label="Search features"]')?.focus());
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
    setSource(f.source);
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
  saveRef.current = () => previewChange();
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
    pages: moreTabs.map((t) => ({ ...t })),
    primary: tabs.map((t) => ({ name: t.name, icon: t.icon, hint: t.shortcut })),
    active: tab,
    onNavigate: navigate,
    commands: [
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
          <div className="brand-mark">
            <Layers3 size={23} />
          </div>
          <span>
            TestAuthoring<span className="brand-light"> Studio</span>
          </span>
          <Badge tone="purple">LOCAL</Badge>
        </div>
        <nav className="workspace-breadcrumb page-heading" aria-label="Breadcrumb">
          <span className="header-divider" aria-hidden="true" />
          <ol>
            <li>
              <button className="crumb" onClick={() => setModal('settings')} title="Workspace settings">
                <Folder size={14} aria-hidden="true" />
                {index?.workspace ?? 'Loading workspace'}
                <ChevronDown size={12} aria-hidden="true" />
              </button>
            </li>
            {tab !== pageTitle && <li className="crumb-section"><ChevronRight size={12} aria-hidden="true" />{tab}</li>}
            <li aria-current="page">
              <ChevronRight size={12} aria-hidden="true" />
              <h1 title={pageDescription}>
                {pageTitle}
                {tab === 'Features' && view === 'editor' && dirty && <span className="dirty-dot" role="img" aria-label="Unsaved changes" title="Unsaved changes (Ctrl/Cmd+S to preview)" />}
              </h1>
            </li>
          </ol>
        </nav>
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
        <IconButton
          label="Preferences"
          onClick={() => setModal('preferences')}
        >
          <SlidersHorizontal size={18} />
        </IconButton>
        <IconButton
          data-tour="workspace"
          label="Workspace settings"
          onClick={() => setModal('settings')}
        >
          <Settings2 size={19} />
        </IconButton>
      </header>
      <nav className="main-nav">
        <NavigationMenu.Root className="nav-root" aria-label="Main">
        <NavigationMenu.List className="nav-tabs">
          {tabs.map((t) => (
            <NavigationMenu.Item key={t.name}>
            <NavigationMenu.Link asChild active={tab === t.name}>
            <button
              key={t.name}
              className={`nav-tab ${tab === t.name ? 'active' : ''}`}
              title={`${t.name} (${t.shortcut})`}
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
          {moreTabs.filter((t) => t.name === tab).map((t) => (
            <NavigationMenu.Item key={t.name}>
              <button className="nav-tab active" aria-current="page">
                <Icon icon={t.icon} />
                {t.name}
              </button>
            </NavigationMenu.Item>
          ))}
          <NavigationMenu.Item><AppMenuButton {...menuProps} /></NavigationMenu.Item>
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
          {tab === 'Features' ? (
            <ToggleGroup.Root type="single" className="segmented" aria-label="Feature view" value={view} onValueChange={(v) => { if (v) withTransition(() => setView(v)); }}>
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
          ) : (
            <span className="local-state"><span aria-hidden="true" />Local workspace</span>
          )}
        </div>
      </nav>
      <div className="app-body">
        {mobileExplorer && (
          <button
            className="explorer-backdrop"
            aria-label="Close feature explorer"
            onClick={() => setMobileExplorer(false)}
          />
        )}
        <aside id="feature-sidebar" className={`sidebar ${mobileExplorer ? 'mobile-open' : ''}`} style={{ width: sidebarWidth }}>
          <FeatureExplorer
            key={index?.workspace + ':' + config?.repositoryRoot}
            features={index?.features ?? []}
            selectedFile={feature?.file}
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
          />
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
                    <span className="micro-label">NORMALIZED IR</span>
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
                      <Badge tone="purple">DETERMINISTIC</Badge>
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
          {tab === 'Features' && view === 'editor' && (
            <section className="panel editor-panel">
              <div className="panel-heading">
                <div>
                  <FileCode2 size={17} />
                  <h2>{feature?.file ?? newFile}</h2>
                  <Badge tone="purple">GHERKIN</Badge>
                </div>
                <Button
                  size="tiny"
                  onClick={() =>
                    work(async () => {
                      setValidation(await api('/scenario/validate', { source }));
                      setNotice('Syntax is valid. Binding results are shown below.');
                    })
                  }
                >
                  <Check size={14} />
                  Validate
                </Button>
              </div>
              <GherkinEditor
                value={source}
                onChange={setSource}
                onNotice={setNotice}
                onPreview={() => previewChange()}
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
              <div className="editor-bottom">
                <Button
                 
                  onClick={() => {
                    setRunProject(
                      config.targetProject.endsWith('.csproj') ? config.targetProject : '',
                    );
                    setRunFilter(
                      'FullyQualifiedName~' +
                        (feature?.scenarios[0]?.name ?? '').replace(/\s/g, ''),
                    );
                    setModal('run');
                  }}
                >
                  <Play size={14} />
                  Run tests
                </Button>
                <span className="subtle">
                  {source === feature?.source ? 'Saved source' : 'Unsaved changes'} · UTF-8
                </span>
                <Button variant="primary" onClick={() => previewChange()}>
                  <Save size={16} />
                  Preview changes
                </Button>
              </div>
            </section>
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
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <Code2 size={18} />
                    <h2>Generated Gherkin</h2>
                  </div>
                </div>
                <CodeMirror
                  value={draftSource()}
                  theme={editorTheme}
                  height="340px"
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
        {tabs.map((t) => (
          <button key={t.name} className={tab === t.name ? 'active' : ''} aria-current={tab === t.name ? 'page' : undefined} onClick={() => navigate(t.name)}>
            <t.icon size={20} />
            <span>{t.name.replace('Dictionary Inspector', 'Dictionary').replace('Test Generator', 'Generator')}</span>
          </button>
        ))}
        <AppMenuButton {...menuProps} />
      </nav>
      <footer className="status-bar">
        <span>
          <span className="status-dot" />
          {busy ? 'Working…' : 'Ready'}
          <span className="muted-separator">│</span>
          <GitBranch size={12} />
          Repository source is authoritative
          {execution.status === 'running' && (<><Separator vertical /><span className="status-run">Running tests</span><Meter value={60} label="Test run" tone="purple" /></>)}
        </span>
        <button onClick={() => setModal('diagnostics')}>
          <TriangleAlert size={12} />
          {index?.diagnostics.length ?? 0} diagnostics
        </button>
        <span className="footer-right">
          <ShieldCheck size={12} />
          Local only<span className="muted-separator">│</span>SpecFlow + Playwright
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
                {modal === 'settings' && config && (
                  <WorkspaceForm
                    initial={config}
                    onSubmit={async (values) => {
                      const r = await api('/workspace', values);
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
