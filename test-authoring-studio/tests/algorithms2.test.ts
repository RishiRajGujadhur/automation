import { describe, expect, it } from 'vitest';
import { annealCoveringArray, causeEffect, classificationParams, conditionCoverage, decisionCoverage, domainPoints, mcdc, missingCombinations, multipleCondition, parseClassificationTree, reduceTable, valueCatalog } from '../src/algorithms/logic';
import { cartesian, coverage, type Param } from '../src/algorithms/combinatorial';
import { parseFsm } from '../src/algorithms/graph';
import { basisPaths, cyclomatic, floydWarshall, mostProbablePaths, pageRank, sneakPaths, stationaryDistribution, yenKShortest } from '../src/algorithms/graph2';
import { kMeans, knapsack, logisticRegression, naiveBayes, paretoFront, quarantinePolicy, riskScore, silhouette, testImpact, traceability } from '../src/algorithms/analytics';
import { coFailures, cusum, madOutliers, mannKendall, mtbf, percentiles, sprt } from '../src/algorithms/stats';
import { associationRules, frequentSequences, gunningFog, isPassive, needlemanWunsch, nextStepModel, rake, stepHamming, tagEntropy, typeTokenRatio, vagueTerms } from '../src/algorithms/text';
import { tfidfVectors, tokens, levenshteinRatio } from '../src/algorithms/strings';

describe('logic coverage', () => {
  const rule = 'a and (b or c)';
  it('multiple-condition, decision and condition coverage', () => {
    expect(multipleCondition(rule)).toHaveLength(8);
    const d = decisionCoverage(rule);
    expect(d.map((r) => r.outcome).sort()).toEqual([false, true]);
    const c = conditionCoverage(rule);
    for (const n of ['a', 'b', 'c']) expect(new Set(c.map((r) => r.values[n])).size).toBe(2);
  });
  it('MC/DC finds an independence pair for every condition with n+1 rows', () => {
    const { rows, pairs } = mcdc(rule);
    expect(Object.values(pairs).every(Boolean)).toBe(true);
    expect(rows.length).toBeLessThanOrEqual(4);
    for (const [cond, p] of Object.entries(pairs)) {
      const [x, y] = p!.map((i) => rows[i]);
      expect(x.outcome).not.toBe(y.outcome);
      expect(Object.keys(x.values).filter((k) => x.values[k] !== y.values[k])).toEqual([cond]);
    }
  });
  it('cause–effect graph merges don\'t-care rows', () => {
    const t = causeEffect(['member', 'coupon'], [{ name: 'discount', when: 'member or coupon' }]);
    expect(t.length).toBeLessThan(4);
    expect(t.some((r) => Object.values(r.values).includes(null))).toBe(true);
    expect(() => causeEffect(['a'], [{ name: 'x', when: 'a and z' }])).toThrow(/Unknown causes/);
  });
  it('classification tree, domain points, catalogue', () => {
    const tree = parseClassificationTree('Payment:\n  Card\n  Invoice\nUser:\n  - Guest\n  - Member\n');
    expect(classificationParams(tree)).toEqual([{ name: 'Payment', values: ['Card', 'Invoice'] }, { name: 'User', values: ['Guest', 'Member'] }]);
    const d = domainPoints('age >= 18');
    expect(d.find((p) => p.kind === 'ON')).toMatchObject({ value: 18, satisfies: true });
    expect(d.find((p) => p.kind === 'OFF')).toMatchObject({ value: 17, satisfies: false });
    expect(valueCatalog.email.length).toBeGreaterThan(3);
  });
  it('annealing covering array, reducer and missing pairs', () => {
    const P: Param[] = [{ name: 'a', values: ['1', '2', '3'] }, { name: 'b', values: ['x', 'y', 'z'] }, { name: 'c', values: ['p', 'q'] }];
    const sa = annealCoveringArray(P, 2, 12, 3, 8000);
    expect(coverage(P, sa, 2).ratio).toBe(1);
    expect(sa.length).toBeLessThanOrEqual(12);
    const full = cartesian(P);
    const reduced = reduceTable(P, full, 2);
    expect(coverage(P, reduced, 2).ratio).toBe(1);
    expect(reduced.length).toBeLessThan(full.length);
    const m = missingCombinations(P, full.slice(0, 3), 2);
    expect(m.missing.length).toBeGreaterThan(0);
    expect(m.ratio).toBeLessThan(1);
  });
});

