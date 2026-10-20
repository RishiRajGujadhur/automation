import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { EditorState } from '@codemirror/state';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Minimap (VS Code): the whole file in miniature beside the text; the slider is the visible part. */
const C = 'Text Editor ▸ Minimap';
export const minimap = {
  enabled: defineSetting<boolean>({ key: 'editor.minimap.enabled', category: C, title: 'Enabled', type: 'boolean', default: false, description: 'Controls whether the minimap is shown.' }),
  autohide: defineSetting<'none' | 'mouseover' | 'scroll'>({
    key: 'editor.minimap.autohide', category: C, title: 'Autohide', type: 'enum', default: 'none', description: 'Controls whether the minimap is hidden automatically.',
    options: [{ value: 'none', description: 'The minimap is always shown.' }, { value: 'mouseover', description: 'The minimap is hidden when the mouse is not over it and shown when it is.' }, { value: 'scroll', description: 'The minimap is only shown when the editor is scrolled.' }],
  }),
  side: defineSetting<'right' | 'left'>({ key: 'editor.minimap.side', category: C, title: 'Side', type: 'enum', default: 'right', description: 'Controls the side where to render the minimap.', options: [{ value: 'right' }, { value: 'left' }] }),
  showSlider: defineSetting<'mouseover' | 'always'>({ key: 'editor.minimap.showSlider', category: C, title: 'Show Slider', type: 'enum', default: 'mouseover', description: 'Controls when the minimap slider is shown.', options: [{ value: 'mouseover' }, { value: 'always' }] }),
  scale: defineSetting<number>({ key: 'editor.minimap.scale', category: C, title: 'Scale', type: 'number', default: 1, min: 1, max: 3, description: 'Scale of content drawn in the minimap: 1, 2 or 3.' }),
  maxColumn: defineSetting<number>({ key: 'editor.minimap.maxColumn', category: C, title: 'Max Column', type: 'number', default: 120, min: 10, max: 300, description: 'Limit the width of the minimap to render at most a certain number of columns.' }),
  renderCharacters: defineSetting<boolean>({ key: 'editor.minimap.renderCharacters', category: C, title: 'Render Characters', type: 'boolean', default: true, description: 'Render the actual characters on a line as opposed to color blocks.' }),
  size: defineSetting<'proportional' | 'fill' | 'fit'>({
    key: 'editor.minimap.size', category: C, title: 'Size', type: 'enum', default: 'proportional', description: 'Controls the size of the minimap.',
    options: [{ value: 'proportional', description: 'The minimap has the same size as the editor contents (and might scroll).' }, { value: 'fill', description: 'The minimap will stretch or shrink as necessary to fill the height of the editor (no scrolling).' }, { value: 'fit', description: 'The minimap will shrink as necessary to never be larger than the editor (no scrolling).' }],
  }),
};

/** A section header drawn in the minimap (V3 adds them). */
export type MinimapHeader = { line: number; label: string; separator: boolean };
const headerSources: ((state: EditorState) => MinimapHeader[])[] = [];
export const addMinimapHeaders = (f: (state: EditorState) => MinimapHeader[]) => { headerSources.push(f); };
let headerFont = () => ({ size: 9, spacing: 1 });
export const setMinimapHeaderFont = (f: () => { size: number; spacing: number }) => { headerFont = f; };

/**
 * The minimap's geometry: line height in pixels and how far the minimap itself is scrolled, from the editor's
 * scroll position. Pure, for the unit tests.
 */
export function minimapLayout(o: { lines: number; height: number; scale: number; size: string; scrollTop: number; scrollHeight: number; clientHeight: number }) {
  let lineH = 2 * o.scale;
  if (o.size === 'fill' || (o.size === 'fit' && o.lines * lineH > o.height)) lineH = o.height / Math.max(1, o.lines);
  const total = o.lines * lineH;
  const range = Math.max(0, o.scrollHeight - o.clientHeight);
  const offset = total > o.height && range > 0 ? (o.scrollTop / range) * (total - o.height) : 0;
  const sliderTop = (o.scrollTop / Math.max(1, o.scrollHeight)) * total - offset;
  const sliderHeight = Math.max(6, (o.clientHeight / Math.max(1, o.scrollHeight)) * total);
  return { lineH, total, offset, sliderTop, sliderHeight };
}

