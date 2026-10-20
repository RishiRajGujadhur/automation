import { useSyncExternalStore } from 'react';
import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Bookmarks (Visual Studio Ctrl+K Ctrl+K / Rider F11): per workspace, kept in this browser. Each editor shows its
 * file's bookmarks in the margin and moves them with edits; the Bookmarks list jumps to any of them.
 */
/** `digit`: a numbered bookmark (Rider's mnemonic bookmarks: Ctrl+Shift+digit sets it, Ctrl+digit jumps). */
export type Bookmark = { file: string; line: number; text: string; digit?: string };
const KEY = () => `tas:bookmarks:${location.pathname}`;
let marks: Bookmark[] = (() => { try { return JSON.parse(localStorage.getItem(KEY()) ?? '[]') as Bookmark[]; } catch { return []; } })();
const listeners = new Set<() => void>();
function save(next: Bookmark[]) {
  marks = next.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  try { localStorage.setItem(KEY(), JSON.stringify(marks)); } catch { /* storage blocked */ }
  for (const l of listeners) l();
}
export const getBookmarks = () => marks;
export const useBookmarks = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => marks);
export const removeBookmark = (b: Bookmark) => save(marks.filter((m) => !(m.file === b.file && m.line === b.line)));
export const bookmarkByDigit = (digit: string) => marks.find((m) => m.digit === digit);
/** Clear All Bookmarks (Visual Studio's Bookmarks window ▸ Delete All). */
export const clearBookmarks = () => save([]);

class Mark extends GutterMarker {
  constructor(readonly digit?: string) { super(); }
  eq(o: Mark) { return o.digit === this.digit; }
  toDOM() {
    const s = document.createElement('span');
    s.className = this.digit ? 'cm-bookmark cm-bookmark-digit' : 'cm-bookmark';
    s.title = this.digit ? `Bookmark ${this.digit} (Ctrl+${this.digit} jumps here)` : 'Bookmark (Ctrl+K Ctrl+K)';
    s.textContent = this.digit ?? '🔖';
    return s;
  }
}
const MARKS = new Map<string, Mark>();
const markFor = (digit?: string) => { const k = digit ?? ''; if (!MARKS.has(k)) MARKS.set(k, new Mark(digit)); return MARKS.get(k)!; };
type LineMark = { line: number; digit?: string };
const setLines = StateEffect.define<LineMark[]>();
const field = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setLines)) {
      const doc = tr.state.doc;
      return RangeSet.of(e.value.filter((m) => m.line >= 1 && m.line <= doc.lines).sort((a, b) => a.line - b.line).map((m) => markFor(m.digit).range(doc.line(m.line).from)));
    }
    return set.map(tr.changes);
  },
});
const linesOf = (view: EditorView) => { const out: LineMark[] = []; view.state.field(field).between(0, view.state.doc.length, (from, _to, m) => { out.push({ line: view.state.doc.lineAt(from).number, digit: (m as Mark).digit }); }); return out; };

export function bookmarks(file: string): Extension {
  const toggle = (view: EditorView) => {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const has = marks.some((m) => m.file === file && m.line === line.number);
    save(has ? marks.filter((m) => !(m.file === file && m.line === line.number)) : [...marks, { file, line: line.number, text: line.text.trim().slice(0, 120) }]);
    return true;
  };
  /** Ctrl+Shift+digit: a numbered bookmark on this line (again: removed); the digit moves from wherever it was. */
  const toggleDigit = (view: EditorView, digit: string) => {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const here = marks.find((m) => m.file === file && m.line === line.number);
    const rest = marks.filter((m) => m !== here && m.digit !== digit);
    save(here?.digit === digit ? rest : [...rest, { file, line: line.number, text: line.text.trim().slice(0, 120), digit }]);
    return true;
  };
  const jump = (dir: 1 | -1) => (view: EditorView) => {
    const here = view.state.doc.lineAt(view.state.selection.main.head).number;
    const lines = marks.filter((m) => m.file === file).map((m) => m.line).sort((a, b) => a - b);
    if (!lines.length) return true;
    const target = dir > 0 ? lines.find((l) => l > here) ?? lines[0] : [...lines].reverse().find((l) => l < here) ?? lines[lines.length - 1];
    const at = view.state.doc.line(Math.min(target, view.state.doc.lines)).from;
    view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    return true;
  };
  const sync = ViewPlugin.fromClass(class {
    off: () => void;
    timer = 0;
    constructor(readonly view: EditorView) {
      const apply = () => { const lines = marks.filter((m) => m.file === file).map((m) => ({ line: m.line, digit: m.digit })); queueMicrotask(() => view.dispatch({ effects: setLines.of(lines) })); };
      listeners.add(apply);
      this.off = () => listeners.delete(apply);
      apply();
    }
    // Edits move the marks: write the new lines back (debounced).
    update(u: ViewUpdate) {
      if (!u.docChanged) return;
      clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        const lines = linesOf(this.view);
        const mine = marks.filter((m) => m.file === file);
        const before = mine.map((m) => m.line).sort((a, b) => a - b);
        if (lines.length === mine.length && lines.every((l, i) => l.line === before[i])) return;
        save([...marks.filter((m) => m.file !== file), ...lines.map((l) => ({ file, line: l.line, text: this.view.state.doc.line(l.line).text.trim().slice(0, 120), ...(l.digit ? { digit: l.digit } : {}) }))]);
      }, 500);
    }
    destroy() { this.off(); clearTimeout(this.timer); }
  });
  return [
    field,
    sync,
    gutter({ class: 'cm-bookmark-gutter', markers: (v) => v.state.field(field) }),
    // Ctrl+Shift+digit (the physical key: Shift turns 1 into ! on most layouts).
    EditorView.domEventHandlers({ keydown: (e, view) => { const d = /^Digit(\d)$/.exec(e.code)?.[1]; if (!d || !(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return false; e.preventDefault(); return toggleDigit(view, d); } }),
    keymap.of([
      { key: 'Mod-k Mod-k', preventDefault: true, run: toggle },
      { key: 'Mod-k Mod-n', preventDefault: true, run: jump(1) },
      { key: 'Mod-k Mod-p', preventDefault: true, run: jump(-1) },
    ]),
  ];
}
