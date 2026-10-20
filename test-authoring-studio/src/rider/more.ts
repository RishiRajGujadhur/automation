import type { EditorView } from '@codemirror/view';
import type { RiderCommand } from './commands';
import { quickInfoAtCaret } from '../editor/csharp';
import { isBrowser } from '../files/provider';
import { GIT_CHANGED_EVENT } from '../editor/events';
import { buildDiagnostics, stepError } from '../build/store';
import { api } from '../api';
import { expectedNamespace, setNamespace, firstTypeName } from '../editor/csharpTools';
import { renamePath } from '../files/provider';
import { movedPath } from '../files/tabs';
import { DEFAULT_TODO_TOKENS } from '../editor/todoHighlight';
import { copyText as copyFilterText } from '../ui';
import { cycleStepKeyword, scenarioToOutline, tableInsertRow, tableAddColumn, tableDeleteColumn, tableSortByColumn, testFilter, selectScenario, extractExamplesParameter, outlineToScenario, duplicateScenario, moveScenario, extractBackground, addExamplesTable, toggleTag, toggleScenarioComment, pasteAsTable, tableCsv } from '../editor/gherkinTools';
import { unsavedFiles } from '../editor/autosave';
import { getTabs, closeTab } from '../files/tabs';
import { reopenClosed } from '../files/tabs';
import { resetWindowLayout } from './layoutStore';
import { exportBreakpoints, importBreakpoints } from '../debug/store';
import { copyText } from '../ui';
import { specAt, toggleBreakpoint, updateBreakpoint, currentFrame, getSnapshot, setWatches } from '../debug/store';
import { lastTestRun, runTests, runUntilFailure, discoverTests } from '../testing/store';
import { jsonToClasses } from '../editor/jsonClasses';
import { generateConstructor } from '../editor/generateCtor';
import { setViewOptions, viewOptions } from '../editor/viewOptions';
import { lastEditLocation, insertGuid, cyclicExpandWord, gotoMember, toggleVerbatim, reformatJson, stripTrailingSpaces, splitString, tabify, untabify, codeBlockStart, codeBlockEnd } from '../editor/textTools';
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

