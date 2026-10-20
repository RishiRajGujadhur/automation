import { EditorView, ViewPlugin } from '@codemirror/view';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Cursor (VS Code's Text Editor ▸ Cursor settings): the caret's shape, width, blinking and the lines kept around it. */
const C = 'Text Editor ▸ Cursor';
export const cursor = {
  style: defineSetting<'line' | 'block' | 'underline' | 'line-thin' | 'block-outline' | 'underline-thin'>({
    key: 'editor.cursorStyle', category: C, title: 'Cursor Style', type: 'enum', default: 'line', description: 'Controls the cursor style in insert input mode.',
    options: [{ value: 'line' }, { value: 'block' }, { value: 'underline' }, { value: 'line-thin' }, { value: 'block-outline' }, { value: 'underline-thin' }],
  }),
  width: defineSetting<number>({ key: 'editor.cursorWidth', category: C, title: 'Cursor Width', type: 'number', default: 0, min: 0, max: 10, description: 'Controls the width of the cursor when editor.cursorStyle is set to line (0 keeps the theme\'s width).' }),
};

// The theme's caret colour is a border colour; the block and underline shapes need it as a variable.
const caretColour = ViewPlugin.fromClass(class {
  constructor(view: EditorView) {
    view.requestMeasure({
      read: () => { const probe = document.createElement('div'); probe.className = 'cm-cursor'; probe.style.display = 'none'; view.scrollDOM.appendChild(probe); const c = getComputedStyle(probe).borderLeftColor; probe.remove(); return c; },
      write: (c) => view.dom.style.setProperty('--vsc-caret', c || 'currentColor'),
    });
  }
});
const shapes: Record<string, Record<string, Record<string, string>>> = {
  'line-thin': { '.cm-cursor': { borderLeftWidth: '1px !important' } },
  block: { '.cm-cursor': { borderLeft: 'none !important', width: '1ch', background: 'var(--vsc-caret)', opacity: '0.65' } },
  'block-outline': { '.cm-cursor': { borderLeft: 'none !important', width: '1ch', boxSizing: 'border-box', border: '1px solid var(--vsc-caret)' } },
  underline: { '.cm-cursor': { borderLeft: 'none !important', width: '1ch', borderBottom: '2px solid var(--vsc-caret)' } },
  'underline-thin': { '.cm-cursor': { borderLeft: 'none !important', width: '1ch', borderBottom: '1px solid var(--vsc-caret)' } },
};
settingsExtension(() => {
  const style = cursor.style(), width = cursor.width();
  const out = [EditorView.editorAttributes.of({ class: `cm-vsc-cursor-${style}` })];
  if (shapes[style]) return [...out, caretColour, EditorView.theme(shapes[style])];
  return width ? [...out, EditorView.theme({ '.cm-cursor': { borderLeftWidth: `${width}px !important` } })] : style === 'line' ? [] : out;
});

/* V5 Cursor blinking and smooth caret animation. */
export const blinking = defineSetting<'blink' | 'smooth' | 'phase' | 'expand' | 'solid'>({
  key: 'editor.cursorBlinking', category: C, title: 'Cursor Blinking', type: 'enum', default: 'blink', description: 'Control the cursor animation style.',
  options: [{ value: 'blink' }, { value: 'smooth' }, { value: 'phase' }, { value: 'expand' }, { value: 'solid' }],
});
export const smoothCaret = defineSetting<'off' | 'explicit' | 'on'>({
  key: 'editor.cursorSmoothCaretAnimation', category: C, title: 'Cursor Smooth Caret Animation', type: 'enum', default: 'off', description: 'Controls whether the smooth caret animation should be enabled.',
  options: [{ value: 'off', description: 'Smooth caret animation is disabled.' }, { value: 'explicit', description: 'Smooth caret animation is enabled only when the user moves the cursor with an explicit gesture.' }, { value: 'on', description: 'Smooth caret animation is always enabled.' }],
});
// CodeMirror blinks the cursor layer with steps(1); the other styles change how it fades (or stop it).
const blinkThemes: Record<string, Parameters<typeof EditorView.theme>[0]> = {
  smooth: { '&.cm-focused > .cm-scroller > .cm-cursorLayer': { animationTimingFunction: 'ease-in-out !important' } },
  phase: { '&.cm-focused > .cm-scroller > .cm-cursorLayer': { animationTimingFunction: 'cubic-bezier(0.8, 0, 0.2, 1) !important' } },
  expand: {
    '&.cm-focused > .cm-scroller > .cm-cursorLayer': { animation: 'none !important' },
    '&.cm-focused .cm-cursor': { animation: 'vsc-expand 1.2s ease-in-out infinite' },
    '@keyframes vsc-expand': { '0%, 20%': { transform: 'scaleY(1)' }, '50%, 60%': { transform: 'scaleY(0)' }, '90%, 100%': { transform: 'scaleY(1)' } },
  },
  solid: { '&.cm-focused > .cm-scroller > .cm-cursorLayer': { animation: 'none !important' } },
};
const glide = EditorView.theme({ '.cm-cursor': { transition: 'left 80ms ease-out, top 80ms ease-out' }, '&.cm-vsc-typing .cm-cursor': { transition: 'none' } });
// "explicit": typing moves the caret without the glide.
const typing = ViewPlugin.fromClass(class {
  timer = 0;
  constructor(readonly view: EditorView) {}
  update(u: import('@codemirror/view').ViewUpdate) {
    if (!u.transactions.some((t) => t.isUserEvent('input') || t.isUserEvent('delete'))) return;
    this.view.dom.classList.add('cm-vsc-typing');
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.view.dom.classList.remove('cm-vsc-typing'), 150);
  }
  destroy() { clearTimeout(this.timer); }
});
settingsExtension(() => {
  const b = blinking(), s = smoothCaret();
  return [
    b === 'blink' ? [] : [EditorView.editorAttributes.of({ class: `cm-vsc-blink-${b}` }), EditorView.theme(blinkThemes[b])],
    s === 'off' ? [] : [EditorView.editorAttributes.of({ class: `cm-vsc-smooth-caret-${s}` }), glide, s === 'explicit' ? typing : []],
  ];
});

