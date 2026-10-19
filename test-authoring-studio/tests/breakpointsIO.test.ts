import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/api', () => ({ api: vi.fn(() => Promise.resolve({})) }));
const store = await import('../src/debug/store');

describe('Export / Import Breakpoints (X31)', () => {
  it('round-trips breakpoints with their settings and rejects other files', () => {
    store.setBreakpoints('Steps/A.cs', [3, 9]);
    store.updateBreakpoint('Steps/A.cs', 9, { condition: 'x > 1', hitCondition: '2' });
    const json = store.exportBreakpoints();
    store.clearBreakpoints();
    expect(store.specsOf('Steps/A.cs')).toEqual([]);
    expect(store.importBreakpoints(json)).toBe(2);
    expect(store.specsOf('Steps/A.cs')).toEqual([{ line: 3 }, { line: 9, condition: 'x > 1', hitCondition: '2' }].map((b) => expect.objectContaining(b)));
    expect(() => store.importBreakpoints('{"x":1}')).toThrow('Not a breakpoints file.');
  });
});
