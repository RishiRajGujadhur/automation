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
