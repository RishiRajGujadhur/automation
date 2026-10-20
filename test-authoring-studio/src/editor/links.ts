import { Prec } from '@codemirror/state';
import { Decoration, EditorView, MatchDecorator, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/** Ctrl+click opens links in the text (VS Code / Rider): web addresses, and `path/file.ext:line` references. */
export const OPEN_LOCATION_EVENT = 'tas:open-location';
const URL = /\bhttps?:\/\/[^\s"'<>)\]]+/g;
const FILE = /(?<![\w/.-])((?:[\w.-]+\/)*[\w.-]+\.(?:cs|feature|md|json|xml|csproj|config|ts|tsx|js|txt|ya?ml|props|targets)):(\d+)(?::(\d+))?/g;
export const linkAt = (text: string, col: number) => {
  for (const m of text.matchAll(URL)) if (col >= m.index! && col <= m.index! + m[0].length) return { url: m[0].replace(/[.,;:]+$/, '') };
  for (const m of text.matchAll(FILE)) if (col >= m.index! && col <= m.index! + m[0].length) return { file: m[1].replace(/\\/g, '/'), line: Number(m[2]), column: m[3] ? Number(m[3]) : 1 };
  return undefined;
};
const mark = Decoration.mark({ class: 'cm-link', attributes: { title: 'Ctrl+click to open' } });
const decorator = new MatchDecorator({ regexp: new RegExp(`${URL.source}|${FILE.source}`, 'g'), decoration: () => mark });
export const editorLinks = [
  ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = decorator.createDeco(view); }
    update(u: ViewUpdate) { this.decorations = decorator.updateDeco(u, this.decorations); }
  }, { decorations: (v) => v.decorations }),
  Prec.highest(EditorView.domEventHandlers({
    mousedown: (e, view) => {
      if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false;
      const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
      if (pos == null) return false;
      const line = view.state.doc.lineAt(pos);
      const link = linkAt(line.text, pos - line.from);
      if (!link) return false;
      e.preventDefault();
      if ('url' in link) window.open(link.url, '_blank', 'noopener');
      else window.dispatchEvent(new CustomEvent(OPEN_LOCATION_EVENT, { detail: link }));
      return true;
    },
  })),
  EditorView.baseTheme({ '.cm-link': { textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' } }),
];
