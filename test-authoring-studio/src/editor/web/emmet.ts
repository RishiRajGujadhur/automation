import { snippet } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { extractAbbreviation, expandAbbreviation, getExpandOptions, isAbbreviationValid } from '@vscode/emmet-helper';
import { TextDocument } from 'vscode-languageserver-textdocument';

/** Expand the abbreviation directly before the caret, preserving Emmet's editable snippet fields. */
export function expandHtmlAtCursor(view: EditorView, file: string, onTab = false): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const document = TextDocument.create(file, 'html', 1, view.state.doc.toString());
  const found = extractAbbreviation(document, document.positionAt(selection.head), { type: 'markup' });
  if (!found || !isAbbreviationValid('html', found.abbreviation)) return false;
  // Tab is shared with indentation and snippet navigation. Only claim deliberate structural abbreviations.
  if (onTab && !/[>+*#.$\[\]{}^]/.test(found.abbreviation)) return false;
  const from = document.offsetAt(found.abbreviationRange.start);
  const to = document.offsetAt(found.abbreviationRange.end);
  if (from === to || to !== selection.head) return false;
  try {
    const expanded = expandAbbreviation(found.abbreviation, getExpandOptions('html', undefined, found.filter));
    snippet(expanded.replace(/\t/g, '  '))(view, null, from, to);
    view.focus();
    return true;
  } catch {
    return false;
  }
}
