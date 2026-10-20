import { foldService } from '@codemirror/language';
import { Prec, type EditorState } from '@codemirror/state';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Custom folding regions (VS Code's folding markers, Rider's custom folding comments): a start and an end pattern. */
export const foldingMarkers = {
  start: defineSetting<string>({ key: 'editor.foldingMarkers.start', category: 'Text Editor', title: 'Folding Markers: Start', type: 'string', default: String.raw`^\s*(//|#|<!--)\s*(region\b|<editor-fold\b)`, description: 'A regular expression for the first line of a custom folding region (e.g. // region Name, // <editor-fold desc="…">). Empty turns custom regions off.' }),
  end: defineSetting<string>({ key: 'editor.foldingMarkers.end', category: 'Text Editor', title: 'Folding Markers: End', type: 'string', default: String.raw`^\s*(//|#|<!--)\s*(endregion\b|</editor-fold>)`, description: 'A regular expression for the last line of a custom folding region.' }),
};
/** The line a region starting on line `from` (1-based) ends on, with nesting; null when it does not close. Pure. */
export function regionEnd(lines: string[], from: number, start: RegExp, end: RegExp): number | null {
  let depth = 0;
  for (let i = from - 1; i < lines.length; i++) {
    if (start.test(lines[i])) depth++;
    else if (end.test(lines[i]) && --depth === 0) return i + 1;
  }
  return null;
}
const compile = (s: string) => { try { return s ? new RegExp(s) : null; } catch { return null; } };
settingsExtension(() => {
  const start = compile(foldingMarkers.start()), end = compile(foldingMarkers.end());
  if (!start || !end) return [];
  return Prec.high(foldService.of((state: EditorState, lineStart: number, lineEnd: number) => {
    const line = state.doc.lineAt(lineStart);
    if (!start.test(line.text)) return null;
    let depth = 0;
    for (let n = line.number; n <= Math.min(state.doc.lines, line.number + 20000); n++) {
      const t = state.doc.line(n).text;
      if (start.test(t)) depth++;
      else if (end.test(t) && --depth === 0) return n > line.number ? { from: lineEnd, to: state.doc.line(n).to } : null;
    }
    return null;
  }));
});
