import { useSyncExternalStore } from 'react';
import { Compartment, EditorSelection, EditorState, Prec, type Extension } from '@codemirror/state';
import { indentUnit } from '@codemirror/language';
import { indentationMarkers } from '@replit/codemirror-indentation-markers';
import { highlightSelectionMatches } from '@codemirror/search';
import { featureOn, onFeaturesChanged } from '../features';
import { todoHighlightFor } from './todoHighlight';
import { bracketColors } from './bracketColors';
import { scrollMarks } from './scrollMarks';
import { currentScenario as currentScenarioFor } from './currentScenario';
import { scrollPastEnd } from '@codemirror/view';
import { searchCount } from './searchCount';
import { EditorView, ViewPlugin, highlightWhitespace, highlightTrailingWhitespace, rectangularSelection, keymap } from '@codemirror/view';

/** View ▸ Active Editor options (Rider): soft wraps, …, shared by every editor and remembered. */
export type ViewOptions = { softWrap: boolean; whitespace: boolean; fontSize: number | null; columnMode?: boolean; hideLineNumbers?: boolean; hideIndentGuides?: boolean; noCaretUsages?: boolean; overtype?: boolean; noActiveLine?: boolean; multiRowTabs?: boolean; noBracketColors?: boolean; todoTokens?: string[]; rightMargin?: number; indent?: { tabs: boolean; size: number }; noScrollMarks?: boolean; pinnedRow?: boolean; colorTabs?: boolean; centered?: boolean; doNotDisturb?: boolean; hideStatusBar?: boolean; hideActivityBar?: boolean; uiZoom?: number; compact?: boolean; noScenarioBand?: boolean; noScrollPastEnd?: boolean };
const KEY = 'tas:rider:view';
const DEFAULTS: ViewOptions = { softWrap: false, whitespace: false, fontSize: null };
let options: ViewOptions = (() => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; } })();
const listeners = new Set<() => void>();
// Settings ▸ Features turn some of these on and off too.
onFeaturesChanged(() => { for (const l of listeners) l(); });
export const viewOptions = () => options;
/** Re-renders a component when the options change (the status bar's OVR). */
const subs = new Set<() => void>();
let vVersion = 0;
export const useViewOptions = () => { useSyncExternalStore((l) => { subs.add(l); return () => subs.delete(l); }, () => vVersion); return options; };
/** Zoom IDE (Rider's View ▸ Appearance ▸ Zoom IDE): the whole window, 50–200 %. */
export function applyUiZoom() { if (typeof document !== 'undefined') { document.documentElement.style.zoom = options.uiZoom && featureOn('zoom-ide') ? `${options.uiZoom}%` : ''; document.documentElement.classList.toggle('compact-ui', !!options.compact && featureOn('compact-mode')); } }
export function setViewOptions(next: Partial<ViewOptions>) {
  options = { ...options, ...next };
  try { localStorage.setItem(KEY, JSON.stringify(options)); } catch { /* storage blocked */ }
  for (const l of listeners) l();
  vVersion++;
  for (const l of subs) l();
  applyUiZoom();
}

/** The current editor font size in pixels (the theme's when none was set). */
export function fontSizeOf(view?: EditorView) {
  if (options.fontSize) return options.fontSize;
  const el = view?.contentDOM ?? document.querySelector('.cm-content');
  return el ? Math.round(parseFloat(getComputedStyle(el).fontSize)) || 13 : 13;
}
/** Increase / Decrease Font Size (by one pixel, 8–40); 0 resets to the theme's size. */
export function changeFontSize(step: number, view?: EditorView) {
  setViewOptions({ fontSize: step === 0 ? null : Math.max(8, Math.min(40, fontSizeOf(view) + step)) });
}

