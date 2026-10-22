import type { EditorState, Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { defineSetting } from '../vscode/settings';

/** editor.stickyScroll.maxLineCount / scrollWithEditor (VSCODE-250.md W86). */
export const stickySettings = {
  maxLineCount: defineSetting<number>({ key: 'editor.stickyScroll.maxLineCount', category: 'Text Editor ▸ Sticky Scroll', title: 'Max Line Count', type: 'number', default: 5, min: 1, max: 20, description: 'Defines the maximum number of sticky lines to show.' }),
  scrollWithEditor: defineSetting<boolean>({ key: 'editor.stickyScroll.scrollWithEditor', category: 'Text Editor ▸ Sticky Scroll', title: 'Scroll With Editor', type: 'boolean', default: true, description: 'Enable scrolling of Sticky Scroll with the editor\'s horizontal scrollbar.' }),
};

type RangeFn = (state: EditorState, lineStart: number, lineEnd: number) => { from: number; to: number } | null;

/**
 * Sticky scroll (VS 2022 / VS Code): the lines that open the blocks around the first visible line (namespace, class,
 * method; Feature, Scenario) stay pinned at the top of the editor; clicking one goes there.
 */
export function stickyScroll(range: RangeFn): Extension {
  return ViewPlugin.fromClass(class {
    dom: HTMLDivElement;
    key = '';
    frame = 0;
    constructor(readonly view: EditorView) {
      this.dom = document.createElement('div');
      this.dom.className = 'cm-sticky';
      this.dom.setAttribute('aria-hidden', 'true');
      view.dom.appendChild(this.dom);
      this.onScroll = this.onScroll.bind(this);
      view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
      this.onScroll();
    }
    onScroll() {
      // Horizontal scrolling moves the sticky lines too (scrollWithEditor).
      this.dom.style.transform = stickySettings.scrollWithEditor() ? `translateX(${-this.view.scrollDOM.scrollLeft}px)` : '';
      cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.render());
    }
    update(u: ViewUpdate) { if (u.docChanged || u.geometryChanged || u.viewportChanged) this.onScroll(); }
    render() {
      const { view } = this;
      const doc = view.state.doc;
      const scroller = view.scrollDOM;
      if (scroller.scrollTop < 2) { this.show([]); return; }
      const top = view.lineBlockAtHeight(scroller.scrollTop + view.documentPadding.top).from;
      const topLine = doc.lineAt(top).number;
      const lines: number[] = [];
      // Walk up (bounded) collecting the lines whose block contains the first visible line.
      let pos = top;
      for (let n = topLine - 1, steps = 0; n >= 1 && steps < 2000 && lines.length < 20; n--, steps++) {
        const l = doc.line(n);
        const r = range(view.state, l.from, l.to);
        if (r && r.to >= pos) { lines.unshift(n); pos = l.from; }
      }
      // Pinned lines cover the lines under them: drop the innermost while it would hide itself.
      const shown = lines.slice(-stickySettings.maxLineCount());
      this.show(shown);
    }
    show(lines: number[]) {
      const key = lines.join(',');
      if (key === this.key) return;
      this.key = key;
      this.dom.replaceChildren();
      const doc = this.view.state.doc;
      const gutter = this.view.dom.querySelector('.cm-gutters') as HTMLElement | null;
      this.dom.style.left = `${gutter?.offsetWidth ?? 0}px`;
      for (const n of lines) {
        const row = document.createElement('div');
        row.className = 'cm-sticky-line';
        row.textContent = doc.line(n).text || ' ';
        row.title = `Line ${n}`;
        row.onmousedown = (e) => {
          e.preventDefault();
          const at = this.view.state.doc.line(Math.min(n, this.view.state.doc.lines)).from;
          this.view.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: 'start' }) });
          this.view.focus();
        };
        this.dom.appendChild(row);
      }
      this.dom.hidden = !lines.length;
    }
    destroy() { cancelAnimationFrame(this.frame); this.view.scrollDOM.removeEventListener('scroll', this.onScroll); this.dom.remove(); }
  });
}
