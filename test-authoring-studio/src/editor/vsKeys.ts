import { EditorSelection, Prec, type ChangeSpec, type Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { gotoLine } from '@codemirror/search';

/** Lines touched by the selection, each once. */
function selectedLines(view: EditorView) {
  const seen = new Set<number>();
  const out: { from: number; text: string }[] = [];
  for (const r of view.state.selection.ranges) {
    const last = view.state.doc.lineAt(r.to > r.from && view.state.doc.lineAt(r.to).from === r.to ? r.to - 1 : r.to).number;
    for (let n = view.state.doc.lineAt(r.from).number; n <= last; n++) if (!seen.has(n)) { seen.add(n); const l = view.state.doc.line(n); out.push({ from: l.from, text: l.text }); }
  }
  return out;
}

/** Ctrl+K, Ctrl+C / Ctrl+K, Ctrl+U: comment or uncomment the selected lines with the file's line-comment token. */
function comment(token: string, add: boolean) {
  return (view: EditorView) => {
    const lines = selectedLines(view).filter((l) => l.text.trim());
    if (!lines.length) return true;
    const indent = Math.min(...lines.map((l) => /^\s*/.exec(l.text)![0].length));
    const changes = lines.flatMap((l): ChangeSpec[] => {
      if (add) return [{ from: l.from + indent, insert: `${token} ` }];
      const at = l.text.indexOf(token);
      if (at < 0 || l.text.slice(0, at).trim()) return [];
      const len = token.length + (l.text[at + token.length] === ' ' ? 1 : 0);
      return [{ from: l.from + at, to: l.from + at + len }];
    });
    view.dispatch({ changes, scrollIntoView: true, userEvent: add ? 'comment' : 'uncomment' });
    return true;
  };
}

/** Ctrl+Shift+D: duplicate the line or selection (VS Code keeps Ctrl+D for the next match, so it stays that). */
function duplicate(view: EditorView) {
  const changes = view.state.selection.ranges.map((r) => {
    if (!r.empty) return { from: r.to, insert: view.state.sliceDoc(r.from, r.to) };
    const l = view.state.doc.lineAt(r.head);
    return { from: l.to, insert: `${view.state.lineBreak}${l.text}` };
  });
  view.dispatch({ changes, userEvent: 'input.copyline' });
  return true;
}

/** Ctrl+L / Ctrl+Shift+L: delete the current lines (Visual Studio's Edit ▸ Line ▸ Delete). */
function deleteLines(view: EditorView) {
  const lines = selectedLines(view);
  const doc = view.state.doc;
  const changes = lines.map((l) => { const line = doc.lineAt(l.from); return line.to < doc.length ? { from: line.from, to: line.to + 1 } : { from: Math.max(0, line.from - 1), to: line.to }; });
  view.dispatch({ changes, selection: EditorSelection.cursor(Math.min(lines[0].from, doc.length)), userEvent: 'delete.line' });
  return true;
}

/** Visual Studio editing keys shared by the code and Gherkin editors. */
export function vsKeys(commentToken: string): Extension {
  return Prec.high(keymap.of([
    { key: 'Mod-k Mod-c', preventDefault: true, run: comment(commentToken, true) },
    { key: 'Mod-k Mod-u', preventDefault: true, run: comment(commentToken, false) },
    { key: 'Mod-Shift-d', preventDefault: true, run: duplicate },
    { key: 'Mod-Shift-l', preventDefault: true, run: deleteLines },
    { key: 'Mod-g', preventDefault: true, run: gotoLine },
  ]));
}
export const commentTokenFor = (file: string) => (/\.(feature|py|ps1|ya?ml|sh|rb)$/i.test(file) ? '#' : /\.(xml|xaml|csproj|config|props|targets|html?)$/i.test(file) ? '' : '//');
