import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { elementAt, parseHtml, attrValue, VOID } from './markup.js';
import type { Node as HtmlNode } from 'vscode-html-languageservice';

/** Quick Actions for HTML (FRONTEND-100.md F56 wrap, F57 unwrap, F62 entities); ids carry the action and range. */
export type HtmlAction = { id: string; title: string; kind: 'refactor' };
const NAMED: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;', '\u00a0': '&nbsp;', '©': '&copy;', '®': '&reg;', '™': '&trade;', '€': '&euro;', '£': '&pound;', '—': '&mdash;', '–': '&ndash;', '…': '&hellip;', '«': '&laquo;', '»': '&raquo;' };
const encode = (s: string) => s.replace(/[<>&"'\u00a0©®™€£—–…«»]|[^\x00-\x7f]/g, (ch) => NAMED[ch] ?? `&#${ch.codePointAt(0)};`);
const ENTITIES: Record<string, string> = Object.fromEntries(Object.entries(NAMED).map(([k, v]) => [v.slice(1, -1), k]));
const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m));

/** The element to wrap: the selection, else the element around the caret. */
const target = (root: string, file: string, text: string, from: number, to: number) => {
  if (to > from) return { from, to };
  const n = elementAt(root, file, text, from);
  return n?.tag ? { from: n.start, to: n.end } : undefined;
};
const unwrappable = (root: string, file: string, text: string, pos: number) => {
  const n = elementAt(root, file, text, pos);
  return n?.tag && !VOID.has(n.tag.toLowerCase()) && n.endTagStart !== undefined && n.startTagEnd !== undefined ? n : undefined;
};

export function htmlActions(root: string, file: string, text: string, from: number, to: number): HtmlAction[] {
  const out: HtmlAction[] = [];
  const a = (k: string, title: string) => out.push({ id: JSON.stringify({ k, s: from, e: to }), title, kind: 'refactor' });
  if (target(root, file, text, from, to)) a('wrap', 'Wrap with <div>');
  const u = unwrappable(root, file, text, from);
  if (u) a('unwrap', `Remove tag <${u.tag}> (keep its content)`);
  const sel = text.slice(from, to);
  if (to > from && encode(sel) !== sel) a('encode', 'Convert characters to HTML entities');
  if (to > from && decode(sel) !== sel) a('decode', 'Convert HTML entities to characters');
  return out;
}

export function applyHtmlAction(root: string, file: string, text: string, id: string): { title: string; text: string; caret?: number } {
  const { k, s, e } = JSON.parse(id) as { k: string; s: number; e: number };
  if (k === 'wrap') {
    const t = target(root, file, text, s, e);
    if (!t) throw new Error('Nothing to wrap here.');
    const lineStart = text.lastIndexOf('\n', t.from - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(lineStart))![0];
    const block = text.slice(lineStart, t.from).trim() === '' && (text[t.to] === '\n' || t.to === text.length);
    const inner = text.slice(t.from, t.to);
    // A whole-line element moves one level in; inline text is wrapped where it is.
    const wrapped = block ? `<div>\n${indent}  ${inner.split('\n').join('\n  ')}\n${indent}</div>` : `<div>${inner}</div>`;
    return { title: 'Wrap with <div>', text: text.slice(0, t.from) + wrapped + text.slice(t.to), caret: t.from + 1 };
  }
  if (k === 'unwrap') {
    const n = unwrappable(root, file, text, s);
    if (!n) throw new Error('No element here.');
    let inner = text.slice(n.startTagEnd!, n.endTagStart!);
    // A block's content goes back one level.
    if (/^\s*\n/.test(inner)) inner = inner.replace(/^\s*\n/, '').replace(/\n[ \t]*$/, '').split('\n').map((l) => l.replace(/^ {2}/, '')).join('\n').replace(/^[ \t]*/, '');
    return { title: `Remove tag <${n.tag}>`, text: text.slice(0, n.start) + inner + text.slice(n.end) };
  }
  if (k === 'encode') return { title: 'Convert characters to HTML entities', text: text.slice(0, s) + encode(text.slice(s, e)) + text.slice(e) };
  if (k === 'decode') return { title: 'Convert HTML entities to characters', text: text.slice(0, s) + decode(text.slice(s, e)) + text.slice(e) };
  throw new Error('Unknown action.');
}

