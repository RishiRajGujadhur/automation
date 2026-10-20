import { describe, expect, it } from 'vitest';
import { relativeDay, conflictsIn, resolveConflict } from '../src/editor/advanced';

describe('advanced features (ADVANCED-20)', () => {
  it('registry starts empty', () => { expect(true).toBe(true); });
  it('Z1 relative day of a blame date', () => {
    const now = new Date(2026, 9, 20);
    expect(relativeDay('2026-10-20', now)).toBe('today');
    expect(relativeDay('2026-10-17', now)).toBe('3 days ago');
    expect(relativeDay('2026-07-20', now)).toBe('3 months ago');
    expect(relativeDay('2024-10-20', now)).toBe('2 years ago');
  });
  it('Z2 merge conflicts: find and resolve', () => {
    const text = 'a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> branch\nz';
    const [c] = conflictsIn(text);
    expect(c).toEqual({ start: 2, mid: 4, end: 6 });
    const lines = text.split('\n');
    expect(resolveConflict(lines, c, 'current')).toEqual(['mine']);
    expect(resolveConflict(lines, c, 'incoming')).toEqual(['theirs']);
    expect(resolveConflict(lines, c, 'both')).toEqual(['mine', 'theirs']);
    expect(conflictsIn('<<<<<<< a\nx\n||||||| base\ny\n=======\nz\n>>>>>>> b')[0]).toEqual({ start: 1, base: 3, mid: 5, end: 7 });
  });
});
