import type { DiscoveredTest, Outcome } from './store';

/** Test Explorer tree groups (Visual Studio's Group By): Project ▸ Class / Feature, Class, Outcome or Duration. */
export type Group = { key: string; label: string; kind: 'project' | 'class' | 'feature' | 'outcome' | 'duration'; tests: DiscoveredTest[]; children: Group[] };
export type GroupBy = 'project' | 'class' | 'outcome' | 'duration';
const OUTCOMES: [Outcome, string][] = [['failed', 'Failed'], ['running', 'Running'], ['passed', 'Passed'], ['skipped', 'Skipped'], ['none', 'Not run']];
const DURATIONS = ['Slow (> 1 s)', 'Medium (100 ms – 1 s)', 'Fast (< 100 ms)', 'Not run'];
const classGroup = (t: DiscoveredTest): Pick<Group, 'key' | 'label' | 'kind'> => (t.kind === 'scenario' ? { key: `f:${t.file}`, label: t.feature ?? t.file, kind: 'feature' } : { key: `c:${t.className}`, label: t.className, kind: 'class' });

export function groupTests(tests: DiscoveredTest[], by: GroupBy, outcome: (t: DiscoveredTest) => Outcome, duration: (t: DiscoveredTest) => number | undefined): Group[] {
  const groups = new Map<string, Group>();
  const bucket = (g: Pick<Group, 'key' | 'label' | 'kind'>, into = groups) => { let x = into.get(g.key); if (!x) { x = { ...g, tests: [], children: [] }; into.set(g.key, x); } return x; };
  for (const t of tests) {
    if (by === 'project') {
      const p = bucket({ key: `p:${t.project}`, label: t.project, kind: 'project' });
      const c = classGroup(t);
      let g = p.children.find((x) => x.key === c.key);
      if (!g) { g = { ...c, tests: [], children: [] }; p.children.push(g); }
      g.tests.push(t);
      p.tests.push(t);
    } else if (by === 'class') bucket(classGroup(t)).tests.push(t);
    else if (by === 'outcome') { const o = outcome(t); bucket({ key: `o:${o}`, label: OUTCOMES.find(([k]) => k === o)![1], kind: 'outcome' }).tests.push(t); }
    else { const d = duration(t); const label = d === undefined ? DURATIONS[3] : d >= 1000 ? DURATIONS[0] : d >= 100 ? DURATIONS[1] : DURATIONS[2]; bucket({ key: `d:${label}`, label, kind: 'duration' }).tests.push(t); }
  }
  const list = [...groups.values()];
  if (by === 'outcome') return list.sort((a, b) => OUTCOMES.findIndex(([, l]) => l === a.label) - OUTCOMES.findIndex(([, l]) => l === b.label));
  if (by === 'duration') return list.sort((a, b) => DURATIONS.indexOf(a.label) - DURATIONS.indexOf(b.label));
  return list.sort((a, b) => a.label.localeCompare(b.label));
}
