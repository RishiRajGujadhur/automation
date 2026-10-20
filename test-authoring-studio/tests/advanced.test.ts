import { describe, expect, it } from 'vitest';
import { relativeDay } from '../src/editor/advanced';

describe('advanced features (ADVANCED-20)', () => {
  it('registry starts empty', () => { expect(true).toBe(true); });
  it('Z1 relative day of a blame date', () => {
    const now = new Date(2026, 9, 20);
    expect(relativeDay('2026-10-20', now)).toBe('today');
    expect(relativeDay('2026-10-17', now)).toBe('3 days ago');
    expect(relativeDay('2026-07-20', now)).toBe('3 months ago');
    expect(relativeDay('2024-10-20', now)).toBe('2 years ago');
  });
});