/** The Error List row Next / Previous Error last went to. */
let errorAt = -1;
export function moreCommands(h: MoreHelpers): RiderCommand[] {
  const goError = (step: 1 | -1) => { const list = buildDiagnostics(); errorAt = stepError(list, errorAt, step); const e = list[errorAt]; if (!e?.file) { h.notice('No build errors or warnings with a location (build first: Ctrl+Shift+B).'); return; } h.navigate({ file: e.file, line: e.line, column: e.column ?? 1 }); h.notice(`${e.code}: ${e.message}`); };
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
    { id: 'cycle-step-keyword', label: 'Cycle Step Keyword', menu: 'Code', group: true, submenu: 'Gherkin', run: h.inEditor(cycleStepKeyword) },
    { id: 'scenario-to-outline', label: 'Convert Scenario to Outline', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => scenarioToOutline(v) || (h.notice('Put the caret in a Scenario whose steps have "quoted" values.'), false)) },
    { id: 'table-insert-row', label: 'Table: Insert Row', menu: 'Code', group: true, submenu: 'Gherkin', run: h.inEditor(tableInsertRow) },
    { id: 'table-add-column', label: 'Table: Add Column', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(tableAddColumn) },
    { id: 'table-delete-column', label: 'Table: Delete Column', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(tableDeleteColumn) },
    { id: 'table-sort', label: 'Table: Sort by Column', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(tableSortByColumn) },
    { id: 'copy-test-filter', label: 'Copy Test Filter', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => { const f = testFilter(v.state, v.state.doc.lineAt(v.state.selection.main.head).number); if (!f) { h.notice('Not a feature file.'); return; } void copyFilterText(f).then((ok) => h.notice(ok ? `Copied: ${f}` : 'Clipboard unavailable.')); }) },
    { id: 'select-scenario', label: 'Select Scenario', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(selectScenario) },
    { id: 'bracket-colors', label: 'Bracket Pair Colorization', menu: 'View', checked: () => !viewOptions().noBracketColors, run: () => setViewOptions({ noBracketColors: !viewOptions().noBracketColors }) },
    { id: 'strip-trailing', label: 'Strip Trailing Spaces', menu: 'Edit', run: h.inEditor((v) => stripTrailingSpaces(v) || h.notice('No trailing spaces.')) },
    { id: 'todo-tokens', label: 'TODO Patterns…', menu: 'Tools', run: () => { const now = (viewOptions().todoTokens ?? DEFAULT_TODO_TOKENS).join(', '); const next = window.prompt('Comment keywords to highlight (comma-separated; empty restores the defaults):', now); if (next === null) return; const tokens = next.split(',').map((t) => t.trim()).filter((t) => /^\w+$/.test(t)); setViewOptions({ todoTokens: tokens.length ? tokens : undefined }); h.notice(`TODO patterns: ${(tokens.length ? tokens : DEFAULT_TODO_TOKENS).join(', ')}`); } },
    { id: 'right-margin', label: 'Right Margin Guide…', menu: 'View', run: () => { const v = window.prompt('Show a guide after column (0 hides it):', String(viewOptions().rightMargin ?? 120)); if (v === null) return; const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 400) { h.notice('Enter a column between 0 and 400.'); return; } setViewOptions({ rightMargin: n }); } },
    { id: 'run-until-failure', label: 'Run Until Failure…', menu: 'Tools', run: () => { if (!lastTestRun()) { h.notice('Run some tests first: Run Until Failure repeats the last test run.'); return; } const v = window.prompt('Repeat the last test run until a test fails, at most this many times:', '10'); const max = Number(v); if (!v || !Number.isInteger(max) || max < 1 || max > 500) return; void runUntilFailure(max, (i) => h.notice(`Run Until Failure: run ${i} of ${max}…`)).then((r) => { if (r) h.notice(r.failed ? `A test failed on run ${r.runs}.` : `All ${r.runs} runs passed.`); }, (e) => h.notice((e as Error).message)); } },
    { id: 'run-file-tests', label: 'Run All Tests in File', menu: 'Tools', run: () => { const f = getTabs().active; if (!f) { h.notice('Open a test file first.'); return; } void discoverTests().then(({ tests }) => { const ts = tests.filter((t) => t.file === f); if (!ts.length) { h.notice(`No tests in ${f.split('/').pop()}.`); return; } h.notice(`Running ${ts.length} test${ts.length === 1 ? '' : 's'} in ${f.split('/').pop()}…`); return runTests(ts); }).catch((e) => h.notice((e as Error).message)); } },
    { id: 'sync-namespace', label: 'Sync Namespace with Folder', menu: 'Code', run: h.inEditor((v, file) => { if (!file.endsWith('.cs')) { h.notice('Open a C# file first.'); return; } void api<{ projects: { file: string; name: string; dir: string }[] }>('/solution').then((s) => { const owner = s.projects.filter((p) => p.file.endsWith('.csproj') && (p.dir === '' || file.startsWith(`${p.dir}/`))).sort((a, b) => b.dir.length - a.dir.length)[0]; if (!owner) { h.notice('This file belongs to no project.'); return; } const ns = expectedNamespace(file, owner.dir, owner.name); h.notice(setNamespace(v, ns) ? `Namespace changed to ${ns}.` : `The namespace already is ${ns} (or there is no namespace declaration).`); }, (e) => h.notice((e as Error).message)); }) },
    { id: 'rename-file-to-type', label: 'Rename File to Match Type', menu: 'Code', run: h.inEditor((v, file) => { const type = file.endsWith('.cs') ? firstTypeName(v.state.doc.toString()) : undefined; if (!type) { h.notice('Open a C# file that declares a type.'); return; } const to = `${file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : ''}${type}.cs`; if (to === file) { h.notice(`${file.split('/').pop()} already matches ${type}.`); return; } if (unsavedFiles().includes(file)) { h.notice('Save the file first.'); return; } void renamePath(file, to).then(() => { movedPath(file, to); h.notice(`Renamed to ${to.split('/').pop()}.`); }, (e) => h.notice((e as Error).message)); }) },
    { id: 'split-string', label: 'Split String', menu: 'Code', run: h.inEditor((v) => splitString(v) || h.notice('Put the caret inside a string literal.')) },
    { id: 'tabify', label: 'Tabify Selected Lines', menu: 'Edit', run: h.inEditor((v) => tabify(v) || h.notice('Nothing to tabify.')) },
    { id: 'untabify', label: 'Untabify Selected Lines', menu: 'Edit', run: h.inEditor((v) => untabify(v) || h.notice('Nothing to untabify.')) },
    { id: 'block-start', label: 'Move Caret to Code Block Start', menu: 'Navigate', run: h.inEditor(codeBlockStart) },
    { id: 'block-end', label: 'Move Caret to Code Block End', menu: 'Navigate', run: h.inEditor(codeBlockEnd) },
    { id: 'extract-examples-param', label: 'Extract Examples Parameter…', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => { if (v.state.selection.main.empty) { h.notice('Select the value in a Scenario Outline step first.'); return; } const name = window.prompt('Parameter name:', 'value')?.trim(); if (!name) return; if (!extractExamplesParameter(name)(v)) h.notice('Select a value on one step of a Scenario Outline with Examples (the name: letters, digits, - or _).'); }) },
    { id: 'outline-to-scenario', label: 'Convert Outline to Scenario', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => outlineToScenario(v) || h.notice('Put the caret in a Scenario Outline whose Examples have exactly one row.')) },
    { id: 'duplicate-scenario', label: 'Duplicate Scenario', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => duplicateScenario(v) || h.notice('Put the caret in a scenario.')) },
    { id: 'move-scenario-up', label: 'Move Scenario Up', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(moveScenario(-1)) },
    { id: 'move-scenario-down', label: 'Move Scenario Down', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(moveScenario(1)) },
    { id: 'extract-background', label: 'Extract Background', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(extractBackground) },
    { id: 'add-examples', label: 'Add Examples Table', menu: 'Code', submenu: 'Gherkin', run: h.inEditor(addExamplesTable) },
    { id: 'toggle-tag', label: 'Toggle Tag…', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => { const tag = window.prompt('Tag to add to (or remove from) the scenario:', '@wip')?.trim(); if (!tag) return; if (!toggleTag(tag)(v)) h.notice('Put the caret in a scenario (a tag is @ and a word without spaces).'); }) },
    { id: 'next-error', label: 'Next Error', menu: 'Navigate', group: true, run: () => goError(1) },
    { id: 'previous-error', label: 'Previous Error', menu: 'Navigate', run: () => goError(-1) },
    { id: 'add-watch', label: 'Add Watch', menu: 'Tools', run: h.inEditor((v) => { const s = v.state.selection.main; const word = v.state.wordAt(s.head) ?? v.state.wordAt(Math.max(0, s.head - 1)); const expr = (s.empty ? (word ? v.state.sliceDoc(word.from, word.to) : '') : v.state.sliceDoc(s.from, s.to)).trim(); if (!expr) { h.notice('Select an expression (or put the caret on a name) first.'); return; } const now = getSnapshot().watches; if (!now.includes(expr)) setWatches([...now, expr]); h.notice(`Watching ${expr}.`); }) },
    { id: 'undo-commit', label: 'Undo Last Commit…', menu: 'Tools', run: () => { if (!window.confirm('Undo the last commit? Its changes stay staged; nothing is lost. (Not for commits already pushed.)')) return; void api<{ output: string }>('/git/undo-commit', {}).then((r) => { window.dispatchEvent(new Event(GIT_CHANGED_EVENT)); h.notice(r.output); }, (e) => h.notice((e as Error).message)); } },
    { id: 'save-as', label: 'Save As…', menu: 'Edit', group: true, run: h.inEditor((v, file) => { if (isBrowser()) { h.notice('Save As needs a folder indexed by the studio server.'); return; } const to = window.prompt('Save a copy as (repository path):', file)?.trim().replace(/\\/g, '/'); if (!to || to === file) return; void api('/file/create', { file: to, source: v.state.doc.toString() }).then(() => { h.notice(`Saved as ${to}.`); window.dispatchEvent(new CustomEvent('tas:rescan', { detail: () => h.navigate({ file: to }) })); }, (e) => h.notice((e as Error).message)); }) },
    { id: 'comment-scenario', label: 'Comment / Uncomment Scenario', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => toggleScenarioComment(v) || h.notice('Put the caret in a scenario.')) },
    { id: 'quick-info', label: 'Quick Info', menu: 'Edit', shortcut: 'Ctrl K, Ctrl I', run: h.inEditor((v, file) => { if (!file.endsWith('.cs')) { h.notice('Quick Info works in C# files.'); return; } void quickInfoAtCaret(v, file).then((ok) => { if (!ok) h.notice('No information for the symbol at the caret.'); }); }) },
    { id: 'paste-table', label: 'Paste as Gherkin Table', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => { void navigator.clipboard.readText().then((t) => { if (!pasteAsTable(t)(v)) h.notice('The clipboard has no rows to paste (copy cells from a spreadsheet or CSV).'); }, () => h.notice('Clipboard unavailable.')); }) },
    { id: 'copy-table-csv', label: 'Copy Table as CSV', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => { const csv = tableCsv(v.state); if (!csv) { h.notice('Put the caret in a table.'); return; } void copyText(csv).then((ok) => h.notice(ok ? `Copied ${csv.split('\n').length} rows as CSV.` : 'Clipboard unavailable.')); }) },
    { id: 'scroll-marks', label: 'Scroll Bar Annotations', menu: 'View', checked: () => !viewOptions().noScrollMarks, run: () => setViewOptions({ noScrollMarks: !viewOptions().noScrollMarks }) },
    { id: 'report-problem', label: 'Report a Problem…', menu: 'Help', group: true, run: () => { const kind = (window as unknown as { desktop?: unknown }).desktop ? 'desktop app' : 'web app'; const body = `**What happened**\n\n\n**Steps to reproduce**\n1. \n\n**Expected**\n\n\n_TestAuthoring Studio (${kind})_`; window.open(`https://github.com/RishiRajGujadhur/automation/issues/new?title=${encodeURIComponent('Problem: ')}&body=${encodeURIComponent(body)}`, '_blank', 'noopener'); } },
    { id: 'pinned-row', label: 'Show Pinned Tabs in a Separate Row', menu: 'View', checked: () => !!viewOptions().pinnedRow, run: () => setViewOptions({ pinnedRow: !viewOptions().pinnedRow }) },
  ];
}
