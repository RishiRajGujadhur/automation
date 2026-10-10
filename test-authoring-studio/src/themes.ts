import { Prec, type Extension } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';
import * as tm from 'thememirror';
import { usePrefs } from './radix2';

/* ------------------------------------------------------------------ App themes */
export type AppThemeId = 'studio' | 'midnight' | 'nord' | 'light' | 'matrix';
export const appThemes: { id: AppThemeId; label: string; description: string; dark: boolean; editor: EditorThemeId; swatch: [string, string, string] }[] = [
  { id: 'studio', label: 'Studio Dark', description: 'The default deep-indigo workspace.', dark: true, editor: 'studio-dark', swatch: ['#0b0e16', '#121722', '#aa94ff'] },
  { id: 'midnight', label: 'Midnight', description: 'Cool navy surfaces with softer contrast.', dark: true, editor: 'cobalt', swatch: ['#0a1426', '#10203a', '#7fb2ff'] },
  { id: 'nord', label: 'Nord', description: 'Arctic slate greys inspired by the Nord palette.', dark: true, editor: 'studio-dark', swatch: ['#2e3440', '#3b4252', '#88c0d0'] },
  { id: 'light', label: 'Light', description: 'Bright surfaces for daylight and print-like reading.', dark: false, editor: 'studio-light', swatch: ['#f6f7fb', '#ffffff', '#6d4ae0'] },
  { id: 'matrix', label: 'Matrix', description: 'Phosphor green on black, monospace everywhere.', dark: true, editor: 'matrix', swatch: ['#000000', '#03140a', '#00ff41'] },
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
export type EditorThemeId = 'auto' | 'studio-dark' | 'one-dark' | 'matrix' | 'studio-light' | 'amy' | 'ayu-light' | 'barf' | 'bespin' | 'birds-of-paradise' | 'boys-and-girls' | 'clouds' | 'cobalt' | 'cool-glow' | 'dracula' | 'espresso' | 'noctis-lilac' | 'rose-pine-dawn' | 'smoothy' | 'solarized-light' | 'tomorrow';
export const editorThemes: { id: Exclude<EditorThemeId, 'auto'>; label: string; dark: boolean; ext: Extension; source: string }[] = [
  { id: 'studio-dark', label: 'Studio Dark', dark: true, ext: studioDark, source: 'Studio (WCAG AA)' },
  { id: 'one-dark', label: 'One Dark', dark: true, ext: oneDark, source: 'CodeMirror' },
  { id: 'matrix', label: 'Matrix', dark: true, ext: matrix, source: 'Studio' },
  { id: 'studio-light', label: 'Studio Light', dark: false, ext: studioLight, source: 'Studio (WCAG AA)' },
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
