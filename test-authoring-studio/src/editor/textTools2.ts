import { EditorSelection, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { indentUnit } from '@codemirror/language';
import { mapLines } from './textTools';

/**
 * Fourth batch of text tools (IDE-FEATURES-4.md): JetBrains Rider's String Manipulation actions and Visual Studio 2026
 * editor commands. Each rewrites the selection (or the word / line at the caret) and returns false when it has nothing to do.
 */

/** Replaces each selection (or, with none, the word or line at the caret) with `fn(text)`. */
export function mapSelections(fn: (text: string) => string | null, empty: 'word' | 'line' | 'doc' = 'word') {
  return (view: EditorView) => {
    const { state } = view;
    let changed = false;
    const tr = state.changeByRange((r) => {
      let { from, to } = r;
      if (r.empty) {
        if (empty === 'doc') { from = 0; to = state.doc.length; }
        else if (empty === 'line') { const l = state.doc.lineAt(r.head); from = l.from; to = l.to; }
        else { const w = state.wordAt(r.head); if (w) { from = w.from; to = w.to; } }
      }
      const text = state.sliceDoc(from, to);
      const next = from === to ? null : fn(text);
      if (next === null || next === text) return { range: r };
      changed = true;
      return { changes: { from, to, insert: next }, range: EditorSelection.range(from, from + next.length) };
    });
    if (!changed) return false;
    view.dispatch({ ...tr, userEvent: 'input.convert' });
    return true;
  };
}
export { mapLines };

/** URL Encode / Decode (Rider String Manipulation): percent-encoding of the selection. */
export const urlEncode = mapSelections((t) => encodeURIComponent(t), 'line');
export const urlDecode = mapSelections((t) => { try { return decodeURIComponent(t.replace(/\+/g, ' ')); } catch { return null; } }, 'line');

/** Base64 Encode / Decode (Rider String Manipulation), UTF-8. */
export const base64Encode = mapSelections((t) => btoa(String.fromCharCode(...new TextEncoder().encode(t))), 'line');
export const base64Decode = mapSelections((t) => { try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(atob(t.trim()), (c) => c.charCodeAt(0))); } catch { return null; } }, 'line');

