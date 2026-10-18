import { describe, expect, it } from 'vitest';
import { expandMacros } from '../src/rider/ExternalTools';

describe('External Tools macros (J57)', () => {
  it('expands Rider macros for the active file', () => {
    const c = { root: 'C:\\repo', file: 'Features/Auth/Login.feature', line: 7, column: 5, selection: 'sign "in"' };
    expect(expandMacros('code -g "$FilePath$:$LineNumber$:$ColumnNumber$"', c)).toBe('code -g "C:\\repo\\Features\\Auth\\Login.feature:7:5"');
    expect(expandMacros('$FileDir$ | $FileName$ | $FileNameWithoutExtension$ | $FileRelativePath$ | $ProjectFileDir$', c)).toBe('C:\\repo\\Features\\Auth | Login.feature | Login | Features/Auth/Login.feature | C:\\repo');
    expect(expandMacros('echo "$SelectedText$" $Unknown$', c)).toBe('echo "sign `"in`"" $Unknown$');
  });
});
