import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { tableDeleteEmptyRows } from '../editor/gherkinTools';
import { urlEncode, urlDecode, base64Encode, base64Decode, escapeString, unescapeString, htmlEncode, htmlDecode, stepNumber, insertSequence, toggleQuotes, joinWith, splitAt, alignAssignments, swapSelections, countOccurrences, trimLines, stamp, insertText, LOREM, shuffleLines, reformatXml, minifyXml, jsonEscape, jsonUnescape, numberLines, mapDoc, toFileScopedNamespace, toBlockScopedNamespace, removeRegions, toRawString, toggleTask, formatMarkdownTable, tableOfContents, MARKDOWN_TABLE, removeComments, concatToInterpolationCmd } from '../editor/textTools2';

/**
 * Fourth batch of Visual Studio 2026 / JetBrains Rider commands (IDE-FEATURES-4.md, Y1–Y100). RiderHost registers
 * them with the same helpers as the third batch; each command's feature switch is in src/features.ts.
 */
export function moreCommands2(h: MoreHelpers): RiderCommand[] {
  return [
    { id: 'url-encode', label: 'URL Encode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => urlEncode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'url-decode', label: 'URL Decode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => urlDecode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'base64-encode', label: 'Base64 Encode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => base64Encode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'base64-decode', label: 'Base64 Decode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => base64Decode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'escape-string', label: 'Escape C# String', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => escapeString(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'unescape-string', label: 'Unescape C# String', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => unescapeString(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'html-encode', label: 'HTML Encode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => htmlEncode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'html-decode', label: 'HTML Decode', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => htmlDecode(v) || h.notice('Select text (or put the caret on a word) to convert.')) },
    { id: 'increment-number', label: 'Increment Number', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => stepNumber(1)(v) || h.notice('Put the caret on a number.')) },
    { id: 'decrement-number', label: 'Decrement Number', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => stepNumber(-1)(v) || h.notice('Put the caret on a number.')) },
    { id: 'insert-sequence', label: 'Insert Sequence (1, 2, 3…)', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => insertSequence(v) || h.notice('Add carets first (Alt+click or Alt+J), then insert the numbers.')) },
    { id: 'toggle-quotes', label: 'Toggle Quotes', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => toggleQuotes(v) || h.notice('Put the caret in a quoted string.')) },
    { id: 'join-with', label: 'Join Lines with Separator…', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => { if (v.state.selection.main.empty) { h.notice('Select the lines to join.'); return; } const sep = window.prompt('Join the selected lines with:', ', '); if (sep !== null) joinWith(sep)(v); }) },
    { id: 'split-at', label: 'Split at Separator…', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => { const sep = window.prompt('Split the line (or selected lines) at:', ','); if (sep) splitAt(sep)(v); }) },
    { id: 'align-assignments', label: 'Align Assignments', menu: 'Edit', shortcut: 'Ctrl Alt ]', run: h.inEditor((v) => alignAssignments(v) || h.notice('Put the caret on an assignment (or select the lines to align).')) },
    { id: 'swap-selections', label: 'Swap Selections', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => swapSelections(v) || h.notice('Select exactly two pieces of text (Alt+drag or Ctrl+Alt+click) to swap.')) },
    { id: 'count-occurrences', label: 'Count Occurrences', menu: 'Edit', run: h.inEditor((v) => { const c = countOccurrences(v.state); h.notice(c ? `"${c.needle.length > 40 ? `${c.needle.slice(0, 37)}…` : c.needle}": ${c.count} occurrence${c.count === 1 ? '' : 's'} on ${c.lines} line${c.lines === 1 ? '' : 's'}.` : 'Select text (or put the caret on a word) to count.'); }) },
    { id: 'trim-lines', label: 'Trim Lines', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => trimLines(v) || h.notice('The lines have no leading or trailing white space.')) },
    { id: 'insert-date', label: 'Insert Date and Time', menu: 'Code', run: h.inEditor(insertText(() => stamp())) },
    { id: 'insert-lorem', label: 'Insert Lorem Ipsum', menu: 'Code', run: h.inEditor(insertText(() => LOREM)) },
    { id: 'shuffle-lines', label: 'Shuffle Lines', menu: 'Edit', run: h.inEditor((v) => shuffleLines()(v) || h.notice('Select the lines to shuffle.')) },
    { id: 'reformat-xml', label: 'Reformat XML', menu: 'Code', run: h.inEditor((v) => reformatXml(v) || h.notice('The file (or selection) is not well-formed XML, or is already formatted.')) },
    { id: 'minify-xml', label: 'Minify XML', menu: 'Code', run: h.inEditor((v) => minifyXml(v) || h.notice('The file (or selection) is not well-formed XML, or is already minified.')) },
    { id: 'json-escape', label: 'Escape JSON String', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => jsonEscape(v) || h.notice('Select text (or put the caret on a line) to convert.')) },
    { id: 'json-unescape', label: 'Unescape JSON String', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => jsonUnescape(v) || h.notice('Select text (or put the caret on a line) to convert.')) },
    { id: 'number-lines', label: 'Number Lines', menu: 'Edit', submenu: 'Convert', run: h.inEditor((v) => numberLines(v) || h.notice('Select the lines to number.')) },
    { id: 'file-scoped-namespace', label: 'Convert to File-Scoped Namespace', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => mapDoc(toFileScopedNamespace)(v) || h.notice('The file needs exactly one block-scoped namespace.')) },
    { id: 'block-scoped-namespace', label: 'Convert to Block-Scoped Namespace', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => mapDoc(toBlockScopedNamespace)(v) || h.notice('The file has no file-scoped namespace (namespace X;).')) },
    { id: 'remove-regions', label: 'Remove #region Directives', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => mapDoc(removeRegions)(v) || h.notice('The file has no #region directives.')) },
    { id: 'raw-string', label: 'Convert to Raw String Literal', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => toRawString(v) || h.notice('Put the caret in a regular "…" string (one that does not start or end with a quote).')) },
    { id: 'md-toggle-task', label: 'Toggle Task', menu: 'Code', submenu: 'Markdown', run: h.inEditor((v) => toggleTask(v) || h.notice('Put the caret on a line.')) },
    { id: 'md-format-table', label: 'Format Table', menu: 'Code', submenu: 'Markdown', run: h.inEditor((v) => formatMarkdownTable(v) || h.notice('Put the caret in a Markdown table.')) },
    { id: 'md-toc', label: 'Insert Table of Contents', menu: 'Code', submenu: 'Markdown', run: h.inEditor((v) => { const toc = tableOfContents(v.state.doc.toString()); if (!toc) { h.notice('The file has no headings.'); return; } insertText(() => `${toc}\n`)(v); }) },
    { id: 'md-insert-table', label: 'Insert Table', menu: 'Code', submenu: 'Markdown', run: h.inEditor((v) => { const line = v.state.doc.lineAt(v.state.selection.main.head); insertText(() => (line.text.trim() ? '\n' : '') + MARKDOWN_TABLE)(v); }) },
    { id: 'remove-comments', label: 'Remove Comments', menu: 'Code', run: h.inEditor((v, file) => { const gherkinLike = /\.(feature|ya?ml|ps1|sh|py|toml|ini)$/i.test(file); const s = v.state.selection.main; const from = s.empty ? 0 : v.state.doc.lineAt(s.from).from, to = s.empty ? v.state.doc.length : v.state.doc.lineAt(s.to).to; const next = removeComments(v.state.sliceDoc(from, to), gherkinLike ? '#' : '//', gherkinLike ? null : ['/*', '*/']); if (next === null) { h.notice('No comments to remove.'); return; } v.dispatch({ changes: { from, to, insert: next }, userEvent: 'input.convert' }); }) },
    { id: 'to-interpolation', label: 'Convert to Interpolated String', menu: 'Code', submenu: 'C#', run: h.inEditor((v) => concatToInterpolationCmd(v) || h.notice('Select a string concatenation ("a" + b + "c").')) },
    { id: 'table-delete-empty', label: 'Table: Delete Empty Rows', menu: 'Code', submenu: 'Gherkin', run: h.inEditor((v) => tableDeleteEmptyRows(v) || h.notice('The table has no empty rows (or the caret is not in a table).')) },
  ];
}
