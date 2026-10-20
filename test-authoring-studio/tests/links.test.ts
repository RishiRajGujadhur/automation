import { describe, expect, it } from 'vitest';
import { linkAt } from '../src/editor/links';

describe('editor links (QL4, QL49)', () => {
  it('QL49 file:line references', () => {
    const t = 'at Steps/AuthSteps.cs:12 and Features/Auth/Login.feature:7:3';
    expect(linkAt(t, t.indexOf('Auth'))).toEqual({ file: 'Steps/AuthSteps.cs', line: 12, column: 1 });
    expect(linkAt(t, t.indexOf('Login'))).toEqual({ file: 'Features/Auth/Login.feature', line: 7, column: 3 });
    expect(linkAt('version 1.2:3', 9)).toBeUndefined();
  });
  it('QL4 web addresses under the pointer', () => {
    const t = '// see https://learn.microsoft.com/dotnet/core. More';
    expect(linkAt(t, t.indexOf('learn'))).toEqual({ url: 'https://learn.microsoft.com/dotnet/core' });
    expect(linkAt(t, 2)).toBeUndefined();
  });
});
