import type { EditorView } from '@codemirror/view';
import type { RiderCommand } from './commands';
import { sortLines, reverseLines } from '../editor/textTools';

/**
 * Third batch of Visual Studio 2026 / JetBrains Rider commands (IDE-FEATURES.md, X1–X200). RiderHost registers them
 * with these helpers; each command's feature switch is in src/features.ts.
 */
export type MoreHelpers = {
  /** Runs on the active editor (with a notice when there is none) and gives it focus back. */
  inEditor: (fn: (v: EditorView, file: string) => unknown) => () => void;
  notice: (m: string) => void;
};

export function moreCommands(h: MoreHelpers): RiderCommand[] {
  return [
    { id: 'sort-lines', label: 'Sort Lines', menu: 'Edit', group: true, run: h.inEditor(sortLines()) },
    { id: 'reverse-lines', label: 'Reverse Lines', menu: 'Edit', run: h.inEditor(reverseLines) },
  ];
}
