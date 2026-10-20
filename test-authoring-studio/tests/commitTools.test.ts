import { describe, expect, it } from 'vitest';
import { issueKey, withIssueKey } from '../src/git/commitTools';

describe('commit message helpers (IDE-FEATURES-4)', () => {
  it('Y61 Issue key from the branch name', () => {
    expect(issueKey('feature/ABC-123-sign-in')).toBe('ABC-123');
    expect(issueKey('bug/42-crash')).toBe('#42');
    expect(issueKey('main')).toBe(undefined);
    expect(withIssueKey('Fix login', 'ABC-123')).toBe('ABC-123: Fix login');
    expect(withIssueKey('ABC-123: Fix', 'ABC-123')).toBe('ABC-123: Fix');
  });
});
