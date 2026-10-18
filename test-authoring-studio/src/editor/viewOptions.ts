import { Compartment, type Extension } from '@codemirror/state';
import { EditorView, ViewPlugin, highlightWhitespace, highlightTrailingWhitespace } from '@codemirror/view';

/** View ▸ Active Editor options (Rider): soft wraps, …, shared by every editor and remembered. */
export type ViewOptions = { softWrap: boolean; whitespace: boolean };
const KEY = 'tas:rider:view';
const DEFAULTS: ViewOptions = { softWrap: false, whitespace: false };
let options: ViewOptions = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; } })();
const listeners = new Set<() => void>();
export const viewOptions = () => options;
export function setViewOptions(next: Partial<ViewOptions>) {
  options = { ...options, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(options)); } catch { /* storage blocked */ }
  for (const l of listeners) l();
}

const wrap = new Compartment();
const spaces = new Compartment();
const extensionsFor = (o: ViewOptions) => ({ wrap: o.softWrap ? EditorView.lineWrapping : [], spaces: o.whitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : [] });

/** Applies the options to an editor and follows later changes. */
export function viewOptionsExtension(): Extension {
  const now = extensionsFor(options);
  return [
    wrap.of(now.wrap),
    spaces.of(now.spaces),
    ViewPlugin.fromClass(class {
      off: () => void;
      constructor(view: EditorView) {
        const apply = () => { const e = extensionsFor(options); view.dispatch({ effects: [wrap.reconfigure(e.wrap), spaces.reconfigure(e.spaces)] }); };
        listeners.add(apply);
        this.off = () => listeners.delete(apply);
      }
      destroy() { this.off(); }
    }),
  ];
}
