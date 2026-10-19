import { describe, expect, it } from 'vitest';
import { groupTests } from '../src/testing/grouping';
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
});
