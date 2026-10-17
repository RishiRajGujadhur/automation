import { useSyncExternalStore } from 'react';
import { RangeSet, StateEffect, StateField, type Extension } from '@codemirror/state';
import { EditorView, GutterMarker, gutter, keymap, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Bookmarks (Visual Studio Ctrl+K Ctrl+K / Rider F11): per workspace, kept in this browser. Each editor shows its
 * file's bookmarks in the margin and moves them with edits; the Bookmarks list jumps to any of them.
 */
export type Bookmark = { file: string; line: number; text: string };
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

class Mark extends GutterMarker {
  toDOM() { const s = document.createElement('span'); s.className = 'cm-bookmark'; s.title = 'Bookmark (Ctrl+K Ctrl+K)'; s.textContent = '🔖'; return s; }
}
const MARK = new Mark();
const setLines = StateEffect.define<number[]>();
const field = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    for (const e of tr.effects) if (e.is(setLines)) {
      const doc = tr.state.doc;
      return RangeSet.of(e.value.filter((n) => n >= 1 && n <= doc.lines).sort((a, b) => a - b).map((n) => MARK.range(doc.line(n).from)));
    }
    return set.map(tr.changes);
  },
});
const linesOf = (view: EditorView) => { const out: number[] = []; view.state.field(field).between(0, view.state.doc.length, (from) => { out.push(view.state.doc.lineAt(from).number); }); return out; };

export function bookmarks(file: string): Extension {
  const toggle = (view: EditorView) => {
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const has = marks.some((m) => m.file === file && m.line === line.number);
    save(has ? marks.filter((m) => !(m.file === file && m.line === line.number)) : [...marks, { file, line: line.number, text: line.text.trim().slice(0, 120) }]);
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
      const apply = () => { const lines = marks.filter((m) => m.file === file).map((m) => m.line); queueMicrotask(() => view.dispatch({ effects: setLines.of(lines) })); };
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
        if (lines.length === mine.length && lines.every((l, i) => l === mine.map((m) => m.line).sort((a, b) => a - b)[i])) return;
        save([...marks.filter((m) => m.file !== file), ...lines.map((l) => ({ file, line: l, text: this.view.state.doc.line(l).text.trim().slice(0, 120) }))]);
      }, 500);
    }
    destroy() { this.off(); clearTimeout(this.timer); }
  });
  return [
    field,
    sync,
    gutter({ class: 'cm-bookmark-gutter', markers: (v) => v.state.field(field) }),
    keymap.of([
      { key: 'Mod-k Mod-k', preventDefault: true, run: toggle },
      { key: 'Mod-k Mod-n', preventDefault: true, run: jump(1) },
      { key: 'Mod-k Mod-p', preventDefault: true, run: jump(-1) },
    ]),
  ];
}
