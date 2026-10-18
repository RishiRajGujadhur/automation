import { Compartment, EditorSelection, Prec, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, highlightWhitespace, highlightTrailingWhitespace, rectangularSelection, keymap } from '@codemirror/view';

/** View ▸ Active Editor options (Rider): soft wraps, …, shared by every editor and remembered. */
export type ViewOptions = { softWrap: boolean; whitespace: boolean; fontSize: number | null; columnMode?: boolean };
const KEY = 'tas:rider:view';
const DEFAULTS: ViewOptions = { softWrap: false, whitespace: false, fontSize: null };
let options: ViewOptions = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; } })();
const listeners = new Set<() => void>();
export const viewOptions = () => options;
export function setViewOptions(next: Partial<ViewOptions>) {
  options = { ...options, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(options)); } catch { /* storage blocked */ }
  for (const l of listeners) l();
}

/** The current editor font size in pixels (the theme's when none was set). */
export function fontSizeOf(view?: EditorView) {
  if (options.fontSize) return options.fontSize;
  const el = view?.contentDOM ?? document.querySelector('.cm-content');
  return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) || 13 : 13;
}
/** Increase / Decrease Font Size (by one pixel, 8–40); 0 resets to the theme's size. */
export function changeFontSize(step: number, view?: EditorView) {
  setViewOptions({ fontSize: step === 0 ? null : Math.max(8, Math.min(40, fontSizeOf(view) + step)) });
}

/** Column Selection Mode (Rider, Alt+Shift+Insert): Shift+↑/↓ grows a column block of carets at the same column. */
function columnStep(dir: 1 | -1) {
  return (view: EditorView) => {
    const st = view.state;
    const ranges = st.selection.ranges;
    const edge = dir > 0 ? ranges.reduce((a, b) => (b.head > a.head ? b : a)) : ranges.reduce((a, b) => (b.head < a.head ? b : a));
    const line = st.doc.lineAt(edge.head);
    const next = line.number + dir;
    if (next < 1 || next > st.doc.lines) return true;
    const target = st.doc.line(next);
    const anchorCol = edge.anchor - st.doc.lineAt(edge.anchor).from, headCol = edge.head - line.from;
    const r = EditorSelection.range(target.from + Math.min(anchorCol, target.length), target.from + Math.min(headCol, target.length));
    view.dispatch({ selection: EditorSelection.create([...ranges, r], ranges.length), scrollIntoView: true });
    return true;
  };
}
const columnMode = [
  rectangularSelection({ eventFilter: (e) => e.button === 0 }),
  Prec.highest(keymap.of([{ key: 'Shift-ArrowDown', run: columnStep(1) }, { key: 'Shift-ArrowUp', run: columnStep(-1) }])),
  EditorView.editorAttributes.of({ class: 'cm-column-mode' }),
];

const wrap = new Compartment();
const column = new Compartment();
const spaces = new Compartment();
const font = new Compartment();
const fontTheme = (px: number | null) => (px ? EditorView.theme({ '&': { fontSize: `${px}px` }, '.cm-content, .cm-gutters': { fontSize: `${px}px` } }) : []);
const extensionsFor = (o: ViewOptions) => ({ column: o.columnMode ? columnMode : [], font: fontTheme(o.fontSize), wrap: o.softWrap ? EditorView.lineWrapping : [], spaces: o.whitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : [] });

/** Applies the options to an editor and follows later changes. */
export function viewOptionsExtension(): Extension {
  const now = extensionsFor(options);
  return [
    wrap.of(now.wrap),
    spaces.of(now.spaces),
    font.of(now.font),
    column.of(now.column),
    ViewPlugin.fromClass(class {
      off: () => void;
      constructor(view: EditorView) {
        const apply = () => { const e = extensionsFor(options); view.dispatch({ effects: [wrap.reconfigure(e.wrap), spaces.reconfigure(e.spaces), font.reconfigure(e.font), column.reconfigure(e.column)] }); };
        listeners.add(apply);
        // Ctrl+Mouse Wheel changes the font size of the editors (Rider's "Change font size with Ctrl+Mouse Wheel").
        const wheel = (e: WheelEvent) => {
          if (!(e.ctrlKey || e.metaKey) || !e.deltaY) return;
          e.preventDefault();
          changeFontSize(e.deltaY < 0 ? 1 : -1, view);
        };
        view.dom.addEventListener('wheel', wheel, { passive: false });
        this.off = () => { listeners.delete(apply); view.dom.removeEventListener('wheel', wheel); };
      }
      destroy() { this.off(); }
    }),
  ];
}
