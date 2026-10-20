import { describe, expect, it } from 'vitest';
import { issueKey, withIssueKey, COMMIT_TYPES, withCommitType } from '../src/git/commitTools';

describe('commit message helpers (IDE-FEATURES-4)', () => {
  it('Y61 Issue key from the branch name', () => {
    expect(issueKey('feature/ABC-123-sign-in')).toBe('ABC-123');
    expect(issueKey('bug/42-crash')).toBe('#42');
    expect(issueKey('main')).toBe(undefined);
    expect(withIssueKey('Fix login', 'ABC-123')).toBe('ABC-123: Fix login');
    expect(withIssueKey('ABC-123: Fix', 'ABC-123')).toBe('ABC-123: Fix');
  });
  it('Y62 Conventional Commits type', () => {
    expect(withCommitType('Sign in works', 'feat')).toBe('feat: Sign in works');
    expect(withCommitType('fix(auth)!: x', 'feat')).toBe('feat(auth)!: x');
    expect(withCommitType('ABC-1: x', 'test')).toBe('ABC-1: test: x');
  });
});
