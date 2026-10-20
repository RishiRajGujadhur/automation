import { describe, expect, it } from 'vitest';
import { groupTests, matchTest, testDetails } from '../src/testing/grouping';
import type { DiscoveredTest, Outcome } from '../src/testing/store';

const t = (id: string, o: Partial<DiscoveredTest> = {}): DiscoveredTest => ({ id, kind: 'test', project: 'App.Tests', className: 'App.Tests.MathTests', method: id, name: id, file: 'Tests/MathTests.cs', line: 1, filter: id, ...o });
const tests = [t('Adds'), t('Divides'), t('Scenario', { kind: 'scenario', className: 'App.Tests.MathFeature', feature: 'Math', file: 'Features/Math.feature' }), t('Other', { project: 'Web.Tests', className: 'Web.Tests.PageTests' })];
const outcomes: Record<string, Outcome> = { Adds: 'passed', Divides: 'failed', Scenario: 'none', Other: 'passed' };
const durations: Record<string, number | undefined> = { Adds: 12, Divides: 1500, Scenario: undefined, Other: 250 };
const group = (by: Parameters<typeof groupTests>[1]) => groupTests(tests, by, (x) => outcomes[x.id], (x) => durations[x.id]);
const shape = (gs: ReturnType<typeof group>) => gs.map((g) => `${g.label}: ${g.children.length ? g.children.map((c) => `${c.label}[${c.tests.map((x) => x.id)}]`).join(' ') : g.tests.map((x) => x.id).join(',')}`);

describe('Test Explorer grouping (X71…)', () => {
  it('X71 Group By: project ▸ class / feature, class, outcome, duration', () => {
    expect(shape(group('project'))).toEqual(['App.Tests: App.Tests.MathTests[Adds,Divides] Math[Scenario]', 'Web.Tests: Web.Tests.PageTests[Other]']);
    expect(shape(group('class'))).toEqual(['App.Tests.MathTests: Adds,Divides', 'Math: Scenario', 'Web.Tests.PageTests: Other']);
    expect(shape(group('outcome'))).toEqual(['Failed: Divides', 'Passed: Adds,Other', 'Not run: Scenario']);
    expect(shape(group('duration'))).toEqual(['Slow (> 1 s): Divides', 'Medium (100 ms – 1 s): Other', 'Fast (< 100 ms): Adds', 'Not run: Scenario']);
  });
  it('X72 search filters: fields, quotes, exclusions', () => {
    const m = (q: string) => tests.filter((x) => matchTest(x, q, outcomes[x.id])).map((x) => x.id);
    expect(m('outcome:failed')).toEqual(['Divides']);
    expect(m('outcome:"not run"')).toEqual(['Scenario']);
    expect(m('project:web')).toEqual(['Other']);
    expect(m('class:MathTests -name:adds')).toEqual(['Divides']);
    expect(m('math passed')).toEqual([]);
    expect(m('"app.tests.math"')).toEqual(['Adds', 'Divides', 'Scenario']);
  });
  it('X73 Copy test details', () => {
    expect(testDetails(tests[1], 'failed', [{ name: 'Divides', outcome: 'failed', durationMs: 1500, message: 'Expected: 3\n  But was: 2\n', stackTrace: 'at MathTests.Divides() in Tests/MathTests.cs:line 9' }])).toBe(
      'Test Name:\tDivides\nTest FullName:\tApp.Tests.MathTests.Divides\nTest Source:\tTests/MathTests.cs : line 1\nTest Outcome:\tFailed\nTest Duration:\t1500 ms\n\nResult Message:\nExpected: 3\n  But was: 2\n\nResult StackTrace:\nat MathTests.Divides() in Tests/MathTests.cs:line 9');
    expect(testDetails(tests[2], 'none', [])).toContain('Test Outcome:\tNot Run');
  });
  it('X144 Group by tag (traits)', () => {
    const tags: Record<string, string[]> = { Scenario: ['@smoke', '@login'], Adds: ['@smoke'] };
    expect(shape(groupTests(tests, 'tag', (x) => outcomes[x.id], (x) => durations[x.id], (x) => tags[x.id] ?? []))).toEqual(['@login: Scenario', '@smoke: Adds,Scenario', 'No tags: Divides,Other']);
  });
  it('X145 tag: filter', () => {
    expect(tests.filter((x) => matchTest(x, 'tag:@smoke', outcomes[x.id], x.id === 'Scenario' ? ['@smoke'] : [])).map((x) => x.id)).toEqual(['Scenario']);
    expect(tests.filter((x) => matchTest(x, '-tag:smoke', outcomes[x.id], x.id === 'Scenario' ? ['@smoke'] : [])).map((x) => x.id)).toEqual(['Adds', 'Divides', 'Other']);
  });
});
