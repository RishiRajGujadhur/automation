import { describe, expect, it } from 'vitest';
import { aetg, allTuples, baseChoice, boundaryValues, cartesian, coverage, eachChoice, equivalenceClasses, expandValues, ipog, makeValidator, orthogonalArray, paramsFromCsv, parseConstraints, quineMcCluskey, randomSample, seedsFromExamples, toExamples, type Param } from '../src/algorithms/combinatorial';
import { damerau, dice, jaccard, jaroWinkler, lcsRatio, levenshtein, metaphone, ncd, porter, soundex, simhash, hamming32, minhash, minhashSimilarity, lshCandidates, tfidfVectors, cosine, tokens, ngramSimilarity } from '../src/algorithms/strings';
import { AhoCorasick, BKTree, InvertedIndex, Trie, fuzzyScore, frecency, highlightRanges } from '../src/algorithms/search';
import { clusterPairs, cucumberToRegex, dbscan, hac, inferTemplates, inferType, regexToCucumber, renameStep, applyEdits, resolveKeywords } from '../src/algorithms/steps';
import { bfsPath, chinesePostman, deadStates, dijkstra, edgeCoverage, hierholzer, kahn, nSwitchCoverage, parseFsm, primePaths, randomWalks, simplePaths, stateCoverage, stateCoverageOf, tarjan, transitionCoverage } from '../src/algorithms/graph';
import { additionalGreedy, adaptiveRandom, annealCover, apfd, coveredBy, exactCover, geneticCover, greedySetCover, hgs, totalGreedy, weightedSetCover, type Test } from '../src/algorithms/optimize';
import { betaPosterior, entropy, ewma, flakyScore, flipRate, parseCucumberJson, wilson } from '../src/algorithms/results';
import { duplicateScenarios, flesch, smellChecks, type QFeature } from '../src/algorithms/quality';
import { cooccurrence, matchTags, parseTagExpression, rollup, rollupTree } from '../src/algorithms/tags';
import { livingDocsHtml, livingDocsMarkdown } from '../src/algorithms/docs';
import { algorithms, isEnabled } from '../src/algorithms/registry';

const P: Param[] = [
  { name: 'browser', values: ['Chrome', 'Firefox', 'Safari'] },
  { name: 'os', values: ['Windows', 'macOS', 'Linux'] },
  { name: 'lang', values: ['en', 'fr'] },
  { name: 'user', values: ['guest', 'member'] },
];

