import { mulberry32 } from './random';
import { jaccard } from './strings';

/* Test-suite minimization and prioritization. A test "covers" a set of requirement keys (tags, steps, states…). */
export type Test = { id: string; covers: string[]; cost?: number };
const universe = (tests: Test[]) => new Set(tests.flatMap((t) => t.covers));

/* ------------------------------------------------------------------ F1 greedy set cover */
export function greedySetCover(tests: Test[]): Test[] {
  const left = universe(tests), chosen: Test[] = [];
  while (left.size) {
    let best: Test | undefined, gain = 0;
    for (const t of tests) { const g = t.covers.filter((c) => left.has(c)).length; if (g > gain) { gain = g; best = t; } }
    if (!best) break;
    chosen.push(best);
    best.covers.forEach((c) => left.delete(c));
  }
  return chosen;
}

/* ------------------------------------------------------------------ F2 weighted set cover */
/** Picks the test with the lowest cost per newly covered requirement (ln(n)-approximation). */
export function weightedSetCover(tests: Test[]): Test[] {
  const left = universe(tests), chosen: Test[] = [];
  while (left.size) {
    let best: Test | undefined, ratio = Infinity;
    for (const t of tests) { const g = t.covers.filter((c) => left.has(c)).length; if (g && (t.cost ?? 1) / g < ratio) { ratio = (t.cost ?? 1) / g; best = t; } }
    if (!best) break;
    chosen.push(best);
    best.covers.forEach((c) => left.delete(c));
  }
  return chosen;
}

