import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import * as cssNs from 'vscode-css-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

/**
 * CSS, SCSS and LESS for FRONTEND-100.md F71–F95: VS Code's CSS language services (completion of properties,
 * values, at-rules, pseudo-classes / -elements, media features, SCSS functions, LESS variables; validation and
 * vendor-prefix lint; selector specificity on hover; colours), plus the project-wide parts the services leave out:
 * selector names used in the markup, container queries, custom properties / SCSS / LESS symbols across files,
 * partial resolution, shorthand and unit conversions.
 */
// CommonJS under Node, ESM in the desktop bundle: the functions are on the default export or the namespace.
const cssLs = (cssNs as unknown as { default?: typeof cssNs }).default ?? cssNs;
const { getCSSLanguageService, getSCSSLanguageService, getLESSLanguageService } = cssLs;
const services = { css: getCSSLanguageService(), scss: getSCSSLanguageService(), less: getLESSLanguageService() };
const lint = { vendorPrefix: 'warning', compatibleVendorPrefixes: 'warning', duplicateProperties: 'warning', emptyRules: 'ignore', unknownVendorSpecificProperties: 'ignore' } as const;
for (const s of Object.values(services)) s.configure({ validate: true, lint: lint as never });
export const langOf = (file: string): 'css' | 'scss' | 'less' => (/\.s[ac]ss$/i.test(file) ? 'scss' : /\.less$/i.test(file) ? 'less' : 'css');
const docOf = (file: string, text: string) => TextDocument.create(`file:///${file}`, langOf(file), 1, text);
type Loc = { file: string; line: number; column: number; text?: string };
const locIn = (file: string, text: string, offset: number): Loc => { const before = text.slice(0, offset); const line = before.split('\n').length; return { file, line, column: offset - before.lastIndexOf('\n'), text: text.split('\n')[line - 1]?.trim() }; };

/** Files of the repository by extension (no node_modules / build output), with their text. */
function repoFiles(root: string, ext: RegExp) {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 10 || out.length > 2000) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['node_modules', '.git', 'dist', 'build', 'bin', 'obj', 'coverage'].includes(e.name)) walk(path.join(dir, e.name), depth + 1); }
      else if (ext.test(e.name)) { try { out.push({ file: path.relative(root, path.join(dir, e.name)).replace(/\\/g, '/'), text: readFileSync(path.join(dir, e.name), 'utf8') }); } catch { /* unreadable */ } }
    }
  };
  walk(root, 0);
  return out;
}
const STYLES = /\.(css|scss|sass|less)$/i;
/** The sheets to search: the open one (its unsaved text) first, then the rest of the repository. */
const sheets = (root: string, file: string, text: string) => [{ file, text }, ...repoFiles(root, STYLES).filter((s) => s.file !== file)];

// ---- Completion ----
export type Item = { label: string; kind: string; insert: string; snippet: boolean; from: number; to: number; detail?: string };
const KINDS: Record<number, string> = { 10: 'property', 12: 'enum', 14: 'keyword', 21: 'constant', 7: 'class', 3: 'function', 15: 'text', 6: 'variable', 16: 'constant', 2: 'method' };
const MEDIA = ['min-width', 'max-width', 'width', 'min-height', 'max-height', 'height', 'orientation', 'aspect-ratio', 'prefers-color-scheme', 'prefers-reduced-motion', 'prefers-contrast', 'hover', 'any-hover', 'pointer', 'any-pointer', 'resolution', 'display-mode', 'forced-colors'];
const CONTAINER = ['min-width', 'max-width', 'width', 'min-height', 'max-height', 'height', 'inline-size', 'min-inline-size', 'max-inline-size', 'block-size', 'aspect-ratio', 'orientation'];