describe('combinatorial design', () => {
  it('IPOG covers every pair with far fewer rows than the product', () => {
    const rows = ipog(P, 2);
    expect(coverage(P, rows, 2).ratio).toBe(1);
    expect(rows.length).toBeLessThan(cartesian(P).length);
    expect(rows.length).toBeGreaterThanOrEqual(9);
  });
  it('IPOG supports 3-way strength', () => {
    const rows = ipog(P, 3);
    expect(coverage(P, rows, 3).ratio).toBe(1);
  });
  it('IPOG respects constraints and keeps seed rows', () => {
    const { rules, errors } = parseConstraints('browser = Safari & os = Windows\nif lang = fr then user != guest', P);
    expect(errors).toEqual([]);
    const valid = makeValidator(P, rules);
    const rows = ipog(P, 2, valid, [[0, 0, 0, 0]]);
    expect(rows.every(valid)).toBe(true);
    expect(rows.some((r) => r.join() === '0,0,0,0')).toBe(true);
    expect(coverage(P, rows, 2, valid).ratio).toBe(1);
  });
  it('reports constraint errors', () => {
    expect(parseConstraints('colour = red', P).errors[0]).toMatch(/unknown parameter/);
  });
  it('AETG is reproducible and complete', () => {
    const a = aetg(P, 2, undefined, 5), b = aetg(P, 2, undefined, 5);
    expect(a).toEqual(b);
    expect(coverage(P, a, 2).ratio).toBe(1);
  });
  it('each-choice, base-choice and random sampling', () => {
    const ec = eachChoice(P);
    expect(ec.length).toBe(3);
    expect(coverage(P, ec, 1).ratio).toBe(1);
    expect(baseChoice(P).length).toBe(1 + 2 + 2 + 1 + 1);
    expect(randomSample(P, 5, 1)).toEqual(randomSample(P, 5, 1));
    expect(new Set(randomSample(P, 20, 2).map((r) => r.join())).size).toBe(20);
  });
  it('cartesian refuses an explosion', () => {
    expect(() => cartesian(Array.from({ length: 12 }, (_, i) => ({ name: `p${i}`, values: ['a', 'b', 'c'] })))).toThrow(/limit/);
  });
  it('orthogonal arrays are balanced for pairs', () => {
    const oa = orthogonalArray(P.slice(0, 3))!;
    expect(oa.length).toBe(9);
    expect(coverage(P.slice(0, 3), oa, 2).ratio).toBe(1);
    expect(orthogonalArray(Array.from({ length: 6 }, (_, i) => ({ name: `p${i}`, values: ['a', 'b', 'c'] })))).toBeNull();
  });
  it('boundary values and equivalence classes', () => {
    expect(boundaryValues(18, 65).map((b) => b.value)).toEqual([17, 18, 19, 42, 64, 65, 66]);
    expect(equivalenceClasses('0..17|18..64').map((c) => c.value)).toEqual(['-1', '9', '41', '65']);
    expect(expandValues('1..3', { bva: false, equivalence: false })).toEqual(['1..3']);
    expect(expandValues('a, b ,c', { bva: true, equivalence: true })).toEqual(['a', 'b', 'c']);
  });
  it('Quine–McCluskey minimizes a decision table', () => {
    // f(a,b,c) = a or (b and c)  → minterms 3,4,5,6,7
    const r = quineMcCluskey(3, [3, 4, 5, 6, 7]).map((x) => x.join(','));
    expect(r.sort()).toEqual(['-1,1,1', '1,-1,-1'].sort());
  });
  it('CSV import, seeds and Examples output', () => {
    expect(paramsFromCsv('a,b\n1,x\n2,"y,z"\n1,\n')).toEqual([{ name: 'a', values: ['1', '2'] }, { name: 'b', values: ['x', 'y,z'] }]);
    expect(seedsFromExamples('| os | browser |\n| Linux | Safari |', P)).toEqual([[2, 2, -1, -1]]);
    expect(toExamples(P.slice(0, 2), [[0, 1]])).toBe('| browser | os    |\n| Chrome  | macOS |');
  });
  it('allTuples counts pairs', () => expect(allTuples(P.slice(0, 2), 2).size).toBe(9));
});

describe('string similarity', () => {
  it('edit distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(damerau('teh', 'the')).toBe(1);
    expect(jaroWinkler('martha', 'marhta')).toBeCloseTo(0.961, 2);
    expect(lcsRatio('abc', 'abc')).toBe(1);
  });
  it('set and vector measures', () => {
    expect(jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(dice('night', 'nacht')).toBeCloseTo(0.25);
    const [x, y, z] = tfidfVectors([tokens('user signs in'), tokens('user signs in now'), tokens('order total')]);
    expect(cosine(x, y)).toBeGreaterThan(cosine(x, z));
    expect(ncd('the user signs in', 'the user signs in')).toBeLessThan(ncd('the user signs in', 'order shipped quickly today'));
    expect(ngramSimilarity('login', 'log in')).toBeGreaterThan(0.3);
  });
  it('hash fingerprints', () => {
    expect(hamming32(simhash(tokens('a b c d e f')), simhash(tokens('a b c d e g')))).toBeLessThan(hamming32(simhash(tokens('a b c d e f')), simhash(tokens('u v w x y z'))));
    const m = [minhash(tokens('the user opens the cart page')), minhash(tokens('the user opens the cart page now')), minhash(tokens('totally different words here'))];
    expect(minhashSimilarity(m[0], m[1])).toBeGreaterThan(minhashSimilarity(m[0], m[2]));
    expect(lshCandidates(m).some(([a, b]) => a === 0 && b === 1)).toBe(true);
  });
  it('phonetics and stemming', () => {
    expect(soundex('Robert')).toBe('R163');
    expect(soundex('Rupert')).toBe('R163');
    expect(metaphone('Knight')).toBe('NT');
    expect(metaphone('Smith')).toBe(metaphone('Smyth'));
    expect(porter('clicking')).toBe('click');
    expect(porter('caresses')).toBe('caress');
    expect(porter('relational')).toBe('relat');
  });
});

