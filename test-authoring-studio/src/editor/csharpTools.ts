import type { EditorView } from '@codemirror/view';

/** C# file tools (Visual Studio / Rider quick actions on the file level). */
const identifier = (s: string) => { const id = s.replace(/[^\w]/g, '_'); return /^\d/.test(id) ? `_${id}` : id; };

/** The namespace a file should have: the project's root namespace plus its folders (Visual Studio's Sync Namespace). */
export function expectedNamespace(file: string, projectDir: string, rootNamespace: string) {
  const rel = projectDir ? file.slice(projectDir.length + 1) : file;
  const folders = rel.split('/').slice(0, -1);
  return [...rootNamespace.split('.'), ...folders].filter(Boolean).map(identifier).join('.');
}
const NAMESPACE = /^([ \t]*namespace[ \t]+)([\w.]+)/m;
/** Changes the file's first namespace declaration; false when there is none or it already matches. */
export function setNamespace(view: EditorView, ns: string) {
  const m = NAMESPACE.exec(view.state.doc.toString());
  if (!m || m[2] === ns) return false;
  const from = m.index + m[1].length;
  view.dispatch({ changes: { from, to: from + m[2].length, insert: ns }, userEvent: 'input' });
  return true;
}
