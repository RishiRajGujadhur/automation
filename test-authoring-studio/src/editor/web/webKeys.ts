import { EditorView, keymap } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import type { CsHandlers } from '../csharp';

/**
 * The navigation and refactoring keys for front-end files, as for C#: F12 / Ctrl+click definition, Shift+F12
 * references, Alt+F12 peek, F2 rename, Ctrl+. Quick Actions, Shift+Alt+F format (FRONTEND-100.md).
 */
export function webKeys(handlers: { current: CsHandlers }): Extension[] {
  const at = (v: EditorView) => v.state.selection.main.head;
  return [
    keymap.of([
      { key: 'F12', preventDefault: true, run: (v) => { handlers.current.definition(at(v)); return true; } },
      { key: 'Shift-F12', preventDefault: true, run: (v) => { handlers.current.references(at(v)); return true; } },
      { key: 'Alt-F12', preventDefault: true, run: (v) => { handlers.current.peek(at(v)); return true; } },
      { key: 'F2', preventDefault: true, run: (v) => { handlers.current.rename(at(v)); return true; } },
      { key: 'Mod-.', preventDefault: true, run: (v) => { const r = v.state.selection.main; handlers.current.actions(r.from, r.to); return true; } },
      { key: 'Alt-Enter', preventDefault: true, run: (v) => { const r = v.state.selection.main; handlers.current.actions(r.from, r.to); return true; } },
      { key: 'Shift-Alt-f', preventDefault: true, run: () => { handlers.current.format(); return true; } },
    ]),
    EditorView.domEventHandlers({
      mousedown: (e, view) => {
        if (!(e.ctrlKey || e.metaKey) || e.button !== 0) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos == null) return false;
        e.preventDefault();
        handlers.current.definition(pos);
        return true;
      },
    }),
  ];
}
