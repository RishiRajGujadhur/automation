import type { EditorView } from '@codemirror/view';
import type { RiderCommand } from './commands';
import { jsonToClasses } from '../editor/jsonClasses';
import { generateConstructor } from '../editor/generateCtor';
import { setViewOptions, viewOptions } from '../editor/viewOptions';
import { lastEditLocation, insertGuid, cyclicExpandWord, gotoMember, toggleVerbatim, reformatJson } from '../editor/textTools';
import { sortLines, reverseLines, deleteHorizontalWhiteSpace, setCase, transposeLine, transposeChars, transposeWords, cursorMatchingBracket, selectMatchingBracket, findSelected } from '../editor/textTools';

/**
 * Third batch of Visual Studio 2026 / JetBrains Rider commands (IDE-FEATURES.md, X1–X200). RiderHost registers them
 * with these helpers; each command's feature switch is in src/features.ts.
 */
export type MoreHelpers = {
  /** Runs on the active editor (with a notice when there is none) and gives it focus back. */
  inEditor: (fn: (v: EditorView, file: string) => unknown) => () => void;
  notice: (m: string) => void;
  /** Opens a file at a line / column. */
  navigate: (loc: { file: string; line?: number; column?: number }) => void;
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
    { id: 'last-edit', label: 'Go to Last Edit Location', menu: 'Navigate', shortcut: 'Ctrl Shift Backspace', run: () => { const l = lastEditLocation(); if (l) h.navigate({ file: l.file, line: l.line, column: l.column }); else h.notice('No edits yet in this session.'); } },
    { id: 'insert-guid', label: 'Insert GUID', menu: 'Code', group: true, run: h.inEditor(insertGuid) },
    { id: 'expand-word', label: 'Cyclic Expand Word', menu: 'Code', shortcut: 'Alt /', run: h.inEditor(cyclicExpandWord) },
    { id: 'overtype', label: 'Overtype Mode', menu: 'Edit', shortcut: 'Insert', checked: () => !!viewOptions().overtype, run: () => { setViewOptions({ overtype: !viewOptions().overtype }); h.notice(viewOptions().overtype ? 'Overtype: typing replaces characters (Insert to switch back).' : 'Insert mode.'); } },
    { id: 'current-line', label: 'Highlight Current Line', menu: 'View', checked: () => !viewOptions().noActiveLine, run: () => setViewOptions({ noActiveLine: !viewOptions().noActiveLine }) },
    { id: 'next-member', label: 'Next Member', menu: 'Navigate', group: true, shortcut: 'Alt PageDown', run: h.inEditor((v, f) => gotoMember(f, 1)(v)) },
    { id: 'previous-member', label: 'Previous Member', menu: 'Navigate', shortcut: 'Alt PageUp', run: h.inEditor((v, f) => gotoMember(f, -1)(v)) },
    { id: 'toggle-verbatim', label: 'To Verbatim / Regular String', menu: 'Code', run: h.inEditor((v) => { if (!toggleVerbatim(v)) h.notice('Put the caret in a C# string without \\n-style escapes.'); }) },
    { id: 'generate-ctor', label: 'Generate Constructor', menu: 'Code', run: h.inEditor((v) => { const err = generateConstructor(v); if (err) h.notice(err); }) },
    { id: 'paste-json-classes', label: 'Paste JSON as Classes', menu: 'Edit', run: h.inEditor(async (v) => { let text = ''; try { text = await navigator.clipboard.readText(); } catch { h.notice('The clipboard cannot be read here.'); return; } try { const code = jsonToClasses(text); v.dispatch(v.state.replaceSelection(code), { scrollIntoView: true, userEvent: 'input.paste' }); } catch { h.notice('The clipboard does not hold JSON.'); } }) },
    { id: 'reformat-json', label: 'Reformat JSON', menu: 'Code', group: true, run: h.inEditor((v) => { if (!reformatJson()(v)) h.notice('The file (or selection) is not valid JSON.'); }) },
    { id: 'minify-json', label: 'Minify JSON', menu: 'Code', run: h.inEditor((v) => { if (!reformatJson(true)(v)) h.notice('The file (or selection) is not valid JSON.'); }) },
    { id: 'run-context', label: 'Run Tests in Context', menu: 'Tools', group: true, shortcut: 'Ctrl R, T', run: h.inEditor((v, file) => window.dispatchEvent(new CustomEvent('tas:run-context', { detail: { file, line: v.state.doc.lineAt(v.state.selection.main.head).number, debug: false } }))) },
  ];
}