/* V6 Cursor surrounding lines: keep n lines above and below the caret visible. */
export const surrounding = defineSetting<number>({ key: 'editor.cursorSurroundingLines', category: C, title: 'Cursor Surrounding Lines', type: 'number', default: 0, min: 0, max: 50, description: 'Controls the minimal number of visible leading lines (minimum 0) and trailing lines (minimum 1) surrounding the cursor. Known as \'scrollOff\' or \'scrollOffset\' in some other editors.' });
export const surroundingStyle = defineSetting<'default' | 'all'>({
  key: 'editor.cursorSurroundingLinesStyle', category: C, title: 'Cursor Surrounding Lines Style', type: 'enum', default: 'default', description: 'Controls when cursorSurroundingLines should be enforced.',
  options: [{ value: 'default', description: 'cursorSurroundingLines is enforced only when triggered via the keyboard or API.' }, { value: 'all', description: 'cursorSurroundingLines is enforced always.' }],
});
settingsExtension(() => {
  const n = surrounding();
  if (!n) return [];
  const margins = EditorView.scrollMargins.of((view) => { const px = n * view.defaultLineHeight; return { top: px, bottom: px }; });
  if (surroundingStyle() !== 'all') return margins;
  // "all": a click near the top or bottom edge scrolls too.
  return [margins, EditorView.updateListener.of((u) => {
    if (!u.transactions.some((t) => t.isUserEvent('select.pointer'))) return;
    const head = u.state.selection.main.head;
    queueMicrotask(() => { try { u.view.dispatch({ effects: EditorView.scrollIntoView(head, { y: 'nearest' }) }); } catch { /* destroyed */ } });
  })];
});
