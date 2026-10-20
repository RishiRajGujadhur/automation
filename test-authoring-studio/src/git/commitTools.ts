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

export const COMMIT_TYPES = ['feat', 'fix', 'test', 'refactor', 'docs', 'chore', 'ci', 'perf', 'build', 'style'];
/** Sets the Conventional Commits type of a message ("fix: …"), replacing a type already there; scope and "!" kept. */
export function withCommitType(message: string, type: string) {
  const m = /^(\w+)(\([^)]*\))?(!)?:\s*/.exec(message);
  if (m && COMMIT_TYPES.includes(m[1])) return `${type}${m[2] ?? ''}${m[3] ?? ''}: ${message.slice(m[0].length)}`;
  const key = /^([A-Z][A-Z0-9]+-\d+|#\d+):\s*/.exec(message);
  return key ? `${key[0]}${type}: ${message.slice(key[0].length)}` : `${type}: ${message}`;
}

/** The message to commit from a box that started with a template: the template's # comment lines go. Pure. */
export function withoutTemplateComments(message: string, template: string) {
  const comments = new Set(template.split('\n').filter((l) => l.startsWith('#')));
  return message.split('\n').filter((l) => !comments.has(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
