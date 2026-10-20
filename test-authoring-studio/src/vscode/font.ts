import { EditorView } from '@codemirror/view';
import { defineSetting } from './settings';
import { settingsExtension } from './registry';

/** Font (VS Code's Text Editor ▸ Font): family, weight, ligatures, line height and letter spacing of the editors. */
const C = 'Text Editor ▸ Font';
export const font = {
  family: defineSetting<string>({ key: 'editor.fontFamily', category: C, title: 'Font Family', type: 'string', default: '', description: 'Controls the font family, e.g. "Cascadia Code, Consolas, monospace". Empty uses the theme\'s font.' }),
  weight: defineSetting<string>({ key: 'editor.fontWeight', category: C, title: 'Font Weight', type: 'enum', default: 'normal', description: 'Controls the font weight.', options: ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'].map((value) => ({ value })) }),
  ligatures: defineSetting<boolean>({ key: 'editor.fontLigatures', category: C, title: 'Font Ligatures', type: 'boolean', default: false, description: 'Enables font ligatures (=>, !=, === drawn as one glyph with fonts that have them, like Cascadia Code or Fira Code).' }),
};
/** A CSS font-family list from the setting: names with spaces are quoted, generic families are not. */
export function fontFamilyCss(value: string) {
  return value.split(',').map((f) => f.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).map((f) => (/^(monospace|serif|sans-serif|system-ui|ui-monospace)$/.test(f) ? f : `"${f}"`)).join(', ');
}
settingsExtension(() => {
  const family = fontFamilyCss(font.family()), weight = font.weight(), liga = font.ligatures();
  const style: Record<string, string> = {};
  if (family) style.fontFamily = `${family} !important`;
  if (weight !== 'normal') style.fontWeight = weight;
  if (liga) { style.fontVariantLigatures = 'normal'; style.fontFeatureSettings = '"liga" 1, "calt" 1'; }
  return Object.keys(style).length ? EditorView.theme({ '.cm-content, .cm-gutters': style }) : [];
});

/* V8 Line height and letter spacing. */
export const lineHeight = defineSetting<number>({ key: 'editor.lineHeight', category: C, title: 'Line Height', type: 'number', default: 0, min: 0, max: 150, step: 0.1, description: 'Controls the line height. Use 0 to automatically compute the line height from the font size. Values between 0 and 8 will be used as a multiplier with the font size. Values greater than or equal to 8 will be used as effective values.' });
export const letterSpacing = defineSetting<number>({ key: 'editor.letterSpacing', category: C, title: 'Letter Spacing', type: 'number', default: 0, min: -5, max: 20, step: 0.1, description: 'Controls the letter spacing in pixels.' });
/** CSS line-height for the setting: '' (the theme's), a multiplier, or pixels. */
export const lineHeightCss = (v: number) => (!v ? '' : v < 8 ? String(v) : `${v}px`);
settingsExtension(() => {
  const lh = lineHeightCss(lineHeight()), ls = letterSpacing();
  const style: Record<string, string> = {};
  if (lh) style.lineHeight = `${lh} !important`;
  if (ls) style.letterSpacing = `${ls}px`;
  return Object.keys(style).length ? EditorView.theme({ '.cm-content, .cm-gutters, .cm-line, .cm-gutterElement': style }) : [];
});
