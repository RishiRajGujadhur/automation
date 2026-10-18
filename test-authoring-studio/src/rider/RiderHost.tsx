import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';
import { activeEditor } from '../editor/activeEditor';
import { extendSelection, shrinkSelection, toggleCase, joinLines, selectNextOccurrence, unselectOccurrence, selectAllOccurrences } from '../editor/riderKeys';
import { registerRider, type RiderCommand } from './commands';

export type RiderHostProps = {
  onNotice: (m: string) => void;
  onNavigate: (loc: { file: string; line?: number; column?: number }) => void;
};

/**
 * JetBrains Rider features: registers their commands (menus, palette, desktop menus) and hosts their popups, dialogs
 * and global keys. Editor keys live in editor/riderKeys.ts.
 */
export default function RiderHost(props: RiderHostProps) {
  const p = useRef(props);
  p.current = props;
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
    ];
    return registerRider(list);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
