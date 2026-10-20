import { describe, expect, it } from 'vitest';
import { changedLines } from '../src/editor/quickPreview';

// Unit tests for RIDER-VSCODE-FEATURES.md.
describe('117 Quick Actions preview', () => {
  it('changed lines with context', () => {
    expect(changedLines('a\nb\nc\nd\ne', 'a\nb\nX\nd\ne', 1)).toEqual([{ kind: ' ', text: 'b' }, { kind: '-', text: 'c' }, { kind: '+', text: 'X' }, { kind: ' ', text: 'd' }]);
    expect(changedLines('same', 'same')).toEqual([]);
    expect(changedLines('a\r\nb', 'a\nb\nc', 0)).toEqual([{ kind: '+', text: 'c' }]);
  });
});
import { todoPositions, stepTo } from '../src/editor/navTools';
describe('324 TODO navigation', () => {
  it('finds TODO keywords in comments only', () => {
    const t = 'var todo = 1; // TODO: a\n# FIXME b\nstring s = "TODO not";\n/* HACK c */\n * BUG d';
    const at = todoPositions(t, ['TODO', 'FIXME', 'HACK', 'BUG']);
    expect(at.map((i) => t.slice(i, i + 4))).toEqual(['TODO', 'FIXM', 'HACK', 'BUG ']);
    expect(stepTo([5, 20, 40], 20, 1)).toBe(40);
    expect(stepTo([5, 20, 40], 41, 1)).toBe(5);
    expect(stepTo([5, 20, 40], 5, -1)).toBe(40);
    expect(stepTo([], 0, 1)).toBe(-1);
  });
});
