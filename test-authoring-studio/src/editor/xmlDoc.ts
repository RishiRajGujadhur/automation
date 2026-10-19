import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

/**
 * XML documentation comments (Visual Studio): typing /// above a member writes the <summary> block, with a <param>
 * per parameter and <returns> for non-void methods, and puts the caret in the summary.
 */
export function docCommentFor(declaration: string, indent: string) {
  const sig = /\(([^)]*)\)/.exec(declaration);
  const params = sig ? sig[1].split(',').map((p) => p.trim().replace(/=.*$/, '').trim().split(/\s+/).pop()!).filter((p) => p && /^@?\w+$/.test(p)) : [];
  const isMethod = !!sig && !/\b(class|record|struct|interface)\b/.test(declaration);
  const returns = isMethod && !/\b(void|Task)\s+\w+\s*\(/.test(declaration) && !/^\s*(public|private|protected|internal)?\s*\w+\s*\(/.test(declaration.replace(/\b(static|async)\b/g, ''));
  const lines = [`${indent}/// <summary>`, `${indent}/// `, `${indent}/// </summary>`, ...params.map((p) => `${indent}/// <param name="${p.replace(/^@/, '')}"></param>`), ...(returns ? [`${indent}/// <returns></returns>`] : [])];
  return { text: lines.join('\n'), caret: lines[0].length + 1 + lines[1].length };
}
export const xmlDocComments = EditorView.inputHandler.of((view, from, to, text) => {
  if (text !== '/' || from !== to) return false;
  const line = view.state.doc.lineAt(from);
  const before = line.text.slice(0, from - line.from);
  if (!/^\s*\/\/$/.test(before) || line.text.slice(from - line.from).trim()) return false;
  // The next code line must be a declaration (not already documented, not a statement).
  let n = line.number + 1;
  while (n <= view.state.doc.lines && !view.state.doc.line(n).text.trim()) n++;
  if (n > view.state.doc.lines) return false;
  let decl = view.state.doc.line(n).text;
  while (/^\s*\[/.test(decl) && n < view.state.doc.lines) decl = view.state.doc.line(++n).text; // attributes
  if (!/^\s*(public|private|protected|internal|static|async|override|virtual|abstract|sealed|partial|readonly|class|record|struct|interface|enum)\b/.test(decl)) return false;
  const indent = /^\s*/.exec(before)![0];
  const { text: doc, caret } = docCommentFor(decl, indent);
  view.dispatch({ changes: { from: line.from, to: line.to, insert: doc }, selection: EditorSelection.cursor(line.from + caret), userEvent: 'input.doc' });
  return true;
});
