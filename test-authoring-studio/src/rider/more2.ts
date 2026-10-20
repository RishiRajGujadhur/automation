import type { RiderCommand } from './commands';
import type { MoreHelpers } from './more';
import { urlEncode, urlDecode, base64Encode, base64Decode, escapeString, unescapeString, htmlEncode, htmlDecode, stepNumber, insertSequence, toggleQuotes, joinWith, splitAt, alignAssignments, swapSelections, countOccurrences, trimLines, stamp, insertText, LOREM, shuffleLines } from '../editor/textTools2';

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
  ];
}
