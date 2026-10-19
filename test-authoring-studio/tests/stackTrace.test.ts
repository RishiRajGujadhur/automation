import { describe, expect, it } from 'vitest';
import { matchFile, parseStackTrace } from '../src/rider/traceParser';

describe('Analyze Stack Trace (X40)', () => {
  it('reads frames and maps machine paths onto repository files', () => {
    const frames = parseStackTrace(['System.Exception: boom', '   at Demo.AuthSteps.SignIn(String userName) in C:\\build\\agent\\Fixtures\\Steps\\AuthSteps.cs:line 6', '   at System.RuntimeMethodHandle.InvokeMethod(Object target)'].join('\n'));
    expect(frames).toEqual([
      { method: 'Demo.AuthSteps.SignIn(String userName)', file: 'C:\\build\\agent\\Fixtures\\Steps\\AuthSteps.cs', line: 6, raw: expect.any(String) },
      { method: 'System.RuntimeMethodHandle.InvokeMethod(Object target)', file: undefined, line: undefined, raw: expect.any(String) },
    ]);
    expect(matchFile(frames[0].file!, ['Steps/AuthSteps.cs', 'Steps/SearchSteps.cs'])).toBe('Steps/AuthSteps.cs');
    expect(matchFile('/home/x/Other.cs', ['Steps/AuthSteps.cs'])).toBeUndefined();
  });
});
