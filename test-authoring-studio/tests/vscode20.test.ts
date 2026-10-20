import { describe, expect, it } from 'vitest';
import { defineSetting, exportSettings, importSettings, parseNumbers, resetSetting, setSetting, setting, settingModified } from '../src/vscode/settings';
import { lineLabel } from '../src/vscode/lineNumbers';

describe('VS Code settings (VSCODE-20.md)', () => {
  it('V1 settings store: defaults, validation, modified, settings.json', () => {
    const size = defineSetting<number>({ key: 'test.size', category: 'Test', title: 'Size', description: '', type: 'number', default: 3, min: 1, max: 5 });
    const mode = defineSetting<string>({ key: 'test.mode', category: 'Test', title: 'Mode', description: '', type: 'enum', default: 'a', options: [{ value: 'a' }, { value: 'b' }] });
    expect(size()).toBe(3);
    setSetting('test.size', 9);
    expect(size()).toBe(3); // out of range: the default
    setSetting('test.size', 4);
    expect(size()).toBe(4);
    expect(settingModified('test.size')).toBe(true);
    setSetting('test.mode', 'b');
    expect(JSON.parse(exportSettings())).toEqual({ 'test.mode': 'b', 'test.size': 4 });
    resetSetting('test.size');
    expect(settingModified('test.size')).toBe(false);
    expect(importSettings('// comment\n{ "test.size": 2, "test.mode": "zzz", "unknown.key": 1 }')).toBe(1);
    expect(size()).toBe(2);
    expect(mode()).toBe('b');
    expect(setting('test.mode')).toBe('b');
    expect(parseNumbers('80, 120 x 100')).toEqual([80, 120, 100]);
  });
  it('V1 editor.lineNumbers labels', () => {
    expect(lineLabel('relative', 5, 5)).toBe('5');
    expect(lineLabel('relative', 2, 5)).toBe('3');
    expect(lineLabel('interval', 7, 3)).toBe('');
    expect(lineLabel('interval', 20, 3)).toBe('20');
    expect(lineLabel('interval', 3, 3)).toBe('3');
  });
});
import { minimapLayout } from '../src/vscode/minimap';
describe('V2 minimap layout', () => {
  it('proportional, fit and fill', () => {
    const base = { lines: 1000, height: 500, scale: 1, scrollTop: 0, scrollHeight: 20000, clientHeight: 500 };
    expect(minimapLayout({ ...base, size: 'proportional' }).lineH).toBe(2);
    expect(minimapLayout({ ...base, size: 'fit' }).lineH).toBe(0.5);
    expect(minimapLayout({ ...base, lines: 100, size: 'fit' }).lineH).toBe(2);
    expect(minimapLayout({ ...base, lines: 100, size: 'fill' }).lineH).toBe(5);
    const end = minimapLayout({ ...base, size: 'proportional', scrollTop: 19500 });
    expect(end.offset).toBe(1500);
    expect(Math.round(end.sliderTop + end.sliderHeight)).toBe(500);
  });
});
import { findSectionHeaders } from '../src/vscode/sectionHeaders';
describe('V3 minimap section headers', () => {
  const regex = String.raw`\bMARK:\s*(?<separator>-?)\s*(?<label>.*)$`;
  it('finds MARK comments and named regions', () => {
    const lines = ['// MARK: - Setup', 'var x = 1; // MARK: Helpers', '#region Steps', '#endregion', 'var s = "MARK: not a comment";', '#region', '<!-- MARK: Fields -->', '# MARK: Gherkin'];
    expect(findSectionHeaders(lines, { region: true, mark: true, regex })).toEqual([
      { line: 1, label: 'Setup', separator: true },
      { line: 2, label: 'Helpers', separator: false },
      { line: 3, label: 'Steps', separator: false },
      { line: 7, label: 'Fields', separator: false },
      { line: 8, label: 'Gherkin', separator: false },
    ]);
    expect(findSectionHeaders(lines, { region: false, mark: true, regex }).map((h) => h.line)).toEqual([1, 2, 7, 8]);
    expect(findSectionHeaders(lines, { region: true, mark: false, regex }).map((h) => h.line)).toEqual([3]);
    expect(findSectionHeaders(['// TODO: x'], { region: true, mark: true, regex: String.raw`\bTODO:\s*(?<label>.*)` })).toEqual([{ line: 1, label: 'x', separator: false }]);
    expect(findSectionHeaders(['// MARK: x'], { region: true, mark: true, regex: '(' })).toEqual([]);
  });
});
import { fontFamilyCss } from '../src/vscode/font';
describe('V7 font family', () => {
  it('quotes names, keeps generic families', () => {
    expect(fontFamilyCss("Cascadia Code, 'Fira Code',monospace")).toBe('"Cascadia Code", "Fira Code", monospace');
    expect(fontFamilyCss('')).toBe('');
  });
});
import { lineHeightCss } from '../src/vscode/font';
describe('V8 line height', () => {
  it('auto, multiplier or pixels', () => {
    expect(lineHeightCss(0)).toBe('');
    expect(lineHeightCss(1.8)).toBe('1.8');
    expect(lineHeightCss(24)).toBe('24px');
  });
});
import { whitespaceToDraw } from '../src/vscode/whitespace';
describe('V9 render whitespace', () => {
  const t = '  a b  c\tx  ';
  it('modes', () => {
    expect(whitespaceToDraw(t, 'none')).toEqual([]);
    expect(whitespaceToDraw(t, 'all')).toEqual([0, 1, 3, 5, 6, 8, 10, 11]);
    expect(whitespaceToDraw(t, 'boundary')).toEqual([0, 1, 5, 6, 8, 10, 11]);
    expect(whitespaceToDraw(t, 'trailing')).toEqual([10, 11]);
    expect(whitespaceToDraw(t, 'selection', [[2, 7]])).toEqual([3, 5, 6]);
  });
});
import { hangingIndent } from '../src/vscode/wordWrap';
describe('V10 wrapping indent', () => {
  it('none, same, indent, deepIndent', () => {
    expect(hangingIndent('    x', 'none', 4, 4)).toBe(0);
    expect(hangingIndent('    x', 'same', 4, 4)).toBe(4);
    expect(hangingIndent('\t  x', 'same', 4, 4)).toBe(6);
    expect(hangingIndent('  x', 'indent', 4, 4)).toBe(6);
    expect(hangingIndent('x', 'deepIndent', 4, 2)).toBe(4);
  });
});
import { rulerImage } from '../src/vscode/rulers';
describe('V11 rulers', () => {
  it('one line per distinct column, in order', () => {
    const img = rulerImage([120, 80, 80]);
    expect(img.match(/linear-gradient/g)).toHaveLength(2);
    expect(img.indexOf('80ch')).toBeLessThan(img.indexOf('120ch'));
  });
});
