import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { EditorView } from '@codemirror/view';

const EditorViewScroll = (at: number) => EditorView.scrollIntoView(at, { y: 'center' });
import { activeEditor } from '../editor/activeEditor';
import { extendSelection, shrinkSelection, toggleCase, joinLines, selectNextOccurrence, unselectOccurrence, selectAllOccurrences, startNewLine, startNewLineBefore, caretsAtLineEnds } from '../editor/riderKeys';
import { registerRider, riderChanged, runRider, type RiderCommand } from './commands';
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
import { setHierarchy, type TypeHierarchy } from './hierarchy';
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
type Popup = { kind: 'paste' } | { kind: 'template' } | { kind: 'surround' } | { kind: 'structure'; items: OutlineItem[]; current: number };
const TITLES: Record<Popup['kind'], string> = { paste: 'Paste from History', template: 'Insert Live Template', surround: 'Surround With', structure: 'File Structure' };

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
  const closeAndFocus = () => { setPopup(null); requestAnimationFrame(() => target.current?.view.focus()); };
  /** Runs an editor action on the active editor (and gives it focus back). */
  const inEditor = (fn: (v: EditorView, file: string) => unknown) => () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    fn(a.view, a.file);
    a.view.focus();
  };
  // Tool window keys work everywhere (not only in an editor).
  useEffect(() => {
    const keys: [test: (e: KeyboardEvent) => boolean, id: string][] = [
      [(e) => e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey && e.code === 'Digit7', 'tool-structure'],
    ];
    const h = (e: KeyboardEvent) => { const k = keys.find(([t]) => t(e)); if (k) { e.preventDefault(); runRider(k[1], 'key'); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
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
      { id: 'carets-line-ends', label: 'Add Carets to Ends of Selected Lines', menu: 'Edit', shortcut: 'Alt Shift G', run: inEditor(caretsAtLineEnds) },
    ];
    return registerRider(list);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
  if (popup?.kind === 'paste') body = <PasteHistory onPaste={(text) => { const v = target.current?.view; closeAndFocus(); if (v) v.dispatch(v.state.replaceSelection(text), { scrollIntoView: true, userEvent: 'input.paste' }); }} />;
  return (
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
  );
}
