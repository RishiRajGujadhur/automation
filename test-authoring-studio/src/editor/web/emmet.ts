import { snippet } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { extractAbbreviation, expandAbbreviation, getExpandOptions, isAbbreviationValid } from '@vscode/emmet-helper';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { defineSetting } from '../../vscode/settings';

export const emmetSettings = {
  tab: defineSetting<boolean>({ key: 'emmet.triggerExpansionOnTab', category: 'Text Editor ▸ Emmet', title: 'Expand on Tab', type: 'boolean', default: true, description: 'Expand a recognized Emmet abbreviation with Tab. When disabled, Tab follows the normal indentation and snippet behavior.' }),
};

/** Expand the abbreviation directly before the caret, preserving Emmet's editable snippet fields. */
function expandAtCursor(view: EditorView, file: string, syntax: 'html' | 'css' | 'jsx', onTab = false): boolean {
  if (onTab && !emmetSettings.tab()) return false;
  const selection = view.state.selection.main;
  if (!selection.empty) return false;
  const document = TextDocument.create(file, syntax, 1, view.state.doc.toString());
  const found = extractAbbreviation(document, document.positionAt(selection.head), { type: syntax === 'css' ? 'stylesheet' : 'markup' });
  if (!found || !isAbbreviationValid(syntax, found.abbreviation)) return false;
  // Tab is shared with indentation and snippet navigation. Only claim deliberate structural abbreviations.
  if (onTab && (syntax === 'html' || syntax === 'jsx') && !/[>+*#.$\[\]{}^]/.test(found.abbreviation)) return false;
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
export const expandJsxAtCursor = (view: EditorView, file: string, onTab = false) => expandAtCursor(view, file, 'jsx', onTab);

/** Emmet's `text` option places existing content in the innermost generated element. */
function wrapSelection(view: EditorView, abbreviation: string, syntax: 'html' | 'jsx'): boolean {
  const selection = view.state.selection.main;
  if (selection.empty || !isAbbreviationValid(syntax, abbreviation)) return false;
  try {
    const config = getExpandOptions(syntax);
    config.text = view.state.sliceDoc(selection.from, selection.to);
    const expanded = expandAbbreviation(abbreviation, config);
    snippet(expanded.replace(/\t/g, '  '))(view, null, selection.from, selection.to);
    view.focus();
    return true;
  } catch {
    return false;
  }
}

export const wrapHtmlSelection = (view: EditorView, abbreviation: string) => wrapSelection(view, abbreviation, 'html');
export const wrapJsxSelection = (view: EditorView, abbreviation: string) => wrapSelection(view, abbreviation, 'jsx');

/** Select the next enclosing HTML element, moving outward on repeated invocation. */
export function balanceHtmlOutward(view: EditorView): boolean {
  const selection = view.state.selection.main;
  let node = syntaxTree(view.state).resolveInner(selection.head, -1);
  while (node) {
    if (node.name === 'Element' && node.from <= selection.from && node.to >= selection.to
      && (node.from !== selection.from || node.to !== selection.to)) {
      view.dispatch({ selection: { anchor: node.from, head: node.to }, scrollIntoView: true });
      view.focus();
      return true;
    }
    node = node.parent!;
  }
  return false;
}