// ---- F65 id references, F66 class references ----
type Loc = { file: string; line: number; column: number; text?: string };
const locIn = (file: string, text: string, offset: number): Loc => { const before = text.slice(0, offset); const line = before.split('\n').length; return { file, line, column: offset - before.lastIndexOf('\n'), text: text.split('\n')[line - 1]?.trim() }; };
const ID_REFS = ['for', 'form', 'list', 'headers', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-errormessage', 'aria-details', 'aria-flowto', 'popovertarget', 'commandfor'];

/** What the caret is on: an id reference (href="#x", for="x", aria-…="x y"), an id, or a class name. */
function tokenAt(root: string, file: string, text: string, pos: number): { kind: 'idref' | 'id' | 'class'; name: string } | undefined {
  const n = elementAt(root, file, text, pos);
  if (!n?.tag || n.startTagEnd === undefined || pos > n.startTagEnd) return undefined;
  const raw = text.slice(n.start, n.startTagEnd);
  for (const m of raw.matchAll(/\s([\w:-]+)\s*=\s*(["'])([^"']*)\2/g)) {
    const from = n.start + m.index! + m[0].indexOf(m[2]) + 1, to = from + m[3].length;
    if (pos < from || pos > to) continue;
    const attr = m[1].toLowerCase();
    const words = [...m[3].matchAll(/[^\s]+/g)];
    const word = words.find((w) => from + w.index! <= pos && pos <= from + w.index! + w[0].length)?.[0] ?? words[0]?.[0] ?? '';
    if (attr === 'href' && m[3].startsWith('#')) return { kind: 'idref', name: m[3].slice(1) };
    if (ID_REFS.includes(attr)) return { kind: 'idref', name: word };
    if (attr === 'id') return { kind: 'id', name: m[3] };
    if (attr === 'class' || attr === 'classname') return { kind: 'class', name: word };
  }
  return undefined;
}
/** Stylesheets that can style the page: its <style> blocks, linked stylesheets, and the repository's CSS / SCSS / LESS. */
function stylesheets(root: string, file: string, text: string) {
  const sheets: { file: string; text: string }[] = [{ file, text }];
  const seen = new Set<string>();
  const add = (abs: string) => { const rel = path.relative(root, abs).replace(/\\/g, '/'); if (seen.has(rel) || rel.startsWith('..')) return; seen.add(rel); try { sheets.push({ file: rel, text: readFileSync(abs, 'utf8') }); } catch { /* missing */ } };
  for (const m of text.matchAll(/<link\b[^>]*href=["']([^"']+\.(?:css|scss|less))["']/gi)) add(path.resolve(root, path.dirname(file), m[1]));
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['node_modules', '.git', 'dist', 'build'].includes(e.name)) walk(path.join(dir, e.name), depth + 1); }
      else if (/\.(css|scss|less)$/.test(e.name)) add(path.join(dir, e.name));
    }
  };
  walk(root, 0);
  return sheets;
}
const selectorHits = (sheets: { file: string; text: string }[], selector: string) => {
  const re = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&')}(?![\\w-])`, 'g');
  return sheets.flatMap((s) => {
    // In an HTML file only its <style> blocks count.
    const ranges = /\.html?$/i.test(s.file) ? [...s.text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => [m.index! + m[0].indexOf('>') + 1, m.index! + m[0].indexOf('>') + 1 + m[1].length]) : [[0, s.text.length]];
    return ranges.flatMap(([a, b]) => [...s.text.slice(a, b).matchAll(re)].filter((m) => /[{,\s>+~]|$/.test(s.text.slice(a + m.index! + m[0].length).trimStart()[0] ?? '{')).map((m) => locIn(s.file, s.text, a + m.index!)));
  });
};

export function htmlDefinition(root: string, file: string, text: string, pos: number) {
  const t = tokenAt(root, file, text, pos);
  if (!t) return { name: '', locations: [] as Loc[] };
  if (t.kind === 'idref') {
    const target = [...text.matchAll(new RegExp(`\\sid\\s*=\\s*(["'])${t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`, 'g'))].map((m) => locIn(file, text, m.index! + 1));
    return { name: `#${t.name}`, locations: target };
  }
  return { name: t.kind === 'class' ? `.${t.name}` : `#${t.name}`, locations: selectorHits(stylesheets(root, file, text), t.kind === 'class' ? `.${t.name}` : `#${t.name}`) };
}
export function htmlReferences(root: string, file: string, text: string, pos: number) {
  const t = tokenAt(root, file, text, pos);
  if (!t) return { name: '', locations: [] as Loc[] };
  const html = parseHtml(root, file, text);
  const nodes: HtmlNode[] = [];
  const collect = (n: HtmlNode) => { nodes.push(n); n.children.forEach(collect); };
  html.roots.forEach(collect);
  if (t.kind === 'class') {
    const users = nodes.filter((n) => (attrValue(n, 'class') ?? attrValue(n, 'className') ?? '').split(/\s+/).includes(t.name)).map((n) => locIn(file, text, n.start));
    return { name: `.${t.name}`, locations: [...users, ...selectorHits(stylesheets(root, file, text), `.${t.name}`)] };
  }
  const users = nodes.filter((n) => (attrValue(n, 'href') === `#${t.name}`) || ID_REFS.some((a) => (attrValue(n, a) ?? '').split(/\s+/).includes(t.name)) || attrValue(n, 'id') === t.name).map((n) => locIn(file, text, n.start));
  return { name: `#${t.name}`, locations: [...users, ...selectorHits(stylesheets(root, file, text), `#${t.name}`)] };
}
