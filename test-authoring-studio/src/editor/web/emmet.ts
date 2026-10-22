import { snippet } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';
import { extractAbbreviation, expandAbbreviation, getExpandOptions, isAbbreviationValid } from '@vscode/emmet-helper';
import { TextDocument } from 'vscode-languageserver-textdocument';

/** Expand the abbreviation directly before the caret, preserving Emmet's editable snippet fields. */
function expandAtCursor(view: EditorView, file: string, syntax: 'html' | 'css' | 'jsx', onTab = false): boolean {
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const document = TextDocument.create(file, syntax, 1, view.state.doc.toString());
  const found = extractAbbreviation(document, document.positionAt(selection.head), { type: syntax === 'css' ? 'stylesheet' : 'markup' });
  if (!found || !isAbbreviationValid(syntax, found.abbreviation)) return false;
  // Tab is shared with indentation and snippet navigation. Only claim deliberate structural abbreviations.
  if (onTab && syntax === 'html' && !/[>+*#.$\[\]{}^]/.test(found.abbreviation)) return false;
  if (onTab && syntax === 'css' && !/^[a-z-]+-?\d/i.test(found.abbreviation)) return false;
  const from = document.offsetAt(found.abbreviationRange.start);
  const to = document.offsetAt(found.abbreviationRange.end);
  if (from === to || to !== selection.head) return false;
  try {
    const expanded = expandAbbreviation(found.abbreviation, getExpandOptions(syntax, undefined, found.filter));
    snippet(expanded.replace(/\t/g, '  '))(view, null, from, to);
    view.focus();
    return true;
  } catch {
    return false;
  }
}

export const expandHtmlAtCursor = (view: EditorView, file: string, onTab = false) => expandAtCursor(view, file, 'html', onTab);
export const expandCssAtCursor = (view: EditorView, file: string, onTab = false) => expandAtCursor(view, file, 'css', onTab);
export const expandJsxAtCursor = (view: EditorView, file: string) => expandAtCursor(view, file, 'jsx');