/** Escape / Unescape C# String (Rider): backslashes, quotes and control characters. */
const ESC: Record<string, string> = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\0': '\\0' };
export const escapeString = mapSelections((t) => t.replace(/[\\"\n\r\t\0]/g, (c) => ESC[c]), 'line');
export const unescapeString = mapSelections((t) => t.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => (c.length > 1 ? String.fromCharCode(parseInt(c.slice(1), 16)) : ({ n: '\n', r: '\r', t: '\t', '0': '\0' } as Record<string, string>)[c] ?? c)), 'line');

/** HTML Encode / Decode (Rider String Manipulation): the five XML entities, and numeric ones when decoding. */
const HTML: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const htmlEncode = mapSelections((t) => t.replace(/[&<>"']/g, (c) => HTML[c]), 'line');
export const htmlDecode = mapSelections((t) => t.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[e])), 'line');

/** Increment / Decrement Number (Rider String Manipulation): the number at each caret, keeping zero padding. */
export function stepNumber(by: number) {
  return (view: EditorView) => {
    const { state } = view;
    let changed = false;
    const tr = state.changeByRange((r) => {
      const line = state.doc.lineAt(r.head);
      for (const m of line.text.matchAll(/-?\d+/g)) {
        const from = line.from + m.index!, to = from + m[0].length;
        if (r.head < from || r.head > to) continue;
        const neg = m[0].startsWith('-');
        const digits = neg ? m[0].slice(1) : m[0];
        const n = BigInt(m[0]) + BigInt(by);
        const abs = (n < 0n ? -n : n).toString().padStart(digits.length, '0');
        const next = (n < 0n ? '-' : '') + abs;
        changed = true;
        return { changes: { from, to, insert: next }, range: EditorSelection.cursor(Math.min(from + next.length, r.head + next.length - m[0].length)) };
      }
      return { range: r };
    });
    if (!changed) return false;
    view.dispatch({ ...tr, userEvent: 'input.convert' });
    return true;
  };
}

/** Insert Sequence (Rider "Increment Duplicates", VS multi-caret numbering): 1, 2, 3… at the carets, in document order,
 * starting from the first selection's number when it is one. */
export function insertSequence(view: EditorView) {
  const ranges = [...view.state.selection.ranges].sort((a, b) => a.from - b.from);
  if (ranges.length < 2) return false;
  const first = view.state.sliceDoc(ranges[0].from, ranges[0].to).trim();
  const start = /^-?\d+$/.test(first) ? Number(first) : 1;
  const order = new Map(ranges.map((r, i) => [r.from, i]));
  view.dispatch({ ...view.state.changeByRange((r) => { const text = String(start + order.get(r.from)!); return { changes: { from: r.from, to: r.to, insert: text }, range: EditorSelection.cursor(r.from + text.length) }; }), userEvent: 'input.convert' });
  return true;
}

/** Toggle Quotes (Rider): the string at the caret switches between "double" and 'single' quotes. */
export function toggleQuotes(view: EditorView) {
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  for (const m of line.text.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)) {
    const from = line.from + m.index!, to = from + m[0].length;
    if (head < from || head > to) continue;
    const dq = m[1] !== undefined;
    const body = dq ? m[1].replace(/\\"/g, '"').replace(/'/g, "\\'") : m[2].replace(/\\'/g, "'").replace(/"/g, '\\"');
    const q = dq ? "'" : '"';
    view.dispatch({ changes: { from, to, insert: q + body + q }, selection: { anchor: Math.min(head, from + body.length + 1) }, userEvent: 'input.convert' });
    return true;
  }
  return false;
}

/** Join Lines with Separator (Rider String Manipulation): the selected lines, trimmed, joined by `sep`. */
export const joinWith = (sep: string) => (view: EditorView) => {
  if (view.state.selection.main.empty) return false;
  return mapLines((lines) => { const indent = /^\s*/.exec(lines[0])![0]; return [indent + lines.map((l) => l.trim()).filter(Boolean).join(sep)]; }, false)(view);
};

/** Split at Separator (Rider String Manipulation): the selection (or line) becomes one line per part, trimmed, indented like the line. */
export const splitAt = (sep: string) => (view: EditorView) => {
  if (!sep) return false;
  return mapLines((lines) => lines.flatMap((l) => { if (!l.includes(sep)) return [l]; const indent = /^\s*/.exec(l)![0]; return l.split(sep).map((p) => p.trim()).filter(Boolean).map((p) => indent + p); }), false)(view);
};

/** The first lone "=" of a line (not ==, =>, <=, >=, !=, +=…), or -1. */
const assignAt = (l: string) => { const m = /(?<![=<>!+\-*/%&|^?:])=(?![=>])/.exec(l); return m ? m.index : -1; };
/** Align Assignments (Visual Studio Productivity Power Tools, Ctrl+Alt+]): the "=" of the selected lines (or the block of
 * assignments around the caret) in one column. */
export function alignAssignments(view: EditorView) {
  const { state } = view;
  const r = state.selection.main;
  let first = state.doc.lineAt(r.from).number, last = state.doc.lineAt(r.to).number;
  if (r.empty) {
    if (assignAt(state.doc.line(first).text) < 0) return false;
    while (first > 1 && assignAt(state.doc.line(first - 1).text) >= 0) first--;
    while (last < state.doc.lines && assignAt(state.doc.line(last + 1).text) >= 0) last++;
  }
  const lines = Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i).text);
  const col = Math.max(...lines.map((l) => { const i = assignAt(l); return i < 0 ? -1 : l.slice(0, i).trimEnd().length; }));
  if (col < 0) return false;
  const next = lines.map((l) => { const i = assignAt(l); return i < 0 ? l : `${l.slice(0, i).trimEnd().padEnd(col)} = ${l.slice(i + 1).trimStart()}`; }).join('\n');
  const from = state.doc.line(first).from, to = state.doc.line(last).to;
  if (next === state.sliceDoc(from, to)) return true;
  view.dispatch({ changes: { from, to, insert: next }, userEvent: 'input.convert' });
  return true;
}

