import { forEachDiagnostic } from '@codemirror/lint';
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/**
 * Scroll bar annotations (Visual Studio's scroll bar marks): errors, warnings and the caret line as marks over the
 * editor's vertical scroll bar, at their place in the file.
 */
export const scrollMarks = [
  ViewPlugin.fromClass(class {
    dom: HTMLElement;
    constructor(readonly view: EditorView) {
      this.dom = document.createElement('div');
      this.dom.className = 'cm-scroll-annotations';
      this.dom.setAttribute('aria-hidden', 'true');
      view.dom.appendChild(this.dom);
      this.draw();
    }
    update(u: ViewUpdate) { if (u.docChanged || u.selectionSet || u.transactions.length) this.draw(); }
    draw() {
      const { state } = this.view;
      const at = (pos: number) => (((state.doc.lineAt(Math.min(pos, state.doc.length)).number - 1) / Math.max(1, state.doc.lines)) * 100).toFixed(2);
      const marks: string[] = [];
      forEachDiagnostic(state, (d) => { marks.push(`<i class="m-${d.severity}" style="top:${at(d.from)}%"></i>`); });
      marks.push(`<i class="m-caret" style="top:${at(state.selection.main.head)}%"></i>`);
      this.dom.innerHTML = marks.join('');
    }
    destroy() { this.dom.remove(); }
  }),
  EditorView.baseTheme({
    '.cm-scroll-annotations': { position: 'absolute', top: '0', right: '0', bottom: '0', width: '7px', pointerEvents: 'none', zIndex: '5' },
    '.cm-scroll-annotations i': { position: 'absolute', left: '0', right: '0', height: '3px' },
    '.cm-scroll-annotations .m-error': { background: '#e5484d' },
    '.cm-scroll-annotations .m-warning': { background: '#d4a72c' },
    '.cm-scroll-annotations .m-info, .cm-scroll-annotations .m-hint': { background: '#3e7bdd', height: '2px' },
    '.cm-scroll-annotations .m-caret': { background: '#888', height: '2px', opacity: '0.8' },
  }),
];
