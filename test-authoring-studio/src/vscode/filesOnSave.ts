import { ViewPlugin, type EditorView } from '@codemirror/view';
import type { ChangeSpec } from '@codemirror/state';
import { defineSetting } from './settings';
import { registerAdvanced } from '../editor/advanced';

/** Files (VS Code's Text Editor ▸ Files): what a save does to the text. */
const C = 'Text Editor ▸ Files';
export const filesOnSave = {
  trimTrailingWhitespace: defineSetting<boolean>({ key: 'files.trimTrailingWhitespace', category: C, title: 'Trim Trailing Whitespace', type: 'boolean', default: false, description: 'When enabled, will trim trailing whitespace when saving a file.' }),
  insertFinalNewline: defineSetting<boolean>({ key: 'files.insertFinalNewline', category: C, title: 'Insert Final Newline', type: 'boolean', default: false, description: 'When enabled, insert a final new line at the end of the file when saving it.' }),
  trimFinalNewlines: defineSetting<boolean>({ key: 'files.trimFinalNewlines', category: C, title: 'Trim Final Newlines', type: 'boolean', default: false, description: 'When enabled, will trim all new lines after the final new line at the end of the file when saving it.' }),
};

/** The text a save writes. Pure, for the unit tests. */
export function textToSave(text: string, o: { trim: boolean; final: boolean; trimFinal: boolean }) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let t = text;
  if (o.trim) t = t.replace(/[ \t]+(\r?)$/gm, '$1');
  if (o.trimFinal && /\n$/.test(t)) t = t.replace(/(\r?\n)+$/, eol);
  if (o.final && t.length && !t.endsWith('\n')) t += eol;
  return t;
}
export const applyOnSave = (text: string) => textToSave(text, { trim: filesOnSave.trimTrailingWhitespace(), final: filesOnSave.insertFinalNewline(), trimFinal: filesOnSave.trimFinalNewlines() });

/** Line-by-line changes from `a` to `b` (so the caret stays where it was). Pure, for the unit tests. */
export function lineChanges(a: string, b: string): ChangeSpec[] {
  const x = a.split('\n'), y = b.split('\n');
  const out: ChangeSpec[] = [];
  let pos = 0;
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    if (x[i] !== y[i]) {
      let p = 0;
      while (p < x[i].length && p < y[i].length && x[i][p] === y[i][p]) p++;
      out.push({ from: pos + p, to: pos + x[i].length, insert: y[i].slice(p) });
    }
    pos += x[i].length + 1;
  }
  const end = pos - 1;
  if (y.length > n) out.push({ from: end, insert: '\n' + y.slice(n).join('\n') });
  else if (x.length > n) out.push({ from: end, to: a.length });
  return out;
}

/** The save wrote a different text (trimmed, final newline): the editor of that file takes it. */
export const SAVED_TEXT_EVENT = 'tas:saved-text';
registerAdvanced((file) => ViewPlugin.fromClass(class {
  constructor(readonly view: EditorView) { window.addEventListener(SAVED_TEXT_EVENT, this.on); }
  on = (e: Event) => {
    const d = (e as CustomEvent<{ file: string; from: string; text: string }>).detail;
    const now = this.view.state.doc.toString();
    if (d.file !== file || now === d.text) return;
    // Only when the buffer is still the text that was saved (the separator may be CRLF on disk).
    const lf = (s: string) => s.replace(/\r\n/g, '\n');
    if (lf(now) !== lf(d.from)) return;
    this.view.dispatch({ changes: lineChanges(now, lf(d.text)), userEvent: 'save.format' });
  };
  destroy() { window.removeEventListener(SAVED_TEXT_EVENT, this.on); }
}));