describe('search', () => {
  it('trie completes by prefix, heaviest first', () => {
    const t = new Trie();
    t.insert('the user signs in', 1); t.insert('the user signs out', 5); t.insert('an order', 9);
    expect(t.complete('the user').map((x) => x.text)).toEqual(['the user signs out', 'the user signs in']);
  });
  it('fuzzy, BM25, BK-tree and inverted index', () => {
    expect(fuzzyScore('lgnusr', 'login user')).not.toBeNull();
    expect(fuzzyScore('xyz', 'login user')).toBeNull();
    const ix = new InvertedIndex();
    ['user signs in', 'user adds item to cart', 'cart is empty'].forEach((d) => ix.add(d));
    expect(ix.bm25('cart empty')[0].id).toBe(2);
    expect(ix.lookup(['user', 'cart'])).toEqual([1]);
    const bk = new BKTree();
    ['checkout', 'checkbox', 'search'].forEach((w) => bk.add(w));
    expect(bk.search('chekout', 1)[0].word).toBe('checkout');
  });
  it('frecency decays and Aho–Corasick finds all patterns', () => {
    const now = Date.now();
    expect(frecency([now], now)).toBeCloseTo(1);
    expect(frecency([now - 7 * 864e5], now)).toBeCloseTo(0.5);
    expect(new AhoCorasick(['he', 'she', 'his', 'hers']).search('ushers').map((h) => h.pattern).sort()).toEqual([0, 1, 3]);
    expect(highlightRanges('Sign in as admin', ['sign', 'admin'])).toEqual([[0, 4], [11, 16]]);
  });
});

describe('step library', () => {
  it('infers templates and types', () => {
    const t = inferTemplates(['I add 2 items', 'I add 5 items', 'I add 7 items', 'the cart is empty']);
    expect(t[0].cucumber).toBe('I add {int} items');
    expect(inferType(['a@b.co'])).toBe('email');
    expect(inferType(['1.5', '2'])).toBe('float');
  });
  it('clusters', () => {
    expect(clusterPairs(4, [[0, 1], [1, 2]])).toEqual([[0, 1, 2]]);
    const pts = [0, 0.1, 0.2, 5, 5.1];
    expect(dbscan(5, (a, b) => Math.abs(pts[a] - pts[b]), 0.15).length).toBe(2);
    expect(hac(5, (a, b) => 1 - Math.min(1, Math.abs(pts[a] - pts[b])), 0.7).length).toBe(2);
  });
  it('expressions and rename', () => {
    const re = new RegExp(cucumberToRegex('I add {int} item(s) to the basket/cart'));
    expect(re.test('I add 3 items to the cart')).toBe(true);
    expect(re.test('I add 1 item to the basket')).toBe(true);
    expect(regexToCucumber('^I search for "(.*)" in (\\w+)$')).toBe('I search for {string} in {word}');
    const src = 'Feature: A\n  Scenario: B\n    Given the user signs in as "admin"\n';
    const edits = renameStep([{ file: 'a.feature', source: src }], 'the user signs in as {string}', 'the user is signed in as {string}');
    expect(applyEdits(src, edits)).toContain('Given the user is signed in as "admin"');
    expect(resolveKeywords([{ keyword: 'Given', text: 'a' }, { keyword: 'And', text: 'b' }])[1].resolved).toBe('Given');
  });
});

