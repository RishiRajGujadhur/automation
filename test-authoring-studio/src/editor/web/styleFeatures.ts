import { autocompletion, snippet, type Completion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { linter, type Diagnostic } from '@codemirror/lint';
import { Decoration, EditorView, ViewPlugin, WidgetType, hoverTooltip, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { api } from '../../api';
import { gateSource } from '../../vscode/suggestions';
import { cmSnippet } from './markupFeatures';
import { doComplete } from '@vscode/emmet-helper';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { emmetConfig, emmetSettings } from './emmet';
import { webSnippetCompletion } from './webSnippets';

/**
 * CSS, SCSS and LESS in the editor (FRONTEND-100.md F71–F95): VS Code's CSS language services through /api/web
 * (completion, validation and lint, selector specificity on hover), colour swatches with a colour picker, and
 * gradient previews.
 */
type Item = { label: string; kind: string; insert: string; snippet: boolean; from: number; to: number; detail?: string };
type Problem = { from: number; to: number; severity: 'error' | 'warning' | 'info'; message: string; rule?: string };

const styleLinter = (file: string) => linter(async (view) => {
  const doc = view.state.doc;
  try {
    const list = await api<Problem[]>('/web/diagnostics', { file, source: doc.toString() });
    return list.filter((d) => d.from <= doc.length).map((d): Diagnostic => ({ from: d.from, to: Math.min(doc.length, Math.max(d.from + 1, d.to)), severity: d.severity, source: 'CSS', message: d.rule && !/^\w+$/.test(d.rule) ? d.message : `${d.message}${d.rule ? ` (${d.rule})` : ''}` }));
  } catch { return []; }
}, { delay: 500 });

async function complete(file: string, ctx: CompletionContext): Promise<CompletionResult | null> {
  const word = ctx.matchBefore(/[\w$@.#:-]*/);
  const before = ctx.state.sliceDoc(Math.max(0, ctx.pos - 1), ctx.pos);
  if (!ctx.explicit && !word?.text && !/[:\s(@$.#&]/.test(before)) return null;
  const items = await api<Item[]>('/web/style/complete', { file, source: ctx.state.doc.toString(), pos: ctx.pos }).catch(() => [] as Item[]);
  if (!items.length) return null;
  const from = Math.min(...items.map((i) => i.from));
  return {
    from,
    validFor: /^[\w$@.#:-]*$/,
    options: items.map((i): Completion => ({
      label: i.label, type: i.kind, detail: i.detail && i.detail.length < 50 ? i.detail : undefined, info: i.detail && i.detail.length >= 50 ? i.detail : undefined,
      apply: (view: EditorView, c: Completion, _f: number, t: number) => {
        const range = { from: i.from, to: Math.max(i.to, t) };
        if (i.snippet) snippet(cmSnippet(i.insert))(view, c, range.from, range.to);
        else view.dispatch({ changes: { from: range.from, to: range.to, insert: i.insert }, selection: { anchor: range.from + i.insert.length }, userEvent: 'input.complete' });
      },
    })),
  };
}

/** Numeric Emmet shorthands alongside the CSS language service's normal property suggestions. */
function emmetComplete(file: string, ctx: CompletionContext): CompletionResult | null {
  if (emmetSettings.suggestions() === 'never') return null;
  const document = TextDocument.create(file, 'css', 1, ctx.state.doc.toString());
  const items = doComplete(document, document.positionAt(ctx.pos), 'css', emmetConfig())?.items ?? [];
  const options: Completion[] = [];
  let from = ctx.pos;
  for (const item of items) {
    const edit = item.textEdit;
    if (!edit || !('range' in edit) || !/^[a-z-]+-?\d/i.test(item.filterText ?? '')) continue;
    const start = document.offsetAt(edit.range.start);
    from = Math.min(from, start);
    options.push({ label: item.label, type: 'property', detail: 'Emmet', boost: 50,
      apply: (view: EditorView) => snippet(cmSnippet(edit.newText))(view, null, start, document.offsetAt(edit.range.end)),
    });
  }
  return options.length ? { from, options } : null;
}

const hover = (file: string) => hoverTooltip(async (view, pos) => {
  const r = await api<{ text: string; from: number; to: number } | null>('/web/style/hover', { file, source: view.state.doc.toString(), pos }).catch(() => null);
  if (!r?.text) return null;
  return { pos: r.from, end: r.to, create: () => { const dom = document.createElement('div'); dom.className = 'cm-quickinfo'; for (const line of r.text.split(/\n{2,}/)) { const p = document.createElement(/^</.test(line) ? 'code' : 'p'); p.textContent = line.replace(/```\w*\n?/g, ''); dom.append(p); } return { dom }; } };
}, { hoverTime: 450 });

// ---- F80 colour previews, F81 colour picker, F82 gradient previews ----
const NAMED = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen';
const COLOR = new RegExp(`#[0-9a-fA-F]{8}\\b|#[0-9a-fA-F]{6}\\b|#[0-9a-fA-F]{3,4}\\b|\\b(?:rgba?|hsla?)\\([^()]*\\)|\\b(?:${NAMED.split(' ').join('|')})\\b`, 'g');
const GRADIENT = /\b(?:repeating-)?(?:linear|radial|conic)-gradient\((?:[^()]|\([^()]*\))*\)/g;
/** A colour as #rrggbb (the browser normalizes it). */
const toHex = (c: string) => { const x = document.createElement('canvas').getContext('2d')!; x.fillStyle = '#000'; x.fillStyle = c; const v = x.fillStyle; if (v.startsWith('#')) return v; const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v); return m ? `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}` : '#000000'; };
/** The picked colour in the format the value was written in. */
function formatLike(original: string, hex: string) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  if (/^rgba?\(/i.test(original)) return `rgb(${r}, ${g}, ${b})`;
  if (/^hsla?\(/i.test(original)) {
    const [R, G, B] = [r / 255, g / 255, b / 255];
    const max = Math.max(R, G, B), min = Math.min(R, G, B), l = (max + min) / 2, dd = max - min;
    const s = dd === 0 ? 0 : dd / (1 - Math.abs(2 * l - 1));
    const h = dd === 0 ? 0 : max === R ? 60 * (((G - B) / dd) % 6) : max === G ? 60 * ((B - R) / dd + 2) : 60 * ((R - G) / dd + 4);
    return `hsl(${Math.round((h + 360) % 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
  }
  return hex;
}
class Swatch extends WidgetType {
  constructor(readonly value: string, readonly from: number, readonly to: number, readonly gradient: boolean) { super(); }
  eq(o: Swatch) { return o.value === this.value && o.from === this.from && o.gradient === this.gradient; }
  toDOM(view: EditorView) {
    const el = document.createElement(this.gradient ? 'span' : 'button');
    el.className = this.gradient ? 'cm-gradient-swatch' : 'cm-color-swatch';
    el.style.background = this.value;
    el.setAttribute('aria-label', this.gradient ? `Gradient preview: ${this.value}` : `Colour ${this.value}: pick a colour`);
    el.title = this.gradient ? this.value : `${this.value} — click to pick a colour`;
    if (!this.gradient) el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // The browser's colour picker; the value is replaced in its own format as the colour changes.
      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'cm-color-input';
      input.value = toHex(this.value);
      input.setAttribute('aria-label', 'Colour picker');
      let range = { from: this.from, to: this.to };
      input.addEventListener('input', () => {
        const text = formatLike(view.state.sliceDoc(range.from, range.to), input.value);
        view.dispatch({ changes: { from: range.from, to: range.to, insert: text }, userEvent: 'input.color' });
        range = { from: range.from, to: range.from + text.length };
      });
      input.addEventListener('change', () => input.remove());
      input.addEventListener('blur', () => setTimeout(() => input.remove(), 200));
      // Outside the editor's content (CodeMirror removes DOM it did not create there), at the swatch.
      const box = el.getBoundingClientRect();
      Object.assign(input.style, { left: `${box.left}px`, top: `${box.bottom}px` });
      document.querySelectorAll('.cm-color-input').forEach((x) => x.remove());
      document.body.append(input);
      try { input.showPicker(); } catch { input.click(); }
    });
    return el;
  }
  ignoreEvent() { return false; }
}
function swatches(view: EditorView): DecorationSet {
  const marks: { from: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.sliceDoc(from, to);
    for (const m of text.matchAll(GRADIENT)) { marks.push({ from: from + m.index!, deco: Decoration.widget({ widget: new Swatch(m[0], from + m.index!, from + m.index! + m[0].length, true), side: -1 }) }); }
    for (const m of text.matchAll(COLOR)) {
      const at = m.index!;
      // Not inside a word (border-color: tan, not "tangent"), not a property name, not a selector or a variable.
      const prev = text[at - 1] ?? ' ';
      if (!/[:,(\s]/.test(prev) || /^\s*:/.test(text.slice(at + m[0].length))) continue;
      marks.push({ from: from + at, deco: Decoration.widget({ widget: new Swatch(m[0], from + at, from + at + m[0].length, false), side: -1 }) });
    }
  }
  return Decoration.set(marks.sort((a, b) => a.from - b.from).map((m) => m.deco.range(m.from)));
}
export const colorPreviews = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = swatches(view); }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = swatches(u.view); }
}, { decorations: (v) => v.decorations });

export function styleFeatures(file: string): Extension[] {
  return [
    styleLinter(file),
    autocompletion({ override: [gateSource((ctx) => complete(file, ctx)), gateSource((ctx) => emmetComplete(file, ctx)), gateSource((ctx) => webSnippetCompletion(file, ctx))], activateOnTyping: true, maxRenderedOptions: 100, icons: true }),
    hover(file),
    colorPreviews,
  ];
}
