import type { EditorView } from '@codemirror/view';
import type { RiderCommand } from './commands';
import { sortLines, reverseLines, deleteHorizontalWhiteSpace, setCase, transposeLine, transposeChars, transposeWords, cursorMatchingBracket, selectMatchingBracket, findSelected } from '../editor/textTools';

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
    { id: 'delete-whitespace', label: 'Delete Horizontal White Space', menu: 'Edit', shortcut: 'Ctrl K, Ctrl \\', run: h.inEditor(deleteHorizontalWhiteSpace) },
    { id: 'make-uppercase', label: 'Make Uppercase', menu: 'Edit', run: h.inEditor(setCase(true)) },
    { id: 'make-lowercase', label: 'Make Lowercase', menu: 'Edit', run: h.inEditor(setCase(false)) },
    { id: 'transpose-line', label: 'Transpose Line', menu: 'Edit', shortcut: 'Shift Alt T', run: h.inEditor(transposeLine) },
    { id: 'transpose-chars', label: 'Transpose Characters', menu: 'Edit', run: h.inEditor(transposeChars) },
    { id: 'transpose-words', label: 'Transpose Words', menu: 'Edit', run: h.inEditor(transposeWords) },
    { id: 'goto-brace', label: 'Go to Matching Brace', menu: 'Navigate', group: true, shortcut: 'Ctrl ]', run: h.inEditor(cursorMatchingBracket) },
    { id: 'select-brace', label: 'Select to Matching Brace', menu: 'Navigate', shortcut: 'Ctrl Shift ]', run: h.inEditor(selectMatchingBracket) },
    { id: 'find-next-selected', label: 'Find Next Selected', menu: 'Edit', group: true, shortcut: 'Ctrl F3', run: h.inEditor(findSelected(1)) },
    { id: 'find-previous-selected', label: 'Find Previous Selected', menu: 'Edit', shortcut: 'Ctrl Shift F3', run: h.inEditor(findSelected(-1)) },
  ];
}