describe('model-based testing', () => {
  const { fsm, errors } = parseFsm('start: A\nend: D\nA -> B : go b\nB -> C : go c [5]\nB -> D : finish\nC -> D : finish c\nC -> B : back\nX -> A : orphan');
  it('parses', () => {
    expect(errors).toEqual([]);
    expect([...fsm.states].sort()).toEqual(['A', 'B', 'C', 'D', 'X']);
    expect(fsm.edges[1].weight).toBe(5);
  });
  it('paths', () => {
    expect(bfsPath(fsm, 'A', 'D')!.map((e) => e.to)).toEqual(['B', 'D']);
    expect(dijkstra(fsm, 'A', 'C')!.cost).toBe(6);
    expect(simplePaths(fsm).length).toBe(2);
  });
  it('coverage criteria reach their targets', () => {
    expect(stateCoverageOf(fsm, stateCoverage(fsm)).covered).toBe(4);
    const tc = transitionCoverage(fsm);
    expect(edgeCoverage(fsm, tc).covered).toBe(5); // all but the orphan edge
    expect(nSwitchCoverage(fsm, 1).length).toBeGreaterThan(0);
    expect(primePaths(fsm).length).toBeGreaterThan(0);
    expect(randomWalks(fsm, 3, 1)).toEqual(randomWalks(fsm, 3, 1));
  });
  it('euler, postman, scc, kahn, dead states', () => {
    const { fsm: loop } = parseFsm('A -> B\nB -> C\nC -> A\nA -> C');
    const tour = chinesePostman(loop)!;
    expect(new Set(tour.map((e) => e.id)).size).toBe(4);
    expect(hierholzer(loop.edges.slice(0, 3), 'A')!.length).toBe(3);
    expect(tarjan(loop).find((c) => c.length === 3)).toBeTruthy();
    expect(kahn(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]).order).toEqual(['a', 'b', 'c']);
    expect(kahn(['a', 'b'], [['a', 'b'], ['b', 'a']]).cycle).toEqual(['a', 'b']);
    expect(deadStates(fsm).unreachable).toEqual(['X']);
  });
});

describe('suite optimization', () => {
  const T: Test[] = [
    { id: 't1', covers: ['a', 'b', 'c'], cost: 5 },
    { id: 't2', covers: ['a', 'b'], cost: 1 },
    { id: 't3', covers: ['c', 'd'], cost: 1 },
    { id: 't4', covers: ['d'], cost: 1 },
  ];
  it('every minimizer keeps full coverage', () => {
    for (const f of [greedySetCover, weightedSetCover, hgs, exactCover, (t: Test[]) => annealCover(t, 1), (t: Test[]) => geneticCover(t, 1)]) expect(coveredBy(f(T))).toBe(4);
    expect(exactCover(T).length).toBe(2);
    expect(weightedSetCover(T).map((t) => t.id).sort()).toEqual(['t2', 't3']);
  });
  it('prioritization and APFD', () => {
    expect(totalGreedy(T)[0].id).toBe('t1');
    expect(additionalGreedy(T).slice(0, 2).map((t) => t.id)).toEqual(['t1', 't3']);
    expect(adaptiveRandom(T, 1).length).toBe(4);
    expect(apfd(additionalGreedy(T))).toBeGreaterThanOrEqual(apfd([...T].reverse()));
  });
});

describe('results and flakiness', () => {
  it('statistics', () => {
    expect(flipRate(['passed', 'failed', 'passed'])).toBe(1);
    expect(entropy(['passed', 'failed'])).toBe(1);
    expect(entropy(['passed', 'passed'])).toBe(0);
    expect(flakyScore(['passed', 'failed', 'passed', 'failed']).label).toBe('flaky');
    expect(flakyScore(['failed', 'failed', 'failed', 'failed']).label).toBe('broken');
    expect(flakyScore(['passed']).label).toBe('insufficient data');
    const w = wilson(9, 10);
    expect(w.low).toBeGreaterThan(0.5); expect(w.high).toBeLessThanOrEqual(1);
    expect(ewma(['passed', 'failed'])).toBeCloseTo(0.3);
    expect(betaPosterior(['failed', 'passed']).mean).toBeCloseTo(0.5);
  });
  it('Cucumber JSON', () => {
    const r = parseCucumberJson(JSON.stringify([{ name: 'F', elements: [{ name: 'S1', type: 'scenario', steps: [{ result: { status: 'passed' } }] }, { name: 'S2', type: 'scenario', steps: [{ result: { status: 'failed', error_message: 'boom' } }] }] }]));
    expect(r.map((x) => x.outcome)).toEqual(['passed', 'failed']);
  });
});

