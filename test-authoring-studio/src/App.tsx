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
import MoreMenu from './MoreMenu';
import '@fontsource-variable/dm-sans';
import '@fontsource/ibm-plex-mono/400.css';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { xml } from '@codemirror/legacy-modes/mode/xml';
import { oneDark } from '@codemirror/theme-one-dark';
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
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Index, Feature, Binding, Action, Match } from './types';
import './tailwind.css';
import './styles.scss';
import './explorer.scss';
import './generator.scss';

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
  ['Ctrl/Cmd + S', 'Test Generator: preview save'],
  ['Ctrl/Cmd + Enter', 'Test Generator: run validation'],
  ['Esc', 'Clear a search box, close a dialog or menu'],
  ['↑ / ↓', 'Move through dictionary fields'],
  ['Right-click', 'Secondary actions on cards, rows, files and folders'],
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
  const [url, setUrl] = useState('http://127.0.0.1:4310/api/demo');
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
  const [undo, setUndo] = useState<{ run: () => void }>();
  const [showTop, setShowTop] = useState(false);
  const now = useNow(30000);
  const saveRef = useRef<() => void>(() => {});
  const dirty = !!source && source !== (feature?.source ?? '');
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
    const ping = () => fetch('/api/health').then((r) => setOnline(r.ok)).catch(() => setOnline(false));
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
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('[role="dialog"] button, [role="dialog"] input')?.focus();
    });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not(:disabled), [role="dialog"] input, [role="dialog"] textarea, [role="dialog"] select, [role="dialog"] [tabindex="0"]',
        ),
      );
      const first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', trap);
      if (previous?.isConnected) previous.focus();
    };
  }, [modal]);
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
    if (!notice) return;
    const timer = setTimeout(() => { setNotice(''); setUndo(undefined); }, 6000);
    return () => clearTimeout(timer);
  }, [notice]);
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
      if (e.key === 'Escape') setModal(undefined);
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
  const select = (f: Feature) => work(() => loadFeature(f.file));
  const navigate = (name: string) => {
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
  const addStep = () => {
    if (!binding) return;
    let n = 0;
    const values = binding.parameters.filter((p) => p.type !== 'Table').map((p) => params[p.name]);
    let text = binding.pattern
      .replace(/^\^|\$$/g, '')
      .replace(/\(\.\*\)|\(\.\+\)|\(\[\^"\]\*\)/g, () => values[n++] ?? '');
    if (n < values.length) {
      setError('This pattern needs manual editing in the feature editor.');
    }
    const tableParam = binding.parameters.find((p) => p.type === 'Table');
    if (tableParam && params[tableParam.name])
      text +=
        '\n' +
        params[tableParam.name]
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
  return (
    <div className="studio-shell">
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
        ]}
      />
      {busy && <div className="progress-bar" role="progressbar" aria-label="Working" />}
      {!online && (
        <div className="offline-banner" role="alert">
          <TriangleAlert size={15} /> Local API is not responding. Is <code>npm run dev</code> still running?
          <button className="button tiny" onClick={() => fetch('/api/health').then((r) => setOnline(r.ok)).catch(() => setOnline(false))}>Retry</button>
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
        <div className="workspace-breadcrumb">
          <span className="header-divider" />
          <Folder size={15} />
          <span>{index?.workspace ?? 'Loading workspace'}</span>
          <ChevronDown size={13} />
        </div>
        <button
          id="guide-me"
          className="button guide-button"
          disabled={!index || busy}
          onClick={() => {
            previousView.current = { tab, view, mobileExplorer };
            setModal(undefined);
            setGuideOpen(true);
          }}
        >
          <Compass size={16} className="animated-icon" />
          Guide me
        </button>
        <button
          className="icon-button explorer-toggle"
          aria-label="Toggle feature explorer"
          aria-expanded={mobileExplorer}
          aria-controls="feature-sidebar"
          onClick={() => setMobileExplorer((open) => !open)}
        >
          <Folder size={19} />
        </button>
        <button
          className="icon-button"
          data-tour="workspace"
          aria-label="Workspace settings"
          onClick={() => setModal('settings')}
        >
          <Settings2 size={19} />
        </button>
      </header>
      <nav className="main-nav">
        <div className="nav-tabs">
          {tabs.map((t) => (
            <button
              key={t.name}
              className={`nav-tab ${tab === t.name ? 'active' : ''}`}
              title={`${t.name} (${t.shortcut})`}
              onClick={() => {
                setTab(t.name);
                setCatalogQuery('');
              }}
            >
              <Icon icon={t.icon} />
              {t.name}
              {t.name === 'Dictionary Inspector' && !!index?.stats?.dictionaries && (
                <span className="nav-count">{index.stats.dictionaries}</span>
              )}
            </button>
          ))}
          <MoreMenu items={moreTabs} active={tab} onSelect={(name) => { setTab(name); setCatalogQuery(''); }} />
        </div>
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
        <div className="local-state">
          <span />
          Local workspace
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
        <aside id="feature-sidebar" className={`sidebar ${mobileExplorer ? 'mobile-open' : ''}`}>
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
              <button
                className={`icon-button ${busy ? 'spin' : ''}`}
                aria-label="Rescan repository"
                onClick={() =>
                  work(async () => {
                    setIndex(await api('/scan', {}));
                    setNotice('Repository index refreshed.');
                  })
                }
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="repo-path">
              <Folder size={13} />
              <span title={config?.repositoryRoot}>{config?.repositoryRoot ?? 'Connecting…'}</span>
            </div>
          </div>
        </aside>
        <main className="main-content">
          <div className="page-heading">
            <div className="page-title">
              <span className="eyebrow">
                WORKSPACE <ChevronRight size={12} /> {tab.toUpperCase()}
              </span>
              <h1>
                {tab === 'Features'
                  ? view === 'recorder'
                    ? 'Playwright recorder'
                    : view === 'builder'
                      ? 'Scenario builder'
                      : (feature?.name ?? 'Feature editor')
                  : tab}
                {tab === 'Features' && view === 'editor' && dirty && <span className="dirty-dot" title="Unsaved changes (Ctrl/Cmd+S to preview)" aria-label="Unsaved changes" />}
              </h1>
              <p>
                {tab === 'Features'
                  ? view === 'recorder'
                    ? 'Turn browser interactions into reusable, repository-aware tests.'
                    : 'Assemble tests from the capabilities your project already contains.'
                  : (headings[tab] ?? 'Discover existing automation, with evidence from your repository.')}
              </p>
            </div>
            <div className="heading-actions">
              {tab === 'Features' && (
                <div className="segmented">
                  {[
                    { id: 'editor', icon: Code2, label: 'Editor' },
                    { id: 'builder', icon: Blocks, label: 'Builder' },
                    { id: 'recorder', icon: Circle, label: 'Recorder' },
                  ].map((v) => (
                    <button
                      className={view === v.id ? 'active' : ''}
                      key={v.id}
                      onClick={() => setView(v.id)}
                    >
                      <v.icon size={14} />
                      {v.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
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
                </div>
                <div className="toolbar-buttons">
                  {['recording', 'paused'].includes(recordStatus) ? (
                    <>
                      <button
                        className="button small"
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
                      </button>
                      <button
                        className="button small"
                        onClick={() =>
                          work(async () => {
                            await api('/recording/stop', {});
                            setRecordStatus('stopped');
                          })
                        }
                      >
                        <Square size={13} />
                        Stop
                      </button>
                    </>
                  ) : (
                    <button className="button small" onClick={() => setModal('record')}>
                      <Play size={14} />
                      Start recording
                    </button>
                  )}
                  <button
                    className="icon-button clear-button"
                    aria-label="Clear recording"
                    onClick={() =>
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
                  </button>
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
                          { label: 'Remove action', icon: Trash2, danger: true, onSelect: () => { const before = actions, beforeAccepted = accepted; setActions(actions.filter((x) => x.id !== a.id)); const { [a.id]: _, ...rest } = accepted; setAccepted(rest); setNotice('Action removed.'); setUndo({ run: () => { setActions(before); setAccepted(beforeAccepted); } }); } },
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
                        <button className="button" onClick={() => setModal('record')}>
                          Start recording
                        </button>
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
                                    <button
                                      className={`button tiny ${accepted[selected] === `${c.binding.keyword} ${c.text}` ? 'success' : 'primary-soft'}`}
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
                                    </button>
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
                              <button
                                className="button"
                                onClick={() => {
                                  setTab('Step Catalog');
                                  setCatalogQuery(selectedAction.target?.name ?? '');
                                }}
                              >
                                Search existing steps
                                <ArrowRight size={14} />
                              </button>
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
                  <button className="button" disabled={busy || !actions.length} onClick={match}>
                    <RefreshCw size={15} />
                    Match all actions
                  </button>
                  <button className="button ghost" disabled={!matches.some((m) => m.candidates.length && !accepted[m.action.id])} onClick={acceptAllTop} title="Accept the highest-ranked match for every action without one">
                    <CheckCheck size={15} />
                    Accept all top matches
                  </button>
                  <button
                    className="button"
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
                  </button>
                  <button
                    className="button primary"
                    disabled={!acceptedCount}
                    onClick={applyRecording}
                  >
                    <CheckCheck size={16} />
                    Apply to editor
                    <ArrowRight size={15} />
                  </button>
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
                <button
                  className="button tiny"
                  onClick={() =>
                    work(async () => {
                      setValidation(await api('/scenario/validate', { source }));
                      setNotice('Syntax is valid. Binding results are shown below.');
                    })
                  }
                >
                  <Check size={14} />
                  Validate
                </button>
              </div>
              <CodeMirror
                value={source}
                height="470px"
                theme={oneDark}
                extensions={[StreamLanguage.define(gherkin)]}
                onChange={setSource}
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
                <button
                  className="button"
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
                </button>
                <span className="subtle">
                  {source === feature?.source ? 'Saved source' : 'Unsaved changes'} · UTF-8
                </span>
                <button className="button primary" onClick={() => previewChange()}>
                  <Save size={16} />
                  Preview changes
                </button>
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
                      <select
                        aria-label={`Step ${i + 1} keyword`}
                        value={s.keyword}
                        onChange={(e) =>
                          setDraftSteps(
                            draftSteps.map((s, j) =>
                              j === i ? { ...s, keyword: e.target.value } : s,
                            ),
                          )
                        }
                      >
                        {['Given', 'When', 'Then', 'And', 'But'].map((k) => (
                          <option key={k}>{k}</option>
                        ))}
                      </select>
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
                  <label className="outline-toggle">
                    <input
                      type="checkbox"
                      checked={outline}
                      onChange={(e) => setOutline(e.target.checked)}
                    />
                    Scenario Outline with examples
                  </label>
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
                  <button
                    className="button dashed"
                    onClick={() => {
                      setTab('Step Catalog');
                      setCatalogQuery('');
                    }}
                  >
                    <Plus size={16} />
                    Add existing step
                  </button>
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
                  theme={oneDark}
                  height="340px"
                  extensions={[StreamLanguage.define(gherkin)]}
                  editable={false}
                />
                <div className="editor-bottom">
                  <button
                    className="button primary"
                    disabled={!draftSteps.length}
                    onClick={() => {
                      setSource(draftSource());
                      setView('editor');
                    }}
                  >
                    Open in editor
                    <ArrowRight size={15} />
                  </button>
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
              <div className="panel-heading"><div><h2>Workspace</h2></div><button className="button small" onClick={() => setModal('settings')}><Settings2 size={14} />Edit workspace settings</button></div>
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
      <footer className="status-bar">
        <span>
          <span className="status-dot" />
          {busy ? 'Working…' : 'Ready'}
          <span className="muted-separator">│</span>
          <GitBranch size={12} />
          Repository source is authoritative
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
      <AnimatePresence>
        {notice && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
          >
            <Check size={17} />
            {notice}
            {undo && (
              <button className="button tiny" onClick={() => { undo.run(); setUndo(undefined); setNotice('Restored.'); }}>
                Undo
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {modal && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModal(undefined)}
          >
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label={modal}
              className={`modal ${['preview', 'source', 'settings', 'dictionary'].includes(modal) ? 'wide' : ''}`}
              initial={{ scale: 0.97, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>
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
                    }[modal]
                  }
                </h2>
                <button
                  className="icon-button"
                  aria-label="Close dialog"
                  onClick={() => setModal(undefined)}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="modal-body">
                {modal === 'settings' && config && (
                  <>
                    <p className="subtle">
                      Point the scanner at a C# SpecFlow + Playwright repository. Indexing is
                      read-only.
                    </p>
                    <label className="field-label">
                      REPOSITORY ROOT
                      <input
                        value={config.repositoryRoot}
                        onChange={(e) => setConfig({ ...config, repositoryRoot: e.target.value })}
                      />
                    </label>
                    <label className="field-label">
                      TARGET PROJECT / DIRECTORY
                      <input
                        value={config.targetProject}
                        onChange={(e) => setConfig({ ...config, targetProject: e.target.value })}
                      />
                    </label>
                    <label className="field-label">
                      REFERENCE SCOPE
                      <select
                        value={config.referenceScope}
                        onChange={(e) => setConfig({ ...config, referenceScope: e.target.value })}
                      >
                        <option>DirectReferences</option>
                        <option>TargetOnly</option>
                      </select>
                    </label>
                    {[
                      'featurePatterns',
                      'sourcePatterns',
                      'selectorPatterns',
                      'ignoredDirectories',
                    ].map((k) => (
                      <label className="field-label" key={k}>
                        {k.replace(/([A-Z])/g, ' $1').toUpperCase()}
                        <input
                          value={config[k].join(', ')}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              [k]: e.target.value
                                .split(',')
                                .map((s: string) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                    ))}
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        work(async () => {
                          const r = await api('/workspace', config);
                          setIndex(r.index);
                          setConfig(r.config);
                          setActiveFolder(undefined);
                          setQuery('');
                          setFeature(r.index.features[0]);
                          setSource(r.index.features[0]?.source ?? '');
                          setMatches([]);
                          setAccepted({});
                          setModal(undefined);
                          setNotice('Workspace indexed.');
                        })
                      }
                    >
                      <RefreshCw size={16} />
                      Scan workspace
                    </button>
                  </>
                )}
                {modal === 'record' && (
                  <>
                    <p className="subtle">
                      A local Chromium window will open. Navigate, click, type, and press keys to
                      capture actions.
                    </p>
                    <label className="field-label">
                      START URL
                      <input value={url} list="recent-urls" onChange={(e) => setUrl(e.target.value)} />
                      <datalist id="recent-urls">{recentUrls.map((u) => <option key={u} value={u} />)}</datalist>
                    </label>
                    <div className="info-box">
                      <ShieldCheck size={18} />
                      <span>
                        Passwords and fields marked as sensitive are redacted. Review recordings
                        before sharing.
                      </span>
                    </div>
                    <button
                      className="button primary"
                      disabled={busy}
                      onClick={() =>
                        work(async () => {
                          await api('/recording/start', { url });
                          setRecentUrls((r) => [url, ...r.filter((x) => x !== url)].slice(0, 8));
                          setRecordStatus('recording');
                          setActions([]);
                          setMatches([]);
                          setAccepted({});
                          setModal(undefined);
                        })
                      }
                    >
                      <Play size={16} />
                      Launch browser
                    </button>
                  </>
                )}
                {modal === 'new' && (
                  <>
                    <label className="field-label">
                      FEATURE FILE
                      <input value={newFile} onChange={(e) => setNewFile(e.target.value)} />
                    </label>
                    <p className="subtle">
                      The file will only be written after you review and approve its diff.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => {
                        setFeature(undefined);
                        setSource(
                          'Feature: New feature\n\n  Scenario: New scenario\n    Given the browser is started\n',
                        );
                        setTab('Features');
                        setView('editor');
                        setModal(undefined);
                      }}
                    >
                      Create draft
                      <ArrowRight size={15} />
                    </button>
                  </>
                )}
                {modal === 'parameters' && binding && (
                  <>
                    <code className="binding-code">
                      {binding.keyword} {binding.pattern}
                    </code>
                    {binding.parameters.map((p) => (
                      <label className="field-label" key={p.name}>
                        {p.name} · {p.type}
                        <>
                          {p.type === 'Table' ? (
                            <textarea
                              rows={5}
                              value={params[p.name] ?? ''}
                              placeholder="| column |\n| value |"
                              onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}
                            />
                          ) : (
                            <input
                              value={params[p.name] ?? ''}
                              placeholder={`Enter ${p.name}`}
                              onChange={(e) => setParams({ ...params, [p.name]: e.target.value })}
                            />
                          )}
                        </>
                      </label>
                    ))}
                    {!binding.parameters.length && (
                      <p className="subtle">This step does not require parameters.</p>
                    )}
                    <button className="button primary" onClick={addStep}>
                      <Plus size={16} />
                      Add existing step
                    </button>
                  </>
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
                      theme={oneDark}
                      extensions={[StreamLanguage.define(diffMode)]}
                      height="360px"
                      editable={false}
                    />
                    <p className="subtle">
                      Approval writes this exact preview to your repository. No commit is created.
                    </p>
                    <button
                      className="button primary"
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
                        })
                      }
                    >
                      <Save size={16} />
                      Approve and write file
                    </button>
                  </>
                )}
                {modal === 'source' && (
                  <CodeMirror
                    value={sourcePeek}
                    theme={oneDark}
                    extensions={[
                      StreamLanguage.define(
                        sourceTitle.includes('.feature:')
                          ? gherkin
                          : sourceTitle.includes('.xml:')
                            ? xml
                            : csharp,
                      ),
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
                    <button
                      className="button primary"
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
                    </button>
                    <button
                      className="button"
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
                    </button>
                  </>
                )}
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
                    <button className="button primary" onClick={() => addBinding(binding)}>
                      <Plus size={15} />
                      Add existing step
                    </button>
                  </>
                )}
                {modal === 'run' && (
                  <>
                    <p className="subtle">
                      This explicitly runs repository test code through dotnet test. Save the
                      feature first. Indexing itself never executes repository code.
                    </p>
                    <label className="field-label">
                      TEST PROJECT
                      <input
                        value={runProject}
                        onChange={(e) => setRunProject(e.target.value)}
                        placeholder="src/Tests/Tests.csproj"
                      />
                    </label>
                    <label className="field-label">
                      TEST FILTER
                      <input
                        value={runFilter}
                        onChange={(e) => setRunFilter(e.target.value)}
                        placeholder="FullyQualifiedName~SearchForDayforce"
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={execution.status === 'running' || !runProject || !runFilter}
                      onClick={() =>
                        work(async () =>
                          setExecution(
                            await api('/execution', {
                              project: runProject,
                              filter: runFilter,
                              approved: true,
                            }),
                          ),
                        )
                      }
                    >
                      <Play size={15} />
                      Run selected tests
                    </button>
                    <Badge tone={execution.status === 'passed' ? 'green' : 'amber'}>
                      {execution.status}
                    </Badge>
                    {execution.output && <pre className="run-output">{execution.output}</pre>}
                  </>
                )}
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
