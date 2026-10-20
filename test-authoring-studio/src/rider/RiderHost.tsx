import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { EditorView } from '@codemirror/view';

const EditorViewScroll = (at: number) => EditorView.scrollIntoView(at, { y: 'center' });
import { activeEditor, focusKeepingSelection } from '../editor/activeEditor';
import { moveStatement } from '../editor/moveStatement';
import { completeStatement } from '../editor/completeStatement';
import { unwrap, unwrappable, type Unwrappable } from '../editor/unwrap';
import { collapseAll, collapseToDefinitions, expandAll } from '../editor/foldAll';
import { gotoChange, rollbackLines } from '../editor/changeGutter';
import { replaceText } from '../editor/csharp';
import { formatFeature } from '../editor/gherkin';
import { blockComment } from '../editor/riderKeys';
import { extendSelection, shrinkSelection, toggleCase, joinLines, selectNextOccurrence, unselectOccurrence, selectAllOccurrences, startNewLine, startNewLineBefore, caretsAtLineEnds } from '../editor/riderKeys';
import { featureOn } from '../features';
import { commandOn, noteUsage, registerRider, riderChanged, runRider, useRiderCommands, type RiderCommand } from './commands';
import { api } from '../api';
import { copyText } from '../ui';
import { isBrowser } from '../files/provider';
import PasteHistory from './PasteHistory';
import ListPopup from './ListPopup';
import { insertTemplate, liveTemplates } from '../editor/snippets';
import { surroundTemplates, surroundWith } from '../editor/surround';
import { setUsages, wordUsages } from '../editor/usages';
import { moreCommands } from './more';
import { moreCommands2 } from './more2';
import ProjectProperties from '../project/ProjectProperties';
import FileItemProperties from '../project/FileItemProperties';
import UserSecrets from '../project/UserSecrets';
import EditorConfigDesigner from '../project/EditorConfigDesigner';
import { addNoWarn } from '../project/projectText';
import DiffApproval from '../DiffApproval';
import type { FilePreview } from '../api';
import WindowLayouts from './WindowLayouts';
import BranchPopup from './BranchPopup';
import { appThemes, type AppThemeId } from '../themes';
import { usePrefs } from '../radix2';
import WhatsNew from './WhatsNew';
import { COMPARE_FILES_EVENT } from '../SolutionExplorer';
import CodeMetrics, { type TypeMetrics } from './CodeMetrics';
import StackTrace from './StackTrace';
import { applyCase, CASE_STYLES } from '../editor/textTools';
import { bookmarkByDigit } from '../editor/bookmarks';
import { requestEol } from '../editor/lineSeparator';
import { SELECT_IN_EXPLORER } from '../SolutionExplorer';
import { desktop } from '../desktop';
import { fileOutline, itemAt, type OutlineItem } from './outline';
import { RIDER_TOOLS, type RiderTool } from './RiderToolWindow';
import { getTabs } from '../files/tabs';
import { recentFiles } from '../navHistory';
import RunAnything from './RunAnything';
import ProductivityGuide from './ProductivityGuide';
import EvaluateExpression from './EvaluateExpression';
import { powerSave, setPowerSave } from './powerSave';
import CheckRegExp from './CheckRegExp';
import CompareClipboard from './CompareClipboard';
import LineHistory from './LineHistory';
import { FILE_TEMPLATES, renderTemplate } from './fileTemplates';
import ExternalToolsDialog, { expandMacros, externalTools, type ExternalTool } from './ExternalTools';
import LocalHistory from '../LocalHistory';
import { readFile } from '../files/provider';
import { createTwoFilesPatch } from 'diff';
import { clipboardHistory } from './clipboardRing';
import { breakpointsMuted, muteBreakpoints } from '../debug/store';
import TipOfTheDay, { tipsOnStartup } from './TipOfTheDay';
import KeyPromoter, { keyPromoterOn, setKeyPromoter } from './KeyPromoter';
import { exitMode, layoutState, toggleMode, toggleToolWindows, useLayoutState } from './layoutModes';
import { queueTerminalCommand, runInTerminal } from './TerminalPanel';
import { setHierarchy, type CallHierarchy, type TypeHierarchy } from './hierarchy';
import { changeFontSize, setViewOptions, viewOptions } from '../editor/viewOptions';

export type RiderHostProps = {
  onNotice: (m: string) => void;
  onNavigate: (loc: { file: string; line?: number; column?: number }) => void;
  /** Shows a Rider tool window in the bottom panel. */
  onTool: (tool: RiderTool) => void;
  /** Shows the Explorer side bar. */
  onExplorer: () => void;
};

/**
 * JetBrains Rider features: registers their commands (menus, palette, desktop menus) and hosts their popups, dialogs
 * and global keys. Editor keys live in editor/riderKeys.ts.
 */
type Popup = { kind: 'editorconfig' } | { kind: 'user-secrets'; project: string; id: string } | { kind: 'file-item'; project: string; file: string; exclude?: boolean } | { kind: 'project-previews'; previews: FilePreview[]; title?: string } | { kind: 'project-props'; project: string } | { kind: 'text-preview'; text: string } | { kind: 'themes' } | { kind: 'whats-new' } | { kind: 'step-usages'; title: string; items: { file: string; line: number; text: string; scenario: string }[] } | { kind: 'compare-pair'; patch: string; left: string; right: string } | { kind: 'metrics'; file: string; types: TypeMetrics[] } | { kind: 'branches' } | { kind: 'stack-trace'; text: string } | { kind: 'file-props'; info: Record<string, string | number | boolean> } | { kind: 'switcher'; items: { file: string; label: string }[] } | { kind: 'window-layouts' } | { kind: 'convert-case' } | { kind: 'new-from-template'; folder: string } | { kind: 'new-file-name'; folder: string; template: string } | { kind: 'external-tools' } | { kind: 'compare-branch'; branches: string[] } | { kind: 'line-history'; file: string; start: number; end: number } | { kind: 'copy-path'; items: { label: string; value: string }[] } | { kind: 'unwrap'; items: Unwrappable[] } | { kind: 'compare-with'; files: string[] } | { kind: 'compare-file'; patch: string; other: string } | { kind: 'select-in'; file: string } | { kind: 'scratch' } | { kind: 'scratches'; items: { file: string; modified: number }[] } | { kind: 'related'; items: { file: string; line: number; reason: string }[] } | { kind: 'recent-changes'; items: { file: string; id: string; at: string; reason: string }[] } | { kind: 'file-history'; file: string; current: string } | { kind: 'compare'; patch: string; what: string } | { kind: 'regexp'; initial: string } | { kind: 'evaluate'; initial: string } | { kind: 'tip' } | { kind: 'productivity' } | { kind: 'run' } | { kind: 'paste' } | { kind: 'template' } | { kind: 'surround' } | { kind: 'structure'; items: OutlineItem[]; current: number };
const TITLES: Record<Popup['kind'], string> = { editorconfig: 'EditorConfig', 'user-secrets': 'Manage User Secrets', 'file-item': 'File Properties', 'project-previews': 'Upgrade Target Framework', 'project-props': 'Project Properties', 'text-preview': 'Preview', themes: 'Quick Switch Theme', 'whats-new': "What's New", 'step-usages': 'Step Usages', 'compare-pair': 'Compare Files', metrics: 'Code Metrics', branches: 'Branches', 'stack-trace': 'Analyze Stack Trace', 'file-props': 'Properties', 'switcher': 'Switcher', 'window-layouts': 'Window Layouts', 'convert-case': 'Convert Case', 'new-from-template': 'New from Template', 'new-file-name': 'New File', 'external-tools': 'External Tools', 'compare-branch': 'Compare with Branch', 'line-history': 'History for Selection', 'copy-path': 'Copy Path / Reference', unwrap: 'Unwrap / Remove', 'compare-with': 'Compare With…', 'compare-file': 'Compare Files', 'select-in': 'Select In', scratch: 'New Scratch File', scratches: 'Scratch Files', related: 'Related Files', 'recent-changes': 'Recent Changes', 'file-history': 'Local History', compare: 'Compare with Clipboard', regexp: 'Check RegExp', evaluate: 'Evaluate Expression', tip: 'Tip of the Day', productivity: 'Productivity Guide', run: 'Run Anything', paste: 'Paste from History', template: 'Insert Live Template', surround: 'Surround With', structure: 'File Structure' };

function PowerSaveBadge() {
  useRiderCommands();
  if (!powerSave()) return null;
  return <button className="power-save-badge" title="Power Save Mode is on: background analysis is paused" onClick={() => runRider('power-save', 'menu')}>Power Save</button>;
}

