import { EditorView } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { featureOn } from '../features';
import { viewOptions } from '../editor/viewOptions';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** editor.rulers (VS Code): vertical lines after the given columns, e.g. 80, 120. */
export const rulers = defineSetting<number[]>({ key: 'editor.rulers', category: 'Text Editor', title: 'Rulers', type: 'numbers', default: [], description: 'Render vertical rulers after a certain number of monospace characters. Use multiple values for multiple rulers, separated by commas (e.g. 80, 120). No rulers are drawn if the list is empty.' });
/** The background image that draws the rulers (one 1 px line per column). */
export const rulerImage = (cols: number[]) => [...new Set(cols)].sort((a, b) => a - b).map((c) => `linear-gradient(to right, transparent calc(${c}ch + 6px), var(--vsc-ruler) calc(${c}ch + 6px), var(--vsc-ruler) calc(${c}ch + 7px), transparent calc(${c}ch + 7px))`).join(', ');
settingsExtension(() => {
  const cols = rulers();
  if (!cols.length) return [];
  // The right margin guide (View ▸ Right Margin) draws the same way: it stays, as one more ruler.
  const margin = featureOn('right-margin') ? viewOptions().rightMargin ?? 120 : 0;
  return Prec.high([
    EditorView.editorAttributes.of({ class: 'cm-vsc-rulers', 'data-rulers': cols.join(',') }),
    EditorView.theme({ '.cm-content': { '--vsc-ruler': 'rgba(128, 128, 128, 0.3)', backgroundImage: rulerImage(margin > 0 ? [...cols, margin] : cols), backgroundRepeat: 'no-repeat' } as Record<string, string> }),
  ]);
});
