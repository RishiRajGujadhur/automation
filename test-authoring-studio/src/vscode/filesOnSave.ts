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

/* Formatting on save (VS Code's editor.formatOnSave, editor.formatOnSaveMode, editor.codeActionsOnSave). */
const F = 'Text Editor ▸ Formatting';
export const formatting = {
  onSave: defineSetting<boolean>({ key: 'editor.formatOnSave', category: F, title: 'Format On Save', type: 'boolean', default: false, description: 'Format a file on save (C# with Roslyn and .editorconfig, feature files, JSON).' }),
  mode: defineSetting<'file' | 'modifications'>({
    key: 'editor.formatOnSaveMode', category: F, title: 'Format On Save Mode', type: 'enum', default: 'file', description: 'Controls if format on save formats the whole file or only modifications.',
    options: [{ value: 'file', description: 'Format the whole file.' }, { value: 'modifications', description: 'Format modifications (C#: the lines changed since the file was last saved).' }],
  }),
  organizeImports: defineSetting<boolean>({ key: 'editor.codeActionsOnSave.organizeImports', category: F, title: 'Code Actions On Save: Organize Imports', type: 'boolean', default: false, description: 'Sort usings and remove the unnecessary ones when a C# file is saved (source.organizeImports).' }),
};
/** Line ranges of `b` (1-based, inclusive) that differ from `a`. Pure, for the unit tests. */
export function changedLineRanges(a: string, b: string): [number, number][] {
  const x = a.replace(/\r\n/g, '\n').split('\n'), y = b.replace(/\r\n/g, '\n').split('\n');
  // Longest common subsequence of lines (small files) or a prefix / suffix trim (large ones).
  if (x.length * y.length > 4_000_000) {
    let s = 0; while (s < x.length && s < y.length && x[s] === y[s]) s++;
    let ex = x.length, ey = y.length; while (ex > s && ey > s && x[ex - 1] === y[ey - 1]) { ex--; ey--; }
    return ey > s ? [[s + 1, ey]] : [];
  }
  const n = x.length, m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const changed: number[] = [];
  let i = 0, j = 0;
  while (j < m) {
    if (i < n && x[i] === y[j]) { i++; j++; } else if (i < n && dp[i + 1][j] >= dp[i][j + 1]) i++; else { changed.push(j + 1); j++; }
  }
  const out: [number, number][] = [];
  for (const l of changed) { const last = out[out.length - 1]; if (last && last[1] === l - 1) last[1] = l; else out.push([l, l]); }
  return out;
}
/** Everything a save does to the text: code actions, formatting, then the Files settings. */
export async function transformOnSave(file: string, text: string, saved: string): Promise<string> {
  let t = text;
  try {
    const { api } = await import('../api');
    const { isBrowser } = await import('../files/provider');
    if (file.endsWith('.cs') && !isBrowser()) {
      if (formatting.organizeImports()) t = (await api<{ text: string }>('/csharp/organize', { file, source: t })).text;
      if (formatting.onSave()) {
        if (formatting.mode() === 'modifications') {
          // Bottom up, so the ranges above keep their line numbers.
          for (const [a, b] of changedLineRanges(saved, t).reverse()) {
            const lines = t.split(/\r?\n/);
            t = (await api<{ text: string }>('/csharp/format', { file, source: t, selection: { line: a, column: 1, endLine: b, endColumn: (lines[b - 1]?.length ?? 0) + 1 } })).text;
          }
        } else t = (await api<{ text: string }>('/csharp/format', { file, source: t })).text;
      }
    } else if (formatting.onSave() && file.endsWith('.feature')) {
      const { formatFeature } = await import('../editor/gherkin');
      t = formatFeature(t, file);
    } else if (formatting.onSave() && /\.json$/i.test(file)) {
      const indent = /^( +|\t)"/m.exec(t)?.[1] ?? '  ';
      t = JSON.stringify(JSON.parse(t), null, indent) + (t.endsWith('\n') ? '\n' : '');
    }
  } catch { t = text; /* the language service is not running, or the text does not parse: saved as it is */ }
  return applyOnSave(t);
}
