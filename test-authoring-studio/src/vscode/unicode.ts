import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';
import { fileOfView } from '../editor/activeEditor';

/** Unicode highlighting (VS Code's editor.unicodeHighlight.*): invisible and look-alike characters get a box. */
const C = 'Text Editor';
export const unicode = {
  invisible: defineSetting<boolean>({ key: 'editor.unicodeHighlight.invisibleCharacters', category: C, title: 'Unicode Highlight: Invisible Characters', type: 'boolean', default: true, description: 'Controls whether characters that just reserve space or have no width at all are highlighted.' }),
  ambiguous: defineSetting<boolean>({ key: 'editor.unicodeHighlight.ambiguousCharacters', category: C, title: 'Unicode Highlight: Ambiguous Characters', type: 'boolean', default: true, description: 'Controls whether characters are highlighted that can be confused with basic ASCII characters.' }),
  nonBasic: defineSetting<boolean>({ key: 'editor.unicodeHighlight.nonBasicASCII', category: C, title: 'Unicode Highlight: Non Basic ASCII', type: 'boolean', default: false, description: 'Controls whether all non-basic ASCII characters are highlighted.' }),
  inComments: defineSetting<boolean>({ key: 'editor.unicodeHighlight.includeComments', category: C, title: 'Unicode Highlight: Include Comments', type: 'boolean', default: false, description: 'Controls whether characters in comments should also be subject to Unicode highlighting.' }),
};
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠋-᠎​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ  -   　]/;
/** Look-alikes of ASCII letters and digits (Cyrillic, Greek, full-width, typographic quotes and dashes). */
const AMBIGUOUS: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'һ': 'h', 'ӏ': 'l', 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y',
  'ο': 'o', 'α': 'a', 'ν': 'v', 'ρ': 'p', 'τ': 't', 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X', 'Υ': 'Y',
  '‘': "'", '’': "'", '“': '"', '”': '"', '‐': '-', '‑': '-', '–': '-', '—': '-', '−': '-', 'ǀ': 'l', '∕': '/', '⁄': '/', ';': ';', 'ı': 'i',
};
const wordAround = (text: string, at: number) => { let a = at, b = at + 1; while (a > 0 && /[\p{L}\p{N}_]/u.test(text[a - 1])) a--; while (b < text.length && /[\p{L}\p{N}_]/u.test(text[b])) b++; return text.slice(a, at) + text.slice(at + 1, b); };
export type UnicodeHit ={ at: number; char: string; kind: 'invisible' | 'ambiguous' | 'nonBasic'; like?: string };
/** The characters of a line to highlight. Pure, for the unit tests. */
export function unicodeHits(text: string, o: { invisible: boolean; ambiguous: boolean; nonBasic: boolean; comments: boolean }): UnicodeHit[] {
  const out: UnicodeHit[] = [];
  const comment = o.comments ? -1 : (() => { const m = /\/\/|#(?!region|endregion|if|else|elif|endif)|<!--/.exec(text); return m ? m.index : -1; })();
  let i = 0;
  for (const char of text) {
    const at = i;
    i += char.length;
    if (char.charCodeAt(0) < 0x80 || (comment >= 0 && at > comment)) continue;
    if (o.invisible && INVISIBLE.test(char)) out.push({ at, char, kind: 'invisible' });
    // A look-alike in a word of its own script (a Russian word, a Greek one) is text, not a trap: only mixed words count.
    else if (o.ambiguous && AMBIGUOUS[char] && (!/\p{L}/u.test(char) || /[A-Za-z]/.test(wordAround(text, at)))) out.push({ at, char, kind: 'ambiguous', like: AMBIGUOUS[char] });
    else if (o.nonBasic && !/\s/.test(char)) out.push({ at, char, kind: 'nonBasic' });
  }
  return out;
}
const code = (c: string) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
const describe = (h: UnicodeHit) => h.kind === 'invisible' ? `The character ${code(h.char)} is invisible.` : h.kind === 'ambiguous' ? `The character ${code(h.char)} "${h.char}" could be confused with the ASCII character "${h.like}", which is more common in source code.` : `The character ${code(h.char)} "${h.char}" is not a basic ASCII character.`;
function build(view: EditorView): DecorationSet {
  // As in VS Code, prose (Markdown, plain text) does not flag look-alikes: typographic quotes belong there.
  const prose = /\.(md|markdown|txt)$/i.test(fileOfView(view) ?? '');
  const o = { invisible: unicode.invisible(), ambiguous: unicode.ambiguous() && !prose, nonBasic: unicode.nonBasic() && !prose, comments: unicode.inComments() };
  const b = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to;) {
      const line = view.state.doc.lineAt(pos);
      for (const h of unicodeHits(line.text, o)) b.add(line.from + h.at, line.from + h.at + h.char.length, Decoration.mark({ class: `cm-unicode-highlight cm-unicode-${h.kind}`, attributes: { title: describe(h), 'aria-label': describe(h) } }));
      pos = line.to + 1;
    }
  }
  return b.finish();
}
const theme = EditorView.baseTheme({
  '.cm-unicode-highlight': { outline: '1px solid #d4a72c', outlineOffset: '-1px', borderRadius: '2px' },
  '.cm-unicode-invisible': { background: 'rgba(212, 167, 44, 0.25)', paddingLeft: '2px' },
});
settingsExtension(() => {
  if (!unicode.invisible() && !unicode.ambiguous() && !unicode.nonBasic()) return [];
  void unicode.inComments();
  return [theme, ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = build(u.view); }
  }, { decorations: (v) => v.decorations })];
});
