import { describe, expect, it } from 'vitest';
import { linkAt } from '../src/editor/links';

describe('editor links (QL4, QL49)', () => {
  it('QL4 web addresses under the pointer', () => {
    const t = '// see https://learn.microsoft.com/dotnet/core. More';
    expect(linkAt(t, t.indexOf('learn'))).toEqual({ url: 'https://learn.microsoft.com/dotnet/core' });
    expect(linkAt(t, 2)).toBeUndefined();
  });
});