describe('quality, tags and docs', () => {
  const f: QFeature = { file: 'a.feature', name: 'A', scenarios: [
    { name: 'One', keyword: 'Scenario', line: 2, steps: [{ keyword: 'Given', text: 'x', line: 3 }, { keyword: 'When', text: 'the user clicks the button and waits', line: 4 }] },
    { name: 'One', keyword: 'Scenario', line: 6, steps: [{ keyword: 'Given', text: 'x', line: 7 }, { keyword: 'When', text: 'the user clicks the button and waits', line: 8 }] },
    { name: 'Out', keyword: 'Scenario Outline', line: 9, examplesHeader: ['a', 'unused'], steps: [{ keyword: 'Given', text: '<a> and <b>', line: 10 }, { keyword: 'Then', text: 'ok', line: 11 }, { keyword: 'Given', text: 'late', line: 12 }] },
  ] };
  it('smells', () => {
    const run = (id: string) => smellChecks[id](f, { maxSteps: 2 });
    expect(run('smell-missing-then').length).toBe(2);
    expect(run('smell-long').length).toBe(1);
    expect(run('smell-conjunction').length).toBe(3);
    expect(run('smell-imperative').length).toBe(2);
    expect(run('smell-order').length).toBe(1);
    expect(run('smell-outline').map((x) => x.message).join()).toMatch(/<b>.*unused|unused.*<b>/);
    expect(run('smell-dup-names').length).toBe(1);
    expect(duplicateScenarios([f])[0].length).toBe(2);
    expect(flesch(['the cat sat'])).toBeGreaterThan(flesch(['administrative authorization verification']));
  });
  it('tag expressions', () => {
    const e = parseTagExpression('@smoke and not (@slow or @wip)');
    expect(matchTags(e, ['@smoke'])).toBe(true);
    expect(matchTags(e, ['@smoke', '@wip'])).toBe(false);
    expect(matchTags(parseTagExpression('@a or @b and @c'), ['@a'])).toBe(true);
    expect(() => parseTagExpression('@a and')).toThrow();
    expect(() => parseTagExpression('(@a')).toThrow();
    expect(cooccurrence([['@a', '@b'], ['@a']]).matrix[0]).toEqual([2, 1]);
  });
  it('roll-ups and docs', () => {
    expect(rollup(['passed', 'failed'])).toBe('failed');
    expect(rollup([])).toBe('unknown');
    expect(rollupTree([{ path: 'F/a.feature/s', status: 'passed' }]).get('F')!.status).toBe('passed');
    const docs = [{ file: 'F/a.feature', name: 'A <b>', tags: [], scenarios: [{ name: 'S', keyword: 'Scenario', tags: [], steps: [{ keyword: 'Given', text: 'x' }], status: 'failed' as const }] }];
    const html = livingDocsHtml(docs, 'Docs', new Date(0));
    expect(html).toContain('A &lt;b&gt;');
    expect(html).toContain('<details class="scenario failed" open>');
    expect(livingDocsMarkdown(docs)).toContain('### ✗ Scenario: S');
  });
});

describe('registry', () => {
  it('has 70–150 unique algorithms with tooltips', () => {
    expect(algorithms.length).toBeGreaterThanOrEqual(70);
    expect(algorithms.length).toBeLessThanOrEqual(150);
    expect(new Set(algorithms.map((a) => a.id)).size).toBe(algorithms.length);
    expect(algorithms.every((a) => a.tooltip.length > 30)).toBe(true);
  });
  it('overrides win over defaults', () => {
    expect(isEnabled({}, 'ipog')).toBe(true);
    expect(isEnabled({ ipog: false }, 'ipog')).toBe(false);
  });
});
