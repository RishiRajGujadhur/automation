import { describe, expect, it } from 'vitest';
import { docCommentFor } from '../src/editor/xmlDoc';

describe('XML documentation comments (X21)', () => {
  it('summary, a param per parameter, returns for non-void methods', () => {
    expect(docCommentFor('    public int Add(int first, int second = 2)', '    ').text).toBe(['    /// <summary>', '    /// ', '    /// </summary>', '    /// <param name="first"></param>', '    /// <param name="second"></param>', '    /// <returns></returns>'].join('\n'));
    expect(docCommentFor('public void SignIn(string userName)', '').text).not.toContain('<returns>');
    expect(docCommentFor('public class Calculator', '').text).toBe(['/// <summary>', '/// ', '/// </summary>'].join('\n'));
    expect(docCommentFor('public async Task OpenAsync()', '').text).not.toContain('<returns>');
  });
});
