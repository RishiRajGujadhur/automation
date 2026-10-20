import type { Extension } from '@codemirror/state';
import { StateEffect } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, type ViewUpdate } from '@codemirror/view';
import { api } from '../api';
import { featureOn } from '../features';
import { FILE_SAVED_EVENT } from './events';

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