describe('model-based extras', () => {
  const { fsm } = parseFsm('start: A\nend: D\nA -> B : go [3]\nA -> C : alt [1]\nB -> D : finish [1]\nC -> D : finish c [1]\nC -> B : over [1]\nB -> A : back [1]');
  it('Floyd–Warshall, cyclomatic, basis paths', () => {
    const fw = floydWarshall(fsm);
    expect(fw.distance[fw.states.indexOf('A')][fw.states.indexOf('D')]).toBe(2);
    expect(cyclomatic(fsm)).toBe(6 - 4 + 2);
    const bp = basisPaths(fsm);
    expect(bp.length).toBeGreaterThanOrEqual(3);
    expect(new Set(bp.flat().map((e) => e.id)).size).toBe(6);
  });
  it("Yen's k shortest", () => {
    const k = yenKShortest(fsm, 'A', 'D', 3);
    expect(k.map((x) => x.cost)).toEqual([...k.map((x) => x.cost)].sort((a, b) => a - b));
    expect(new Set(k.map((x) => x.path.map((e) => e.id).join())).size).toBe(k.length);
    expect(k[0].cost).toBe(2);
  });
  it('Markov usage, PageRank, sneak paths', () => {
    const top = mostProbablePaths(fsm, 3);
    expect(top[0].probability).toBeGreaterThanOrEqual(top[top.length - 1].probability);
    const st = stationaryDistribution(fsm);
    expect([...st.values()].reduce((a, x) => a + x, 0)).toBeCloseTo(1, 5);
    expect(pageRank(fsm)[0][0]).toMatch(/[ABD]/);
    expect(sneakPaths(fsm).some((s) => s.state === 'A' && s.action === 'finish')).toBe(true);
  });
});

describe('impact and risk', () => {
  it('test impact via feature files and changed bindings', () => {
    const r = testImpact(['Steps/AuthSteps.cs'], [{ id: 's1', name: 'Sign in', file: 'Features/Login.feature', steps: [{ text: 'the user signs in as "x"' }] }, { id: 's2', name: 'Other', file: 'Features/Other.feature', steps: [{ text: 'nothing' }] }], [{ pattern: 'the user signs in as {string}', expression: 'Cucumber', file: 'Steps/AuthSteps.cs', keyword: 'When' }]);
    expect(r.map((x) => x.scenario.id)).toEqual(['s1']);
    expect(testImpact(['Features/Other.feature'], [{ id: 's2', name: 'Other', file: 'Features/Other.feature', steps: [] }], [])[0].reasons).toEqual(['feature file changed']);
  });
  it('traceability, risk, quarantine', () => {
    const t = traceability([{ id: 'a', name: 'A', tags: ['@REQ-1'] }, { id: 'b', name: 'B', tags: ['@smoke'] }], undefined, ['REQ-2']);
    expect(t.uncovered).toEqual(['@REQ-2']);
    expect(t.untraced.map((s) => s.id)).toEqual(['b']);
    const r = riskScore([{ id: 'x', tags: ['@payments'], fails: 3, runs: 10, steps: 5 }, { id: 'y', tags: [], fails: 0, runs: 10, steps: 5 }], { '@payments': 5 });
    expect(r[0].id).toBe('x');
    expect(quarantinePolicy(['passed', 'failed', 'passed', 'failed', 'passed', 'passed']).action).toBe('quarantine');
    expect(quarantinePolicy(['failed', 'failed', 'failed']).action).toBe('fix');
    expect(quarantinePolicy([...Array(3).fill('failed'), ...Array(12).fill('passed')]).action).toBe('release');
  });
  it('knapsack and Pareto', () => {
    const picked = knapsack([{ cost: 5, value: 10 }, { cost: 4, value: 40 }, { cost: 6, value: 30 }, { cost: 3, value: 50 }], 10);
    expect(picked.reduce((a, x) => a + x.value, 0)).toBe(90);
    expect(paretoFront([{ cost: 1, coverage: 1 }, { cost: 2, coverage: 1 }, { cost: 3, coverage: 5 }]).map((p) => p.cost)).toEqual([1, 3]);
  });
  it('classifiers learn a simple rule', () => {
    const X = Array.from({ length: 40 }, (_, i) => [i % 10, (i * 7) % 3]);
    const y = X.map(([a]) => (a > 5 ? 1 : 0));
    const lr = logisticRegression(X, y);
    expect(lr.predict([9, 0])).toBeGreaterThan(0.5);
    expect(lr.predict([1, 0])).toBeLessThan(0.5);
    const nb = naiveBayes(X, y);
    expect(nb.predict([9, 1])).toBeGreaterThan(nb.predict([1, 1]));
  });
  it('k-means and silhouette', () => {
    const docs = ['login password user', 'login user sign', 'password reset user', 'cart checkout pay', 'checkout pay card', 'cart add item'].map(tokens);
    const v = tfidfVectors(docs);
    const { assign } = kMeans(v, 2, 3);
    expect(new Set(assign.slice(0, 3)).size).toBe(1);
    expect(assign[0]).not.toBe(assign[4]);
    expect(silhouette(v, assign)).toBeGreaterThan(0);
  });
});