export function styleComplete(root: string, file: string, text: string, pos: number): Item[] {
  const d = docOf(file, text);
  const ls = services[langOf(file)];
  const at = d.positionAt(pos);
  const lineBefore = text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos);
  const word = /[\w-]*$/.exec(lineBefore)![0];
  const item = (label: string, kind: string, insert = label, detail?: string): Item => ({ label, kind, insert, snippet: false, from: pos - word.length, to: pos, detail });
  // F85 Container queries: @container [name] (feature…) — names from container-name in the project.
  if (/@container\b[^{]*$/.test(lineBefore)) {
    if (/\([^)]*$/.test(lineBefore)) return [...CONTAINER.map((f) => item(f, 'property', `${f}: `)), item('style', 'function', 'style(--')];
    const names = new Set<string>();
    for (const s of sheets(root, file, text)) for (const m of s.text.matchAll(/container(?:-name)?\s*:\s*([\w-]+)/g)) if (!/^(normal|none|inline-size|size)$/.test(m[1])) names.add(m[1]);
    return [...[...names].map((n) => item(n, 'variable', n, 'container name')), item('(min-width)', 'keyword', '(min-width: ')];
  }
  // F84 Media queries: features inside @media ( … ).
  if (/@media\b[^{]*\([^)]*$/.test(lineBefore) && !/:\s*[\w-]*$/.test(lineBefore)) return MEDIA.map((f) => item(f, 'property', `${f}: `));
  const list = ls.doComplete(d, at, ls.parseStylesheet(d));
  const items: Item[] = list.items.map((i) => {
    const edit = i.textEdit && 'range' in i.textEdit ? i.textEdit : undefined;
    return { label: i.label, kind: KINDS[i.kind ?? 0] ?? 'text', insert: edit?.newText ?? i.insertText ?? i.label, snippet: i.insertTextFormat === 2, from: edit ? d.offsetAt(edit.range.start) : pos - word.length, to: edit ? d.offsetAt(edit.range.end) : pos, detail: typeof i.documentation === 'string' ? i.documentation.slice(0, 160) : i.detail };
  });
  // F71 Selector completion: classes and ids the project's markup uses (HTML, JSX / TSX), at a selector position.
  const sel = /(^|[\s,>+~{}])([.#])([\w-]*)$/.exec(lineBefore);
  const inBlock = (text.slice(0, pos).match(/{/g)?.length ?? 0) > (text.slice(0, pos).match(/}/g)?.length ?? 0) && !/[{;]\s*[\w-]*$/.test(text.slice(0, pos).replace(/\s+$/, '')) && /:\s*[^;{}]*$/.test(lineBefore);
  if (sel && !inBlock) {
    const found = new Set<string>();
    for (const m of repoFiles(root, /\.(html?|[jt]sx|vue|svelte)$/i)) {
      const attr = sel[2] === '.' ? /\bclass(?:Name)?\s*=\s*["'{`]([^"'}`]+)/g : /\bid\s*=\s*["']([^"']+)/g;
      for (const a of m.text.matchAll(attr)) for (const name of a[1].split(/\s+/)) if (/^[\w-]+$/.test(name)) found.add(name);
    }
    for (const n of found) items.unshift({ label: `${sel[2]}${n}`, kind: 'class', insert: `${sel[2]}${n}`, snippet: false, from: pos - sel[3].length - 1, to: pos, detail: 'used in the markup' });
  }
  // F91 SCSS functions and F93 LESS variables of other files (the service knows the open file only).
  if (langOf(file) === 'scss' && !/\$[\w-]*$/.test(lineBefore)) for (const s of sheets(root, file, text).slice(1)) for (const m of s.text.matchAll(/@function\s+([\w-]+)\s*\(([^)]*)\)/g)) items.push({ label: m[1], kind: 'function', insert: `${m[1]}(`, snippet: false, from: pos - word.length, to: pos, detail: `@function ${m[1]}(${m[2]}) — ${s.file}` });
  const varPrefix = langOf(file) === 'less' ? '@' : langOf(file) === 'scss' ? '$' : '';
  const v = varPrefix ? new RegExp(`\\${varPrefix}([\\w-]*)$`).exec(lineBefore) : null;
  if (v) {
    const seen = new Set(items.map((i) => i.label));
    for (const s of sheets(root, file, text).slice(1)) if (langOf(s.file) === langOf(file)) for (const m of s.text.matchAll(new RegExp(`\\${varPrefix}([\\w-]+)\\s*:\\s*([^;\\n]+)`, 'g'))) {
      const label = `${varPrefix}${m[1]}`;
      if (!seen.has(label) && !/^(import|media|use|forward|include|mixin|function|if|else|each|return)$/.test(m[1])) { seen.add(label); items.push({ label, kind: 'variable', insert: label, snippet: false, from: pos - v[1].length - 1, to: pos, detail: `${m[2].trim()} — ${s.file}` }); }
    }
  }
  return items;
}

/** F76 Selector specificity (and property docs) on hover. */
export function styleHover(file: string, text: string, pos: number) {
  const d = docOf(file, text);
  const ls = services[langOf(file)];
  const h = ls.doHover(d, d.positionAt(pos), ls.parseStylesheet(d));
  if (!h) return null;
  const parts = (Array.isArray(h.contents) ? h.contents : [h.contents]).map((c) => (typeof c === 'string' ? c : c.value));
  const textOut = parts.join('\n').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
  return { text: textOut, from: h.range ? d.offsetAt(h.range.start) : pos, to: h.range ? d.offsetAt(h.range.end) : pos };
}

// ---- Diagnostics: the service's validation and lint (F79 vendor prefixes), partials that do not resolve (F92) ----
export type Problem = { from: number; to: number; severity: 'error' | 'warning' | 'info'; message: string; rule: string };
export function styleProblems(root: string, file: string, text: string): Problem[] {
  const d = docOf(file, text);
  const ls = services[langOf(file)];
  const out: Problem[] = ls.doValidation(d, ls.parseStylesheet(d)).map((x) => ({ from: d.offsetAt(x.range.start), to: d.offsetAt(x.range.end), severity: x.severity === 1 ? 'error' : x.severity === 2 ? 'warning' : 'info', message: x.message, rule: String(x.code ?? 'css') }));
  for (const m of text.matchAll(/@(use|forward|import)\s+['"]([^'"]+)['"]/g)) {
    if (/^(sass:|https?:|url\()/.test(m[2]) || m[2].endsWith('.css') && m[1] === 'import') continue;
    if (!resolvePartial(root, file, m[2])) { const from = m.index! + m[0].indexOf(m[2]); out.push({ from, to: from + m[2].length, severity: 'error', message: `Cannot find the stylesheet "${m[2]}" (tried ${partialCandidates(file, m[2]).map((c) => path.posix.basename(c)).join(', ')}).`, rule: 'scss-import' }); }
  }
  return out;
}

// ---- F92 SCSS partial import resolution ----
const partialCandidates = (file: string, spec: string) => {
  const dir = path.posix.dirname(file);
  const s = spec.replace(/^~/, 'node_modules/');
  const base = path.posix.normalize(spec.startsWith('~') ? s : path.posix.join(dir, s));
  const name = path.posix.basename(base), folder = path.posix.dirname(base);
  const exts = /\.\w+$/.test(name) ? [''] : ['.scss', '.sass', '.css', '.less'];
  return [...exts.map((e) => `${folder}/${name}${e}`), ...exts.map((e) => `${folder}/_${name}${e}`), ...exts.map((e) => `${base}/_index${e}`), ...exts.map((e) => `${base}/index${e}`)].filter((c) => c);
};
export function resolvePartial(root: string, file: string, spec: string) {
  return partialCandidates(file, spec).find((c) => existsSync(path.join(root, c)));
}

// ---- F74 / F75 custom properties, F89 SCSS mixins, F90 SCSS variables, LESS variables: definition and usages ----
/** The symbol at a position: --custom-property, $scss-var, @less-var, a mixin (@include / @mixin), or a partial. */
function symbolAt(file: string, text: string, pos: number) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const line = text.slice(lineStart, text.indexOf('\n', pos) < 0 ? text.length : text.indexOf('\n', pos));
  const col = pos - lineStart;
  const imp = /@(use|forward|import)\s+['"]([^'"]+)['"]/.exec(line);
  if (imp && col >= imp.index && col <= imp.index + imp[0].length) return { kind: 'partial' as const, name: imp[2] };
  const mixin = /@(include|mixin)\s+([\w-]+(?:\.[\w-]+)?)/.exec(line);
  if (mixin && col >= mixin.index && col <= mixin.index + mixin[0].length) return { kind: 'mixin' as const, name: mixin[2].split('.').pop()! };
  for (const re of [/--[\w-]+/g, /\$[\w-]+/g, /@[\w-]+/g]) for (const m of line.matchAll(re)) if (col >= m.index! && col <= m.index! + m[0].length) {
    if (m[0].startsWith('@') && (langOf(file) !== 'less' || /^@(media|import|keyframes|font-face|supports|container|layer|charset|page|namespace|plugin)$/.test(m[0]))) continue;
    return { kind: m[0].startsWith('--') ? 'custom' as const : m[0].startsWith('$') ? 'scss' as const : 'less' as const, name: m[0] };
  }
  return undefined;
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function styleDefinition(root: string, file: string, text: string, pos: number) {
  const s = symbolAt(file, text, pos);
  if (!s) return { name: '', locations: [] as Loc[] };
  if (s.kind === 'partial') { const r = resolvePartial(root, file, s.name); return { name: s.name, locations: r ? [{ file: r, line: 1, column: 1 }] : [] }; }
  const decl = s.kind === 'mixin' ? new RegExp(`@mixin\\s+${escape(s.name)}\\b`, 'g') : new RegExp(`${escape(s.name)}(?![\\w-])\\s*:`, 'g');
  // Sheets, then (custom properties) inline styles and markup <style> blocks are not searched: declarations live in stylesheets.
  const all = sheets(root, file, text);
  const locations = all.flatMap((x) => [...x.text.matchAll(decl)].map((m) => locIn(x.file, x.text, m.index!)));
  return { name: s.name, locations };
}
export function styleReferences(root: string, file: string, text: string, pos: number) {
  const s = symbolAt(file, text, pos);
  if (!s || s.kind === 'partial') return { name: '', locations: [] as Loc[] };
  const use = s.kind === 'mixin' ? new RegExp(`@(include|mixin)\\s+([\\w-]+\\.)?${escape(s.name)}\\b`, 'g') : new RegExp(`${escape(s.name)}(?![\\w-])`, 'g');
  // Custom properties are also read from scripts and markup (style={{ '--x': … }}, var(--x) in HTML).
  const files = s.kind === 'custom' ? [...sheets(root, file, text), ...repoFiles(root, /\.(html?|[jt]sx?|vue|svelte)$/i)] : sheets(root, file, text);
  return { name: s.name, locations: files.flatMap((x) => [...x.text.matchAll(use)].map((m) => locIn(x.file, x.text, m.index!))) };
}

// ---- Quick Actions: F77 expand / F78 compress shorthands, F79 vendor prefixes, F83 units ----
export type StyleAction = { id: string; title: string; kind: 'refactor' | 'fix' };
const BOX = ['margin', 'padding', 'inset', 'border-width', 'border-style', 'border-color'];
const sides = (p: string) => (p === 'inset' ? ['top', 'right', 'bottom', 'left'] : p.startsWith('border-') ? ['top', 'right', 'bottom', 'left'].map((s) => `border-${s}-${p.slice(7)}`) : ['top', 'right', 'bottom', 'left'].map((s) => `${p}-${s}`));
const PREFIXES: Record<string, string[]> = { 'user-select': ['-webkit-'], appearance: ['-webkit-', '-moz-'], 'backdrop-filter': ['-webkit-'], 'text-size-adjust': ['-webkit-', '-moz-'], 'mask-image': ['-webkit-'], 'background-clip': ['-webkit-'], 'line-clamp': ['-webkit-'], 'box-decoration-break': ['-webkit-'], hyphens: ['-webkit-'] };
// Prefixes every current browser has dropped.
const OBSOLETE = /^-(webkit|moz|ms|o)-(border-radius|box-shadow|transition|transform|animation|box-sizing|opacity|flex|border-image|columns|column-\w+|transition-\w+|animation-\w+|transform-\w+)$/;
/** The declaration (`prop: value;`) on the line of a position. */
function declarationAt(text: string, pos: number) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const le = text.indexOf('\n', pos) < 0 ? text.length : text.indexOf('\n', pos);
  const m = /^(\s*)([-\w]+)\s*:\s*([^;{}]*?)\s*(;|$)/.exec(text.slice(ls, le));
  return m ? { from: ls, to: le, indent: m[1], prop: m[2], value: m[3] } : undefined;
}
const compress = (v: string[]) => (v[1] === v[3] ? (v[0] === v[2] ? (v[0] === v[1] ? [v[0]] : [v[0], v[1]]) : [v[0], v[1], v[2]]) : v).join(' ');
/** The declarations of the rule around a position: name → { value, line range }. */
function ruleAround(text: string, pos: number) {
  const open = text.lastIndexOf('{', pos), close = text.indexOf('}', pos);
  if (open < 0 || close < 0 || text.lastIndexOf('}', pos - 1) > open) return undefined;
  const decls = new Map<string, { value: string; from: number; to: number }>();
  for (const m of text.slice(open + 1, close).matchAll(/(^|\n)([ \t]*)([-\w]+)\s*:\s*([^;{}\n]+);?[ \t]*/g)) {
    const from = open + 1 + m.index! + m[1].length;
    decls.set(m[3], { value: m[4].trim(), from, to: from + m[0].length - m[1].length });
  }
  return { open, close, decls };
}
const PX = 16;
const unitAt = (text: string, pos: number) => {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const line = text.slice(ls, text.indexOf('\n', pos) < 0 ? text.length : text.indexOf('\n', pos));
  for (const m of line.matchAll(/(-?\d*\.?\d+)(px|rem|em|ms|s|deg|turn)\b/g)) if (pos - ls >= m.index! && pos - ls <= m.index! + m[0].length) return { from: ls + m.index!, to: ls + m.index! + m[0].length, n: Number(m[1]), unit: m[2] };
  return undefined;
};
const fmt = (n: number) => String(Number(n.toFixed(4)));
const conversions = (u: { n: number; unit: string }) => ({ px: [`${fmt(u.n / PX)}rem`, `${fmt(u.n / PX)}em`], rem: [`${fmt(u.n * PX)}px`], em: [`${fmt(u.n * PX)}px`], ms: [`${fmt(u.n / 1000)}s`], s: [`${fmt(u.n * 1000)}ms`], deg: [`${fmt(u.n / 360)}turn`], turn: [`${fmt(u.n * 360)}deg`] }[u.unit] ?? []);

export function styleActions(file: string, text: string, from: number): StyleAction[] {
  const out: StyleAction[] = [];
  const add = (k: string, title: string, extra: Record<string, unknown> = {}, kind: StyleAction['kind'] = 'refactor') => out.push({ id: JSON.stringify({ k, s: from, ...extra }), title, kind });
  const d = declarationAt(text, from);
  if (d && (BOX.includes(d.prop) || d.prop === 'border') && d.value) add('expand', `Expand ${d.prop} into longhand properties`);
  const r = ruleAround(text, from);
  if (r) for (const p of BOX) if (sides(p).every((s) => r.decls.has(s))) add('compress', `Combine into ${p} shorthand`, { p });
  if (d && PREFIXES[d.prop]) { const missing = PREFIXES[d.prop].filter((x) => !r?.decls.has(`${x}${d.prop}`)); if (missing.length) add('prefix', `Add vendor prefixes for ${d.prop} (${missing.map((x) => `${x}${d.prop}`).join(', ')})`, {}, 'fix'); }
  if (d && OBSOLETE.test(d.prop)) add('unprefix', `Remove the obsolete prefix ${d.prop} (use ${d.prop.replace(/^-\w+-/, '')})`, {}, 'fix');
  const u = unitAt(text, from);
  if (u) for (const c of conversions(u)) add('unit', `Convert ${u.n}${u.unit} to ${c}`, { c });
  void file;
  return out;
}
export function applyStyleAction(text: string, id: string): { title: string; text: string } {
  const a = JSON.parse(id) as { k: string; s: number; p?: string; c?: string };
  const d = declarationAt(text, a.s);
  if (a.k === 'expand' && d) {
    let lines: string[];
    if (d.prop === 'border') {
      const parts = d.value.split(/\s+(?![^(]*\))/);
      const style = parts.find((x) => /^(none|hidden|dotted|dashed|solid|double|groove|ridge|inset|outset)$/.test(x));
      const width = parts.find((x) => /^\d|^(thin|medium|thick)$/.test(x));
      const color = parts.find((x) => x !== style && x !== width);
      lines = [width && `border-width: ${width};`, style && `border-style: ${style};`, color && `border-color: ${color};`].filter(Boolean) as string[];
    } else {
      const v = d.value.split(/\s+(?![^(]*\))/);
      const four = [v[0], v[1] ?? v[0], v[2] ?? v[0], v[3] ?? v[1] ?? v[0]];
      lines = sides(d.prop).map((s, i) => `${s}: ${four[i]};`);
    }
    return { title: `Expand ${d.prop}`, text: text.slice(0, d.from) + lines.map((l) => d.indent + l).join('\n') + text.slice(d.to) };
  }
  if (a.k === 'compress') {
    const r = ruleAround(text, a.s)!;
    const names = sides(a.p!);
    const values = names.map((n) => r.decls.get(n)!.value);
    const first = r.decls.get(names[0])!;
    const indent = /^[ \t]*/.exec(text.slice(first.from))![0];
    let out = text;
    // Later declarations first, so earlier offsets stay right; the shorthand takes the first one's place.
    for (const n of [...names].sort((x, y) => r.decls.get(y)!.from - r.decls.get(x)!.from)) {
      const dl = r.decls.get(n)!;
      const end = out[dl.to] === '\n' && n !== names[0] ? dl.to + 1 : dl.to;
      out = out.slice(0, dl.from) + (n === names[0] ? `${indent}${a.p}: ${compress(values)};` : '') + out.slice(end);
    }
    return { title: `Combine into ${a.p}`, text: out.replace(/\n[ \t]*\n(?=[ \t]*[-\w]+\s*:)/g, '\n') };
  }
  if (a.k === 'prefix' && d) {
    const r = ruleAround(text, a.s);
    const missing = PREFIXES[d.prop].filter((x) => !r?.decls.has(`${x}${d.prop}`));
    return { title: `Add vendor prefixes for ${d.prop}`, text: text.slice(0, d.from) + missing.map((x) => `${d.indent}${x}${d.prop}: ${d.value};\n`).join('') + text.slice(d.from) };
  }
  if (a.k === 'unprefix' && d) return { title: `Remove the prefix of ${d.prop}`, text: text.slice(0, d.from) + `${d.indent}${d.prop.replace(/^-\w+-/, '')}: ${d.value};` + text.slice(d.to) };
  if (a.k === 'unit') { const u = unitAt(text, a.s)!; return { title: `Convert to ${a.c}`, text: text.slice(0, u.from) + a.c + text.slice(u.to) }; }
  throw new Error('This action no longer applies here.');
}

/** F68 / formatting for stylesheets. */
export function styleFormat(file: string, text: string) {
  const d = docOf(file, text);
  return TextDocument.applyEdits(d, services[langOf(file)].format(d, undefined, { tabSize: 2, insertSpaces: true }));
}

/** F94 CSS Modules: the class names a module stylesheet defines (for its generated typings). */
export function moduleClasses(text: string) {
  const names = new Set<string>();
  for (const m of text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)(?=[^{}]*\{)/g)) names.add(m[1]);
  return [...names];
}
export { locIn };
