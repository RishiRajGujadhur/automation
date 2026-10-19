import type { Extension } from '@codemirror/state';
import { Decoration, MatchDecorator, ViewPlugin, EditorView, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * TODO highlighting (Rider): TODO / FIXME / HACK / BUG comments stand out in every editor (the same comments the TODO
 * window lists), from the keyword to the end of the line. The keywords can be changed (Rider's TODO patterns,
 * Visual Studio's Task List tokens).
 */
export const DEFAULT_TODO_TOKENS = ['TODO', 'FIXME', 'HACK', 'BUG'];
const cache = new Map<string, Extension>();
export function todoHighlightFor(tokens: string[] = DEFAULT_TODO_TOKENS): Extension {
  const words = tokens.map((t) => t.trim()).filter((t) => /^\w+$/.test(t));
  const key = (words.length ? words : DEFAULT_TODO_TOKENS).join('|');
  const hit = cache.get(key);
  if (hit) return hit;
  const word = new RegExp(`\\b(${key})\\b`, 'i');
  const decorator = new MatchDecorator({
    regexp: new RegExp(`(?:\\/\\/+|#|<!--|\\/\\*|^\\s*\\*)\\s*\\b(${key})\\b.*$`, 'gim'),
    decorate: (add, from, _to, match) => {
      const at = from + match[0].search(word);
      add(at, from + match[0].length, Decoration.mark({ class: `cm-todo cm-todo-${match[1].toLowerCase()}` }));
    },
  });
  const ext = [
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
  cache.set(key, ext);
  return ext;
}
export const todoHighlight = todoHighlightFor();
