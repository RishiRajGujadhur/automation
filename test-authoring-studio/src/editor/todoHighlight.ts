import { Decoration, MatchDecorator, ViewPlugin, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * TODO highlighting (Rider): TODO / FIXME / HACK / BUG comments stand out in every editor (the same comments the TODO
 * window lists), from the keyword to the end of the line.
 */
const decorator = new MatchDecorator({
  regexp: /(?:\/\/+|#|<!--|\/\*|^\s*\*)\s*\b(TODO|FIXME|HACK|BUG)\b.*$/gim,
  decorate: (add, from, _to, match) => {
    const at = from + match[0].search(/\b(TODO|FIXME|HACK|BUG)\b/i);
    add(at, from + match[0].length, Decoration.mark({ class: `cm-todo cm-todo-${match[1].toLowerCase()}` }));
  },
});
export const todoHighlight = [
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = decorator.createDeco(view); }
    update(u: ViewUpdate) { this.decorations = decorator.updateDeco(u, this.decorations); }
  }, { decorations: (v) => v.decorations }),
  EditorView.baseTheme({
    '.cm-todo': { color: '#3e7bdd', fontStyle: 'italic', fontWeight: '600' },
    '.cm-todo-fixme, .cm-todo-bug': { color: '#d9534f' },
    '.cm-todo-hack': { color: '#b8860b' },
  }),
];
