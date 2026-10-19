import type { EditorView } from '@codemirror/view';
import type { RiderCommand } from './commands';
import { unsavedFiles } from '../editor/autosave';
import { getTabs, closeTab } from '../files/tabs';
import { reopenClosed } from '../files/tabs';
import { resetWindowLayout } from './layoutStore';
import { exportBreakpoints, importBreakpoints } from '../debug/store';
import { copyText } from '../ui';
import { specAt, toggleBreakpoint, updateBreakpoint, currentFrame, getSnapshot } from '../debug/store';
import { lastTestRun, runTests } from '../testing/store';
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
    { id: 'debug-context', label: 'Debug Tests in Context', menu: 'Tools', shortcut: 'Ctrl R, Ctrl T', run: h.inEditor((v, file) => window.dispatchEvent(new CustomEvent('tas:run-context', { detail: { file, line: v.state.doc.lineAt(v.state.selection.main.head).number, debug: true } }))) },
    { id: 'repeat-run', label: 'Repeat Last Test Run', menu: 'Tools', shortcut: 'Ctrl R, L', run: () => { const l = lastTestRun(); if (!l) { h.notice('No test run yet in this session.'); return; } runTests(l.tests, l.configuration, l.coverage).then(() => h.notice('Running the last tests again.'), (e) => h.notice((e as Error).message)); } },
    { id: 'toggle-bp-enabled', label: 'Enable / Disable Breakpoint', menu: 'Tools', group: true, shortcut: 'Ctrl F9', run: h.inEditor((v, file) => { const line = v.state.doc.lineAt(v.state.selection.main.head).number; const b = specAt(file, line); if (!b) { toggleBreakpoint(file, line); updateBreakpoint(file, line, { enabled: false }); h.notice('Disabled breakpoint set.'); return; } updateBreakpoint(file, line, { enabled: b.enabled === false }); h.notice(b.enabled === false ? 'Breakpoint enabled.' : 'Breakpoint disabled.'); }) },
    { id: 'show-next-statement', label: 'Show Next Statement', menu: 'Tools', shortcut: 'Alt Num *', run: () => { const f = currentFrame(); if (!f?.file) { h.notice('The debugger is not paused in your code.'); return; } h.navigate({ file: f.file, line: f.line, column: f.column }); } },
    { id: 'copy-call-stack', label: 'Copy Call Stack', menu: 'Tools', run: () => { const s = getSnapshot().state; if (s.status !== 'paused' || !s.frames.length) { h.notice('The call stack is shown while the debugger is paused.'); return; } const text = s.frames.map((f) => `${f.name}${f.file ? ` in ${f.file}:line ${f.line}` : ''}`).join('\n'); void copyText(text).then((ok) => h.notice(ok ? `Copied ${s.frames.length} frames.` : 'Clipboard unavailable.')); } },
    { id: 'export-breakpoints', label: 'Export Breakpoints…', menu: 'Tools', run: () => { const blob = new Blob([exportBreakpoints()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'breakpoints.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); h.notice('Breakpoints exported to breakpoints.json.'); } },
    { id: 'import-breakpoints', label: 'Import Breakpoints…', menu: 'Tools', run: () => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json'; input.onchange = () => { const f = input.files?.[0]; if (!f) return; f.text().then((t) => { try { h.notice(`Imported ${importBreakpoints(t)} breakpoints.`); } catch (e) { h.notice((e as Error).message); } }); }; input.click(); } },
    { id: 'reset-layout', label: 'Reset Window Layout', menu: 'View', run: () => { if (window.confirm('Reset the panels, side bar and tool windows to their defaults?')) resetWindowLayout(); } },
    { id: 'reopen-tab', label: 'Reopen Closed Tab', menu: 'View', shortcut: 'Ctrl Shift T', run: () => { const f = reopenClosed(); if (f) h.navigate({ file: f }); else h.notice('No closed tabs to reopen.'); } },
    { id: 'close-unmodified', label: 'Close Unmodified Tabs', menu: 'View', run: () => { const t = getTabs(); const dirty = new Set(unsavedFiles()); const close = t.tabs.filter((x) => !x.pinned && !dirty.has(x.file) && x.file !== t.active).map((x) => x.file); close.forEach(closeTab); h.notice(close.length ? `Closed ${close.length} unmodified tab${close.length === 1 ? '' : 's'}.` : 'No unmodified tabs to close.'); } },
    { id: 'multi-row-tabs', label: 'Tabs in Multiple Rows', menu: 'View', checked: () => !!viewOptions().multiRowTabs, run: () => setViewOptions({ multiRowTabs: !viewOptions().multiRowTabs }) },
  ];
}
