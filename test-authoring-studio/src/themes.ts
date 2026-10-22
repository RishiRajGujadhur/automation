import { Prec, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import * as tm from 'thememirror';
import { usePrefs } from './radix2';

/* ------------------------------------------------------------------ App themes */
export type AppThemeId = 'studio' | 'midnight' | 'nord' | 'light' | 'matrix' | 'monokai' | 'monokai-machine' | 'monokai-octagon' | 'monokai-ristretto' | 'monokai-spectrum' | 'monokai-light';
export const appThemes: { id: AppThemeId; label: string; description: string; dark: boolean; editor: EditorThemeId; swatch: [string, string, string] }[] = [
  { id: 'studio', label: 'Studio Dark', description: 'The default deep-indigo workspace.', dark: true, editor: 'studio-dark', swatch: ['#0b0e16', '#121722', '#aa94ff'] },
  { id: 'midnight', label: 'Midnight', description: 'Cool navy surfaces with softer contrast.', dark: true, editor: 'cobalt', swatch: ['#0a1426', '#10203a', '#7fb2ff'] },
  { id: 'nord', label: 'Nord', description: 'Arctic slate greys inspired by the Nord palette.', dark: true, editor: 'studio-dark', swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'light', label: 'Light', description: 'Bright surfaces for daylight and print-like reading.', dark: false, editor: 'studio-light', swatch: ['#f6f7fb', '#ffffff', '#6d4ae0'] },
  { id: 'matrix', label: 'Matrix', description: 'Phosphor green on black, monospace everywhere.', dark: true, editor: 'matrix', swatch: ['#000000', '#03140a', '#00ff41'] },
  { id: 'monokai', label: 'Monokai Inspired', description: 'Warm charcoal with vivid yellow, coral and green syntax.', dark: true, editor: 'monokai', swatch: ['#272822', '#34352f', '#e6db74'] },
  { id: 'monokai-machine', label: 'Monokai Inspired · Machine', description: 'Cool blue charcoal with mint and amber accents.', dark: true, editor: 'monokai-machine', swatch: ['#1f252c', '#2b323b', '#7ddac5'] },
  { id: 'monokai-octagon', label: 'Monokai Inspired · Octagon', description: 'Muted plum surfaces with rose and lavender syntax.', dark: true, editor: 'monokai-octagon', swatch: ['#282433', '#352f40', '#e6a4c4'] },
  { id: 'monokai-ristretto', label: 'Monokai Inspired · Ristretto', description: 'Espresso browns with warm peach and sage syntax.', dark: true, editor: 'monokai-ristretto', swatch: ['#302b2a', '#3c3533', '#e8b89d'] },
  { id: 'monokai-spectrum', label: 'Monokai Inspired · Spectrum', description: 'Near-black surfaces and clear, saturated syntax colours.', dark: true, editor: 'monokai-spectrum', swatch: ['#18191b', '#252629', '#b5e56f'] },
  { id: 'monokai-light', label: 'Monokai Inspired · Light', description: 'Warm paper surfaces with darker Monokai-like syntax colours.', dark: false, editor: 'monokai-light', swatch: ['#f5f1e8', '#fffdf8', '#7250a5'] },
];

/* ------------------------------------------------------------------ Editor themes */
const matrix = tm.createTheme({
  variant: 'dark',
  settings: {
    background: '#000000',
    foreground: '#00ff41',
    caret: '#00ff41',
    selection: '#00ff4133',
    lineHighlight: '#00ff4110',
    gutterBackground: '#000000',
    gutterForeground: '#0b7a2a',
  },
  styles: [
    { tag: [t.keyword, t.heading, t.typeName], color: '#b6ffb0', fontWeight: 'bold' },
    { tag: [t.string, t.special(t.string), t.attributeValue], color: '#7dff9a' },
    { tag: [t.comment, t.meta], color: '#0f8a35', fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.atom], color: '#d6ffcf' },
    { tag: [t.tagName, t.propertyName, t.attributeName], color: '#39ff6a' },
    { tag: [t.variableName, t.definition(t.variableName)], color: '#00ff41' },
    { tag: [t.punctuation, t.bracket, t.operator], color: '#22c55e' },
    { tag: t.invalid, color: '#ff4d4d' },
  ],
});
/** One Dark syntax on a deeper background so every token clears 4.5:1 (One Dark's red is 4.38:1 on #282c34). */
const studioDark: Extension = [
  oneDark,
  Prec.highest(EditorView.theme({ '&': { backgroundColor: '#101621' }, '.cm-gutters': { backgroundColor: '#101621' }, '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#ffffff06' } }, { dark: true })),
];
/** Light editor theme tuned so every token is ≥ 4.5:1 on its background (WCAG 1.4.3). */
const studioLight = tm.createTheme({
  variant: 'light',
  settings: { background: '#ffffff', foreground: '#1f2430', caret: '#4c2fc0', selection: '#d9d0ff', lineHighlight: '#f3f1fb', gutterBackground: '#f7f8fb', gutterForeground: '#4b5468' },
  styles: [
    { tag: [t.keyword, t.heading], color: '#4c2fc0', fontWeight: 'bold' },
    { tag: [t.string, t.special(t.string), t.attributeValue], color: '#0b6b3a' },
    { tag: [t.comment, t.meta], color: '#5b6474', fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.atom], color: '#a2410a' },
    { tag: [t.tagName, t.typeName], color: '#9b1c5a' },
    { tag: [t.propertyName, t.attributeName], color: '#7a4a00' },
    { tag: [t.variableName, t.definition(t.variableName)], color: '#1f2430' },
    { tag: [t.operator, t.punctuation, t.bracket], color: '#3d4556' },
    { tag: t.invalid, color: '#b42335' },
  ],
});
type MonokaiPalette = { background: string; foreground: string; gutter: string; keyword: string; string: string; comment: string; number: string; type: string; property: string; operator: string; selection: string; line: string; invalid: string; light?: boolean };
const monokaiEditor = (p: MonokaiPalette) => tm.createTheme({
  variant: p.light ? 'light' : 'dark',
  settings: { background: p.background, foreground: p.foreground, caret: p.keyword, selection: p.selection, lineHighlight: p.line, gutterBackground: p.background, gutterForeground: p.gutter },
  styles: [
    { tag: [t.keyword, t.heading], color: p.keyword, fontWeight: 'bold' },
    { tag: [t.string, t.special(t.string), t.attributeValue], color: p.string },
    { tag: [t.comment, t.meta], color: p.comment, fontStyle: 'italic' },
    { tag: [t.number, t.bool, t.atom], color: p.number },
    { tag: [t.tagName, t.typeName], color: p.type },
    { tag: [t.propertyName, t.attributeName], color: p.property },
    { tag: [t.variableName, t.definition(t.variableName)], color: p.foreground },
    { tag: [t.operator, t.punctuation, t.bracket], color: p.operator },
    { tag: t.invalid, color: p.invalid },
  ],
});
const monokaiPalettes = {
  monokai: { background: '#272822', foreground: '#f8f8f2', gutter: '#aaa99d', keyword: '#ff709b', string: '#e6db74', comment: '#aaa891', number: '#b5e56f', type: '#7de1ef', property: '#e6db74', operator: '#f8f8f2', selection: '#57584a', line: '#35362f', invalid: '#ff709b' },
  'monokai-machine': { background: '#1f252c', foreground: '#e9edf1', gutter: '#9aaeb8', keyword: '#ff8b9c', string: '#f1d88a', comment: '#a5b3b7', number: '#a4df8e', type: '#7ddac5', property: '#f1d88a', operator: '#e9edf1', selection: '#40505b', line: '#2b323b', invalid: '#ff8b9c' },
  'monokai-octagon': { background: '#282433', foreground: '#f1edf4', gutter: '#aaa0b5', keyword: '#e6a4c4', string: '#e5d28b', comment: '#aba2b6', number: '#b8dda0', type: '#b4c7f2', property: '#e5d28b', operator: '#f1edf4', selection: '#51475e', line: '#352f40', invalid: '#f29bb0' },
  'monokai-ristretto': { background: '#302b2a', foreground: '#f4ece6', gutter: '#b5a9a1', keyword: '#e8b89d', string: '#ecd799', comment: '#b6aaa1', number: '#b4d497', type: '#a8d2cd', property: '#ecd799', operator: '#f4ece6', selection: '#5a4b45', line: '#3c3533', invalid: '#ee9b9b' },
  'monokai-spectrum': { background: '#18191b', foreground: '#f5f5f2', gutter: '#a3a6a7', keyword: '#ff75a0', string: '#f2dd83', comment: '#a3a6a7', number: '#b5e56f', type: '#78dce8', property: '#f2dd83', operator: '#f5f5f2', selection: '#3c4042', line: '#252629', invalid: '#ff75a0' },
  'monokai-light': { background: '#fffdf8', foreground: '#302c2d', gutter: '#665f60', keyword: '#a52d67', string: '#6b5b00', comment: '#665f60', number: '#426c19', type: '#165c75', property: '#795800', operator: '#38343a', selection: '#e6dbcf', line: '#f5f1e8', invalid: '#a42b40', light: true },
} satisfies Record<string, MonokaiPalette>;
export type EditorThemeId = 'auto' | 'studio-dark' | 'one-dark' | 'matrix' | 'studio-light' | keyof typeof monokaiPalettes | 'amy' | 'ayu-light' | 'barf' | 'bespin' | 'birds-of-paradise' | 'boys-and-girls' | 'clouds' | 'cobalt' | 'cool-glow' | 'dracula' | 'espresso' | 'noctis-lilac' | 'rose-pine-dawn' | 'smoothy' | 'solarized-light' | 'tomorrow';
export const editorThemes: { id: Exclude<EditorThemeId, 'auto'>; label: string; dark: boolean; ext: Extension; source: string }[] = [
  { id: 'studio-dark', label: 'Studio Dark', dark: true, ext: studioDark, source: 'Studio (WCAG AA)' },
  { id: 'one-dark', label: 'One Dark', dark: true, ext: oneDark, source: 'CodeMirror' },
  { id: 'matrix', label: 'Matrix', dark: true, ext: matrix, source: 'Studio' },
  { id: 'studio-light', label: 'Studio Light', dark: false, ext: studioLight, source: 'Studio (WCAG AA)' },
  ...Object.entries(monokaiPalettes).map(([id, palette]) => ({ id: id as keyof typeof monokaiPalettes, label: appThemes.find((theme) => theme.id === id)?.label ?? id, dark: !('light' in palette && palette.light), ext: monokaiEditor(palette), source: 'Studio · Monokai inspired' })),
  { id: 'amy', label: 'Amy', dark: true, ext: tm.amy, source: 'ThemeMirror' },
  { id: 'barf', label: 'Barf', dark: true, ext: tm.barf, source: 'ThemeMirror' },
  { id: 'bespin', label: 'Bespin', dark: true, ext: tm.bespin, source: 'ThemeMirror' },
  { id: 'birds-of-paradise', label: 'Birds of Paradise', dark: true, ext: tm.birdsOfParadise, source: 'ThemeMirror' },
  { id: 'boys-and-girls', label: 'Boys and Girls', dark: true, ext: tm.boysAndGirls, source: 'ThemeMirror' },
  { id: 'cobalt', label: 'Cobalt', dark: true, ext: tm.cobalt, source: 'ThemeMirror' },
  { id: 'cool-glow', label: 'Cool Glow', dark: true, ext: tm.coolGlow, source: 'ThemeMirror' },
  { id: 'dracula', label: 'Dracula', dark: true, ext: tm.dracula, source: 'ThemeMirror' },
  { id: 'espresso', label: 'Espresso', dark: false, ext: tm.espresso, source: 'ThemeMirror' },
  { id: 'ayu-light', label: 'Ayu Light', dark: false, ext: tm.ayuLight, source: 'ThemeMirror' },
  { id: 'clouds', label: 'Clouds', dark: false, ext: tm.clouds, source: 'ThemeMirror' },
  { id: 'noctis-lilac', label: 'Noctis Lilac', dark: false, ext: tm.noctisLilac, source: 'ThemeMirror' },
  { id: 'rose-pine-dawn', label: 'Rosé Pine Dawn', dark: false, ext: tm.rosePineDawn, source: 'ThemeMirror' },
  { id: 'smoothy', label: 'Smoothy', dark: false, ext: tm.smoothy, source: 'ThemeMirror' },
  { id: 'solarized-light', label: 'Solarized Light', dark: false, ext: tm.solarizedLight, source: 'ThemeMirror' },
  { id: 'tomorrow', label: 'Tomorrow', dark: false, ext: tm.tomorrow, source: 'ThemeMirror' },
];
export function resolveEditorTheme(editor: EditorThemeId, app: AppThemeId) {
  const id = editor === 'auto' ? (appThemes.find((a) => a.id === app)?.editor ?? 'studio-dark') : editor;
  return editorThemes.find((e) => e.id === id) ?? editorThemes[0];
}
/** CodeMirror theme extension for the current preferences ("auto" follows the app theme). */
export function useEditorTheme(): Extension {
  const { prefs } = usePrefs();
  return resolveEditorTheme(prefs.editorTheme, prefs.theme).ext;
}
