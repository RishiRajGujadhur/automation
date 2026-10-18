import { EditorSelection } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

const HEADER = /^(if|else if|else|for|foreach|while|switch|try|catch|finally|using|lock|do|namespace|class|interface|struct|record|enum)\b|^(public|private|protected|internal|static|async|override|virtual|abstract)\b.*\)$/;

/** Unclosed ( [ in a line (strings and char literals skipped). */
function missingClosers(text: string) {
  const stack: string[] = [];
  const s = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  for (const c of s) {
    if (c === '(' || c === '[') stack.push(c === '(' ? ')' : ']');
    else if ((c === ')' || c === ']') && stack.at(-1) === c) stack.pop();
  }
  return stack.reverse().join('');
}

/**
 * Complete Current Statement (Rider, Ctrl+Shift+Enter): closes open parentheses, then adds the ";" or the { } block
 * the line needs (in the file's brace style) and puts the caret where the next code goes. In Gherkin: a new step line.
 */
export function completeStatement(file: string) {
  return (view: EditorView) => {
    const st = view.state;
    const line = st.doc.lineAt(st.selection.main.head);
    const indent = /^\s*/.exec(line.text)![0];
    const nl = st.lineBreak;
    if (!file.endsWith('.cs')) {
      const insert = nl + indent;
      view.dispatch({ changes: { from: line.to, insert }, selection: EditorSelection.cursor(line.to + insert.length), scrollIntoView: true, userEvent: 'input.complete' });
      return true;
    }
    let text = line.text.trimEnd();
    const trimmed = text.trim();
    if (!trimmed) return false;
    text += missingClosers(text);
    const unit = indent.includes('\t') ? '\t' : '    ';
    // Allman (Visual Studio's default) unless the file puts braces at the end of lines.
    const doc = st.doc.toString();
    const allman = (doc.match(/^\s*\{\s*$/gm)?.length ?? 0) >= (doc.match(/\S\s*\{\s*$/gm)?.length ?? 0);
    let insert: string, caret: number;
    if (HEADER.test(trimmed) && !/[;{}]$/.test(text.trim())) {
      const open = allman ? `${nl}${indent}{` : ' {';
      insert = `${text}${open}${nl}${indent}${unit}`;
      caret = line.from + insert.length;
      insert += `${nl}${indent}}`;
    } else {
      if (!/[;{},]$/.test(text.trim())) text += ';';
      insert = `${text}${nl}${indent}`;
      caret = line.from + insert.length;
    }
    view.dispatch({ changes: { from: line.from, to: line.to, insert }, selection: EditorSelection.cursor(caret), scrollIntoView: true, userEvent: 'input.complete' });
    return true;
  };
}
