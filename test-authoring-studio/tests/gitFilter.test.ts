import { describe, expect, it } from 'vitest';
import { matchCommit } from '../src/rider/gitFilter';

const rows = [
  { hash: 'a1b2c3d', author: 'Ada Lovelace', refs: 'HEAD -> main, origin/main', subject: 'Sign in as admin' },
  { hash: 'e4f5a6b', author: 'Bob', refs: 'feature/login', subject: 'Add login page' },
  { hash: '0c0ffee', author: 'Ada Lovelace', refs: '', subject: 'Fix flaky test' },
  { graph: '|' } as { hash?: string },
];
const m = (q: string) => rows.filter((r) => matchCommit(r, q)).map((r) => r.hash);

describe('Git Log filter (X127)', () => {
  it('author:, branch:, hash:, words, exclusions, quotes', () => {
    expect(m('')).toEqual(['a1b2c3d', 'e4f5a6b', '0c0ffee']);
    expect(m('author:ada')).toEqual(['a1b2c3d', '0c0ffee']);
    expect(m('branch:feature')).toEqual(['e4f5a6b']);
    expect(m('hash:0c0f')).toEqual(['0c0ffee']);
    expect(m('author:ada -flaky')).toEqual(['a1b2c3d']);
    expect(m('"login page"')).toEqual(['e4f5a6b']);
    expect(m('author:"ada lovelace" admin')).toEqual(['a1b2c3d']);
  });
});
