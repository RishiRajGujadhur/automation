import { foldService, matchBrackets } from '@codemirror/language';
import type { EditorState, Extension } from '@codemirror/state';

/** C#-style folding: a line whose last `{` (or a `{` on the next line, Allman style) opens a block folds to its match. */
export function braceRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
  const doc = state.doc;
  const line = doc.lineAt(lineStart);
  const open = line.text.lastIndexOf('{');
  const at = (pos: number) => {
    const m = matchBrackets(state, pos, 1);
    if (!m || !m.matched || !m.end) return null;
    const endLine = doc.lineAt(m.end.from);
    return endLine.number > line.number ? { from: lineEnd, to: m.end.from } : null;
  };
  if (open >= 0 && line.text.indexOf('}', open) < 0) return at(line.from + open);
  // Allman: the block opens on the next line (only "{" there); fold from this line, like Visual Studio's outlining.
  if (line.number < doc.lines && line.text.trim() && !line.text.trim().endsWith(';')) {
    const next = doc.line(line.number + 1);
    if (next.text.trim() === '{') return at(next.from + next.text.indexOf('{'));
  }
  // #region … #endregion
  if (/^\s*#region\b/.test(line.text)) {
    let depth = 0;
    for (let n = line.number + 1; n <= doc.lines; n++) {
      const t = doc.line(n).text;
      if (/^\s*#region\b/.test(t)) depth++;
      else if (/^\s*#endregion\b/.test(t)) { if (depth-- === 0) return { from: lineEnd, to: doc.line(n).to }; }
    }
  }
  return null;
}

/** Gherkin / YAML-style folding: a line folds the following lines that are indented deeper (blank lines included). */
export function indentRange(state: EditorState, lineStart: number, lineEnd: number): { from: number; to: number } | null {
  const doc = state.doc;
  const line = doc.lineAt(lineStart);
  if (!line.text.trim()) return null;
  const ind = (t: string) => /^\s*/.exec(t)![0].replace(/\t/g, '    ').length;
  const base = ind(line.text);
  let last = line.number;
  for (let n = line.number + 1; n <= doc.lines; n++) {
    const t = doc.line(n).text;
    if (!t.trim()) continue;
    if (ind(t) <= base) break;
    last = n;
  }
  return last > line.number ? { from: lineEnd, to: doc.line(last).to } : null;
}

export const braceFolding = (): Extension => foldService.of(braceRange);
export const indentFolding = (): Extension => foldService.of(indentRange);
