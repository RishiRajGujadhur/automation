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

/** The first type declared in a C# file (comments and strings aside). */
export function firstTypeName(source: string) {
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$|@?"(?:[^"\\]|\\.|"")*"/gm, '');
  return /\b(?:class|interface|struct|record|enum)\s+(@?\w+)/.exec(code)?.[1].replace(/^@/, '');
}

/**
 * Toggle Ignore Test (Rider's unit test "Ignore"): [Ignore("…")] on the NUnit / MSTest method at the caret, or off again.
 * The method is the first signature at or above the caret; its attributes are the [..] lines just above it.
 */
export function toggleIgnore(view: EditorView, reason = 'Ignored') {
  const { state } = view;
  const doc = state.doc;
  let n = doc.lineAt(state.selection.main.head).number;
  const sig = /^\s*(?:(?:public|private|protected|internal|static|async|virtual|override)\s+)+[\w<>\[\],.? ]+\s+\w+\s*\(/;
  while (n >= 1 && !sig.test(doc.line(n).text)) n--;
  if (n < 1) return false;
  let first = n;
  while (first > 1 && /^\s*\[.*\]\s*$/.test(doc.line(first - 1).text)) first--;
  for (let k = first; k < n; k++) {
    const line = doc.line(k);
    if (/^\s*\[\s*Ignore\b/.test(line.text)) { view.dispatch({ changes: { from: line.from, to: Math.min(doc.length, line.to + state.lineBreak.length) }, userEvent: 'delete' }); return true; }
  }
  if (first === n) return false; // no attributes: not a test method
  const line = doc.line(n);
  view.dispatch({ changes: { from: line.from, insert: `${/^\s*/.exec(line.text)![0]}[Ignore("${reason}")]${state.lineBreak}` }, userEvent: 'input' });
  return true;
}
