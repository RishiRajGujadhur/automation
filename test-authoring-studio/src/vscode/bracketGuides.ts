import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, type Text } from '@codemirror/state';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Bracket pair guides (VS Code's editor.guides.bracketPairs): a vertical line for each bracket pair over several lines. */
export const bracketGuides = {
  mode: defineSetting<'true' | 'active' | 'false'>({
    key: 'editor.guides.bracketPairs', category: 'Text Editor', title: 'Guides: Bracket Pairs', type: 'enum', default: 'false', description: 'Controls whether bracket pair guides are enabled or not.',
    options: [{ value: 'true', description: 'Enables bracket pair guides.' }, { value: 'active', description: 'Enables bracket pair guides only for the active bracket pair.' }, { value: 'false', description: 'Disables bracket pair guides.' }],
  }),
  highlightActive: defineSetting<boolean>({ key: 'editor.guides.highlightActiveBracketPair', category: 'Text Editor', title: 'Guides: Highlight Active Bracket Pair', type: 'boolean', default: true, description: 'Controls whether the editor should highlight the active bracket pair.' }),
};

export type Pair = { open: number; close: number; openLine: number; closeLine: number; column: number; depth: number };
const OPEN = '([{', CLOSE = ')]}';
/** Multi-line bracket pairs of a text, skipping strings and // comments. `column` is the closing bracket's column. Pure. */
export function bracketPairs(text: string, tabSize = 4, maxLines = 20000): Pair[] {
  const out: Pair[] = [];
  const stack: { ch: string; at: number; line: number }[] = [];
  let line = 1, lineStart = 0, quote = '', comment = false, block = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') { line++; lineStart = i + 1; comment = false; if (quote !== '`') quote = ''; if (line > maxLines) break; continue; }
    if (comment) continue;
    if (block) { if (c === '*' && text[i + 1] === '/') { block = false; i++; } continue; }
    if (quote) { if (c === '\\') { i++; continue; } if (c === quote) quote = ''; continue; }
    if (c === '/' && text[i + 1] === '/') { comment = true; continue; }
    if (c === '/' && text[i + 1] === '*') { block = true; i++; continue; }
    if (c === '"' || c === '\'' || c === '`') { quote = c; continue; }
    const o = OPEN.indexOf(c);
    if (o >= 0) { stack.push({ ch: c, at: i, line }); continue; }
    const k = CLOSE.indexOf(c);
    if (k < 0) continue;
    let j = stack.length - 1;
    while (j >= 0 && stack[j].ch !== OPEN[k]) j--;
    if (j < 0) continue;
    const top = stack[j];
    stack.length = j;
    if (top.line === line) continue;
    let col = 0;
    for (let x = lineStart; x < i; x++) col += text[x] === '\t' ? tabSize - (col % tabSize) : 1;
    out.push({ open: top.at, close: i, openLine: top.line, closeLine: line, column: col, depth: j });
  }
  return out;
}
const COLOURS = ['#ffd700', '#da70d6', '#179fff'];
const cache = new WeakMap<Text, Pair[]>();
const pairsOf = (doc: Text, tab: number) => { let p = cache.get(doc); if (!p) { p = bracketPairs(doc.toString(), tab); cache.set(doc, p); } return p; };
function build(view: EditorView, mode: string): DecorationSet {
  const st = view.state;
  const pairs = pairsOf(st.doc, st.tabSize);
  const head = st.selection.main.head;
  const active = pairs.filter((p) => p.open < head && p.close >= head).sort((a, b) => b.open - a.open)[0];
  const shown = mode === 'active' ? (active ? [active] : []) : pairs;
  const perLine = new Map<number, { col: number; colour: string; strong: boolean }[]>();
  for (const p of shown) for (let l = p.openLine + 1; l < p.closeLine; l++) {
    const strong = p === active && bracketGuides.highlightActive();
    const list = perLine.get(l) ?? [];
    list.push({ col: p.column, colour: COLOURS[p.depth % COLOURS.length], strong });
    perLine.set(l, list);
  }
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = st.doc.lineAt(pos);
      const g = perLine.get(line.number);
      if (g) {
        const image = g.map((x) => { const c = x.strong ? x.colour : `${x.colour}66`; return `linear-gradient(to right, transparent calc(${x.col}ch + 6px), ${c} calc(${x.col}ch + 6px), ${c} calc(${x.col}ch + 7px), transparent calc(${x.col}ch + 7px))`; }).join(', ');
        b.add(line.from, line.from, Decoration.line({ class: 'cm-bracket-guide', attributes: { style: `background-image: ${image}; background-repeat: no-repeat`, 'data-guides': g.map((x) => x.col).join(',') } }));
      }
      pos = line.to + 1;
    }
  }
  return b.finish();
}
settingsExtension(() => {
  const mode = bracketGuides.mode();
  if (mode === 'false') return [];
  void bracketGuides.highlightActive();
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view, mode); }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || u.selectionSet) this.decorations = build(u.view, mode); }
  }, { decorations: (v) => v.decorations });
});
