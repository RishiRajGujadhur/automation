import { xml as xmlLanguage } from '@codemirror/lang-xml';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import type { Text } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { msbuildElements } from './msbuildSchema';
import { autocompletion } from '@codemirror/autocomplete';

const SELECTOR_TYPES = /^(testid|text|css|xpath|ariarole\.(textbox|combobox|button|link|checkbox|radio|option|tab|menuitem|heading))$/i;

const posOf = (doc: Text, line: number, col = 1) => {
  const l = doc.line(Math.min(doc.lines, Math.max(1, line)));
  return Math.min(l.to, l.from + Math.max(0, col - 1));
};

/** Well-formedness errors from the browser's XML parser, located by line/column. */
export function xmlSyntaxDiagnostics(src: string, doc: Text): Diagnostic[] {
  if (!src.trim()) return [];
  const parsed = new DOMParser().parseFromString(src, 'application/xml');
  const err = parsed.getElementsByTagName('parsererror')[0];
  if (!err) return [];
  const text = err.textContent ?? 'XML is not well-formed.';
  const m = /line (\d+) at column (\d+)/i.exec(text) ?? /line\s*(\d+)[^\d]+(\d+)/i.exec(text);
  const line = m ? Number(m[1]) : 1;
  const col = m ? Number(m[2]) : 1;
  const from = posOf(doc, line, col);
  const msg = text.replace(/This page contains the following errors:|Below is a rendering of the page up to the first error\.?/g, '').replace(/error on line \d+ at column \d+:\s*/i, '').trim();
  return [{ from: Math.max(0, from - 1), to: Math.min(doc.length, from + 1), severity: 'error', source: 'XML', message: msg || 'XML is not well-formed.' }];
}

/** Dictionary rules: Page/Section/Field/Selector shape, supported selector types, duplicate fields, brittle selectors. */
export function dictionaryDiagnostics(src: string, doc: Text): Diagnostic[] {
  const out: Diagnostic[] = [];
  const lines = src.split('\n');
  let section = '';
  const seen = new Map<string, number>();
  let fieldLine = 0, selectorsInField = 0;
  const flag = (line: number, severity: Diagnostic['severity'], message: string) => {
    const l = doc.line(line);
    const indent = l.text.length - l.text.trimStart().length;
    out.push({ from: l.from + indent, to: l.to, severity, source: 'Dictionary', message });
  };
  lines.forEach((text, i) => {
    const n = i + 1;
    const sec = /<Section\b[^>]*XRefCode="([^"]*)"/.exec(text);
    if (sec) { section = sec[1].toLowerCase().replace(/[\s/()]/g, ''); if (!sec[1].trim()) flag(n, 'error', 'Section XRefCode is empty.'); }
    else if (/<Section\b/.test(text) && !/XRefCode=/.test(text)) flag(n, 'error', 'Section is missing an XRefCode attribute.');
    const field = /<Field\b([^>]*)>/.exec(text);
    if (field) {
      if (fieldLine && selectorsInField === 0) flag(fieldLine, 'error', 'Field has no Selector elements.');
      fieldLine = n;
      selectorsInField = 0;
      const x = /XRefCode="([^"]*)"/.exec(field[1]);
      if (!x) flag(n, 'error', 'Field is missing an XRefCode attribute.');
      else {
        const key = section + '/' + x[1].toLowerCase().replace(/[\s/()]/g, '');
        if (seen.has(key)) flag(n, 'warning', `Duplicate field "${x[1]}" in this section (first on line ${seen.get(key)}). Lookups use the first match.`);
        else seen.set(key, n);
      }
      if (!/Type="/.test(field[1])) flag(n, 'info', 'Field has no Type (e.g. TextBox, Button).');
    }
    if (/<\/Field>/.test(text)) {
      if (fieldLine && selectorsInField === 0) flag(fieldLine, 'error', 'Field has no Selector elements.');
      fieldLine = 0;
    }
    const sel = /<Selector\b([^>]*)>([^<]*)<\/Selector>/.exec(text);
    if (sel) {
      selectorsInField++;
      const type = /Type="([^"]*)"/.exec(sel[1])?.[1] ?? '';
      if (!type) flag(n, 'error', 'Selector is missing a Type attribute.');
      else if (!SELECTOR_TYPES.test(type)) flag(n, 'error', `Unsupported selector type "${type}". Use testid, ariarole.<role>, text, css or xpath.`);
      if (!sel[2].trim()) flag(n, 'error', 'Selector value is empty.');
      if (/nth-child|nth-of-type/.test(sel[2])) flag(n, 'warning', 'Positional CSS (nth-child) is brittle. Prefer a test id or role.');
      if (/^xpath$/i.test(type)) flag(n, 'info', 'XPath needs a documented exception.');
      if (selectorsInField === 1 && /^(css|xpath)$/i.test(type)) flag(n, 'warning', 'First selector is CSS/XPath. Put a test id or role selector first.');
    }
  });
  return out;
}

export const xmlLinter = (dictionary = true) =>
  linter((view) => {
    const src = view.state.doc.toString();
    const syntax = xmlSyntaxDiagnostics(src, view.state.doc);
    return syntax.length || !dictionary ? syntax : dictionaryDiagnostics(src, view.state.doc);
  }, { delay: 250 });

export function xmlExtensions(dictionary = true, msbuild = false): Extension[] {
  // Project files get element / attribute IntelliSense from a small MSBuild schema.
  return [...(msbuild ? [xmlLanguage({ elements: msbuildElements }), autocompletion({ activateOnTyping: true })] : [xmlLanguage()]), xmlLinter(dictionary), lintGutter()];
}
