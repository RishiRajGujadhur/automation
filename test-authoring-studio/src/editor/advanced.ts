import type { Extension } from '@codemirror/state';
import { StateEffect, StateField, type EditorState, type Range, Prec } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate, type DecorationSet, keymap } from '@codemirror/view';
import { api } from '../api';
import { featureOn } from '../features';
import { FILE_SAVED_EVENT } from './events';
import { stepBindings, setStepBindings } from './gherkin';

/**
 * Advanced Visual Studio 2026 / Rider editor features (ADVANCED-20.md, Z1–Z20). Each registers a factory here; the code
 * and Gherkin editors include them all. A factory returns [] for files (or editors) it does not apply to.
 */
export type EditorKind = 'code' | 'gherkin';
const factories: ((file: string, kind: EditorKind) => Extension)[] = [];
export const registerAdvanced = (f: (file: string, kind: EditorKind) => Extension) => { factories.push(f); };
export const advancedEditor = (file: string, kind: EditorKind): Extension[] => factories.map((f) => f(file, kind));

/* Z1 Inline Git blame (Visual Studio 2026 "Git line blame", GitLens): who last changed the caret's line, at its end. */
type Blame = { hash: string; author: string; when: string; summary: string };
const blames = new Map<string, Promise<Blame[] | null>>();
const blameOf = (file: string) => { let p = blames.get(file); if (!p) { p = api<Blame[]>(`/git/blame?file=${encodeURIComponent(file)}`).catch(() => null); blames.set(file, p); } return p; };
if (typeof window !== 'undefined') window.addEventListener(FILE_SAVED_EVENT, (e) => blames.delete((e as CustomEvent<string>).detail));
/** "today", "3 days ago", "2 months ago", "1 year ago" from a yyyy-MM-dd date. */
export function relativeDay(when: string, now = new Date()) {
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.parse(`${when}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) { const m = Math.round(days / 30); return `${m} month${m === 1 ? '' : 's'} ago`; }
  const y = Math.round(days / 365);
  return `${y} year${y === 1 ? '' : 's'} ago`;
}
class BlameWidget extends WidgetType {
  constructor(readonly b: Blame) { super(); }
  eq(o: BlameWidget) { return o.b.hash === this.b.hash; }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'cm-inline-blame';
    const mine = /^0+$/.test(this.b.hash);
    el.textContent = mine ? 'You · not committed yet' : `${this.b.author}, ${relativeDay(this.b.when)} · ${this.b.summary}`;
    el.title = mine ? 'Local change' : `${this.b.hash.slice(0, 10)} — ${this.b.author}, ${this.b.when}\n${this.b.summary}`;
    el.setAttribute('aria-label', `Blame: ${el.textContent}`);
    return el;
  }
}
const blameReady = StateEffect.define<null>();
registerAdvanced((file) => (file.startsWith('untitled') ? [] : ViewPlugin.fromClass(class {
  decorations = Decoration.none;
  data: Blame[] | null | undefined;
  constructor(view: EditorView) { this.load(view); }
  load(view: EditorView) { void blameOf(file).then((d) => { this.data = d; if (d) queueMicrotask(() => { try { view.dispatch({ effects: blameReady.of(null) }); } catch { /* destroyed */ } }); }); }
  update(u: ViewUpdate) {
    if (!featureOn('inline-blame')) { this.decorations = Decoration.none; return; }
    if (this.data === undefined) return;
    if (u.transactions.some((t) => t.effects.some((e) => e.is(blameReady))) || u.selectionSet || u.docChanged || u.focusChanged) {
      if (u.docChanged && !blames.has(file)) this.load(u.view);
      const line = u.state.doc.lineAt(u.state.selection.main.head);
      const b = this.data?.[line.number - 1];
      this.decorations = b && Math.abs(this.data!.length - u.state.doc.lines) <= 1 ? Decoration.set([Decoration.widget({ widget: new BlameWidget(b), side: 1 }).range(line.to)]) : Decoration.none;
    }
  }
}, { decorations: (v) => v.decorations })));

/* Z2 Merge conflicts (Visual Studio 2026 merge editor / Rider conflict markers): Accept Current / Incoming / Both. */
export type Conflict = { start: number; mid: number; end: number; base?: number };
/** The <<<<<<< / ======= / >>>>>>> blocks of a text, as 1-based line numbers (diff3's ||||||| kept as `base`). */
export function conflictsIn(text: string): Conflict[] {
  const out: Conflict[] = [];
  let cur: Partial<Conflict> | null = null;
  text.split('\n').forEach((l, i) => {
    const n = i + 1;
    if (l.startsWith('<<<<<<<')) cur = { start: n };
    else if (cur && l.startsWith('|||||||') && cur.mid === undefined) cur.base = n;
    else if (cur && l.startsWith('=======') && cur.mid === undefined) cur.mid = n;
    else if (cur && cur.mid !== undefined && l.startsWith('>>>>>>>')) { out.push({ ...(cur as Conflict), end: n }); cur = null; }
  });
  return out;
}
/** The text that replaces a conflict block when one side (or both) is accepted. */
export function resolveConflict(lines: string[], c: Conflict, take: 'current' | 'incoming' | 'both') {
  const current = lines.slice(c.start, (c.base ?? c.mid) - 1);
  const incoming = lines.slice(c.mid, c.end - 1);
  return take === 'current' ? current : take === 'incoming' ? incoming : [...current, ...incoming];
}
function acceptConflict(view: EditorView, c: Conflict, take: 'current' | 'incoming' | 'both') {
  const doc = view.state.doc;
  const lines = doc.toString().split('\n');
  const keep = resolveConflict(lines, c, take);
  const from = doc.line(c.start).from, to = c.end < doc.lines ? doc.line(c.end + 1).from : doc.length;
  view.dispatch({ changes: { from, to, insert: keep.length ? keep.join('\n') + (c.end < doc.lines ? '\n' : '') : '' }, userEvent: 'input' });
  view.focus();
}
class ConflictActions extends WidgetType {
  constructor(readonly c: Conflict) { super(); }
  eq(o: ConflictActions) { return o.c.start === this.c.start && o.c.end === this.c.end; }
  toDOM(view: EditorView) {
    const el = document.createElement('div');
    el.className = 'cm-conflict-actions';
    el.setAttribute('role', 'toolbar');
    el.setAttribute('aria-label', 'Merge conflict');
    for (const [take, label] of [['current', 'Accept Current'], ['incoming', 'Accept Incoming'], ['both', 'Accept Both']] as const) {
      const b = document.createElement('button');
      b.className = 'link-button';
      b.textContent = label;
      b.onmousedown = (e) => e.preventDefault();
      b.onclick = () => { const now = conflictsIn(view.state.doc.toString()).find((x) => x.start === this.c.start); if (now) acceptConflict(view, now, take); };
      el.append(b);
    }
    return el;
  }
  ignoreEvent() { return true; }
}
const CURRENT = Decoration.line({ class: 'cm-conflict-current' });
const INCOMING = Decoration.line({ class: 'cm-conflict-incoming' });
const MARKER = Decoration.line({ class: 'cm-conflict-marker' });
function conflictDecorations(state: EditorState) {
  const text = state.doc.toString();
  if (!featureOn('merge-conflicts') || !text.includes('<<<<<<<')) return Decoration.none;
  const ranges: Range<Decoration>[] = [];
  for (const c of conflictsIn(text)) {
    ranges.push(Decoration.widget({ widget: new ConflictActions(c), block: true, side: -1 }).range(state.doc.line(c.start).from));
    for (let n = c.start; n <= c.end; n++) ranges.push((n === c.start || n === c.mid || n === c.end || n === c.base ? MARKER : n < (c.base ?? c.mid) ? CURRENT : n > c.mid ? INCOMING : MARKER).range(state.doc.line(n).from));
  }
  return Decoration.set(ranges, true);
}
const conflictField = StateField.define<DecorationSet>({
  create: (s) => conflictDecorations(s),
  update: (v, tr) => (tr.docChanged ? conflictDecorations(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});
registerAdvanced(() => conflictField);
/** Navigate ▸ Next Merge Conflict: the caret on the next <<<<<<< line (wrapping). */
export function nextConflict(view: EditorView) {
  const here = view.state.doc.lineAt(view.state.selection.main.head).number;
  const all = conflictsIn(view.state.doc.toString());
  const c = all.find((x) => x.start > here) ?? all[0];
  if (!c) return false;
  const at = view.state.doc.line(c.start).from;
  view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
  return true;
}

/* Z4 Postfix templates (Rider): `expr.var`, `.if`, `.not`, `.null`, `.notnull`, `.foreach`, `.return`, `.await`, `.throw`,
   `.par` and Tab rewrite the expression. */
const POSTFIX = /([A-Za-z_@][\w.]*(?:\([^()]*\))?(?:\.[A-Za-z_]\w*(?:\([^()]*\))?)*)\.(var|if|not|null|notnull|foreach|return|await|throw|par)$/;
/** A name for a variable holding `expr`: the last identifier, Get/Find prefixes dropped, camelCase. */
const varName = (expr: string) => { const id = (/(\w+)(?:\([^()]*\))?$/.exec(expr)?.[1] ?? 'value').replace(/^(Get|Find|Create|Load|Read)(?=[A-Z])/, ''); const n = id[0].toLowerCase() + id.slice(1); return /^(class|var|int|string|new|this|base|default)$/.test(n) ? `${n}Value` : n; };
/** The text before the caret on a line → the replacement and where the caret goes (offset in the replacement). */
export function postfix(before: string, indent: string, unit = '    ') {
  const m = POSTFIX.exec(before);
  if (!m) return null;
  const expr = m[1], kind = m[2];
  const from = before.length - m[0].length;
  const block = (head: string) => { const text = `${head}\n${indent}{\n${indent}${unit}\n${indent}}`; return { from, text, caret: head.length + indent.length * 2 + unit.length + 3 }; };
  switch (kind) {
    case 'var': { const t = `var ${varName(expr)} = ${expr};`; return { from, text: t, caret: t.length }; }
    case 'if': return block(`if (${expr})`);
    case 'not': return { from, text: `!${expr}`, caret: expr.length + 1 };
    case 'null': return block(`if (${expr} is null)`);
    case 'notnull': return block(`if (${expr} is not null)`);
    case 'foreach': return block(`foreach (var item in ${expr})`);
    case 'return': return { from, text: `return ${expr};`, caret: expr.length + 8 };
    case 'await': return { from, text: `await ${expr}`, caret: expr.length + 6 };
    case 'throw': return { from, text: `throw ${expr};`, caret: expr.length + 7 };
    default: return { from, text: `(${expr})`, caret: expr.length + 2 };
  }
}
registerAdvanced((file, kind) => (kind !== 'code' || !file.endsWith('.cs') ? [] : Prec.highest(keymap.of([{
  key: 'Tab',
  run: (view) => {
    if (!featureOn('postfix-templates')) return false;
    const s = view.state.selection.main;
    if (!s.empty) return false;
    const line = view.state.doc.lineAt(s.head);
    const r = postfix(line.text.slice(0, s.head - line.from), /^\s*/.exec(line.text)![0]);
    if (!r) return false;
    view.dispatch({ changes: { from: line.from + r.from, to: s.head, insert: r.text }, selection: { anchor: line.from + r.from + r.caret }, userEvent: 'input.complete' });
    return true;
  },
}]))));

/* Z9 Inline values while debugging (Visual Studio 2026 inline values, Rider): "name = value" after the lines of the
   paused method that use a local. */
type InlineValues = { file: string; line: number; values: { name: string; value: string }[] } | null;
let lastValues: InlineValues = null;
const setInlineValues = StateEffect.define<null>();
if (typeof window !== 'undefined') window.addEventListener('tas:inline-values', (e) => { lastValues = (e as CustomEvent<InlineValues>).detail; for (const v of inlineViews) v.dispatch({ effects: setInlineValues.of(null) }); });
const inlineViews = new Set<EditorView>();
/** The values to show on each line (1-based) from `first` to `last`: locals used on that line, up to 3. */
export function inlineValuesFor(lines: string[], first: number, last: number, values: { name: string; value: string }[]) {
  const out = new Map<number, string>();
  for (let n = first; n <= last; n++) {
    const text = (lines[n - 1] ?? '').replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, '');
    const used = values.filter((v) => /^[A-Za-z_]\w*$/.test(v.name) && new RegExp(`\\b${v.name}\\b`).test(text)).slice(0, 3);
    if (used.length) out.set(n, used.map((v) => `${v.name} = ${v.value.length > 40 ? `${v.value.slice(0, 37)}…` : v.value}`).join(', '));
  }
  return out;
}
class ValueWidget extends WidgetType {
  constructor(readonly text: string) { super(); }
  eq(o: ValueWidget) { return o.text === this.text; }
  toDOM() { const el = document.createElement('span'); el.className = 'cm-inline-value'; el.textContent = this.text; return el; }
}
registerAdvanced((file) => ViewPlugin.fromClass(class {
  decorations = Decoration.none;
  constructor(readonly view: EditorView) { inlineViews.add(view); this.decorations = this.build(); }
  destroy() { inlineViews.delete(this.view); }
  update(u: ViewUpdate) { if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(setInlineValues)))) this.decorations = this.build(); }
  build() {
    const v = lastValues;
    if (!v || v.file !== file || !featureOn('inline-values')) return Decoration.none;
    const doc = this.view.state.doc;
    const lines = doc.toString().split('\n');
    const last = Math.min(v.line, doc.lines);
    let first = last;
    while (first > 1 && last - first < 40 && !/^\s*(public|private|protected|internal|static|async|void)\b.*\(/.test(lines[first - 1])) first--;
    const map = inlineValuesFor(lines, first, last, v.values);
    return Decoration.set([...map].map(([n, text]) => Decoration.widget({ widget: new ValueWidget(text), side: 1 }).range(doc.line(n).to)));
  }
}, { decorations: (p) => p.decorations }));

/* Z10 Unused step definitions (Rider's Reqnroll plugin greys them out): faded, with a tooltip, in C# step files. */
type Unused = { file: string; line: number; pattern: string };
let unusedCache: { at: number; p: Promise<Unused[]> } | undefined;
const unusedSteps = () => { if (!unusedCache || Date.now() - unusedCache.at > 15_000) unusedCache = { at: Date.now(), p: api<Unused[]>('/steps/unused').catch(() => []) }; return unusedCache.p; };
if (typeof window !== 'undefined') for (const ev of [FILE_SAVED_EVENT, 'tas:files-changed']) window.addEventListener(ev, () => { unusedCache = undefined; });
const unusedReady = StateEffect.define<null>();
registerAdvanced((file, kind) => (kind !== 'code' || !file.endsWith('.cs') ? [] : ViewPlugin.fromClass(class {
  decorations = Decoration.none;
  constructor(readonly view: EditorView) { this.load(); }
  load() {
    if (!featureOn('unused-steps')) return;
    void unusedSteps().then((list) => {
      const mine = list.filter((u) => u.file === file && u.line <= this.view.state.doc.lines);
      this.decorations = Decoration.set(mine.map((u) => Decoration.line({ class: 'cm-unused-step', attributes: { title: `Step definition not used by any feature: ${u.pattern}` } }).range(this.view.state.doc.line(u.line).from)), true);
      queueMicrotask(() => { try { this.view.dispatch({ effects: unusedReady.of(null) }); } catch { /* destroyed */ } });
    });
  }
  update(u: ViewUpdate) { if (u.docChanged) this.decorations = this.decorations.map(u.changes); }
}, { decorations: (p) => p.decorations })));

/* Z11 Steps sharing a step definition (Rider highlights usages): with the caret on a bound step, every step of the file
   bound to the same definition is highlighted. */
const SAME = Decoration.mark({ class: 'cm-same-binding', attributes: { title: 'Bound to the same step definition' } });
function sameBinding(state: EditorState) {
  if (!featureOn('same-binding')) return Decoration.none;
  const all = state.field(stepBindings, false);
  if (!all?.length) return Decoration.none;
  const line = state.doc.lineAt(state.selection.main.head);
  const here = all.find((b) => b.from <= line.to && b.to >= line.from);
  if (!here) return Decoration.none;
  const same = all.filter((b) => b.key === here.key && b.to > b.from);
  return same.length > 1 ? Decoration.set(same.map((b) => SAME.range(b.from, b.to)), true) : Decoration.none;
}
const sameBindingField = StateField.define<DecorationSet>({
  create: (s) => sameBinding(s),
  update: (v, tr) => (tr.selection || tr.effects.some((e) => e.is(setStepBindings)) || tr.docChanged ? sameBinding(tr.state) : v),
  provide: (f) => EditorView.decorations.from(f),
});
registerAdvanced((_file, kind) => (kind === 'gherkin' ? sameBindingField : []));

/* Z14 Parameter name hints in feature files (Rider shows step parameter names): "userName:" before each argument of a
   bound step. */
class ParamHint extends WidgetType {
  constructor(readonly name: string) { super(); }
  eq(o: ParamHint) { return o.name === this.name; }
  toDOM() { const el = document.createElement('span'); el.className = 'cm-param-hint'; el.textContent = `${this.name}:`; return el; }
}
function paramHints(state: EditorState) {
  if (!featureOn('step-param-hints')) return Decoration.none;
  const all = state.field(stepBindings, false) ?? [];
  const ranges = all.flatMap((b) => b.params.filter((p) => p.name && p.to > p.from).map((p) => {
    const quoted = state.sliceDoc(p.from - 1, p.from) === '"' ? p.from - 1 : p.from;
    return Decoration.widget({ widget: new ParamHint(p.name!), side: -1 }).range(quoted);
  }));
  return Decoration.set(ranges, true);
}
const paramHintField = StateField.define<DecorationSet>({
  create: (s) => paramHints(s),
  update: (v, tr) => (tr.effects.some((e) => e.is(setStepBindings)) ? paramHints(tr.state) : tr.docChanged ? v.map(tr.changes) : v),
  provide: (f) => EditorView.decorations.from(f),
});
registerAdvanced((_file, kind) => (kind === 'gherkin' ? paramHintField : []));

/* Z18 Code Vision authors (Rider): after each Feature / Rule / Scenario line, who changed the block last, when, and how
   many people worked on it (from git blame). */
/** The latest change of lines [from, to] (1-based) and the number of distinct authors. */
export function blockAuthors(lines: Blame[], from: number, to: number) {
  const slice = lines.slice(from - 1, to);
  if (!slice.length) return null;
  const mine = slice.some((b) => /^0+$/.test(b.hash));
  const committed = slice.filter((b) => !/^0+$/.test(b.hash));
  const latest = committed.reduce<Blame | null>((a, b) => (!a || b.when > a.when ? b : a), null);
  const authors = new Set(committed.map((b) => b.author)).size;
  if (mine) return { text: authors ? `You (changed) · ${authors} author${authors === 1 ? '' : 's'}` : 'You (not committed)' };
  return latest ? { text: `${latest.author}${authors > 1 ? ` +${authors - 1}` : ''} · ${relativeDay(latest.when)}`, title: `${latest.hash.slice(0, 10)} — ${latest.summary}` } : null;
}
class VisionWidget extends WidgetType {
  constructor(readonly text: string, readonly title = '') { super(); }
  eq(o: VisionWidget) { return o.text === this.text; }
  toDOM() { const el = document.createElement('span'); el.className = 'cm-code-vision'; el.textContent = this.text; if (this.title) el.title = this.title; return el; }
}
const BLOCK = /^\s*(Feature|Rule|Background|Scenario|Scenario Outline|Scenario Template|Example):/;
registerAdvanced((file, kind) => (kind !== 'gherkin' || file.startsWith('untitled') ? [] : ViewPlugin.fromClass(class {
  decorations = Decoration.none;
  data: Blame[] | null = null;
  constructor(readonly view: EditorView) { void blameOf(file).then((d) => { this.data = d; this.decorations = this.build(); queueMicrotask(() => { try { view.dispatch({ effects: blameReady.of(null) }); } catch { /* destroyed */ } }); }); }
  update(u: ViewUpdate) { if (u.docChanged) this.decorations = this.build(); }
  build() {
    if (!this.data || !featureOn('code-vision-authors')) return Decoration.none;
    const doc = this.view.state.doc;
    const heads: number[] = [];
    for (let n = 1; n <= doc.lines; n++) if (BLOCK.test(doc.line(n).text)) heads.push(n);
    return Decoration.set(heads.flatMap((n, i) => {
      const end = n === heads[0] && /^\s*Feature:/.test(doc.line(n).text) ? doc.lines : (heads[i + 1] ?? doc.lines + 1) - 1;
      const a = blockAuthors(this.data!, n, end);
      return a ? [Decoration.widget({ widget: new VisionWidget(a.text, a.title), side: 2 }).range(doc.line(n).to)] : [];
    }));
  }
}, { decorations: (p) => p.decorations })));

/* DB16 Pinned DataTips (Visual Studio): "expr = value" pinned at the end of a source line, with × to unpin. */
type Pin = { file: string; line: number; expr: string; value?: string };
let pinned: Pin[] = [];
const pinsChanged = StateEffect.define<null>();
const pinViews = new Set<EditorView>();
if (typeof window !== 'undefined') {
  try { pinned = JSON.parse(localStorage.getItem('tas:pinnedDataTips') ?? '[]') as Pin[]; } catch { /* storage blocked */ }
  window.addEventListener('tas:pinned-values', (e) => { pinned = (e as CustomEvent<Pin[]>).detail; for (const v of pinViews) v.dispatch({ effects: pinsChanged.of(null) }); });
}
class PinWidget extends WidgetType {
  constructor(readonly pins: Pin[]) { super(); }
  eq(o: PinWidget) { return JSON.stringify(o.pins) === JSON.stringify(this.pins); }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-pinned-tips';
    for (const p of this.pins) {
      const el = document.createElement('span');
      el.className = 'cm-pinned-tip';
      el.textContent = `📌 ${p.expr} = ${p.value ?? '?'}`;
      el.title = 'Pinned DataTip (updates when the debugger pauses)';
      const x = document.createElement('button');
      x.className = 'cm-pinned-close';
      x.textContent = '×';
      x.setAttribute('aria-label', `Unpin ${p.expr}`);
      x.onmousedown = (e) => e.preventDefault();
      x.onclick = () => window.dispatchEvent(new CustomEvent('tas:unpin', { detail: { file: p.file, line: p.line, expr: p.expr } }));
      el.append(x);
      wrap.append(el);
    }
    return wrap;
  }
  ignoreEvent() { return true; }
}
registerAdvanced((file) => ViewPlugin.fromClass(class {
  decorations = Decoration.none;
  constructor(readonly view: EditorView) { pinViews.add(view); this.decorations = this.build(); }
  destroy() { pinViews.delete(this.view); }
  update(u: ViewUpdate) { if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(pinsChanged)))) this.decorations = this.build(); }
  build() {
    if (!featureOn('pinned-datatips')) return Decoration.none;
    const doc = this.view.state.doc;
    const mine = pinned.filter((p) => p.file === file && p.line <= doc.lines);
    const lines = [...new Set(mine.map((p) => p.line))].sort((a, b) => a - b);
    return Decoration.set(lines.map((l) => Decoration.widget({ widget: new PinWidget(mine.filter((p) => p.line === l)), side: 3 }).range(doc.line(l).to)));
  }
}, { decorations: (p) => p.decorations }));

/* RC10 Highlight exit points (Rider): with the caret on return / throw, every exit of the method is highlighted. */
export function exitPoints(text: string, pos: number) {
  const word = /\b(return|throw)\b/g;
  let at: RegExpExecArray | null = null;
  for (let m = word.exec(text); m; m = word.exec(text)) if (pos >= m.index && pos <= m.index + m[0].length) { at = m; break; }
  if (!at) return [];
  // The enclosing block: walk back to the "{" that opens the method body (the outermost brace below the type).
  let depth = 0, open = -1;
  const opens: number[] = [];
  for (let i = at.index; i >= 0; i--) { const c = text[i]; if (c === '}') depth++; else if (c === '{') { if (depth === 0) opens.push(i); else depth--; } }
  // opens: innermost first; the method body is the second-outermost (inside the type), or the outermost in top-level code.
  open = opens.length >= 2 ? opens[opens.length - 2] : opens[0] ?? 0;
  if (opens.length >= 3 && /namespace\s+[\w.]+\s*$/.test(text.slice(0, opens[opens.length - 1]).trimEnd())) open = opens[opens.length - 3];
  let d = 0, close = text.length;
  for (let i = open; i < text.length; i++) { if (text[i] === '{') d++; else if (text[i] === '}' && --d === 0) { close = i; break; } }
  const out: { from: number; to: number }[] = [];
  const inner = /\b(return|throw)\b/g;
  inner.lastIndex = open;
  for (let m = inner.exec(text); m && m.index < close; m = inner.exec(text)) out.push({ from: m.index, to: m.index + m[0].length });
  return out;
}
const EXIT = Decoration.mark({ class: 'cm-exit-point' });
const exitField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (v, tr) => { if (!tr.selection && !tr.docChanged) return v; if (!featureOn('exit-points')) return Decoration.none; const pts = exitPoints(tr.state.doc.toString(), tr.state.selection.main.head); return pts.length > 1 ? Decoration.set(pts.map((p) => EXIT.range(p.from, p.to))) : Decoration.none; },
  provide: (f) => EditorView.decorations.from(f),
});
registerAdvanced((file, kind) => (kind === 'code' && file.endsWith('.cs') ? exitField : []));
