/** Commit message helpers of the Git Changes window (IDE-FEATURES-4.md). */

/** The issue key in a branch name: "feature/ABC-123-sign-in" → "ABC-123", "fix/#42-x" or "bug/42-x" → "#42". */
export function issueKey(branch?: string) {
  if (!branch) return undefined;
  const jira = /([A-Z][A-Z0-9]+-\d+)/.exec(branch);
  if (jira) return jira[1];
  const num = /(?:^|[/_-])#?(\d+)(?=[-_/]|$)/.exec(branch);
  return num ? `#${num[1]}` : undefined;
}
/** The message with the key in front ("ABC-123: …"), unless it already mentions it. */
export const withIssueKey = (message: string, key: string) => (message.includes(key) ? message : `${key}: ${message}`);