describe('result statistics', () => {
  it('CUSUM and SPRT', () => {
    const series = [...Array(10).fill(0), ...Array(8).fill(1)];
    expect(cusum(series, 0.05).changeAt).toBe(10);
    expect(sprt([true, false, true, false, true]).decision).toBe('flaky');
    expect(sprt(Array(40).fill(false)).decision).toBe('stable');
  });
  it('Mann–Kendall, MAD, percentiles, MTBF, co-failure', () => {
    expect(mannKendall([1, 2, 3, 4, 5, 6, 7, 8]).trend).toBe('increasing');
    expect(mannKendall([3, 1, 3, 1, 3, 1]).trend).toBe('none');
    expect(madOutliers([1, 1.1, 0.9, 1, 30].map((d, i) => ({ i, d })), (x) => x.d).map((r) => r.item.i)).toEqual([4]);
    expect(percentiles([1, 2, 3, 4, 5]).p50).toBe(3);
    expect(mtbf([false, true, false, false, true])).toBe(3);
    expect(coFailures([{ failed: ['a', 'b'] }, { failed: ['a', 'b'] }, { failed: ['c'] }, { failed: ['c'] }])[0]).toMatchObject({ a: 'a', b: 'b', jaccard: 1 });
  });
});

describe('text and sequences', () => {
  it('readability and smells', () => {
    expect(gunningFog(['the cat sat'])).toBeLessThan(gunningFog(['administrative authorization verification procedure']));
    expect(typeTokenRatio(['a a a a'])).toBe(0.25);
    expect(isPassive('the order is placed by the user')).toBe(true);
    expect(isPassive('the user places the order')).toBe(false);
    expect(vagueTerms('the page loads quickly and works as expected')).toEqual(['quickly', 'as expected']);
    expect(rake(['the user adds the product to the shopping cart'])[0].phrase).toContain('shopping cart');
  });
  it('next steps, frequent sequences, alignment, rules, entropy', () => {
    const seqs = [['open', 'login', 'buy'], ['open', 'login', 'search'], ['open', 'login', 'buy']];
    expect(nextStepModel(seqs)('login')[0]).toMatchObject({ step: 'buy', count: 2 });
    const fs = frequentSequences(seqs);
    expect(fs[0].steps.slice(0, 2)).toEqual(['open', 'login']);
    expect(fs[0].asPrefix).toBeGreaterThanOrEqual(2);
    const al = needlemanWunsch(['open', 'login', 'buy'], ['open', 'buy'], (a, b) => levenshteinRatio(a, b));
    expect(al.alignment.filter((x) => !x.b).map((x) => x.a)).toEqual(['login']);
    expect(stepHamming(['a', 'b'], ['a', 'c'])).toBe(1);
    const rules = associationRules([['@checkout', '@payments'], ['@checkout', '@payments'], ['@smoke']], 0.3, 0.9);
    expect(rules.some((r) => r.if[0] === '@checkout' && r.then[0] === '@payments')).toBe(true);
    expect(tagEntropy([['a'], ['b']])).toBeCloseTo(1);
    expect(tagEntropy([['a'], ['a'], ['a'], ['b']])).toBeLessThan(1);
  });
});