/** Swap Selections (Rider String Manipulation): the text of two selections changes places. */
export function swapSelections(view: EditorView) {
  const ranges = view.state.selection.ranges;
  if (ranges.length !== 2 || ranges.some((r) => r.empty)) return false;
  const [a, b] = [...ranges].sort((x, y) => x.from - y.from);
  const ta = view.state.sliceDoc(a.from, a.to), tb = view.state.sliceDoc(b.from, b.to);
  const shift = tb.length - ta.length;
  view.dispatch({ changes: [{ from: a.from, to: a.to, insert: tb }, { from: b.from, to: b.to, insert: ta }], selection: EditorSelection.create([EditorSelection.range(a.from, a.from + tb.length), EditorSelection.range(b.from + shift, b.to + shift)]), userEvent: 'input.convert' });
  return true;
}

/** Count Occurrences (Rider): how often the selection (or the word at the caret) appears in the file. */
export function countOccurrences(state: EditorState) {
  const r = state.selection.main;
  const w = r.empty ? state.wordAt(r.head) : r;
  if (!w || w.from === w.to) return null;
  const needle = state.sliceDoc(w.from, w.to);
  const doc = state.doc.toString();
  let n = 0;
  for (let i = doc.indexOf(needle); i >= 0; i = doc.indexOf(needle, i + needle.length)) n++;
  return { needle, count: n, lines: new Set(Array.from(doc.matchAll(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')), (m) => state.doc.lineAt(m.index!).number)).size };
}

/** Trim Lines (Rider String Manipulation): leading and trailing white space of the selected lines (or the caret's line). */
export function trimLines(view: EditorView) {
  const { state } = view;
  const r = state.selection.main;
  const first = state.doc.lineAt(r.from), last = state.doc.lineAt(r.to);
  const text = state.sliceDoc(first.from, last.to);
  const next = text.split('\n').map((l) => l.trim()).join('\n');
  if (next === text) return false;
  view.dispatch({ changes: { from: first.from, to: last.to, insert: next }, userEvent: 'input.convert' });
  return true;
}

/** Insert Date and Time (Rider live template "date"): local ISO-like "yyyy-MM-dd HH:mm" at each caret. */
export const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const insertText = (text: () => string) => (view: EditorView) => {
  const t = text();
  view.dispatch({ ...view.state.changeByRange((r) => ({ changes: { from: r.from, to: r.to, insert: t }, range: EditorSelection.cursor(r.from + t.length) })), userEvent: 'input' });
  return true;
};

/** Insert Lorem Ipsum (Rider): placeholder text for test data. */
export const LOREM = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

/** Shuffle Lines (Rider String Manipulation): the selected lines in random order (e.g. test data). */
export const shuffleLines = (random = Math.random) => (view: EditorView) => {
  if (view.state.selection.main.empty) return false;
  return mapLines((lines) => { const a = [...lines]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }, false)(view);
};

/** XML tokens: comments, CDATA, processing instructions and tags, with the text between them. */
const xmlTokens = (src: string) => src.split(/(<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[^>]+>)/).map((t) => t.trim()).filter(Boolean);
/** Reformat XML (Rider / Visual Studio Format Document for XML): one element per line, indented; short text stays inline. */
export function formatXml(src: string, unit = '  ') {
  const toks = xmlTokens(src);
  if (!toks.length || !toks[0].startsWith('<')) return null;
  const out: string[] = [];
  let depth = 0;
  const isOpen = (t?: string) => !!t && t.startsWith('<') && !/^<[/?!]/.test(t) && !t.endsWith('/>');
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.startsWith('</')) { depth = Math.max(0, depth - 1); out.push(unit.repeat(depth) + t); continue; }
    if (isOpen(t)) {
      const next = toks[i + 1], after = toks[i + 2];
      if (next && !next.startsWith('<') && after?.startsWith('</')) { out.push(unit.repeat(depth) + t + next + after); i += 2; continue; }
      if (next?.startsWith('</')) { out.push(unit.repeat(depth) + t + next); i += 1; continue; }
      out.push(unit.repeat(depth) + t);
      depth++;
      continue;
    }
    out.push(unit.repeat(depth) + t);
  }
  return depth === 0 ? out.join('\n') : null;
}
/** Uses the editor's indent unit (Tab or spaces). */
export const reformatXml = (view: EditorView) => mapSelections((t) => formatXml(t, view.state.facet(indentUnit)), 'doc')(view);

/** Minify XML (Rider): the white space between tags removed. */
export const minifyXml = mapSelections((t) => (formatXml(t) === null ? null : t.replace(/>\s+</g, '><').trim()), 'doc');

/** Escape / Unescape JSON String (Rider): the selection as the body of a JSON string, and back. */
export const jsonEscape = mapSelections((t) => JSON.stringify(t).slice(1, -1), 'line');
export const jsonUnescape = mapSelections((t) => { try { return JSON.parse(`"${t.replace(/(^|[^\\])"/g, '$1\\"')}"`) as string; } catch { return null; } }, 'line');

/** Number Lines (Rider String Manipulation): "1. ", "2. "… before the selected lines, after their indentation. */
export const numberLines = (view: EditorView) => {
  if (view.state.selection.main.empty) return false;
  let n = 0;
  return mapLines((lines) => lines.map((l) => (l.trim() ? l.replace(/^(\s*)/, (_, ind: string) => `${ind}${++n}. `) : l)), false)(view);
};

/** Replaces the whole document with `fn(text)` (null: nothing to do). */
export const mapDoc = (fn: (text: string) => string | null) => (view: EditorView) => {
  const text = view.state.doc.toString();
  const next = fn(text);
  if (next === null || next === text) return false;
  view.dispatch({ changes: { from: 0, to: text.length, insert: next }, userEvent: 'input.convert' });
  return true;
};
/** Convert to File-Scoped Namespace (Visual Studio / Rider quick action): `namespace X { … }` → `namespace X;`, body unindented. */
export function toFileScopedNamespace(text: string) {
  if ((text.match(/^\s*namespace\s/gm) ?? []).length !== 1) return null;
  const m = /^([ \t]*)namespace\s+([\w.]+)\s*\{[ \t]*\r?\n?/m.exec(text);
  if (!m) return null;
  const close = text.lastIndexOf('}');
  if (close < m.index + m[0].length || text.slice(close + 1).trim()) return null;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const body = text.slice(m.index + m[0].length, close).split(/\r?\n/).map((l) => l.replace(/^( {4}|\t)/, '')).join(eol).replace(/^(\s*\r?\n)+/, '').trimEnd();
  return `${text.slice(0, m.index)}namespace ${m[2]};${eol}${eol}${body}${eol}`;
}

/** Convert to Block-Scoped Namespace (Visual Studio / Rider): `namespace X;` → `namespace X { … }`, body indented. */
export function toBlockScopedNamespace(text: string) {
  const m = /^([ \t]*)namespace\s+([\w.]+)\s*;[ \t]*\r?$/m.exec(text);
  if (!m) return null;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const rest = text.slice(m.index + m[0].length).replace(/^(\s*\r?\n)+/, '').trimEnd();
  const body = rest.split(/\r?\n/).map((l) => (l.trim() ? `    ${l}` : '')).join(eol);
  return `${text.slice(0, m.index)}namespace ${m[2]}${eol}{${eol}${body}${eol}}${eol}`;
}

/** Remove #region Directives (Rider): every #region / #endregion line goes, the code between stays. */
export const removeRegions = (text: string) => { const next = text.replace(/^[ \t]*#(?:end)?region\b.*(?:\r?\n|$)/gm, ''); return next === text ? null : next; };

/** Convert to Raw String Literal (Visual Studio quick action, C# 11): the "…" string at the caret becomes \"\"\"…\"\"\". */
export function toRawString(view: EditorView) {
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  for (const m of line.text.matchAll(/(?<![@$\w"])"((?:[^"\\]|\\.)*)"/g)) {
    const from = line.from + m.index!, to = from + m[0].length;
    if (head < from || head > to) continue;
    const body = m[1].replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, c: string) => (c.length > 1 ? String.fromCharCode(parseInt(c.slice(1), 16)) : ({ n: '\n', t: '\t', r: '', '0': '\0' } as Record<string, string>)[c] ?? c));
    if (body.includes('"""')) return false;
    let insert: string;
    if (body.includes('\n')) {
      const indent = /^\s*/.exec(line.text)![0] + '    ';
      insert = `"""\n${body.split('\n').map((l) => (l ? indent + l : '')).join('\n')}\n${indent}"""`;
    } else {
      if (body.startsWith('"') || body.endsWith('"')) return false;
      insert = `"""${body}"""`;
    }
    view.dispatch({ changes: { from, to, insert }, userEvent: 'input.convert' });
    return true;
  }
  return false;
}

/** Markdown: Toggle Task (Rider): "- [ ]" ↔ "- [x]" on the selected lines; a plain item or line becomes a task. */
export function toggleTask(view: EditorView) {
  const { state } = view;
  const r = state.selection.main;
  const first = state.doc.lineAt(r.from), last = state.doc.lineAt(r.to);
  const text = state.sliceDoc(first.from, last.to);
  const next = text.split('\n').map((l) => {
    if (!l.trim()) return l;
    const t = /^(\s*[-*+] )\[( |x|X)\] /.exec(l);
    if (t) return l.slice(0, t[1].length) + (t[2] === ' ' ? '[x] ' : '[ ] ') + l.slice(t[0].length);
    const item = /^(\s*[-*+] )/.exec(l);
    if (item) return `${item[1]}[ ] ${l.slice(item[0].length)}`;
    const ind = /^\s*/.exec(l)![0];
    return `${ind}- [ ] ${l.slice(ind.length)}`;
  }).join('\n');
  if (next === text) return false;
  view.dispatch({ changes: { from: first.from, to: last.to, insert: next }, userEvent: 'input.convert' });
  return true;
}

/** Markdown: Format Table (Rider): the table at the caret with its pipes lined up; ":---:" alignment kept. */
export function formatMarkdownTable(view: EditorView) {
  const { state } = view;
  const at = state.doc.lineAt(state.selection.main.head).number;
  const isRow = (n: number) => n >= 1 && n <= state.doc.lines && state.doc.line(n).text.trim().startsWith('|');
  if (!isRow(at)) return false;
  let first = at, last = at;
  while (isRow(first - 1)) first--;
  while (isRow(last + 1)) last++;
  const indent = /^\s*/.exec(state.doc.line(first).text)![0];
  const rows = Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i).text.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  const cols = Math.max(...rows.map((r) => r.length));
  const sep = (c: string) => /^:?-+:?$/.test(c);
  const isSep = (r: string[]) => r.every((c) => sep(c) || !c) && r.some(sep);
  const width = Array.from({ length: cols }, (_, c) => Math.max(3, ...rows.filter((r) => !isSep(r)).map((r) => (r[c] ?? '').length)));
  const out = rows.map((r) => `${indent}| ${Array.from({ length: cols }, (_, c) => {
    const v = r[c] ?? '';
    if (!isSep(r)) return v.padEnd(width[c]);
    const left = v.startsWith(':'), right = v.endsWith(':') && v.length > 1;
    return (left ? ':' : '-') + '-'.repeat(width[c] - 2) + (right ? ':' : '-');
  }).join(' | ')} |`).join('\n');
  const from = state.doc.line(first).from, to = state.doc.line(last).to;
  if (out === state.sliceDoc(from, to)) return true;
  view.dispatch({ changes: { from, to, insert: out }, userEvent: 'input.convert' });
  return true;
}

/** GitHub-style heading anchor. */
export const slug = (text: string) => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-');
/** Markdown: Table of Contents (Rider): a nested list of links to the headings (not those inside code fences). */
export function tableOfContents(markdown: string) {
  let fence = false;
  const heads: { level: number; text: string }[] = [];
  for (const l of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
    const m = !fence && /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(l);
    if (m) heads.push({ level: m[1].length, text: m[2] });
  }
  if (!heads.length) return '';
  const min = Math.min(...heads.map((h) => h.level));
  return heads.map((h) => `${'  '.repeat(h.level - min)}- [${h.text}](#${slug(h.text)})`).join('\n');
}

/** Markdown: Insert Table (Rider): a 2×2 table to fill in. */
export const MARKDOWN_TABLE = '| Column 1 | Column 2 |\n| -------- | -------- |\n|          |          |\n';

/** Remove Comments (Rider Code Cleanup): line comments (`//`, or `#` in Gherkin / YAML) and block comments of the
 * selection or file; comment-only lines are deleted, strings are left alone. `# language:` lines stay. */
export function removeComments(text: string, line = '//', block: [string, string] | null = ['/*', '*/']) {
  const out: string[] = [];
  let inBlock = false;
  for (const l of text.split('\n')) {
    let res = '', i = 0, quote = '';
    let had = false;
    while (i < l.length) {
      if (inBlock) { const e = block ? l.indexOf(block[1], i) : -1; if (e < 0) { i = l.length; had = true; break; } inBlock = false; had = true; i = e + block![1].length; continue; }
      const c = l[i];
      if (quote) { res += c; if (c === '\\') { res += l[i + 1] ?? ''; i += 2; continue; } if (c === quote) quote = ''; i++; continue; }
      if (c === '"' || (c === "'" && line === '//')) { quote = c; res += c; i++; continue; }
      if (block && l.startsWith(block[0], i)) { inBlock = true; had = true; i += block[0].length; continue; }
      if (l.startsWith(line, i) && (line !== '#' || !l.slice(0, i).trim()) && !/^\s*#\s*language\s*:/.test(l)) { had = true; break; }
      res += c; i++;
    }
    if (had && !res.trim()) continue;
    out.push(had ? res.trimEnd() : res);
  }
  const next = out.join('\n');
  return next === text ? null : next;
}

/** Convert Concatenation to Interpolated String (Visual Studio / Rider quick action): "a" + b + "c" → $"a{b}c". */
export function concatToInterpolation(expr: string) {
  const parts: string[] = [];
  let cur = '', depth = 0, quote = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) { cur += c; if (c === '\\') { cur += expr[++i] ?? ''; } else if (c === '"') quote = false; continue; }
    if (c === '"') { quote = true; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === '+' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur.trim());
  if (parts.length < 2 || parts.some((p) => !p)) return null;
  const isStr = (p: string) => /^"(?:[^"\\]|\\.)*"$/.test(p);
  if (!parts.some(isStr) || parts.every(isStr)) return null;
  return `$"${parts.map((p) => (isStr(p) ? p.slice(1, -1).replace(/[{}]/g, (b) => b + b) : `{${p}}`)).join('')}"`;
}
export const concatToInterpolationCmd = mapSelections((t) => { const m = /^(\s*)([\s\S]*?)(;?\s*)$/.exec(t)!; const r = concatToInterpolation(m[2]); return r === null ? null : m[1] + r + m[3]; }, 'line');

/** Go to Offset (Rider Navigate ▸ Offset): the caret at a character offset of the file (from a stack trace or tool). */
export const gotoOffset = (offset: number) => (view: EditorView) => {
  if (!Number.isInteger(offset) || offset < 0) return false;
  const at = Math.min(offset, view.state.doc.length);
  view.dispatch({ selection: { anchor: at }, scrollIntoView: true });
  return true;
};