class Minimap {
  dom: HTMLDivElement;
  canvas: HTMLCanvasElement;
  slider: HTMLDivElement;
  frame = 0;
  hideTimer = 0;
  layout = minimapLayout({ lines: 1, height: 1, scale: 1, size: 'proportional', scrollTop: 0, scrollHeight: 1, clientHeight: 1 });
  side = minimap.side();
  width = 0;
  constructor(readonly view: EditorView) {
    this.dom = document.createElement('div');
    this.dom.className = `cm-minimap cm-minimap-${this.side} cm-minimap-slider-${minimap.showSlider()} cm-minimap-autohide-${minimap.autohide()}`;
    this.dom.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.slider = document.createElement('div');
    this.slider.className = 'cm-minimap-slider';
    this.dom.append(this.canvas, this.slider);
    view.dom.appendChild(this.dom);
    this.width = Math.max(24, Math.min(360, minimap.maxColumn() * minimap.scale()));
    this.dom.style.width = `${this.width}px`;
    view.scrollDOM.style[this.side === 'left' ? 'marginLeft' : 'marginRight'] = `${this.width}px`;
    this.onScroll = this.onScroll.bind(this);
    view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
    this.dom.addEventListener('mousedown', this.onDown);
    this.schedule();
  }
  onScroll() {
    this.schedule();
    if (minimap.autohide() === 'scroll') {
      this.dom.classList.add('cm-minimap-scrolling');
      clearTimeout(this.hideTimer);
      this.hideTimer = window.setTimeout(() => this.dom.classList.remove('cm-minimap-scrolling'), 1000);
    }
  }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged || u.geometryChanged) this.schedule(); }
  schedule() { cancelAnimationFrame(this.frame); this.frame = requestAnimationFrame(() => this.draw()); }
  /** Click: centre that line; drag the slider (or anywhere): scroll along. */
  onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const s = this.view.scrollDOM;
    const rect = this.dom.getBoundingClientRect();
    const onSlider = e.target === this.slider;
    const startY = e.clientY, startTop = s.scrollTop;
    if (!onSlider) s.scrollTop = ((e.clientY - rect.top + this.layout.offset) / Math.max(1, this.layout.total)) * s.scrollHeight - s.clientHeight / 2;
    const from = s.scrollTop;
    const move = (m: MouseEvent) => {
      const ratio = s.scrollHeight / Math.max(1, Math.min(this.layout.total, rect.height));
      s.scrollTop = (onSlider ? startTop : from) + (m.clientY - startY) * ratio;
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); this.dom.classList.remove('cm-minimap-active'); };
    this.dom.classList.add('cm-minimap-active');
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  draw() {
    const { view } = this;
    const doc = view.state.doc;
    const height = this.dom.clientHeight;
    if (!height) return;
    const scale = minimap.scale();
    const s = view.scrollDOM;
    this.layout = minimapLayout({ lines: doc.lines, height, scale, size: minimap.size(), scrollTop: s.scrollTop, scrollHeight: s.scrollHeight, clientHeight: s.clientHeight });
    const { lineH, offset, sliderTop, sliderHeight } = this.layout;
    const dpr = window.devicePixelRatio || 1;
    const c = this.canvas;
    c.width = Math.round(this.width * dpr);
    c.height = Math.round(height * dpr);
    c.style.width = `${this.width}px`;
    c.style.height = `${height}px`;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, height);
    const color = getComputedStyle(view.contentDOM).color || '#888';
    const charW = scale;
    const cols = Math.floor(this.width / charW);
    const tab = view.state.tabSize;
    const first = Math.max(1, Math.floor(offset / lineH) + 1);
    const last = Math.min(doc.lines, Math.ceil((offset + height) / lineH) + 1);
    const step = lineH < 1 ? Math.ceil(1 / lineH) : 1;
    const chars = minimap.renderCharacters() && lineH >= 2;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    if (chars) { ctx.font = `${Math.max(2, lineH * 1.35)}px monospace`; ctx.textBaseline = 'top'; }
    const glyph = chars ? ctx.measureText('M').width || 1 : 1;
    for (let n = first; n <= last; n += step) {
      const text = doc.line(n).text.replace(/\t/g, ' '.repeat(tab)).slice(0, cols);
      const y = (n - 1) * lineH - offset;
      if (chars) {
        ctx.save();
        ctx.translate(0, y);
        ctx.scale(charW / glyph, 1);
        ctx.fillText(text, 0, 0);
        ctx.restore();
      } else {
        for (const m of text.matchAll(/\S+/g)) ctx.fillRect(m.index! * charW, y, m[0].length * charW, Math.max(1, lineH * 0.7));
      }
    }
    // Section headers (V3): a label in the minimap for // MARK: and #region lines.
    const headers = headerSources.flatMap((f) => f(view.state));
    this.dom.dataset.sections = headers.map((h) => `${h.separator ? '— ' : ''}${h.label}`).join(' | ');
    if (headers.length) {
      const f = headerFont();
      ctx.globalAlpha = 1;
      ctx.font = `600 ${f.size}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      (ctx as unknown as { letterSpacing: string }).letterSpacing = `${f.spacing}px`;
      for (const h of headers) {
        const y = (h.line - 1) * lineH - offset;
        if (y < -f.size || y > height) continue;
        if (h.separator) ctx.fillRect(0, y - 1, this.width, 1);
        if (h.label) ctx.fillText(h.label, 2, y + 1, this.width - 4);
      }
    }
    this.slider.style.top = `${sliderTop}px`;
    this.slider.style.height = `${sliderHeight}px`;
  }
  destroy() {
    cancelAnimationFrame(this.frame);
    clearTimeout(this.hideTimer);
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
    this.view.scrollDOM.style.marginLeft = this.view.scrollDOM.style.marginRight = '';
    this.dom.remove();
  }
}

const theme = EditorView.baseTheme({
  '.cm-minimap': { position: 'absolute', top: 0, bottom: 0, zIndex: 3, cursor: 'default', transition: 'opacity 0.2s', background: 'inherit' },
  '.cm-minimap-right': { right: 0, boxShadow: '-1px 0 0 rgba(128, 128, 128, 0.18)' },
  '.cm-minimap-left': { left: 0, boxShadow: '1px 0 0 rgba(128, 128, 128, 0.18)' },
  '.cm-minimap canvas': { display: 'block' },
  '.cm-minimap-slider': { position: 'absolute', left: 0, right: 0, background: 'rgba(121, 121, 121, 0.2)', transition: 'opacity 0.15s' },
  '.cm-minimap-slider-mouseover .cm-minimap-slider': { opacity: 0 },
  '.cm-minimap-slider-mouseover:hover .cm-minimap-slider, .cm-minimap-active .cm-minimap-slider': { opacity: 1 },
  '.cm-minimap-autohide-mouseover:not(:hover):not(.cm-minimap-active), .cm-minimap-autohide-scroll:not(.cm-minimap-scrolling):not(:hover):not(.cm-minimap-active)': { opacity: 0 },
});
settingsExtension(() => {
  if (!minimap.enabled()) return [];
  // Read here so a change of any minimap setting rebuilds it.
  void [minimap.autohide(), minimap.side(), minimap.showSlider(), minimap.scale(), minimap.maxColumn(), minimap.renderCharacters(), minimap.size()];
  return [theme, ViewPlugin.fromClass(Minimap)];
});