/** Column Selection Mode (Rider, Alt+Shift+Insert): Shift+↑/↓ grows a column block of carets at the same column. */
function columnStep(dir: 1 | -1) {
  return (view: EditorView) => {
    const st = view.state;
    const ranges = st.selection.ranges;
    const edge = dir > 0 ? ranges.reduce((a, b) => (b.head > a.head ? b : a)) : ranges.reduce((a, b) => (b.head < a.head ? b : a));
    const line = st.doc.lineAt(edge.head);
    const next = line.number + dir;
    if (next < 1 || next > st.doc.lines) return true;
    const target = st.doc.line(next);
    const anchorCol = edge.anchor - st.doc.lineAt(edge.anchor).from, headCol = edge.head - line.from;
    const r = EditorSelection.range(target.from + Math.min(anchorCol, target.length), target.from + Math.min(headCol, target.length));
    view.dispatch({ selection: EditorSelection.create([...ranges, r], ranges.length), scrollIntoView: true });
    return true;
  };
}
const columnMode = [
  rectangularSelection({ eventFilter: (e) => e.button === 0 }),
  Prec.highest(keymap.of([{ key: 'Shift-ArrowDown', run: columnStep(1) }, { key: 'Shift-ArrowUp', run: columnStep(-1) }])),
  EditorView.editorAttributes.of({ class: 'cm-column-mode' }),
];

const wrap = new Compartment();
const column = new Compartment();
const numbers = new Compartment();
const guides = new Compartment();
const caretUsages = new Compartment();
const todos = new Compartment();
const overtypeC = new Compartment();
const activeLine = new Compartment();
const noActiveLine = [EditorView.editorAttributes.of({ class: 'cm-no-active-line' }), EditorView.theme({ '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'transparent !important' } })];
/** Overtype mode (Visual Studio, Insert): a typed character replaces the one after the caret instead of pushing it. */
const overtype = [
  EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || text.length !== 1 || text === '\n') return false;
    const line = view.state.doc.lineAt(from);
    if (from >= line.to) return false;
    view.dispatch({ changes: { from, to: from + 1, insert: text }, selection: { anchor: from + 1 }, userEvent: 'input.type' });
    return true;
  }),
  EditorView.editorAttributes.of({ class: 'cm-overtype' }),
  EditorView.baseTheme({ '&.cm-overtype .cm-cursor': { borderLeftWidth: '0.6em', opacity: '0.45' } }),
];
// Highlight usages of the identifier at the caret (Rider's default): whole-word matches of the word under the caret.
const wordAtCaret = [highlightSelectionMatches({ highlightWordAroundCursor: true, minSelectionLength: 2, wholeWords: true }), EditorView.baseTheme({ '.cm-selectionMatch': { backgroundColor: 'rgba(98, 166, 255, 0.18)' } })];
// Indent guides (Rider shows them by default): a thin line per indentation level, the active block's brighter.
const indentGuides = indentationMarkers({ highlightActiveBlock: true, markerType: 'fullScope', thickness: 1, colors: { light: '#d0d7de', dark: '#3a3f4b', activeLight: '#9aa5b1', activeDark: '#6b7385' } });
// Line numbers come with the editors' basic setup; hiding them is a class the theme reacts to.
const hideNumbers = [EditorView.editorAttributes.of({ class: 'cm-no-line-numbers' }), EditorView.theme({ '.cm-lineNumbers': { display: 'none !important' } })];
const spaces = new Compartment();
const font = new Compartment();
const fontTheme = (px: number | null) => (px ? EditorView.theme({ '&': { fontSize: `${px}px` }, '.cm-content, .cm-gutters': { fontSize: `${px}px` } }) : []);
const extensionsFor = (o: ViewOptions) => ({ activeLine: o.noActiveLine && featureOn('current-line') ? noActiveLine : [], overtype: o.overtype && featureOn('overtype') ? overtype : [], todos: featureOn('todo-highlighting') ? todoHighlightFor(featureOn('todo-tokens') ? o.todoTokens : undefined) : [], caret: o.noCaretUsages || !featureOn('highlight-usages') ? [] : wordAtCaret, guides: o.hideIndentGuides || !featureOn('indent-guides') ? [] : indentGuides, numbers: o.hideLineNumbers ? hideNumbers : [], column: o.columnMode ? columnMode : [], font: fontTheme(o.fontSize), wrap: o.softWrap ? EditorView.lineWrapping : [], spaces: o.whitespace ? [highlightWhitespace(), highlightTrailingWhitespace()] : [] });

