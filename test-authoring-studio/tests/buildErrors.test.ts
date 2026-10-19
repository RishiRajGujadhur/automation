import { describe, expect, it } from 'vitest';
import { stepError, type BuildDiagnostic } from '../src/build/store';

const d = (file?: string, line?: number): BuildDiagnostic => ({ severity: 'error', code: 'CS0001', message: 'x', file, line });
describe('Next / Previous Error (X104)', () => {
  it('steps through located diagnostics, wrapping', () => {
    const list = [d('a.cs', 1), d(), d('b.cs', 2), d('c.cs', 3)];
    expect(stepError(list, -1, 1)).toBe(0);
    expect(stepError(list, 0, 1)).toBe(2);
    expect(stepError(list, 3, 1)).toBe(0);
    expect(stepError(list, 0, -1)).toBe(3);
    expect(stepError(list, -1, -1)).toBe(3);
    expect(stepError([d()], -1, 1)).toBe(-1);
  });
});