/* ------------------------------------------------------------------ F3 HGS */
/** Harrold–Gupta–Soffa: satisfy the requirements covered by the fewest tests first. */
export function hgs(tests: Test[]): Test[] {
  const reqs = [...universe(tests)];
  const coverers = new Map(reqs.map((r) => [r, tests.filter((t) => t.covers.includes(r))]));
  const done = new Set<string>(), chosen: Test[] = [];
  const card = [...new Set([...coverers.values()].map((c) => c.length))].sort((a, b) => a - b);
  for (const k of card) {
    for (;;) {
      const open = reqs.filter((r) => !done.has(r) && coverers.get(r)!.length === k);
      if (!open.length) break;
      const counts = new Map<Test, number>();
      open.forEach((r) => coverers.get(r)!.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
      const best = [...counts].sort((a, b) => b[1] - a[1] || b[0].covers.length - a[0].covers.length)[0][0];
      if (!chosen.includes(best)) chosen.push(best);
      best.covers.forEach((r) => done.add(r));
    }
  }
  return chosen;
}

/* ------------------------------------------------------------------ F4 exact branch and bound */
/** Optimal minimum cover for small suites (≤ 24 tests); larger inputs fall back to greedy. */
export function exactCover(tests: Test[], maxTests = 24): Test[] {
  if (tests.length > maxTests) return greedySetCover(tests);
  const all = [...universe(tests)];
  const bit = new Map(all.map((r, i) => [r, BigInt(1) << BigInt(i)]));
  const masks = tests.map((t) => t.covers.reduce((m, c) => m | bit.get(c)!, BigInt(0)));
  const full = all.reduce((m, r) => m | bit.get(r)!, BigInt(0));
  let best = greedySetCover(tests).map((t) => tests.indexOf(t));
  const rec = (i: number, mask: bigint, picked: number[]) => {
    if (mask === full) { if (picked.length < best.length) best = picked.slice(); return; }
    if (i >= tests.length || picked.length + 1 >= best.length) return;
    if ((masks[i] | mask) !== mask) { picked.push(i); rec(i + 1, mask | masks[i], picked); picked.pop(); }
    rec(i + 1, mask, picked);
  };
  rec(0, BigInt(0), []);
  return best.map((i) => tests[i]);
}

/* ------------------------------------------------------------------ F9 simulated annealing */
export function annealCover(tests: Test[], seed = 1, iterations = 4000): Test[] {
  const rnd = mulberry32(seed);
  const all = universe(tests);
  const covers = (sel: boolean[]) => { const s = new Set<string>(); sel.forEach((on, i) => on && tests[i].covers.forEach((c) => s.add(c))); return s.size; };
  const cost = (sel: boolean[]) => sel.filter(Boolean).length + (all.size - covers(sel)) * (tests.length + 1);
  let cur = tests.map(() => true), curCost = cost(cur), best = cur.slice(), bestCost = curCost;
  for (let k = 0; k < iterations; k++) {
    const T = 2 * (1 - k / iterations) + 0.01;
    const next = cur.slice();
    const i = Math.floor(rnd() * tests.length);
    next[i] = !next[i];
    const c = cost(next);
    if (c <= curCost || rnd() < Math.exp((curCost - c) / T)) { cur = next; curCost = c; if (c < bestCost) { best = next.slice(); bestCost = c; } }
  }
  return tests.filter((_, i) => best[i]);
}

/* ------------------------------------------------------------------ F10 genetic algorithm */
export function geneticCover(tests: Test[], seed = 1, generations = 120, popSize = 40): Test[] {
  const rnd = mulberry32(seed);
  const all = universe(tests);
  const n = tests.length;
  const fitness = (g: boolean[]) => { const s = new Set<string>(); g.forEach((on, i) => on && tests[i].covers.forEach((c) => s.add(c))); return (s.size === all.size ? 1000 : s.size * 10) - g.filter(Boolean).length; };
  let pop = Array.from({ length: popSize }, () => Array.from({ length: n }, () => rnd() < 0.5));
  pop[0] = tests.map(() => true);
  for (let gen = 0; gen < generations; gen++) {
    const scored = pop.map((g) => ({ g, f: fitness(g) })).sort((a, b) => b.f - a.f);
    const next = scored.slice(0, 4).map((s) => s.g); // elitism
    const tournament = () => { const a = scored[Math.floor(rnd() * scored.length)], b = scored[Math.floor(rnd() * scored.length)]; return a.f > b.f ? a.g : b.g; };
    while (next.length < popSize) {
      const a = tournament(), b = tournament(), cut = Math.floor(rnd() * n);
      next.push(a.map((x, i) => { const v = i < cut ? x : b[i]; return rnd() < 1 / Math.max(1, n) ? !v : v; }));
    }
    pop = next;
  }
  const best = pop.reduce((a, b) => (fitness(b) > fitness(a) ? b : a));
  return tests.filter((_, i) => best[i]);
}

/* ------------------------------------------------------------------ F5 total greedy, F6 additional greedy */
export const totalGreedy = (tests: Test[]) => tests.slice().sort((a, b) => new Set(b.covers).size - new Set(a.covers).size);
export function additionalGreedy(tests: Test[]): Test[] {
  const rest = tests.slice(), order: Test[] = [];
  let covered = new Set<string>();
  while (rest.length) {
    let bi = 0, bg = -1;
    rest.forEach((t, i) => { const g = t.covers.filter((c) => !covered.has(c)).length; if (g > bg) { bg = g; bi = i; } });
    if (bg === 0 && covered.size) covered = new Set(); // everything covered: reset and continue (Rothermel et al.)
    const [t] = rest.splice(bi, 1);
    order.push(t);
    t.covers.forEach((c) => covered.add(c));
  }
  return order;
}

/* ------------------------------------------------------------------ F7 adaptive random */
/** ART prioritization (Jiang et al.): next test is the candidate farthest (max-min Jaccard distance) from those already chosen. */
export function adaptiveRandom(tests: Test[], seed = 1, candidates = 10): Test[] {
  const rnd = mulberry32(seed);
  const rest = tests.slice(), order: Test[] = [];
  if (!rest.length) return order;
  order.push(rest.splice(Math.floor(rnd() * rest.length), 1)[0]);
  while (rest.length) {
    const cand = Array.from({ length: Math.min(candidates, rest.length) }, () => Math.floor(rnd() * rest.length));
    let bi = cand[0], bd = -1;
    for (const i of cand) { const d = Math.min(...order.map((o) => 1 - jaccard(o.covers, rest[i].covers))); if (d > bd) { bd = d; bi = i; } }
    order.push(rest.splice(bi, 1)[0]);
  }
  return order;
}

/* ------------------------------------------------------------------ F8 APFD */
/** Average Percentage of Faults Detected. `faults` maps a fault to the ids of tests that reveal it. Uses requirements as faults when omitted. */
export function apfd(order: Test[], faults?: Map<string, string[]>) {
  const f = faults ?? new Map([...universe(order)].map((r) => [r, order.filter((t) => t.covers.includes(r)).map((t) => t.id)]));
  const n = order.length, m = f.size;
  if (!n || !m) return 1;
  let sum = 0;
  f.forEach((ids) => { const pos = order.findIndex((t) => ids.includes(t.id)); sum += pos < 0 ? n + 1 : pos + 1; });
  return 1 - sum / (n * m) + 1 / (2 * n);
}
export const coveredBy = (tests: Test[]) => universe(tests).size;
