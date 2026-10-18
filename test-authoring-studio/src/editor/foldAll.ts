import { foldable, foldEffect, unfoldAll, foldAll } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';

/** Collapse All / Expand All / Collapse to Definitions (Rider; VS Code Ctrl+K Ctrl+0 / Ctrl+J / Ctrl+2; Ctrl+M is CodeMirror's Tab focus mode). */
export const collapseAll = (view: EditorView) => foldAll(view);
export const expandAll = (view: EditorView) => unfoldAll(view);
const CONTAINER = /\b(namespace|class|interface|struct|record|enum)\b|^\s*Feature:|^\s*Rule:/;
/**
 * Collapse to Definitions: member bodies (methods, properties) and scenarios fold; the types, namespaces, features
 * and rules around them stay open, so the file reads as a list of its definitions.
 */
export function collapseToDefinitions(view: EditorView) {
  unfoldAll(view);
  const st = view.state;
  const effects = [];
  for (let n = 1; n <= st.doc.lines; n++) {
    const line = st.doc.line(n);
    const range = foldable(st, line.from, line.to);
    if (!range) continue;
    // The header is this line (or the line before a lone "{").
    const header = line.text.trim() === '{' && n > 1 ? st.doc.line(n - 1).text : line.text;
    if (CONTAINER.test(header)) continue;
    effects.push(foldEffect.of(range));
    // Skip what this fold hides.
    n = st.doc.lineAt(range.to).number;
  }
  if (effects.length) view.dispatch({ effects });
  return true;
}
