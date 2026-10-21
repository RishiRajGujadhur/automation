import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import * as htmlNs from 'vscode-html-languageservice';
import type { HTMLDocument, Node as HtmlNode, IHTMLDataProvider } from 'vscode-html-languageservice';
import * as cssNs from 'vscode-css-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

// CommonJS under Node (re-exports are not ESM named exports: take them from the module object); the desktop bundle
// uses their ESM build, where they are plain named exports.
const htmlLs = (htmlNs as unknown as { default?: typeof htmlNs }).default ?? htmlNs;
const cssLs = (cssNs as unknown as { default?: typeof cssNs }).default ?? cssNs;
const { getLanguageService: htmlService, getDefaultHTMLDataProvider, newHTMLDataProvider, TokenType } = htmlLs;
const { getCSSLanguageService } = cssLs;

/**
 * HTML for FRONTEND-100.md F51–F70: VS Code's HTML language service (completion of tags, attributes, values and
 * entities; closing tags; folding; formatting), the project's custom elements as HTML data, CSS inside <style> and
 * style="" through the CSS service, and the studio's own checks (structure, attributes, nesting, accessibility,
 * ARIA) and actions (wrap, unwrap, entities, id / class navigation).
 */
const defaults = getDefaultHTMLDataProvider();
const css = getCSSLanguageService();
const doc = (file: string, text: string, lang = 'html') => TextDocument.create(`file:///${file}`, lang, 1, text);
export const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
// Elements whose end tag may be left out (HTML's optional end tags).
const OPTIONAL_END = new Set(['li', 'p', 'td', 'th', 'tr', 'option', 'optgroup', 'dt', 'dd', 'thead', 'tbody', 'tfoot', 'colgroup', 'rt', 'rp', 'html', 'head', 'body']);

