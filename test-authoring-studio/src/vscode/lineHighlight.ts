import { EditorView } from '@codemirror/view';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** editor.renderLineHighlight (VS Code): the current line's highlight in the gutter, the text, both or neither. */
export const lineHighlight = {
  mode: defineSetting<'none' | 'gutter' | 'line' | 'all'>({
    key: 'editor.renderLineHighlight', category: 'Text Editor', title: 'Render Line Highlight', type: 'enum', default: 'line', description: 'Controls how the editor should render the current line highlight.',
    options: [{ value: 'none' }, { value: 'gutter' }, { value: 'line' }, { value: 'all', description: 'Highlights both the gutter and the current line.' }],
  }),
  onlyWhenFocus: defineSetting<boolean>({ key: 'editor.renderLineHighlightOnlyWhenFocus', category: 'Text Editor', title: 'Render Line Highlight Only When Focus', type: 'boolean', default: false, description: 'Controls if the editor should render the current line highlight only when the editor is focused.' }),
};
const clear = { backgroundColor: 'transparent !important' };
settingsExtension(() => {
  const mode = lineHighlight.mode(), focus = lineHighlight.onlyWhenFocus();
  const rules: Record<string, typeof clear> = {};
  if (mode === 'none' || mode === 'gutter') rules['.cm-activeLine'] = clear;
  if (mode === 'none' || mode === 'line') rules['.cm-activeLineGutter'] = clear;
  if (focus) { rules['&:not(.cm-focused) .cm-activeLine'] = clear; rules['&:not(.cm-focused) .cm-activeLineGutter'] = clear; }
  return [EditorView.editorAttributes.of({ class: `cm-vsc-line-highlight-${mode}` }), EditorView.theme(rules)];
});