/** Right margin guide (Rider's visual guide at column 120; Visual Studio's guidelines): a thin line after column n. */
const marginGuide = (col: number) => [
  EditorView.editorAttributes.of({ class: 'cm-right-margin' }),
  EditorView.theme({ '.cm-content': { backgroundImage: `linear-gradient(to right, transparent calc(${col}ch + 6px), rgba(128, 128, 128, 0.35) calc(${col}ch + 6px), rgba(128, 128, 128, 0.35) calc(${col}ch + 7px), transparent calc(${col}ch + 7px))` } }),
];
/** More options (IDE-FEATURES.md): a compartment each, with the extension for the current options. */
const EXTRA: [Compartment, (o: ViewOptions) => Extension][] = [
  [new Compartment(), (o) => (o.noBracketColors || !featureOn('bracket-colors') ? [] : bracketColors)],
  [new Compartment(), (o) => (featureOn('right-margin') && (o.rightMargin ?? 120) > 0 ? marginGuide(o.rightMargin ?? 120) : [])],
  // Indentation (VS Code's status bar / Visual Studio's Tabs options): spaces or tabs, and the size.
  [new Compartment(), (o) => (o.indent && featureOn('indentation') ? Prec.high([indentUnit.of(o.indent.tabs ? '\t' : ' '.repeat(o.indent.size)), EditorState.tabSize.of(o.indent.size)]) : [])],
  // Scroll bar annotations (Visual Studio): errors, warnings and the caret line over the scroll bar.
  [new Compartment(), (o) => (o.noScrollMarks || !featureOn('scroll-marks') ? [] : scrollMarks)],
  // Centered layout (VS Code): the text in a readable column in the middle of a wide editor.
  [new Compartment(), (o) => (o.centered && featureOn('centered-layout') ? [EditorView.editorAttributes.of({ class: 'cm-centered' }), EditorView.theme({ '.cm-content': { maxWidth: 'min(120ch, 100%)', marginLeft: 'auto !important', marginRight: 'auto !important' } })] : [])],
  // Highlight Current Scenario (Gherkin): the scenario at the caret on a light band.
  [new Compartment(), (o) => (o.noScenarioBand || !featureOn('current-scenario') ? [] : currentScenarioFor)],
  // Scroll past the end (VS Code's default): the last line can scroll up to the top.
  [new Compartment(), (o) => (o.noScrollPastEnd || !featureOn('scroll-past-end') ? [] : scrollPastEnd())],
  // Find: "3 of 12" matches.
  [new Compartment(), () => (featureOn('search-count') ? searchCount : [])],
  // extra view options
];

/** Applies the options to an editor and follows later changes. */
export function viewOptionsExtension(): Extension {
  const now = extensionsFor(options);
  return [
    wrap.of(now.wrap),
    spaces.of(now.spaces),
    font.of(now.font),
    column.of(now.column),
    numbers.of(now.numbers),
    guides.of(now.guides),
    caretUsages.of(now.caret),
    todos.of(now.todos),
    overtypeC.of(now.overtype),
    activeLine.of(now.activeLine),
    ...EXTRA.map(([c, f]) => c.of(f(options))),
    ViewPlugin.fromClass(class {
      off: () => void;
      constructor(view: EditorView) {
        const apply = () => { const e = extensionsFor(options); view.dispatch({ effects: [wrap.reconfigure(e.wrap), spaces.reconfigure(e.spaces), font.reconfigure(e.font), column.reconfigure(e.column), numbers.reconfigure(e.numbers), guides.reconfigure(e.guides), caretUsages.reconfigure(e.caret), todos.reconfigure(e.todos), overtypeC.reconfigure(e.overtype), activeLine.reconfigure(e.activeLine), ...EXTRA.map(([c, f]) => c.reconfigure(f(options)))] }); };
        listeners.add(apply);
        // Ctrl+Mouse Wheel changes the font size of the editors (Rider's "Change font size with Ctrl+Mouse Wheel").
        const wheel = (e: WheelEvent) => {
          if (!(e.ctrlKey || e.metaKey) || !e.deltaY || !featureOn('font-zoom')) return;
          e.preventDefault();
          changeFontSize(e.deltaY < 0 ? 1 : -1, view);
        };
        view.dom.addEventListener('wheel', wheel, { passive: false });
        this.off = () => { listeners.delete(apply); view.dom.removeEventListener('wheel', wheel); };
      }
      destroy() { this.off(); }
    }),
  ];
}

// The zoom of the last session.
applyUiZoom();
