import { describe, expect, it } from 'vitest';
import { globMatcher } from '../src/files/glob';

// VSCODE-250.md W100: files.exclude globs.
describe('globMatcher', () => {
  it('matches ** folders and files under them', () => {
    expect(globMatcher('**/bin')('src/app/bin/x.dll')).toBe(true);
    expect(globMatcher('**/bin')('bin')).toBe(true);
    expect(globMatcher('**/bin')('src/binary.cs')).toBe(false);
  });
  it('matches extensions anywhere and braces', () => {
    expect(globMatcher('*.log')('a/b/run.log')).toBe(true);
    expect(globMatcher('**/*.{js,map}')('dist/app.map')).toBe(true);
    expect(globMatcher('**/*.{js,map}')('dist/app.ts')).toBe(false);
  });
});
