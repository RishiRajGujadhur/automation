import { RangeSetBuilder, StateField, type Text } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';

/**
 * Bracket pair colorization (Visual Studio 2026 / Rider's rainbow brackets): (), [] and {} coloured by nesting depth.
 * Strings, character literals and comments are skipped; unmatched closers stay plain.
 */
export function bracketDepths(text: string) {
  const out: { pos: number; depth: number }[] = [];
  const stack: string[] = [];
  let lineStart = true;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\n') { lineStart = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r') continue;
    const atStart = lineStart;
    lineStart = false;
    if ((c === '/' && text[i + 1] === '/') || (c === '#' && atStart)) { const e = text.indexOf('\n', i); if (e < 0) break; i = e - 1; continue; }
    if (c === '/' && text[i + 1] === '*') { const e = text.indexOf('*/', i + 2); if (e < 0) break; i = e + 1; continue; }
    if (c === '"') {
      const verbatim = text[i - 1] === '@' || (text[i - 2] === '@' && text[i - 1] === '$') || (text[i - 2] === '$' && text[i - 1] === '@');
      let j = i + 1;
      for (; j < text.length; j++) {
        if (!verbatim && text[j] === '\\') { j++; continue; }
        if (!verbatim && text[j] === '\n') break;
        if (text[j] === '"') { if (verbatim && text[j + 1] === '"') { j++; continue; } break; }
      }
      i = j;
      continue;
    }
    // A character literal ('x' or '\n'); a lone apostrophe (Gherkin's "user's") is text.
    if (c === "'" && (text[i + 2] === "'" || (text[i + 1] === '\\' && text[i + 3] === "'"))) { i += text[i + 1] === '\\' ? 3 : 2; continue; }
    const open = '([{'.indexOf(c);
    if (open >= 0) { out.push({ pos: i, depth: stack.length }); stack.push(')]}'[open]); continue; }
    if (')]}'.includes(c) && stack[stack.length - 1] === c) { stack.pop(); out.push({ pos: i, depth: stack.length }); }
  }
  return out;
}

const marks = [0, 1, 2].map((i) => Decoration.mark({ class: `cm-bracket-${i}` }));
const build = (doc: Text): DecorationSet => {
  const b = new RangeSetBuilder<Decoration>();
  if (doc.length <= 2_000_000) for (const { pos, depth } of bracketDepths(doc.toString())) b.add(pos, pos + 1, marks[depth % 3]);
  return b.finish();
};
export const bracketColors = [
  StateField.define<DecorationSet>({
    create: (state) => build(state.doc),
    update: (deco, tr) => (tr.docChanged ? build(tr.state.doc) : deco),
    provide: (f) => EditorView.decorations.from(f),
  }),
  EditorView.baseTheme({
    '&light .cm-bracket-0, &light .cm-bracket-0 *': { color: '#0431fa !important' },
    '&light .cm-bracket-1, &light .cm-bracket-1 *': { color: '#319331 !important' },
    '&light .cm-bracket-2, &light .cm-bracket-2 *': { color: '#7b3814 !important' },
    '&dark .cm-bracket-0, &dark .cm-bracket-0 *': { color: '#ffd700 !important' },
    '&dark .cm-bracket-1, &dark .cm-bracket-1 *': { color: '#da70d6 !important' },
    '&dark .cm-bracket-2, &dark .cm-bracket-2 *': { color: '#179fff !important' },
  }),
];
