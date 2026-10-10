/** Getting-started milestones, recorded per browser. */
export const milestones = [
  { id: 'scan', label: 'Connect and scan a repository' },
  { id: 'generator', label: 'Open the Test Generator' },
  { id: 'dictionary', label: 'Inspect a selector dictionary' },
  { id: 'record', label: 'Record a browser workflow' },
  { id: 'validate', label: 'Run a dry-run validation' },
  { id: 'save', label: 'Approve and write a change' },
] as const;
export type MilestoneId = (typeof milestones)[number]['id'];
export function markDone(id: MilestoneId) {
  try {
    const done = new Set<string>(JSON.parse(localStorage.getItem('tas:milestones') ?? '[]'));
    if (done.has(id)) return;
    done.add(id);
    localStorage.setItem('tas:milestones', JSON.stringify([...done]));
    window.dispatchEvent(new Event('tas:milestones'));
  } catch {
    /* storage unavailable */
  }
}
export function doneMilestones(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('tas:milestones') ?? '[]'));
  } catch {
    return new Set();
  }
}
