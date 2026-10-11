import { describe, it, expect } from 'vitest';
import { Text } from '@codemirror/state';
import { changeMarks } from '../src/editor/changeGutter';

const doc = (s: string) => Text.of(s.split('\n'));

describe('change bars against the last commit', () => {
  it('marks added, modified and deleted lines', () => {
    const base = 'a\nb\nc\nd\ne\n';
    expect(changeMarks(base, doc('a\nB\nc\nd\ne\nf\n'))).toEqual([{ line: 2, kind: 'modified' }, { line: 6, kind: 'added' }]);
    expect(changeMarks(base, doc('a\nb\ne\n'))).toEqual([{ line: 3, kind: 'deleted' }]);
    expect(changeMarks(base, doc('a\nX\nY\nZ\nc\nd\ne\n'))).toEqual([{ line: 2, kind: 'modified' }, { line: 3, kind: 'added' }, { line: 4, kind: 'added' }]);
  });
  it('ignores line-ending differences (CRLF on disk, LF in the editor)', () => {
    expect(changeMarks('a\r\nb\r\n', doc('a\nb\n'))).toEqual([]);
  });
});
