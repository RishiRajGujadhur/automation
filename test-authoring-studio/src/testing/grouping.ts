import type { DiscoveredTest, Outcome } from './store';

/** Test Explorer tree groups (Visual Studio's Group By): Project ▸ Class / Feature, Class, Outcome or Duration. */
export type Group = { key: string; label: string; kind: 'project' | 'class' | 'feature' | 'outcome' | 'duration' | 'tag'; tests: DiscoveredTest[]; children: Group[] };
export type GroupBy = 'project' | 'class' | 'outcome' | 'duration' | 'tag';
const OUTCOMES: [Outcome, string][] = [['failed', 'Failed'], ['running', 'Running'], ['passed', 'Passed'], ['skipped', 'Skipped'], ['none', 'Not run']];
const DURATIONS = ['Slow (> 1 s)', 'Medium (100 ms – 1 s)', 'Fast (< 100 ms)', 'Not run'];
const classGroup = (t: DiscoveredTest): Pick<Group, 'key' | 'label' | 'kind'> => (t.kind === 'scenario' ? { key: `f:${t.file}`, label: t.feature ?? t.file, kind: 'feature' } : { key: `c:${t.className}`, label: t.className, kind: 'class' });

export function groupTests(tests: DiscoveredTest[], by: GroupBy, outcome: (t: DiscoveredTest) => Outcome, duration: (t: DiscoveredTest) => number | undefined, tagsOf: (t: DiscoveredTest) => string[] = () => []): Group[] {
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
    // Group by Traits (Visual Studio): a scenario under each of its tags.
    else if (by === 'tag') { const tags = tagsOf(t); for (const tag of tags.length ? tags : ['']) bucket({ key: `t:${tag}`, label: tag || 'No tags', kind: 'tag' }).tests.push(t); }
    else if (by === 'outcome') { const o = outcome(t); bucket({ key: `o:${o}`, label: OUTCOMES.find(([k]) => k === o)![1], kind: 'outcome' }).tests.push(t); }
    else { const d = duration(t); const label = d === undefined ? DURATIONS[3] : d >= 1000 ? DURATIONS[0] : d >= 100 ? DURATIONS[1] : DURATIONS[2]; bucket({ key: `d:${label}`, label, kind: 'duration' }).tests.push(t); }
  }
  const list = [...groups.values()];
  if (by === 'outcome') return list.sort((a, b) => OUTCOMES.findIndex(([, l]) => l === a.label) - OUTCOMES.findIndex(([, l]) => l === b.label));
  if (by === 'duration') return list.sort((a, b) => DURATIONS.indexOf(a.label) - DURATIONS.indexOf(b.label));
  if (by === 'tag') return list.sort((a, b) => Number(a.key === 't:') - Number(b.key === 't:') || a.label.localeCompare(b.label));
  return list.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Test Explorer search (Visual Studio's filter syntax): free words match project, class, name and feature; `outcome:failed`,
 * `class:`, `project:`, `feature:`, `name:` and `file:` match one field; quotes keep spaces ("add two"); `-word` excludes.
 */
export function matchTest(t: DiscoveredTest, query: string, outcome: Outcome, tags: string[] = []) {
  const terms = query.trim().toLowerCase().match(/-?\w+:"[^"]*"|-?"[^"]*"|\S+/g) ?? [];
  return terms.every((raw) => {
    const not = raw.startsWith('-') && raw.length > 1;
    const term = not ? raw.slice(1) : raw;
    const m = /^(outcome|state|class|project|feature|name|file|tag|trait):"?([^"]*)"?$/.exec(term);
    const value = m ? m[2] : term.replace(/^"|"$/g, '');
    const field = !m ? `${t.project} ${t.className} ${t.name} ${t.feature ?? ''}`
      : m[1] === 'tag' || m[1] === 'trait' ? tags.join(' ')
      : m[1] === 'outcome' || m[1] === 'state' ? (outcome === 'none' ? 'not run' : outcome)
      : m[1] === 'class' ? t.className : m[1] === 'project' ? t.project : m[1] === 'feature' ? t.feature ?? '' : m[1] === 'file' ? t.file : t.name;
    return field.toLowerCase().includes(value) !== not;
  });
}

/** Copy (Visual Studio's Test Detail Summary): name, full name, outcome, duration, message and stack trace. */
export function testDetails(t: DiscoveredTest, outcome: Outcome, results: { name: string; outcome: string; durationMs: number; message?: string; stackTrace?: string }[]) {
  const head = [`Test Name:\t${t.name}`, `Test FullName:\t${t.className}.${t.method}`, `Test Source:\t${t.file} : line ${t.line}`, `Test Outcome:\t${outcome === 'none' ? 'Not Run' : outcome[0].toUpperCase() + outcome.slice(1)}`];
  const body = results.flatMap((r) => [
    ...(results.length > 1 ? ['', `Result Name:\t${r.name}`, `Result Outcome:\t${r.outcome}`] : []),
    `Test Duration:\t${r.durationMs} ms`,
    ...(r.message ? ['', 'Result Message:', r.message.trim()] : []),
    ...(r.stackTrace ? ['', 'Result StackTrace:', r.stackTrace.trim()] : []),
  ]);
  return [...head, ...body].join('\n');
}
