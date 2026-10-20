import { ViewPlugin, type EditorView } from '@codemirror/view';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Scrolling (VS Code): mouse wheel speed, faster with Alt, and smooth scrolling. */
export const scrolling = {
  sensitivity: defineSetting<number>({ key: 'editor.mouseWheelScrollSensitivity', category: 'Text Editor', title: 'Mouse Wheel Scroll Sensitivity', type: 'number', default: 1, min: 0.1, max: 10, step: 0.1, description: 'A multiplier to be used on the deltaX and deltaY of mouse wheel scroll events.' }),
  fast: defineSetting<number>({ key: 'editor.fastScrollSensitivity', category: 'Text Editor', title: 'Fast Scroll Sensitivity', type: 'number', default: 5, min: 1, max: 20, step: 0.5, description: 'Scrolling speed multiplier when pressing Alt.' }),
  smooth: defineSetting<boolean>({ key: 'editor.smoothScrolling', category: 'Text Editor', title: 'Smooth Scrolling', type: 'boolean', default: false, description: 'Controls whether the editor will scroll using an animation.' }),
};
/** Pixels to scroll for a wheel event. Pure, for the unit tests. */
export function wheelDelta(delta: number, mode: number, lineHeight: number, pageHeight: number, factor: number) {
  return delta * (mode === 1 ? lineHeight : mode === 2 ? pageHeight : 1) * factor;
}
settingsExtension(() => {
  const sens = scrolling.sensitivity(), fast = scrolling.fast(), smooth = scrolling.smooth();
  return ViewPlugin.fromClass(class {
    target: { top: number; left: number } | null = null;
    idle = 0;
    constructor(readonly view: EditorView) { view.scrollDOM.addEventListener('wheel', this.wheel, { passive: false }); }
    wheel = (e: WheelEvent) => {
      // Ctrl+wheel zooms (View ▸ font zoom); defaults leave the browser's own scrolling.
      if (e.ctrlKey || e.metaKey || (!e.altKey && sens === 1 && !smooth)) return;
      const s = this.view.scrollDOM;
      const factor = e.altKey ? fast : sens;
      // Alt+wheel on some mice sends the movement sideways.
      const dy = wheelDelta(e.altKey && !e.deltaY ? e.deltaX : e.deltaY, e.deltaMode, this.view.defaultLineHeight, s.clientHeight, factor);
      const dx = e.altKey && !e.deltaY ? 0 : wheelDelta(e.deltaX, e.deltaMode, this.view.defaultCharacterWidth, s.clientWidth, factor);
      e.preventDefault();
      if (!smooth) { s.scrollTop += dy; s.scrollLeft += dx; return; }
      const t = this.target ?? { top: s.scrollTop, left: s.scrollLeft };
      this.target = { top: Math.max(0, Math.min(s.scrollHeight - s.clientHeight, t.top + dy)), left: Math.max(0, t.left + dx) };
      s.scrollTo({ top: this.target.top, left: this.target.left, behavior: 'smooth' });
      clearTimeout(this.idle);
      this.idle = window.setTimeout(() => { this.target = null; }, 250);
    };
    destroy() { clearTimeout(this.idle); this.view.scrollDOM.removeEventListener('wheel', this.wheel); }
  });
});
