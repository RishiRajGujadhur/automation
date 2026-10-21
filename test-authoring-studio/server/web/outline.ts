import * as htmlNs from 'vscode-html-languageservice';
import * as cssNs from 'vscode-css-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ts, type TsProject } from './tsService.js';
import { langOf } from './styles.js';

/**
 * Document symbols of front-end files for Go to Symbol in Editor (VSCODE-250.md W3 / W4) and the Outline view:
 * TypeScript's navigation tree for scripts, VS Code's HTML / CSS language services for markup and style sheets.
 */
export type Symbol = { label: string; kind: string; line: number; column: number; depth: number; start: number; end: number };

const html = (htmlNs as unknown as { default?: typeof htmlNs }).default ?? htmlNs;
const css = (cssNs as unknown as { default?: typeof cssNs }).default ?? cssNs;
let htmlService: ReturnType<typeof html.getLanguageService> | undefined;
const cssServices = new Map<string, ReturnType<typeof css.getCSSLanguageService>>();
const cssService = (lang: 'css' | 'scss' | 'less') => {
  let s = cssServices.get(lang);
  if (!s) { s = lang === 'scss' ? css.getSCSSLanguageService() : lang === 'less' ? css.getLESSLanguageService() : css.getCSSLanguageService(); cssServices.set(lang, s); }
  return s;
};
const KINDS: Record<number, string> = { 2: 'module', 3: 'namespace', 5: 'class', 6: 'method', 7: 'property', 8: 'field', 9: 'constructor', 10: 'enum', 11: 'interface', 12: 'function', 13: 'variable', 14: 'constant', 15: 'string', 22: 'enum-member', 23: 'struct', 24: 'event', 25: 'operator', 26: 'type-parameter' };
const TS_KINDS: Record<string, string> = { class: 'class', interface: 'interface', type: 'type', enum: 'enum', 'enum member': 'enum-member', module: 'namespace', method: 'method', property: 'property', getter: 'property', setter: 'property', constructor: 'constructor', function: 'function', 'local function': 'function', var: 'variable', let: 'variable', const: 'constant', alias: 'variable', 'JSX attribute': 'property', parameter: 'variable' };

type DocSymbol = { name: string; kind: number; range: { start: { line: number; character: number }; end: { line: number; character: number } }; selectionRange: { start: { line: number; character: number } }; children?: DocSymbol[] };
function fromDocSymbols(list: DocSymbol[], text: TextDocument, depth = 0, out: Symbol[] = []) {
  for (const s of list) {
    out.push({ label: s.name, kind: KINDS[s.kind] ?? 'field', line: s.selectionRange.start.line + 1, column: s.selectionRange.start.character + 1, depth, start: s.range.start.line + 1, end: s.range.end.line + 1 });
    if (s.children?.length) fromDocSymbols(s.children, text, depth + 1, out);
  }
  return out;
}

export function scriptSymbols(p: TsProject, abs: string): Symbol[] {
  const sf = p.sourceFile(abs);
  if (!sf) return [];
  const out: Symbol[] = [];
  const walk = (n: ts.NavigationTree, depth: number) => {
    for (const c of n.childItems ?? []) {
      const kind = TS_KINDS[c.kind];
      if (!kind || !c.spans.length) { walk(c, depth); continue; }
      const span = c.nameSpan ?? c.spans[0];
      const at = sf.getLineAndCharacterOfPosition(span.start);
      const s = sf.getLineAndCharacterOfPosition(c.spans[0].start), e = sf.getLineAndCharacterOfPosition(c.spans[0].start + c.spans[0].length);
      out.push({ label: c.text, kind, line: at.line + 1, column: at.character + 1, depth, start: s.line + 1, end: e.line + 1 });
      // Members of classes, interfaces, objects; not the locals of functions (VS Code's outline shows those too, but Go to Symbol stays short).
      if (!['function', 'method', 'constructor'].includes(kind)) walk(c, depth + 1);
    }
  };
  walk(p.service.getNavigationTree(abs), 0);
  // The navigation tree is sorted by name; VS Code lists symbols in document order.
  return out.sort((a, b) => a.start - b.start || a.depth - b.depth);
}

export function markupSymbols(file: string, text: string): Symbol[] {
  htmlService ??= html.getLanguageService();
  const doc = TextDocument.create(`file:///${file}`, 'html', 1, text);
  return fromDocSymbols(htmlService.findDocumentSymbols2(doc, htmlService.parseHTMLDocument(doc)) as DocSymbol[], doc);
}

export function styleSymbols(file: string, text: string): Symbol[] {
  const lang = langOf(file);
  const s = cssService(lang);
  const doc = TextDocument.create(`file:///${file}`, lang, 1, text);
  return fromDocSymbols(s.findDocumentSymbols2(doc, s.parseStylesheet(doc)) as DocSymbol[], doc);
}