/** F69: custom elements of the project — `customElements.define('x-y', …)` in its scripts, and VS Code html.customData files. */
const customCache = new Map<string, { at: number; provider: IHTMLDataProvider; names: Set<string> }>();
export function customElements(root: string) {
  const hit = customCache.get(root);
  if (hit && Date.now() - hit.at < 5000) return hit;
  const tags: { name: string; description?: string; attributes: { name: string }[] }[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 8) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!['node_modules', '.git', 'dist', 'build', 'bin', 'obj'].includes(e.name)) walk(`${dir}/${e.name}`, depth + 1); continue; }
      if (!/\.(m?[jt]sx?)$/.test(e.name)) continue;
      const text = readFileSync(`${dir}/${e.name}`, 'utf8');
      for (const m of text.matchAll(/customElements\.define\(\s*['"]([a-z][\w-]*-[\w-]*)['"]\s*,\s*(\w+)/g)) {
        // observedAttributes of the class become its attributes.
        const cls = new RegExp(`class\\s+${m[2]}[\\s\\S]*?observedAttributes[^\\[]*\\[([^\\]]*)\\]`).exec(text);
        const attributes = cls ? [...cls[1].matchAll(/['"]([\w-]+)['"]/g)].map((a) => ({ name: a[1] })) : [];
        tags.push({ name: m[1], description: `Custom element (${m[2]}, ${path.posix.relative(root, `${dir}/${e.name}`)})`, attributes });
      }
    }
  };
  try { walk(root.replace(/\\/g, '/'), 0); } catch { /* unreadable folder */ }
  // .vscode/settings.json "html.customData": ["./custom-data.json"].
  try {
    const settings = path.join(root, '.vscode', 'settings.json');
    const list = existsSync(settings) ? (JSON.parse(readFileSync(settings, 'utf8').replace(/^\s*\/\/.*$/gm, ''))['html.customData'] as string[] | undefined) : undefined;
    for (const f of list ?? []) { const data = JSON.parse(readFileSync(path.resolve(root, f), 'utf8')) as { tags?: typeof tags }; tags.push(...(data.tags ?? []).map((t) => ({ ...t, attributes: t.attributes ?? [] }))); }
  } catch { /* no custom data */ }
  const value = { at: Date.now(), provider: newHTMLDataProvider('project', { version: 1.1, tags }), names: new Set(tags.map((t) => t.name)) };
  customCache.set(root, value);
  return value;
}
const service = (root: string) => htmlService({ customDataProviders: [defaults, customElements(root).provider] });

/** The <style> element or style="" attribute around a position: its text with everything else blanked (same offsets). */
function embeddedCss(text: string, pos: number): { text: string; inline: boolean } | undefined {
  const blank = (from: number, to: number) => text.slice(0, from).replace(/[^\n]/g, ' ') + text.slice(from, to) + text.slice(to).replace(/[^\n]/g, ' ');
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const from = m.index! + m[0].indexOf('>') + 1, to = from + m[1].length;
    if (pos >= from && pos <= to) return { text: blank(from, to), inline: false };
  }
  for (const m of text.matchAll(/\sstyle\s*=\s*(["'])([^"']*)\1/gi)) {
    const from = m.index! + m[0].indexOf(m[1]) + 1, to = from + m[2].length;
    // An inline style is a declaration list: `*{…}` in place of `="…"` makes it a rule (same offsets), as in VS Code.
    if (pos >= from && pos <= to) { const b = blank(from, to); return { text: `${b.slice(0, from - 2)}*{${b.slice(from, to)}}${b.slice(to + 1)}`.slice(0, text.length).padEnd(text.length, ' '), inline: true }; }
  }
  return undefined;
}

export type Item = { label: string; kind: string; insert: string; snippet: boolean; from: number; to: number; detail?: string };
export function htmlComplete(root: string, file: string, text: string, pos: number): Item[] {
  const d = doc(file, text);
  const at = d.positionAt(pos);
  // F70 Language injection: CSS completion inside <style> and style="".
  const embedded = embeddedCss(text, pos);
  if (embedded) {
    const cd = doc(file, embedded.text, 'css');
    const list = css.doComplete(cd, at, css.parseStylesheet(cd));
    return list.items.map((i) => itemOf(cd, i, pos));
  }
  const ls = service(root);
  const list = ls.doComplete(d, at, ls.parseHTMLDocument(d), { hideAutoCompleteProposals: true });
  return list.items.map((i) => itemOf(d, i, pos));
}
const KINDS: Record<number, string> = { 10: 'property', 12: 'enum', 14: 'keyword', 21: 'constant', 7: 'class', 3: 'function', 15: 'text', 6: 'variable', 9: 'namespace', 16: 'constant' };
function itemOf(d: TextDocument, i: import('vscode-languageserver-types').CompletionItem, pos: number): Item {
  const edit = i.textEdit && 'range' in i.textEdit ? i.textEdit : undefined;
  return { label: i.label, kind: KINDS[i.kind ?? 0] ?? 'text', insert: edit?.newText ?? i.insertText ?? i.label, snippet: i.insertTextFormat === 2, from: edit ? d.offsetAt(edit.range.start) : pos, to: edit ? d.offsetAt(edit.range.end) : pos, detail: typeof i.documentation === 'string' ? i.documentation.slice(0, 120) : i.detail };
}

/** F54: the closing tag after typing `>` or `</` (the service's text, `$0` the caret). */
export function htmlTagComplete(root: string, file: string, text: string, pos: number) {
  const d = doc(file, text);
  const ls = service(root);
  return ls.doTagComplete(d, d.positionAt(pos), ls.parseHTMLDocument(d)) ?? null;
}

/** F68 HTML document formatting (embedded CSS and JavaScript included). */
export function htmlFormat(root: string, file: string, text: string) {
  const d = doc(file, text);
  const edits = service(root).format(d, undefined, { tabSize: 2, insertSpaces: true, indentInnerHtml: false, wrapLineLength: 120, unformatted: 'wbr', contentUnformatted: 'pre,code,textarea', endWithNewline: true, extraLiners: 'head, body, /html', wrapAttributes: 'auto' });
  return TextDocument.applyEdits(d, edits);
}

// ---- Checks: F58 structure, F59 attributes, F60 nesting, F63 accessibility, F64 ARIA ----
export type Problem = { from: number; to: number; severity: 'error' | 'warning' | 'info'; message: string; rule: string };
const ROLES = new Set('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem'.split(' '));
const ARIA_BOOL = new Set(['aria-hidden', 'aria-disabled', 'aria-required', 'aria-readonly', 'aria-multiline', 'aria-multiselectable', 'aria-modal', 'aria-atomic', 'aria-busy']);
const ARIA_IDREFS = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant', 'aria-errormessage', 'aria-details', 'aria-flowto'];
const PARENTS: Record<string, string[]> = { li: ['ul', 'ol', 'menu'], tr: ['table', 'thead', 'tbody', 'tfoot'], td: ['tr'], th: ['tr'], option: ['select', 'datalist', 'optgroup'], dt: ['dl', 'div'], dd: ['dl', 'div'], figcaption: ['figure'], legend: ['fieldset'], summary: ['details'], thead: ['table'], tbody: ['table'], tfoot: ['table'], caption: ['table'], colgroup: ['table'] };
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'ul']);
const INTERACTIVE = new Set(['a', 'button', 'details', 'label', 'select', 'textarea', 'iframe']);
const attrValue = (n: HtmlNode, name: string) => { const v = n.attributes?.[name]; return v == null ? undefined : v.replace(/^(["'])([\s\S]*)\1$/, '$2'); };

export function htmlProblems(root: string, file: string, text: string): Problem[] {
  const out: Problem[] = [];
  const d = doc(file, text);
  const ls = service(root);
  const html = ls.parseHTMLDocument(d);
  const custom = customElements(root).names;

  // F58 Tag structure: end tags without a start tag, elements left open.
  const scanner = ls.createScanner(text);
  const stack: { name: string; from: number; to: number }[] = [];
  let tag = '', tagFrom = 0, selfClosing = false;
  for (let t = scanner.scan(); t !== TokenType.EOS; t = scanner.scan()) {
    if (t === TokenType.StartTag) { tag = scanner.getTokenText().toLowerCase(); tagFrom = scanner.getTokenOffset(); selfClosing = false; }
    else if (t === TokenType.StartTagSelfClose) selfClosing = true;
    else if (t === TokenType.StartTagClose && tag) { if (!VOID.has(tag) && !selfClosing) stack.push({ name: tag, from: tagFrom, to: tagFrom + tag.length }); tag = ''; }
    else if (t === TokenType.EndTag) {
      const name = scanner.getTokenText().toLowerCase(), from = scanner.getTokenOffset();
      const i = stack.map((s) => s.name).lastIndexOf(name);
      if (i < 0) { out.push({ from, to: from + name.length, severity: 'error', rule: 'html-structure', message: `Closing tag </${name}> has no matching <${name}>.` }); continue; }
      for (const open of stack.splice(i).slice(1)) if (!OPTIONAL_END.has(open.name)) out.push({ ...open, severity: 'error', rule: 'html-structure', message: `<${open.name}> is not closed before </${name}>.` });
    }
  }
  for (const open of stack) if (!OPTIONAL_END.has(open.name)) out.push({ ...open, severity: 'error', rule: 'html-structure', message: `<${open.name}> is not closed.` });

  const ids = new Map<string, number>();
  const all: HtmlNode[] = [];
  const collect = (n: HtmlNode) => { all.push(n); n.children.forEach(collect); };
  html.roots.forEach(collect);
  for (const n of all) { const id = attrValue(n, 'id'); if (id) ids.set(id, (ids.get(id) ?? 0) + 1); }
  const labelled = new Set(all.filter((n) => n.tag === 'label').map((n) => attrValue(n, 'for')).filter(Boolean));
  const nameRange = (n: HtmlNode) => ({ from: n.start + 1, to: n.start + 1 + (n.tag?.length ?? 0) });
  const attrRange = (n: HtmlNode, a: string) => { const i = text.slice(n.start, n.startTagEnd ?? n.end).search(new RegExp(`\\s${a.replace(/[-[\]]/g, '\\$&')}(\\s*=|[\\s/>])`, 'i')); return i < 0 ? nameRange(n) : { from: n.start + i + 1, to: n.start + i + 1 + a.length }; };
  const textOf = (n: HtmlNode) => text.slice(n.startTagEnd ?? n.end, n.endTagStart ?? n.end).replace(/<[^>]*>/g, '').trim();

  for (const n of all) {
    const tagName = n.tag?.toLowerCase();
    if (!tagName) continue;
    const isCustom = tagName.includes('-');
    const known = !isCustom && defaults.provideTags().some((t) => t.name === tagName);
    // F59 Attributes: unknown on known elements, duplicates, values outside the element's value set.
    const seen = new Set<string>();
    const raw = text.slice(n.start, n.startTagEnd ?? n.end);
    for (const m of raw.matchAll(/\s([^\s"'<>/=]+)(?=\s*=|[\s/>])/g)) {
      const a = m[1].toLowerCase();
      const r = { from: n.start + m.index! + 1, to: n.start + m.index! + 1 + m[1].length };
      if (seen.has(a)) out.push({ ...r, severity: 'warning', rule: 'html-attributes', message: `Duplicate attribute ${a} on <${tagName}>.` });
      seen.add(a);
      if (!known || a.startsWith('data-') || a.startsWith('aria-') || a === 'role' || /^on\w+$/.test(a) || a.startsWith('x-') || a.startsWith(':') || a.startsWith('@') || a.startsWith('v-')) continue;
      const attrs = defaults.provideAttributes(tagName);
      if (!attrs.some((x) => x.name === a)) out.push({ ...r, severity: 'warning', rule: 'html-attributes', message: `<${tagName}> has no attribute ${a}.` });
      else {
        const values = defaults.provideValues(tagName, a).map((v) => v.name);
        const v = attrValue(n, a);
        const set = attrs.find((x) => x.name === a)?.valueSet;
        if (v !== undefined && values.length && set && set !== 'v' && !values.includes(v.toLowerCase())) out.push({ ...r, severity: 'warning', rule: 'html-attributes', message: `"${v}" is not a valid value of ${a} on <${tagName}> (${values.slice(0, 8).join(', ')}${values.length > 8 ? ', …' : ''}).` });
      }
    }
    if (isCustom && !custom.has(tagName) && !tagName.includes(':')) out.push({ ...nameRange(n), severity: 'info', rule: 'html-custom', message: `<${tagName}> is not defined in this project (customElements.define or html.customData).` });
    // F60 Nesting.
    const parent = n.parent?.tag?.toLowerCase();
    if (PARENTS[tagName] && parent && !PARENTS[tagName].includes(parent)) out.push({ ...nameRange(n), severity: 'warning', rule: 'html-nesting', message: `<${tagName}> belongs in ${PARENTS[tagName].map((p) => `<${p}>`).join(' or ')}, not <${parent}>.` });
    if (BLOCK.has(tagName)) for (let p = n.parent; p; p = p.parent) if (p.tag?.toLowerCase() === 'p') { out.push({ ...nameRange(n), severity: 'warning', rule: 'html-nesting', message: `<${tagName}> cannot be inside <p> (the paragraph ends before it).` }); break; }
    if (INTERACTIVE.has(tagName)) for (let p = n.parent; p; p = p.parent) if (p.tag && INTERACTIVE.has(p.tag.toLowerCase()) && p.tag.toLowerCase() !== 'label' && p.tag.toLowerCase() !== 'details') { out.push({ ...nameRange(n), severity: 'warning', rule: 'html-nesting', message: `Interactive <${tagName}> inside interactive <${p.tag}>.` }); break; }
    if (tagName === 'form') for (let p = n.parent; p; p = p.parent) if (p.tag?.toLowerCase() === 'form') { out.push({ ...nameRange(n), severity: 'warning', rule: 'html-nesting', message: 'Forms cannot be nested.' }); break; }
    // F63 Accessibility.
    const label = attrValue(n, 'aria-label') || attrValue(n, 'aria-labelledby') || attrValue(n, 'title');
    if (tagName === 'img' && attrValue(n, 'alt') === undefined && attrValue(n, 'role') !== 'presentation') out.push({ ...nameRange(n), severity: 'warning', rule: 'a11y', message: '<img> needs an alt attribute (alt="" when it is decorative).' });
    if (tagName === 'html' && !attrValue(n, 'lang')) out.push({ ...nameRange(n), severity: 'warning', rule: 'a11y', message: '<html> needs a lang attribute.' });
    if ((tagName === 'button' || tagName === 'a') && !label && !textOf(n) && !/<img[^>]*alt="[^"]+"/.test(text.slice(n.startTagEnd ?? n.end, n.endTagStart ?? n.end))) out.push({ ...nameRange(n), severity: 'warning', rule: 'a11y', message: `<${tagName}> has no text for screen readers (add text or aria-label).` });
    if (tagName === 'iframe' && !attrValue(n, 'title')) out.push({ ...nameRange(n), severity: 'warning', rule: 'a11y', message: '<iframe> needs a title.' });
    if (['input', 'select', 'textarea'].includes(tagName) && !['hidden', 'submit', 'button', 'reset', 'image'].includes(attrValue(n, 'type') ?? '')) {
      const id = attrValue(n, 'id');
      let wrapped = false;
      for (let p = n.parent; p; p = p.parent) if (p.tag?.toLowerCase() === 'label') wrapped = true;
      if (!label && !wrapped && !(id && labelled.has(id))) out.push({ ...nameRange(n), severity: 'warning', rule: 'a11y', message: `<${tagName}> has no label (a <label for>, a wrapping <label> or aria-label).` });
    }
    const id = attrValue(n, 'id');
    if (id && (ids.get(id) ?? 0) > 1) out.push({ ...attrRange(n, 'id'), severity: 'warning', rule: 'html-id', message: `The id "${id}" is used more than once.` });
    // F64 ARIA.
    const role = attrValue(n, 'role');
    if (role !== undefined) for (const r of role.split(/\s+/).filter(Boolean)) if (!ROLES.has(r)) out.push({ ...attrRange(n, 'role'), severity: 'warning', rule: 'aria', message: `"${r}" is not an ARIA role.` });
    for (const a of Object.keys(n.attributes ?? {})) {
      if (!a.startsWith('aria-')) continue;
      const known2 = defaults.provideAttributes('div').some((x) => x.name === a);
      if (!known2) { out.push({ ...attrRange(n, a), severity: 'warning', rule: 'aria', message: `${a} is not an ARIA attribute.` }); continue; }
      const v = attrValue(n, a) ?? '';
      if (ARIA_BOOL.has(a) && !['true', 'false'].includes(v)) out.push({ ...attrRange(n, a), severity: 'warning', rule: 'aria', message: `${a} must be "true" or "false".` });
      if (ARIA_IDREFS.includes(a)) for (const ref of v.split(/\s+/).filter(Boolean)) if (!ids.has(ref)) out.push({ ...attrRange(n, a), severity: 'warning', rule: 'aria', message: `${a} refers to "${ref}", but no element has that id.` });
    }
  }
  return out.sort((a, b) => a.from - b.from);
}

/** The parsed document and the element at an offset (innermost). */
export function elementAt(root: string, file: string, text: string, pos: number) {
  const d = doc(file, text);
  const html: HTMLDocument = service(root).parseHTMLDocument(d);
  return html.findNodeAt(pos);
}
export const parseHtml = (root: string, file: string, text: string) => service(root).parseHTMLDocument(doc(file, text));
export { attrValue, doc as textDocument };
