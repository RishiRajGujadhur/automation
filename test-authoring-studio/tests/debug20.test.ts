import { describe, expect, it } from 'vitest';
import { expandMacros } from '../server/debugger';
import { visualize } from '../src/debug/DebugPanel';

describe('debugging features (DEBUG-20)', () => {
  it('runs', () => { expect(true).toBe(true); });
  it('DB13 visualizers unquote C# strings and format JSON / XML', () => {
    expect(visualize('Text', '"line1\\nline2"')).toBe('line1\nline2');
    expect(visualize('JSON', '"{\\"a\\":[1,2]}"')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(visualize('XML', '"<a><b>x</b></a>"')).toBe('<a>\n  <b>x</b>\n</a>');
    expect(visualize('JSON', '"oops"')).toMatch(/^Not valid JSON/);
  });
  it('DB20 tracepoint macros', () => {
    expect(expandMacros('in $FUNCTION from $CALLER on $TID at $FILEPOS ($FUNCTIONS stays)', { func: 'Add()', caller: 'Run()', tid: 7, file: 'A.cs', line: 3 })).toBe('in Add() from Run() on 7 at A.cs(3) ($FUNCTIONS stays)');
  });
});
