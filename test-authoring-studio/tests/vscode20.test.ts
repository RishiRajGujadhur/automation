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
