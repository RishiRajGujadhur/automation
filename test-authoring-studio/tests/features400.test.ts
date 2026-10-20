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