export default function RiderHost(props: RiderHostProps) {
  // Quick Switch Theme (Rider's Ctrl+` Quick Switch Scheme).
  const prefsCtx = usePrefs();
  const p = useRef(props);
  p.current = props;
  const [popup, setPopup] = useState<Popup | null>(null);
  // The editor a popup acts on (it loses focus while the popup is open).
  const target = useRef<{ view: EditorView; file: string } | undefined>(undefined);
  const openPopup = (next: Popup, needsEditor = true) => {
    target.current = activeEditor();
    if (needsEditor && !target.current) { p.current.onNotice('Open a file in the editor first.'); return; }
    setPopup(next);
  };
  /** Line / column (1-based) of the main cursor, with the editor's text, for the C# language service. */
  const position = (view: EditorView, file: string) => {
    const head = view.state.selection.main.head;
    const line = view.state.doc.lineAt(head);
    return { file, source: view.state.doc.toString(), line: line.number, column: head - line.from + 1 };
  };
  /** Copy Reference (Ctrl+Alt+Shift+C): C# symbols by fully qualified name, other files as path:line. */
  const copyReference = async () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    const at = position(a.view, a.file);
    let ref = `${a.file}:${at.line}`;
    if (a.file.endsWith('.cs') && !isBrowser()) {
      try { ref = (await api<{ name: string }>('/csharp/symbolId', at)).name; } catch { /* no symbol: path:line */ }
    }
    const ok = await copyText(ref);
    p.current.onNotice(ok ? `Copied reference: ${ref}` : 'Clipboard unavailable.');
    a.view.focus();
  };
  /** Highlight Usages in File (Ctrl+Shift+F7): the C# symbol's references in this file (Roslyn), else the word. */
  const highlightUsages = async () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    const { view, file } = a;
    let ranges = wordUsages(view);
    if (file.endsWith('.cs') && !isBrowser()) {
      try {
        const r = await api<{ locations: { file: string; line: number; column: number; endLine?: number; endColumn?: number }[] }>('/csharp/references', position(view, file));
        const doc = view.state.doc;
        const here = r.locations.filter((l) => l.file === file && l.line <= doc.lines).map((l) => {
          const from = doc.line(l.line).from + l.column - 1;
          const to = l.endLine && l.endColumn && l.endLine <= doc.lines ? doc.line(l.endLine).from + l.endColumn - 1 : from;
          return { from, to };
        });
        if (here.length) ranges = here;
      } catch { /* not a symbol: the word */ }
    }
    view.dispatch({ effects: setUsages.of(ranges) });
    p.current.onNotice(ranges.length ? `${ranges.length} usage${ranges.length === 1 ? '' : 's'} in this file (F3 / Shift+F3 to move, Esc to clear).` : 'Nothing to highlight here.');
    view.focus();
  };
  /** File Structure (Rider's Ctrl+F12): the file's types and members (or scenarios, headings), filter and jump. */
  const fileStructure = async () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    let items: OutlineItem[] = [];
    try { items = await fileOutline(a.file, a.view.state.doc.toString()); } catch (e) { p.current.onNotice((e as Error).message); return; }
    if (!items.length) { p.current.onNotice('This file has no structure to show.'); return; }
    const line = a.view.state.doc.lineAt(a.view.state.selection.main.head).number;
    const here = itemAt(items, line);
    target.current = a;
    setPopup({ kind: 'structure', items, current: here ? items.indexOf(here) : 0 });
  };
  /** Puts the cursor at a line / column of the target editor and scrolls it to the middle. */
  const goTo = (view: EditorView, line: number, column: number) => {
    const doc = view.state.doc;
    const l = doc.line(Math.max(1, Math.min(line, doc.lines)));
    const at = Math.min(l.to, l.from + column - 1);
    view.dispatch({ selection: { anchor: at }, effects: EditorViewScroll(at) });
  };
  /** Type Hierarchy (Ctrl+H): base types, interfaces and derived types of the type at the caret (Roslyn). */
  const typeHierarchy = async () => {
    const a = activeEditor();
    if (!a || !a.file.endsWith('.cs') || isBrowser()) { p.current.onNotice('Type Hierarchy works in C# files of a studio-indexed folder.'); return; }
    setHierarchy({ kind: 'type', loading: true });
    p.current.onTool('hierarchy');
    try { setHierarchy({ kind: 'type', data: await api<TypeHierarchy>('/csharp/typeHierarchy', position(a.view, a.file)) }); } catch (e) { setHierarchy({ kind: 'type', error: (e as Error).message }); }
  };
  /** Call Hierarchy (Ctrl+Alt+H): who calls the member at the caret; expand a caller to see its callers. */
  const callHierarchy = async () => {
    const a = activeEditor();
    if (!a || !a.file.endsWith('.cs') || isBrowser()) { p.current.onNotice('Call Hierarchy works in C# files of a studio-indexed folder.'); return; }
    setHierarchy({ kind: 'call', loading: true });
    p.current.onTool('hierarchy');
    try { setHierarchy({ kind: 'call', data: await api<CallHierarchy>('/csharp/callers', position(a.view, a.file)) }); } catch (e) { setHierarchy({ kind: 'call', error: (e as Error).message }); }
  };
  /** Compare with Clipboard: the selection, or the whole file, against the clipboard text. */
  const compareWithClipboard = async () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    let clip: string | undefined;
    try { clip = await navigator.clipboard.readText(); } catch { clip = clipboardHistory()[0]; }
    if (clip === undefined) { p.current.onNotice('The clipboard cannot be read here; copy the text in an editor first.'); return; }
    const st = a.view.state;
    const r = st.selection.main;
    const mine = r.empty ? st.doc.toString() : st.sliceDoc(r.from, r.to);
    const what = r.empty ? 'File' : 'Selection';
    const norm = (t: string) => t.replace(/\r\n/g, '\n');
    const patch = norm(mine) === norm(clip) ? '' : createTwoFilesPatch(`${a.file}${r.empty ? '' : ' (selection)'}`, 'Clipboard', norm(mine), norm(clip), '', '', { context: 3 }).split('\n').slice(2).join('\n');
    target.current = a;
    setPopup({ kind: 'compare', patch, what });
  };
  /** Recent Changes (Alt+Shift+C): the latest Local History versions of every file; pick one to see its history. */
  const recentChangesPopup = async () => {
    if (isBrowser()) { p.current.onNotice('Recent Changes needs a folder indexed by the studio server.'); return; }
    try { setPopup({ kind: 'recent-changes', items: await api('/history/recent') }); } catch (e) { p.current.onNotice((e as Error).message); }
  };
  const showFileHistory = async (file: string) => {
    p.current.onNavigate({ file });
    let current = '';
    try { current = (await readFile(file)).source; } catch { /* deleted: compare against nothing */ }
    setPopup({ kind: 'file-history', file, current });
  };
  /** Go to Related Files (Ctrl+Alt+Home): feature ⇄ its step definition files (and code-behind). */
  const relatedFiles = async () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    if (isBrowser()) { p.current.onNotice('Related files need a folder indexed by the studio server.'); return; }
    try {
      const items = await api<{ file: string; line: number; reason: string }[]>(`/related?file=${encodeURIComponent(a.file)}`);
      if (!items.length) { p.current.onNotice(`No related files for ${a.file}.`); return; }
      setPopup({ kind: 'related', items });
    } catch (e) { p.current.onNotice((e as Error).message); }
  };
  /** Code Cleanup (Visual Studio Ctrl+K, Ctrl+E): C# usings organized and formatted (Roslyn), features formatted, trailing whitespace trimmed. */
  const codeCleanup = async () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    const { view, file } = a;
    const before = view.state.doc.toString();
    let text = before;
    const done: string[] = [];
    try {
      if (file.endsWith('.cs') && !isBrowser()) {
        const o = await api<{ text: string; removed: number }>('/csharp/organize', { file, source: text });
        if (o.removed) done.push(`${o.removed} unnecessary using${o.removed === 1 ? '' : 's'} removed`);
        text = o.text;
        text = (await api<{ text: string }>('/csharp/format', { file, source: text })).text;
      } else if (file.endsWith('.feature')) text = formatFeature(text, file);
    } catch (e) { p.current.onNotice((e as Error).message); return; }
    text = text.replace(/[ \t]+(\r?\n)/g, '$1').replace(/[ \t]+$/, '');
    if (!/\n$/.test(text) && text) text += view.state.lineBreak;
    if (text === before) { p.current.onNotice('Code Cleanup: nothing to change.'); return; }
    replaceText(view, text);
    p.current.onNotice(`Code Cleanup: ${['formatted', ...done].join(', ')}.`);
    view.focus();
  };
  /** Copy Path / Reference… (Rider, Ctrl+Shift+C): absolute path, path from the root, file name, path:line, reference. */
  const copyPathPopup = async () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    const at = position(a.view, a.file);
    let root = '';
    if (!isBrowser()) { try { root = (await api<{ config: { repositoryRoot: string } }>('/workspace')).config.repositoryRoot; } catch { /* no root */ } }
    const sep = root.includes('\\') ? '\\' : '/';
    let reference = `${a.file}:${at.line}`;
    if (a.file.endsWith('.cs') && !isBrowser()) { try { reference = (await api<{ name: string }>('/csharp/symbolId', at)).name; } catch { /* path:line */ } }
    const items = [
      ...(root ? [{ label: 'Absolute Path', value: `${root.replace(/[\\/]$/, '')}${sep}${a.file.split('/').join(sep)}` }] : []),
      { label: 'Path From Repository Root', value: a.file },
      { label: 'File Name', value: a.file.split('/').pop()! },
      { label: 'Path:Line', value: `${a.file}:${at.line}` },
      { label: 'Reference', value: reference },
    ];
    target.current = a;
    setPopup({ kind: 'copy-path', items });
  };
  /** Runs an External Tool in the Terminal with the macros of the active editor. */
  const runExternal = async (tool: ExternalTool) => {
    const a = activeEditor() ?? target.current;
    let root = '';
    try { root = (await api<{ config: { repositoryRoot: string } }>('/workspace')).config.repositoryRoot; } catch { /* no root */ }
    const st = a?.view.state;
    const head = st?.selection.main.head ?? 0;
    const line = st ? st.doc.lineAt(head) : undefined;
    const cmd = expandMacros(tool.command, { root, file: a?.file ?? '', line: line?.number ?? 1, column: line ? head - line.from + 1 : 1, selection: st ? st.sliceDoc(st.selection.main.from, st.selection.main.to) : '' });
    setPopup(null);
    if (document.querySelector('.terminal-host:not([hidden])')) runInTerminal(cmd); else queueTerminalCommand(cmd);
    p.current.onTool('terminal');
  };
  /** New File from Template: the file is created in the folder of the active file (or the root), then opened. */
  const createFromTemplate = async (folder: string, templateId: string, name: string) => {
    const t = FILE_TEMPLATES.find((x) => x.id === templateId)!;
    const base = name.trim().replace(/\.[^.]*$/, '');
    if (!/^[\w .-]+$/.test(base)) { p.current.onNotice('Use letters, digits, spaces, dots, dashes or underscores.'); return; }
    const file = `${folder ? `${folder}/` : ''}${base}.${t.ext}`;
    // Namespace: the owning project's name plus the folders below it (Visual Studio's default namespace).
    let namespace = '', reqnroll = false;
    try {
      const s = await api<{ name: string; projects: { name: string; dir: string; packages: string[] }[] }>('/solution');
      const proj = [...s.projects].sort((a, b) => b.dir.length - a.dir.length).find((pr) => !pr.dir || folder === pr.dir || folder.startsWith(`${pr.dir}/`)) ?? s.projects[0];
      const rel = proj ? folder.slice(proj.dir ? proj.dir.length + 1 : 0) : folder;
      namespace = [proj?.name ?? s.name, ...rel.split('/').filter(Boolean)].join('.').replace(/[^\w.]/g, '_');
      reqnroll = !!proj?.packages.some((pk) => /^Reqnroll/i.test(pk));
    } catch { /* defaults */ }
    try {
      await api('/file/create', { file, source: renderTemplate(t, file, namespace, reqnroll) });
      setPopup(null);
      p.current.onNavigate({ file, line: 1 });
      p.current.onNotice(`Created ${file}.`);
    } catch (e) { p.current.onNotice((e as Error).message); }
  };
  const closeAndFocus = () => { setPopup(null); const v = target.current?.view; if (v) focusKeepingSelection(v, true); };
  /** Runs an editor action on the active editor (and gives it focus back). */
  const inEditor = (fn: (v: EditorView, file: string) => unknown) => () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    fn(a.view, a.file);
    focusKeepingSelection(a.view);
  };
  // Manage User Secrets: secrets.json of the project's UserSecretsId (one is added, previewed, first).
  useEffect(() => {
    const h = (e: Event) => {
      const project = (e as CustomEvent<string>).detail;
      void api<{ all: Record<string, string> }>(`/project/properties?project=${encodeURIComponent(project)}`).then(async (r) => {
        if (r.all.UserSecretsId) { setPopup({ kind: 'user-secrets', project, id: r.all.UserSecretsId }); return; }
        const pv = await api<FilePreview>('/project/properties/preview', { project, set: { UserSecretsId: crypto.randomUUID() } });
        setPopup({ kind: 'project-previews', previews: [pv], title: 'Add a UserSecretsId, then Manage User Secrets again' });
      }).catch((err) => p.current.onNotice((err as Error).message));
    };
    window.addEventListener('tas:user-secrets', h);
    return () => window.removeEventListener('tas:user-secrets', h);
  }, []);
  useEffect(() => { const h = () => setPopup({ kind: 'editorconfig' }); window.addEventListener('tas:editorconfig', h); return () => window.removeEventListener('tas:editorconfig', h); }, []);
  // Explorer ▸ Build Action…: a file's Build Action and Copy to Output Directory.
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<{ project: string; file: string; exclude?: boolean }>).detail; setPopup({ kind: 'file-item', project: d.project, file: d.file, exclude: d.exclude }); };
    window.addEventListener('tas:file-item', h);
    return () => window.removeEventListener('tas:file-item', h);
  }, []);
  // Error List ▸ Suppress in Project File: the warning's code added to the project's NoWarn (previewed).
  useEffect(() => {
    const h = (e: Event) => {
      const { code, project } = (e as CustomEvent<{ code: string; project: string }>).detail;
      void (async () => {
        const s = await api<{ projects?: { file: string }[] }>('/solution');
        const file = (s.projects ?? []).map((x) => x.file).find((f) => f.split('/').pop()!.replace(/\.\w+proj$/i, '') === project);
        if (!file) { p.current.onNotice(`No project file for ${project}.`); return; }
        const props = await api<{ all: Record<string, string> }>(`/project/properties?project=${encodeURIComponent(file)}`);
        const next = addNoWarn(props.all.NoWarn, code);
        if (!next) { p.current.onNotice(`${code} is already suppressed in ${file}.`); return; }
        const pv = await api<FilePreview>('/project/properties/preview', { project: file, set: { NoWarn: next } });
        setPopup({ kind: 'project-previews', previews: [pv], title: `Suppress ${code} in Project File` });
      })().catch((err) => p.current.onNotice((err as Error).message));
    };
    window.addEventListener('tas:suppress-warning', h);
    return () => window.removeEventListener('tas:suppress-warning', h);
  }, []);
  // Tools ▸ Upgrade Target Framework: the previewed project files.
  useEffect(() => {
    const h = (e: Event) => { const d = (e as CustomEvent<FilePreview[] | { title: string; previews: FilePreview[] }>).detail; setPopup(Array.isArray(d) ? { kind: 'project-previews', previews: d } : { kind: 'project-previews', previews: d.previews, title: d.title }); };
    window.addEventListener('tas:project-previews', h);
    return () => window.removeEventListener('tas:project-previews', h);
  }, []);
  // Project ▸ Properties (Explorer project menu, Tools ▸ Project Properties).
  useEffect(() => {
    const h = (e: Event) => setPopup({ kind: 'project-props', project: (e as CustomEvent<string>).detail });
    window.addEventListener('tas:project-properties', h);
    return () => window.removeEventListener('tas:project-properties', h);
  }, []);
  // Read-only text previews (Code ▸ Gherkin ▸ Preview Expanded Outline).
  useEffect(() => {
    const h = (e: Event) => setPopup({ kind: 'text-preview', text: (e as CustomEvent<string>).detail });
    window.addEventListener('tas:text-preview', h);
    return () => window.removeEventListener('tas:text-preview', h);
  }, []);
  // Edit ▸ Compare with Saved: the unsaved changes against the file on disk.
  useEffect(() => {
    const h = (e: Event) => setPopup({ kind: 'compare-file', patch: (e as CustomEvent<string>).detail, other: 'the saved file' });
    window.addEventListener('tas:compare-saved', h);
    return () => window.removeEventListener('tas:compare-saved', h);
  }, []);
  // Explorer ▸ Open in Terminal: a terminal in that folder (QOL-50).
  useEffect(() => {
    const h = (e: Event) => { const cmd = `Set-Location "${(e as CustomEvent<string>).detail}"`; if (document.querySelector('.terminal-host:not([hidden])')) runInTerminal(cmd); else queueTerminalCommand(cmd); p.current.onTool('terminal'); };
    window.addEventListener('tas:terminal-in', h);
    return () => window.removeEventListener('tas:terminal-in', h);
  }, []);
  // Explorer ▸ Compare with Selected: the two files' unified diff.
  useEffect(() => {
    const h = (e: Event) => {
      const { left, right } = (e as CustomEvent<{ left: string; right: string }>).detail;
      Promise.all([readFile(left), readFile(right)]).then(([a, b]) => {
        const norm = (t: string) => t.replace(/\r\n/g, '\n');
        const patch = norm(a.source) === norm(b.source) ? '' : createTwoFilesPatch(left, right, norm(a.source), norm(b.source), '', '', { context: 3 }).split('\n').slice(2).join('\n');
        setPopup({ kind: 'compare-pair', patch, left, right });
      }, (err) => p.current.onNotice((err as Error).message));
    };
    window.addEventListener(COMPARE_FILES_EVENT, h);
    return () => window.removeEventListener(COMPARE_FILES_EVENT, h);
  }, []);
  // Tip of the Day at startup (when chosen in the dialog), once per session.
  useEffect(() => {
    let shown = false;
    try { shown = sessionStorage.getItem('tas:rider:tipShown') === '1'; } catch { /* storage blocked */ }
    if (!tipsOnStartup() || shown || !featureOn('tip-of-the-day')) return;
    const t = setTimeout(() => {
      try { sessionStorage.setItem('tas:rider:tipShown', '1'); } catch { /* storage blocked */ }
      setPopup((p) => p ?? { kind: 'tip' });
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  // Run Anything: press Ctrl twice (Rider).
  useEffect(() => {
    let last = 0, other = false;
    const down = (e: KeyboardEvent) => { if (e.key !== 'Control') other = true; };
    const up = (e: KeyboardEvent) => {
      if (e.key !== 'Control') return;
      const now = Date.now();
      if (!other && now - last < 400 && commandOn('run-anything')) { last = 0; runRider('run-anything', 'key'); } else last = now;
      other = false;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, []);
  // Each External Tool is a command of its own (palette, Tools menu), refreshed when the dialog closes.
  useEffect(() => {
    if (popup) return;
    return registerRider(externalTools().map((t, i) => ({ id: `external:${i}`, label: `External Tool: ${t.name}`, menu: 'Tools' as const, group: i === 0, run: () => void runExternal(t) })));
  }, [popup]); // eslint-disable-line react-hooks/exhaustive-deps
  // Tool window keys work everywhere (not only in an editor).
  useEffect(() => {
    const keys: [test: (e: KeyboardEvent) => boolean, id: string][] = [
      [(e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === 'Digit7', 'tool-structure'],
      [(e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === 'Digit9', 'tool-gitlog'],
      [(e) => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'Digit6', 'tool-problems'],
      // Alt+F12 opens the Terminal (Rider) except in a C# editor, where it stays Peek Definition (Visual Studio);
      // Ctrl+` (Visual Studio's View ▸ Terminal) works everywhere.
      [(e) => e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'F12' && !((e.target as HTMLElement | null)?.closest?.('.cm-editor') && activeEditor()?.file.endsWith('.cs')), 'tool-terminal'],
      [(e) => e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && (e.key === '`' || e.code === 'Backquote'), 'tool-terminal'],
      // Distraction-Free Mode (Rider has no default key; Ctrl+K is the command palette here).
      [(e) => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyZ', 'zen-mode'],
      [(e) => (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key === 'F12', 'hide-tools'],
      [(e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.key === 'F8', 'evaluate-expression'],
      [(e) => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyC', 'recent-changes'],
      [(e) => (e.ctrlKey || e.metaKey) && e.altKey && e.shiftKey && e.key === 'Insert', 'new-scratch'],
      [(e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.key === 'F1', 'select-in'],
      [(e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.key === 'Enter' && !!(e.target as HTMLElement | null)?.closest?.('.cm-editor'), 'file-props'],
      // Ctrl+Tab (Visual Studio's IDE Navigator; browsers keep it for themselves, the desktop app gets it).
      [(e) => e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Tab', 'switcher'],
      [(e) => e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'NumpadMultiply', 'show-next-statement'],
      [(e) => !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.key === 'Insert' && !!(e.target as HTMLElement | null)?.closest?.('.cm-editor'), 'overtype'],
      [(e) => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'Insert', 'column-mode'],
      [(e) => e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'Insert', 'new-from-template'],
    ];
    // Ctrl+digit: go to numbered bookmark (Rider), when there is one with that digit.
    const digit = (e: KeyboardEvent) => {
      const d = /^Digit(\d)$/.exec(e.code)?.[1];
      if (!d || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !featureOn('numbered-bookmarks')) return false;
      const b = bookmarkByDigit(d);
      if (!b) return false;
      e.preventDefault(); e.stopPropagation();
      noteUsage('numbered-bookmarks', 'key');
      p.current.onNavigate({ file: b.file, line: b.line });
      return true;
    };
    // Capture phase: the keys also work while the Terminal (xterm.js swallows key events) or a field has focus.
    const h = (e: KeyboardEvent) => { if (digit(e)) return; const k = keys.find(([t, id]) => t(e) && commandOn(id)); if (k) { e.preventDefault(); e.stopPropagation(); runRider(k[1], 'key'); } };
    window.addEventListener('keydown', h, true);
    return () => window.removeEventListener('keydown', h, true);
  }, []);
  useEffect(() => {
    const list: RiderCommand[] = [
      { id: 'extend-selection', label: 'Extend Selection', menu: 'Edit', group: true, shortcut: 'Shift Alt →', run: inEditor(extendSelection) },
      { id: 'shrink-selection', label: 'Shrink Selection', menu: 'Edit', shortcut: 'Shift Alt ←', run: inEditor(shrinkSelection) },
      { id: 'toggle-case', label: 'Toggle Case', menu: 'Edit', group: true, shortcut: 'Ctrl Shift U', run: inEditor(toggleCase) },
      { id: 'join-lines', label: 'Join Lines', menu: 'Edit', shortcut: 'Ctrl Shift J', run: inEditor(joinLines) },
      { id: 'next-occurrence', label: 'Add Selection for Next Occurrence', menu: 'Edit', group: true, shortcut: 'Alt J', run: inEditor(selectNextOccurrence) },
      { id: 'unselect-occurrence', label: 'Unselect Occurrence', menu: 'Edit', shortcut: 'Alt Shift J', run: inEditor(unselectOccurrence) },
      { id: 'all-occurrences', label: 'Select All Occurrences', menu: 'Edit', shortcut: 'Ctrl Alt Shift J', run: inEditor(selectAllOccurrences) },
      { id: 'new-line', label: 'Start New Line', menu: 'Edit', group: true, shortcut: 'Shift Enter', run: inEditor(startNewLine) },
      { id: 'new-line-before', label: 'Start New Line Before Current', menu: 'Edit', shortcut: 'Ctrl Alt Enter', run: inEditor(startNewLineBefore) },
      { id: 'paste-history', label: 'Paste from History…', menu: 'Edit', group: true, shortcut: 'Ctrl Shift V', run: () => openPopup({ kind: 'paste' }) },
      { id: 'live-template', label: 'Insert Live Template…', menu: 'Code', shortcut: 'Ctrl J', run: () => openPopup({ kind: 'template' }) },
      { id: 'surround-with', label: 'Surround With…', menu: 'Code', shortcut: 'Ctrl Alt J', run: () => openPopup({ kind: 'surround' }) },
      { id: 'soft-wrap', label: 'Soft-Wrap', menu: 'View', group: true, checked: () => viewOptions().softWrap, run: () => { setViewOptions({ softWrap: !viewOptions().softWrap }); riderChanged(); } },
      { id: 'whitespace', label: 'Show Whitespaces', menu: 'View', checked: () => viewOptions().whitespace, run: () => { setViewOptions({ whitespace: !viewOptions().whitespace }); riderChanged(); } },
      { id: 'font-bigger', label: 'Increase Font Size', menu: 'View', group: true, shortcut: 'Ctrl Wheel ↑', run: () => changeFontSize(1, activeEditor()?.view) },
      { id: 'font-smaller', label: 'Decrease Font Size', menu: 'View', shortcut: 'Ctrl Wheel ↓', run: () => changeFontSize(-1, activeEditor()?.view) },
      { id: 'font-reset', label: 'Reset Font Size', menu: 'View', run: () => changeFontSize(0) },
      { id: 'copy-reference', label: 'Copy Reference', menu: 'Edit', group: true, shortcut: 'Ctrl Alt Shift C', run: () => void copyReference() },
      { id: 'highlight-usages', label: 'Highlight Usages in File', menu: 'Navigate', shortcut: 'Ctrl Shift F7', run: () => void highlightUsages() },
      { id: 'file-structure', label: 'File Structure…', menu: 'Navigate', shortcut: 'Ctrl Alt F12', run: () => void fileStructure() },
      { id: 'tool-structure', label: 'Structure', menu: 'View', group: true, shortcut: 'Alt 7', run: () => p.current.onTool('structure') },
      { id: 'type-hierarchy', label: 'Type Hierarchy', menu: 'Navigate', group: true, shortcut: 'Ctrl H', run: () => void typeHierarchy() },
      { id: 'call-hierarchy', label: 'Call Hierarchy', menu: 'Navigate', shortcut: 'Ctrl Alt H', run: () => void callHierarchy() },
      { id: 'tool-problems', label: 'Problems', menu: 'View', shortcut: 'Alt Shift 6', run: () => p.current.onTool('problems') },
      { id: 'tool-terminal', label: 'Terminal', menu: 'View', shortcut: 'Alt F12 / Ctrl `', run: () => { if (isBrowser()) { p.current.onNotice('The terminal needs a folder indexed by the studio server.'); return; } p.current.onTool('terminal'); } },
      { id: 'run-anything', label: 'Run Anything…', menu: 'Tools', shortcut: 'Ctrl Ctrl', run: () => { if (isBrowser()) { p.current.onNotice('Run Anything needs a folder indexed by the studio server.'); return; } openPopup({ kind: 'run' }, false); } },
      { id: 'zen-mode', label: 'Distraction-Free Mode', menu: 'View', group: true, shortcut: 'Alt Shift Z', checked: () => layoutState().mode === 'zen', run: () => { toggleMode('zen'); riderChanged(); } },
      { id: 'presentation-mode', label: 'Presentation Mode', menu: 'View', checked: () => layoutState().mode === 'presentation', run: () => { toggleMode('presentation'); riderChanged(); } },
      { id: 'hide-tools', label: 'Hide All Tool Windows', menu: 'View', shortcut: 'Ctrl Shift F12', checked: () => layoutState().toolsHidden, run: () => { toggleToolWindows(); riderChanged(); } },
      { id: 'key-promoter', label: 'Key Promoter', menu: 'Help', group: true, checked: keyPromoterOn, run: () => { setKeyPromoter(!keyPromoterOn()); riderChanged(); } },
      { id: 'productivity-guide', label: 'Productivity Guide', menu: 'Help', run: () => openPopup({ kind: 'productivity' }, false) },
      { id: 'tip-of-the-day', label: 'Tip of the Day', menu: 'Help', run: () => openPopup({ kind: 'tip' }, false) },
      { id: 'evaluate-expression', label: 'Evaluate Expression…', menu: 'Tools', group: true, shortcut: 'Alt F8', run: () => {
        // The selection (or the word at the caret) of the active editor is the starting expression.
        const a = activeEditor();
        let initial = '';
        if (a) { const st = a.view.state; const r = st.selection.main; const w = r.empty ? st.wordAt(r.head) : r; initial = w ? st.sliceDoc(w.from, w.to) : ''; }
        openPopup({ kind: 'evaluate', initial }, false);
      } },
      { id: 'mute-breakpoints', label: 'Mute Breakpoints', menu: 'Tools', checked: breakpointsMuted, run: () => { muteBreakpoints(!breakpointsMuted()); riderChanged(); p.current.onNotice(breakpointsMuted() ? 'Breakpoints muted: the debugger will not stop at them.' : 'Breakpoints active again.'); } },
      { id: 'check-regexp', label: 'Check RegExp…', menu: 'Code', run: () => {
        // The step definition pattern at the caret ([Given(@"…")] in C#), else the selection.
        const a = activeEditor();
        let initial = '';
        if (a) {
          const st = a.view.state;
          const r = st.selection.main;
          const line = st.doc.lineAt(r.head).text;
          const m = /\[(?:Given|When|Then|StepDefinition)\s*\(\s*(@?)"((?:[^"]|"")*)"/.exec(line);
          initial = m ? (m[1] ? m[2].replace(/""/g, '"') : m[2].replace(/\\\\/g, '\\')) : st.sliceDoc(r.from, r.to);
        }
        openPopup({ kind: 'regexp', initial }, false);
      } },
      { id: 'compare-clipboard', label: 'Compare with Clipboard', menu: 'Edit', run: () => void compareWithClipboard() },
      { id: 'recent-changes', label: 'Recent Changes…', menu: 'Navigate', shortcut: 'Alt Shift C', run: () => void recentChangesPopup() },
      { id: 'tool-shelf', label: 'Shelf', menu: 'View', run: () => { if (isBrowser()) { p.current.onNotice('The shelf needs a folder indexed by the studio server.'); return; } p.current.onTool('shelf'); } },
      { id: 'power-save', label: 'Power Save Mode', menu: 'Tools', group: true, checked: powerSave, run: () => { setPowerSave(!powerSave()); riderChanged(); p.current.onNotice(powerSave() ? 'Power Save Mode: background analysis (C# diagnostics, CodeLens, inlay hints) is paused.' : 'Power Save Mode off: background analysis resumes.'); } },
      { id: 'related-files', label: 'Go to Related Files…', menu: 'Navigate', shortcut: 'Ctrl Alt Home', run: () => void relatedFiles() },
      { id: 'statement-up', label: 'Move Statement Up', menu: 'Code', group: true, shortcut: 'Ctrl Shift Alt ↑', run: inEditor(moveStatement(-1)) },
      { id: 'statement-down', label: 'Move Statement Down', menu: 'Code', shortcut: 'Ctrl Shift Alt ↓', run: inEditor(moveStatement(1)) },
      { id: 'block-comment', label: 'Comment with Block Comment', menu: 'Code', group: true, shortcut: 'Ctrl Shift /', run: inEditor((v, f) => blockComment(f)(v)) },
      { id: 'code-cleanup', label: 'Code Cleanup', menu: 'Code', shortcut: 'Ctrl K, Ctrl E', run: () => void codeCleanup() },
      { id: 'next-change', label: 'Next Change', menu: 'Navigate', group: true, shortcut: 'Alt F5', run: inEditor(gotoChange(1)) },
      { id: 'previous-change', label: 'Previous Change', menu: 'Navigate', shortcut: 'Shift Alt F5', run: inEditor(gotoChange(-1)) },
      { id: 'rollback-lines', label: 'Rollback Lines', menu: 'Edit', shortcut: 'Ctrl Alt Z', run: inEditor((v) => { if (!rollbackLines(v)) p.current.onNotice('No uncommitted change at the caret.'); }) },
      { id: 'new-scratch', label: 'New Scratch File…', menu: 'Tools', group: true, shortcut: 'Ctrl Alt Shift Insert', run: () => { if (isBrowser()) { p.current.onNotice('Scratch files need a folder indexed by the studio server.'); return; } openPopup({ kind: 'scratch' }, false); } },
      { id: 'scratches', label: 'Scratch Files…', menu: 'Tools', run: () => { api<{ file: string; modified: number }[]>('/scratch').then((items) => { if (!items.length) p.current.onNotice('No scratch files yet: Tools ▸ New Scratch File (Ctrl+Alt+Shift+Insert).'); else setPopup({ kind: 'scratches', items }); }, (e) => p.current.onNotice((e as Error).message)); } },
      { id: 'numbered-bookmarks', label: 'Numbered Bookmarks (Ctrl+Shift+digit sets, Ctrl+digit jumps)', menu: 'Navigate', group: true, run: () => p.current.onNotice('Put the caret on a line and press Ctrl+Shift+1…9 to set bookmark 1…9; Ctrl+1…9 jumps to it from anywhere.') },
      { id: 'expand-all', label: 'Expand All', menu: 'Code', group: true, shortcut: 'Ctrl K, Ctrl J', run: inEditor(expandAll) },
      { id: 'collapse-all', label: 'Collapse All', menu: 'Code', shortcut: 'Ctrl K, Ctrl 0', run: inEditor(collapseAll) },
      { id: 'collapse-definitions', label: 'Collapse to Definitions', menu: 'Code', shortcut: 'Ctrl K, Ctrl 2', run: inEditor(collapseToDefinitions) },
      { id: 'select-in', label: 'Select In…', menu: 'Navigate', group: true, shortcut: 'Alt F1', run: () => { const a = activeEditor(); if (!a) { p.current.onNotice('Open a file in the editor first.'); return; } setPopup({ kind: 'select-in', file: a.file }); } },
      { id: 'compare-with', label: 'Compare With…', menu: 'Edit', run: () => {
        const a = activeEditor();
        if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
        target.current = a;
        if (isBrowser()) { p.current.onNotice('Compare With needs a folder indexed by the studio server.'); return; }
        api<{ files: { file: string }[] }>('/solution').then((s) => setPopup({ kind: 'compare-with', files: s.files.map((f) => f.file).filter((f) => f !== a.file) }), (e) => p.current.onNotice((e as Error).message));
      } },
      { id: 'complete-statement', label: 'Complete Current Statement', menu: 'Code', group: true, shortcut: 'Ctrl Shift Enter', run: inEditor((v, f) => completeStatement(f)(v)) },
      { id: 'unwrap', label: 'Unwrap / Remove…', menu: 'Code', shortcut: 'Ctrl Shift Delete', run: () => {
        const a = activeEditor();
        if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
        const items = unwrappable(a.view.state, a.view.state.selection.main.head);
        if (!items.length) { p.current.onNotice('Nothing to unwrap here (put the caret inside an if, loop, using or { } block).'); return; }
        target.current = a;
        setPopup({ kind: 'unwrap', items });
      } },
      { id: 'column-mode', label: 'Column Selection Mode', menu: 'Edit', group: true, shortcut: 'Alt Shift Insert', checked: () => !!viewOptions().columnMode, run: () => { setViewOptions({ columnMode: !viewOptions().columnMode }); riderChanged(); p.current.onNotice(viewOptions().columnMode ? 'Column Selection Mode: drag or Shift+↑/↓ to select a block of columns.' : 'Column Selection Mode off.'); } },
      { id: 'copy-path', label: 'Copy Path / Reference…', menu: 'Edit', shortcut: 'Ctrl Shift C', run: () => void copyPathPopup() },
      { id: 'line-history', label: 'Show History for Selection', menu: 'Tools', group: true, run: () => {
        const a = activeEditor();
        if (!a || isBrowser()) { p.current.onNotice('Open a file of a studio-indexed Git repository first.'); return; }
        const st = a.view.state, r = st.selection.main;
        setPopup({ kind: 'line-history', file: a.file, start: st.doc.lineAt(r.from).number, end: st.doc.lineAt(r.to).number });
      } },
      { id: 'tool-gitlog', label: 'Git Log', menu: 'View', shortcut: 'Alt 9', run: () => { if (isBrowser()) { p.current.onNotice('The Git Log needs a folder indexed by the studio server.'); return; } p.current.onTool('gitlog'); } },
      { id: 'compare-branch', label: 'Compare with Branch…', menu: 'Tools', run: () => {
        const a = activeEditor();
        if (!a || isBrowser()) { p.current.onNotice('Open a file of a studio-indexed Git repository first.'); return; }
        target.current = a;
        api<{ local: { name: string; current: boolean }[]; remote: string[] }>('/git/branches').then((b) => setPopup({ kind: 'compare-branch', branches: [...b.local.filter((l) => !l.current).map((l) => l.name), ...b.remote, ...b.local.filter((l) => l.current).map((l) => l.name)] }), (e) => p.current.onNotice((e as Error).message));
      } },
      { id: 'external-tools', label: 'External Tools…', menu: 'Tools', group: true, run: () => { if (isBrowser()) { p.current.onNotice('External tools need a folder indexed by the studio server.'); return; } target.current = activeEditor(); openPopup({ kind: 'external-tools' }, false); } },
      { id: 'new-from-template', label: 'New File from Template…', menu: 'Tools', group: true, shortcut: 'Alt Insert', run: () => {
        if (isBrowser()) { p.current.onNotice('New files from templates need a folder indexed by the studio server.'); return; }
        const f = activeEditor()?.file ?? '';
        openPopup({ kind: 'new-from-template', folder: f.includes('/') && !f.startsWith('.tas/') ? f.slice(0, f.lastIndexOf('/')) : '' }, false);
      } },
      { id: 'eol-crlf', label: 'Line Separators: CRLF (Windows)', menu: 'Edit', group: true, run: () => { const a = activeEditor(); if (a) requestEol(a.file, '\r\n'); else p.current.onNotice('Open a file in the editor first.'); } },
      { id: 'eol-lf', label: 'Line Separators: LF (Unix)', menu: 'Edit', run: () => { const a = activeEditor(); if (a) requestEol(a.file, '\n'); else p.current.onNotice('Open a file in the editor first.'); } },
      { id: 'line-numbers', label: 'Show Line Numbers', menu: 'View', checked: () => !viewOptions().hideLineNumbers, run: () => { setViewOptions({ hideLineNumbers: !viewOptions().hideLineNumbers }); riderChanged(); } },
      { id: 'indent-guides', label: 'Show Indent Guides', menu: 'View', checked: () => !viewOptions().hideIndentGuides, run: () => { setViewOptions({ hideIndentGuides: !viewOptions().hideIndentGuides }); riderChanged(); } },
      { id: 'caret-usages', label: 'Highlight Usages at Caret', menu: 'View', checked: () => !viewOptions().noCaretUsages, run: () => { setViewOptions({ noCaretUsages: !viewOptions().noCaretUsages }); riderChanged(); } },
      { id: 'convert-case', label: 'Convert Case…', menu: 'Edit', run: () => openPopup({ kind: 'convert-case' }) },
      { id: 'window-layouts', label: 'Window Layouts…', menu: 'View', group: true, run: () => openPopup({ kind: 'window-layouts' }, false) },
      { id: 'switcher', label: 'Switcher…', menu: 'Navigate', group: true, shortcut: 'Ctrl Tab', run: () => { const t = getTabs(); const order = [t.active, ...recentFiles()].filter((f, i, a) => f && a.indexOf(f) === i && t.tabs.some((x) => x.file === f)) as string[]; const rest = t.tabs.map((x) => x.file).filter((f) => !order.includes(f)); const tools = (Object.keys(RIDER_TOOLS) as RiderTool[]).map((k) => ({ file: `tool:${k}`, label: RIDER_TOOLS[k] })); setPopup({ kind: 'switcher', items: [...[...order, ...rest].map((f) => ({ file: f, label: f.split('/').pop()! })), ...tools] }); } },
      { id: 'tool-notifications', label: 'Notifications', menu: 'View', run: () => p.current.onTool('notifications') },
      { id: 'file-props', label: 'File Properties', menu: 'View', shortcut: 'Alt Enter', run: () => { const a = activeEditor(); if (!a || isBrowser()) { p.current.onNotice('Open a file of a studio-indexed folder first.'); return; } api<Record<string, string | number | boolean>>(`/file/info?file=${encodeURIComponent(a.file)}`).then((info) => setPopup({ kind: 'file-props', info }), (e) => p.current.onNotice((e as Error).message)); } },
      { id: 'analyze-stack', label: 'Analyze Stack Trace…', menu: 'Tools', group: true, run: () => { void (async () => { let text = ''; try { const c = await navigator.clipboard.readText(); if (/\bat\s+\S+/.test(c)) text = c; } catch { /* paste it */ } setPopup({ kind: 'stack-trace', text }); })(); } },
      { id: 'branches', label: 'Branches…', menu: 'Tools', group: true, run: () => { if (isBrowser()) { p.current.onNotice('Git needs a folder indexed by the studio server.'); return; } openPopup({ kind: 'branches' }, false); } },
      { id: 'code-metrics', label: 'Calculate Code Metrics', menu: 'Tools', group: true, run: () => { const a = activeEditor(); if (!a || !a.file.endsWith('.cs') || isBrowser()) { p.current.onNotice('Open a C# file of a studio-indexed folder first.'); return; } p.current.onNotice('Calculating code metrics…'); api<{ types: TypeMetrics[] }>('/csharp/metrics', { file: a.file, source: a.view.state.doc.toString() }).then((r) => setPopup({ kind: 'metrics', file: a.file, types: r.types }), (e) => p.current.onNotice((e as Error).message)); } },
      { id: 'tool-tags', label: 'Tags', menu: 'View', run: () => p.current.onTool('tags') },
      { id: 'find-step-usages', label: 'Find Step Usages', menu: 'Code', submenu: 'Gherkin', run: () => { const a = activeEditor(); if (!a || !a.file.endsWith('.feature') || isBrowser()) { p.current.onNotice('Put the caret on a step of a feature file.'); return; } const line = a.view.state.doc.lineAt(a.view.state.selection.main.head).number; api<{ binding: { pattern: string } | null; usages: { file: string; line: number; text: string; scenario: string }[] }>(`/steps/usages?file=${encodeURIComponent(a.file)}&line=${line}`).then((r) => { if (!r.binding) { p.current.onNotice('This step has no step definition (or the file has unsaved changes: save to re-index).'); return; } setPopup({ kind: 'step-usages', title: `Usages of ${r.binding.pattern}`, items: r.usages }); }, (e) => p.current.onNotice((e as Error).message)); } },
      { id: 'whats-new', label: "What's New", menu: 'Help', group: true, run: () => openPopup({ kind: 'whats-new' }, false) },
      { id: 'quick-theme', label: 'Quick Switch Theme…', menu: 'View', run: () => openPopup({ kind: 'themes' }, false) },
      { id: 'carets-line-ends', label: 'Add Carets to Ends of Selected Lines', menu: 'Edit', shortcut: 'Alt Shift G', run: inEditor(caretsAtLineEnds) },
    ];
    return registerRider([...list, ...moreCommands({ inEditor, notice: (m) => p.current.onNotice(m), navigate: (l) => p.current.onNavigate(l) }), ...moreCommands2({ inEditor, notice: (m) => p.current.onNotice(m), navigate: (l) => p.current.onNavigate(l) })]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const layout = useLayoutState();
  let body: ReactNode = null;
  if (popup?.kind === 'template' && target.current) {
    const { view, file } = target.current;
    const items = liveTemplates(file);
    body = <ListPopup label="Live templates" placeholder="Template (Ctrl+J)" empty="No live templates for this kind of file." items={items.map((t) => ({ key: t.label, label: t.label, detail: t.detail }))} onPick={(k) => { insertTemplate(view, file, k); closeAndFocus(); }} />;
  }
  if (popup?.kind === 'surround' && target.current) {
    const { view, file } = target.current;
    body = <ListPopup label="Surround templates" placeholder="Surround with (Ctrl+Alt+J)" empty="Nothing to surround with here." items={surroundTemplates(file).map((t) => ({ key: t.id, label: t.label, detail: t.block ? 'lines' : 'selection' }))} onPick={(k) => { surroundWith(view, file, k); closeAndFocus(); }} />;
  }
  if (popup?.kind === 'structure' && target.current) {
    const { view } = target.current;
    const items = popup.items;
    body = <ListPopup label="File structure" placeholder="File structure: type to filter" empty="No matches." initial={popup.current} items={items.map((it, i) => ({ key: String(i), label: it.label, detail: `${it.kind} · line ${it.line}`, indent: it.depth }))} onPick={(k) => { const it = items[Number(k)]; goTo(view, it.line, it.column); closeAndFocus(); }} />;
  }
  if (popup?.kind === 'switcher') {
    const items = popup.items;
    body = <ListPopup label="Open editors and tool windows" placeholder="Switch to… (Ctrl+Tab)" empty="Nothing open." initial={items.length > 1 ? 1 : 0} items={items.map((it) => ({ key: it.file, label: it.label, detail: it.file.startsWith('tool:') ? 'tool window' : it.file }))} onPick={(k) => { setPopup(null); if (k.startsWith('tool:')) p.current.onTool(k.slice(5) as RiderTool); else p.current.onNavigate({ file: k }); }} />;
  }
  if (popup?.kind === 'file-props') {
    const i = popup.info;
    const rows: [string, string][] = [['File', String(i.file)], ['Full path', String(i.path)], ['Size', `${Number(i.size).toLocaleString()} bytes`], ['Lines', String(i.lines)], ['Encoding', String(i.encoding)], ['Line endings', String(i.lineEndings)], ['Modified', new Date(String(i.modified)).toLocaleString()], ['Created', new Date(String(i.created)).toLocaleString()], ['Read-only', i.readOnly ? 'Yes' : 'No']];
    body = <dl className="file-props" aria-label="File properties">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
  }
  if (popup?.kind === 'stack-trace') body = <StackTrace initial={popup.text} onOpen={(file, line) => { setPopup(null); p.current.onNavigate({ file, line }); }} />;
  if (popup?.kind === 'branches') body = <BranchPopup onDone={(m) => { setPopup(null); p.current.onNotice(m); }} />;
  if (popup?.kind === 'metrics') { const f = popup.file; body = <CodeMetrics file={f} types={popup.types} onOpen={(line) => { setPopup(null); p.current.onNavigate({ file: f, line, column: 1 }); }} />; }
  if (popup?.kind === 'window-layouts') body = <WindowLayouts onNotice={(m) => p.current.onNotice(m)} />;
  if (popup?.kind === 'convert-case' && target.current) {
    const { view } = target.current;
    body = <ListPopup label="Case styles" placeholder="Convert case to…" empty="No such style." items={CASE_STYLES.map((c) => ({ key: c.id, label: c.label, detail: c.example }))} onPick={(k) => { applyCase(k as (typeof CASE_STYLES)[number]['id'])(view); closeAndFocus(); }} />;
  }
  if (popup?.kind === 'new-from-template') {
    const folder = popup.folder;
    body = <ListPopup label="File templates" placeholder={`New file in ${folder || 'the root'}…`} empty="No such template." items={FILE_TEMPLATES.map((t) => ({ key: t.id, label: t.label, detail: `.${t.ext}` }))} onPick={(k) => setPopup({ kind: 'new-file-name', folder, template: k })} />;
  }
  if (popup?.kind === 'new-file-name') {
    const { folder, template } = popup;
    const t = FILE_TEMPLATES.find((x) => x.id === template)!;
    body = (
      <form className="new-file-form" onSubmit={(e) => { e.preventDefault(); void createFromTemplate(folder, template, String(new FormData(e.currentTarget).get('name') ?? '')); }}>
        <label>{t.label} name <small>in {folder || 'the root'}</small>
          <input name="name" aria-label="File name" autoFocus required placeholder={t.ext === 'cs' ? 'CheckoutPage' : 'checkout'} />
        </label>
        <button className="button" type="submit">Create</button>
      </form>
    );
  }
  if (popup?.kind === 'external-tools') body = <ExternalToolsDialog onRun={(t) => void runExternal(t)} />;
  if (popup?.kind === 'compare-branch' && target.current) {
    const { view, file } = target.current;
    body = <ListPopup label="Branches" placeholder="Compare with branch…" empty="No other branches." items={popup.branches.map((b) => ({ key: b, label: b }))} onPick={(ref) => {
      api<{ text: string | null }>(`/git/at?file=${encodeURIComponent(file)}&ref=${encodeURIComponent(ref)}`).then((r) => {
        const norm = (t: string) => t.replace(/\r\n/g, '\n');
        const mine = norm(view.state.doc.toString()), theirs = norm(r.text ?? '');
        const patch = mine === theirs ? '' : createTwoFilesPatch(`${file} (${ref})`, file, theirs, mine, '', '', { context: 3 }).split('\n').slice(2).join('\n');
        setPopup({ kind: 'compare-file', patch, other: r.text === null ? `${ref} (the file does not exist there)` : ref });
      }, (e) => p.current.onNotice((e as Error).message));
    }} />;
  }
  if (popup?.kind === 'line-history') body = <LineHistory file={popup.file} start={popup.start} end={popup.end} />;
  if (popup?.kind === 'copy-path') {
    const items = popup.items;
    body = <ListPopup label="Copy targets" placeholder="Copy path / reference" empty="Nothing to copy." items={items.map((c, i) => ({ key: String(i), label: c.label, detail: c.value }))} onPick={(k) => { const c = items[Number(k)]; void copyText(c.value).then((ok) => p.current.onNotice(ok ? `Copied: ${c.value}` : 'Clipboard unavailable.')); closeAndFocus(); }} />;
  }
  if (popup?.kind === 'unwrap' && target.current) {
    const { view } = target.current;
    const items = popup.items;
    body = <ListPopup label="Unwrap targets" placeholder="Unwrap / Remove" empty="Nothing to unwrap." items={items.map((u, i) => ({ key: String(i), label: u.label, detail: `line ${u.header}` }))} onPick={(k) => { if (!unwrap(view, items[Number(k)])) p.current.onNotice('That block shares a line with other code ("} else {"); unwrap the inner one.'); closeAndFocus(); }} />;
  }
  if (popup?.kind === 'compare-with' && target.current) {
    const { view, file } = target.current;
    body = <ListPopup label="Files to compare with" placeholder="Compare with… (type a file name)" empty="No other files." items={popup.files.map((f) => ({ key: f, label: f.split('/').pop()!, detail: f }))} onPick={(k) => {
      readFile(k).then((r) => {
        const norm = (t: string) => t.replace(/\r\n/g, '\n');
        const mine = norm(view.state.doc.toString()), theirs = norm(r.source);
        const patch = mine === theirs ? '' : createTwoFilesPatch(file, k, mine, theirs, '', '', { context: 3 }).split('\n').slice(2).join('\n');
        setPopup({ kind: 'compare-file', patch, other: k });
      }, (e) => p.current.onNotice((e as Error).message));
    }} />;
  }
  if (popup?.kind === 'compare-pair') body = <CompareClipboard patch={popup.patch} what={popup.left} against={popup.right} />;
  if (popup?.kind === 'compare-file') body = <CompareClipboard patch={popup.patch} what="This file" against={popup.other} />;
  if (popup?.kind === 'select-in') {
    const file = popup.file;
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.';
    const targets = [
      { key: 'explorer', label: 'Explorer', detail: 'reveal the file in the Solution Explorer' },
      { key: 'structure', label: 'Structure', detail: 'the file\'s outline' },
      ...(isBrowser() ? [] : [{ key: 'terminal', label: 'Terminal', detail: `a terminal in ${dir}` }]),
      ...(desktop ? [{ key: 'files', label: 'File Explorer', detail: 'show the file in Windows Explorer' }] : []),
    ];
    body = <ListPopup label="Select in targets" placeholder="Select in… (Alt+F1)" empty="Nowhere to select it." items={targets} onPick={(k) => {
      setPopup(null);
      if (k === 'explorer') { p.current.onExplorer(); setTimeout(() => window.dispatchEvent(new Event(SELECT_IN_EXPLORER)), 50); }
      else if (k === 'structure') p.current.onTool('structure');
      else if (k === 'terminal') { const cmd = `Set-Location "${dir}"`; if (document.querySelector('.terminal-host:not([hidden])')) runInTerminal(cmd); else queueTerminalCommand(cmd); p.current.onTool('terminal'); }
      else if (k === 'files' && desktop) void desktop.reveal(file);
    }} />;
  }
  if (popup?.kind === 'scratch') {
    const kinds = [['cs', 'C#'], ['feature', 'Gherkin feature'], ['json', 'JSON'], ['xml', 'XML'], ['http', 'HTTP request'], ['md', 'Markdown'], ['txt', 'Plain text']];
    body = <ListPopup label="Scratch file types" placeholder="New scratch file: language" empty="No such type." items={kinds.map(([k, l]) => ({ key: k, label: l, detail: `.${k}` }))} onPick={(k) => { setPopup(null); api<{ file: string }>('/scratch/new', { ext: k }).then((r) => p.current.onNavigate({ file: r.file, line: 1 }), (e) => p.current.onNotice((e as Error).message)); }} />;
  }
  if (popup?.kind === 'scratches') {
    const items = popup.items;
    body = <ListPopup label="Scratch files" placeholder="Scratch files" empty="No scratch files." items={items.map((s) => ({ key: s.file, label: s.file.split('/').pop()!, detail: new Date(s.modified).toLocaleString() }))} onPick={(k) => { setPopup(null); p.current.onNavigate({ file: k, line: 1 }); }} />;
  }
  if (popup?.kind === 'step-usages') {
    const items = popup.items;
    body = <ListPopup label={popup.title} placeholder="Filter the usages" empty="No feature uses this step." items={items.map((u, i) => ({ key: String(i), label: u.text, detail: `${u.scenario} · ${u.file.split('/').pop()}:${u.line}` }))} onPick={(k) => { const u = items[Number(k)]; setPopup(null); p.current.onNavigate({ file: u.file, line: u.line }); }} />;
  }
  if (popup?.kind === 'whats-new') body = <WhatsNew />;
  if (popup?.kind === 'editorconfig') body = <EditorConfigDesigner onNotice={(m) => p.current.onNotice(m)} />;
  if (popup?.kind === 'user-secrets') body = <UserSecrets project={popup.project} id={popup.id} onNotice={(m) => p.current.onNotice(m)} />;
  if (popup?.kind === 'file-item') body = <FileItemProperties project={popup.project} file={popup.file} exclude={popup.exclude} onNotice={(m) => p.current.onNotice(m)} />;
  if (popup?.kind === 'project-previews') body = <div className="project-props project-previews">{popup.previews.map((pv) => <DiffApproval key={pv.id} preview={pv} height="140px" onApplied={() => { p.current.onNotice(`${pv.file} written.`); window.dispatchEvent(new Event('tas:rescan')); }} />)}</div>;
  if (popup?.kind === 'project-props') body = <ProjectProperties project={popup.project} onNotice={(m) => p.current.onNotice(m)} />;
  if (popup?.kind === 'text-preview') body = <pre className="text-preview" aria-label="Preview text">{popup.text}</pre>;
  if (popup?.kind === 'themes') body = <ListPopup label="Themes" placeholder="Theme…" empty="No themes." items={appThemes.map((t) => ({ key: t.id, label: `${prefsCtx.prefs.theme === t.id ? '✓ ' : ''}${t.label}`, detail: t.description }))} onPick={(k) => { setPopup(null); prefsCtx.setPrefs({ theme: k as AppThemeId }); p.current.onNotice(`Theme: ${appThemes.find((t) => t.id === k)?.label}.`); }} />;
  if (popup?.kind === 'related') {
    const items = popup.items;
    body = <ListPopup label="Related files" placeholder="Related files (Ctrl+Alt+Home)" empty="No related files." items={items.map((r, i) => ({ key: String(i), label: r.file, detail: r.reason }))} onPick={(k) => { const r = items[Number(k)]; setPopup(null); p.current.onNavigate({ file: r.file, line: r.line }); }} />;
  }
  if (popup?.kind === 'recent-changes') {
    const items = popup.items;
    const when = (at: string) => { const s = Math.round((Date.now() - Date.parse(at)) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : new Date(at).toLocaleString(); };
    body = <ListPopup label="Recent changes" placeholder="Recent changes (Alt+Shift+C)" empty="No local history yet: it fills as files are saved, changed or deleted." items={items.map((c, i) => ({ key: String(i), label: c.file, detail: `${c.reason === 'save' ? 'saved' : c.reason === 'delete' ? 'deleted' : 'changed'} · ${when(c.at)}` }))} onPick={(k) => void showFileHistory(items[Number(k)].file)} />;
  }
  if (popup?.kind === 'file-history') {
    const { file, current } = popup;
    body = <LocalHistory file={file} current={current} onRevert={(src) => {
      setPopup(null);
      // Into the file's editor (opened by showFileHistory), as unsaved changes.
      requestAnimationFrame(() => { const a = activeEditor(); if (a?.file === file) { a.view.dispatch({ changes: { from: 0, to: a.view.state.doc.length, insert: src } }); p.current.onNotice('Reverted in the editor: save to keep it.'); } else p.current.onNotice(`Open ${file} to revert it.`); });
    }} />;
  }
  if (popup?.kind === 'compare') body = <CompareClipboard patch={popup.patch} what={popup.what} />;
  if (popup?.kind === 'regexp') body = <CheckRegExp initial={popup.initial} onOpen={(file, line) => { setPopup(null); p.current.onNavigate({ file, line }); }} />;
  if (popup?.kind === 'evaluate') body = <EvaluateExpression initial={popup.initial} />;
  if (popup?.kind === 'tip') body = <TipOfTheDay onClose={() => setPopup(null)} />;
  if (popup?.kind === 'productivity') body = <ProductivityGuide onClose={() => setPopup(null)} />;
  if (popup?.kind === 'run') {
    body = <RunAnything onRun={(cmd) => {
      setPopup(null);
      // An open Terminal runs it at once; otherwise the new one runs it when its shell is ready.
      if (document.querySelector('.terminal-host:not([hidden])')) runInTerminal(cmd); else queueTerminalCommand(cmd);
      p.current.onTool('terminal');
    }} />;
  }
  if (popup?.kind === 'paste') body = <PasteHistory onPaste={(text) => { const v = target.current?.view; closeAndFocus(); if (v) v.dispatch(v.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.paste' }); }} />;
  return (
    <>
    <KeyPromoter />
    {/* Status bar badge while Power Save Mode is on (click to turn it off). */}
    <PowerSaveBadge />
    {layout.mode !== 'normal' && (
      <button className="rider-exit-mode" onClick={() => { exitMode(); riderChanged(); }}>
        Exit {layout.mode === 'zen' ? 'Distraction-Free' : 'Presentation'} Mode
      </button>
    )}
    <Dialog.Root open={!!popup} onOpenChange={(o) => { if (!o) closeAndFocus(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        {popup && (
          <Dialog.Content className="modal rider-popup" aria-describedby={undefined} onCloseAutoFocus={(e) => e.preventDefault()}>
            <div className="modal-header">
              <Dialog.Title asChild><h2>{popup.kind === 'project-previews' && popup.title ? popup.title : TITLES[popup.kind]}</h2></Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close dialog"><X size={19} /></Dialog.Close>
            </div>
            <div className="modal-body">{body}</div>
          </Dialog.Content>
        )}
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}
