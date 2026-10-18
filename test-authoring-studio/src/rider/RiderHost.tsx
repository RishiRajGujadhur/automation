import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { EditorView } from '@codemirror/view';
import { activeEditor } from '../editor/activeEditor';
import { extendSelection, shrinkSelection, toggleCase, joinLines, selectNextOccurrence, unselectOccurrence, selectAllOccurrences, startNewLine, startNewLineBefore, caretsAtLineEnds } from '../editor/riderKeys';
import { registerRider, riderChanged, type RiderCommand } from './commands';
import PasteHistory from './PasteHistory';
import ListPopup from './ListPopup';
import { insertTemplate, liveTemplates } from '../editor/snippets';
import { surroundTemplates, surroundWith } from '../editor/surround';
import { setViewOptions, viewOptions } from '../editor/viewOptions';

export type RiderHostProps = {
  onNotice: (m: string) => void;
  onNavigate: (loc: { file: string; line?: number; column?: number }) => void;
};

/**
 * JetBrains Rider features: registers their commands (menus, palette, desktop menus) and hosts their popups, dialogs
 * and global keys. Editor keys live in editor/riderKeys.ts.
 */
type Popup = { kind: 'paste' } | { kind: 'template' } | { kind: 'surround' };
const TITLES: Record<Popup['kind'], string> = { paste: 'Paste from History', template: 'Insert Live Template', surround: 'Surround With' };

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
  const closeAndFocus = () => { setPopup(null); requestAnimationFrame(() => target.current?.view.focus()); };
  /** Runs an editor action on the active editor (and gives it focus back). */
  const inEditor = (fn: (v: EditorView, file: string) => unknown) => () => {
    const a = activeEditor();
    if (!a) { p.current.onNotice('Open a file in the editor first.'); return; }
    fn(a.view, a.file);
    a.view.focus();
  };
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
