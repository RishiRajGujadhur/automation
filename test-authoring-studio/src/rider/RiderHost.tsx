import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { EditorView } from '@codemirror/view';

const EditorViewScroll = (at: number) => EditorView.scrollIntoView(at, { y: 'center' });
import { activeEditor } from '../editor/activeEditor';
import { moveStatement } from '../editor/moveStatement';
import { gotoChange, rollbackLines } from '../editor/changeGutter';
import { replaceText } from '../editor/csharp';
import { formatFeature } from '../editor/gherkin';
import { blockComment } from '../editor/riderKeys';
import { extendSelection, shrinkSelection, toggleCase, joinLines, selectNextOccurrence, unselectOccurrence, selectAllOccurrences, startNewLine, startNewLineBefore, caretsAtLineEnds } from '../editor/riderKeys';
import { registerRider, riderChanged, runRider, useRiderCommands, type RiderCommand } from './commands';
import { api } from '../api';
import { copyText } from '../ui';
import { isBrowser } from '../files/provider';
import PasteHistory from './PasteHistory';
import ListPopup from './ListPopup';
import { insertTemplate, liveTemplates } from '../editor/snippets';
import { surroundTemplates, surroundWith } from '../editor/surround';
import { setUsages, wordUsages } from '../editor/usages';
import { fileOutline, itemAt, type OutlineItem } from './outline';
import type { RiderTool } from './RiderToolWindow';
import RunAnything from './RunAnything';
import ProductivityGuide from './ProductivityGuide';
import EvaluateExpression from './EvaluateExpression';
import { powerSave, setPowerSave } from './powerSave';
import CheckRegExp from './CheckRegExp';
import CompareClipboard from './CompareClipboard';
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
};

/**
 * JetBrains Rider features: registers their commands (menus, palette, desktop menus) and hosts their popups, dialogs
 * and global keys. Editor keys live in editor/riderKeys.ts.
 */
type Popup = { kind: 'scratch' } | { kind: 'scratches'; items: { file: string; modified: number }[] } | { kind: 'related'; items: { file: string; line: number; reason: string }[] } | { kind: 'recent-changes'; items: { file: string; id: string; at: string; reason: string }[] } | { kind: 'file-history'; file: string; current: string } | { kind: 'compare'; patch: string; what: string } | { kind: 'regexp'; initial: string } | { kind: 'evaluate'; initial: string } | { kind: 'tip' } | { kind: 'productivity' } | { kind: 'run' } | { kind: 'paste' } | { kind: 'template' } | { kind: 'surround' } | { kind: 'structure'; items: OutlineItem[]; current: number };
const TITLES: Record<Popup['kind'], string> = { scratch: 'New Scratch File', scratches: 'Scratch Files', related: 'Related Files', 'recent-changes': 'Recent Changes', 'file-history': 'Local History', compare: 'Compare with Clipboard', regexp: 'Check RegExp', evaluate: 'Evaluate Expression', tip: 'Tip of the Day', productivity: 'Productivity Guide', run: 'Run Anything', paste: 'Paste from History', template: 'Insert Live Template', surround: 'Surround With', structure: 'File Structure' };

function PowerSaveBadge() {
  useRiderCommands();
  if (!powerSave()) return null;
  return <button className="power-save-badge" title="Power Save Mode is on: background analysis is paused" onClick={() => runRider('power-save', 'menu')}>Power Save</button>;
}

export default function RiderHost(props: RiderHostProps) {
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
  const closeAndFocus = () => { setPopup(null); requestAnimationFrame(() => target.current?.view.focus()); };
  /** Runs an editor action on the active editor (and gives it focus back). */
  const inEditor = (fn: (v: EditorView, file: string) => unknown) => () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    fn(a.view, a.file);
    a.view.focus();
  };
  // Tip of the Day at startup (when chosen in the dialog), once per session.
  useEffect(() => {
    let shown = false;
    try { shown = sessionStorage.getItem('tas:rider:tipShown') === '1'; } catch { /* storage blocked */ }
    if (!tipsOnStartup() || shown) return;
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
      if (!other && now - last < 400) { last = 0; runRider('run-anything', 'key'); } else last = now;
      other = false;
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, []);
  // Tool window keys work everywhere (not only in an editor).
  useEffect(() => {
    const keys: [test: (e: KeyboardEvent) => boolean, id: string][] = [
      [(e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === 'Digit7', 'tool-structure'],
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
    ];
    // Capture phase: the keys also work while the Terminal (xterm.js swallows key events) or a field has focus.
    const h = (e: KeyboardEvent) => { const k = keys.find(([t]) => t(e)); if (k) { e.preventDefault(); e.stopPropagation(); runRider(k[1], 'key'); } };
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
      { id: 'carets-line-ends', label: 'Add Carets to Ends of Selected Lines', menu: 'Edit', shortcut: 'Alt Shift G', run: inEditor(caretsAtLineEnds) },
    ];
    return registerRider(list);
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
  if (popup?.kind === 'scratch') {
    const kinds = [['cs', 'C#'], ['feature', 'Gherkin feature'], ['json', 'JSON'], ['xml', 'XML'], ['http', 'HTTP request'], ['md', 'Markdown'], ['txt', 'Plain text']];
    body = <ListPopup label="Scratch file types" placeholder="New scratch file: language" empty="No such type." items={kinds.map(([k, l]) => ({ key: k, label: l, detail: `.${k}` }))} onPick={(k) => { setPopup(null); api<{ file: string }>('/scratch/new', { ext: k }).then((r) => p.current.onNavigate({ file: r.file, line: 1 }), (e) => p.current.onNotice((e as Error).message)); }} />;
  }
  if (popup?.kind === 'scratches') {
    const items = popup.items;
    body = <ListPopup label="Scratch files" placeholder="Scratch files" empty="No scratch files." items={items.map((s) => ({ key: s.file, label: s.file.split('/').pop()!, detail: new Date(s.modified).toLocaleString() }))} onPick={(k) => { setPopup(null); p.current.onNavigate({ file: k, line: 1 }); }} />;
  }
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
              <Dialog.Title asChild><h2>{TITLES[popup.kind]}</h2></Dialog.Title>
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
