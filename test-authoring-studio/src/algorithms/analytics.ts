import { cucumberToRegex } from './steps';
import { mulberry32 } from './random';
import { cosine } from './strings';

/* ------------------------------------------------------------------ L1 test impact analysis */
export type ImpactBinding = { pattern: string; expression?: string; file: string; keyword: string };
export type ImpactScenario = { id: string; name: string; file: string; steps: { text: string }[] };
/** A binding pattern as a RegExp (Cucumber expressions converted, regex patterns used as-is). */
export function bindingRegex(b: ImpactBinding): RegExp | null {
  try { return new RegExp(b.expression === 'Cucumber' ? cucumberToRegex(b.pattern) : b.pattern.startsWith('^') ? b.pattern : `^${b.pattern}$`); } catch { return null; }
}
const norm = (f: string) => f.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
/**
 * Change-based selection: a scenario is impacted when its own .feature file changed, or when one of its steps
 * is bound by a step definition in a changed C# file. Returns the reasons for each selected scenario.
 */
export function testImpact<S extends ImpactScenario>(changed: string[], scenarios: S[], bindings: ImpactBinding[]) {
  const set = new Set(changed.map(norm).filter(Boolean));
  const hit = (file: string) => set.has(norm(file)) || [...set].some((c) => norm(file).endsWith('/' + c) || c.endsWith('/' + norm(file)));
  const changedBindings = bindings.filter((b) => hit(b.file)).map((b) => ({ b, re: bindingRegex(b) })).filter((x) => x.re);
  return scenarios.flatMap((s) => {
    const reasons: string[] = [];
    if (hit(s.file)) reasons.push('feature file changed');
    for (const st of s.steps) for (const { b, re } of changedBindings) if (re!.test(st.text)) reasons.push(`"${st.text}" → ${b.file}`);
    return reasons.length ? [{ scenario: s, reasons: [...new Set(reasons)] }] : [];
  });
}

/* ------------------------------------------------------------------ L2 traceability matrix */
/** Requirements are tags matching `pattern` (default @REQ-…, @JIRA-…, @US-…); `expected` lists ids that must be covered. */
export function traceability(scenarios: { id: string; name: string; tags: string[] }[], pattern = /^@(req|jira|us|story|[A-Z]{2,10})-?\d+$/i, expected: string[] = []) {
  const reqs = new Map<string, string[]>();
  scenarios.forEach((s) => s.tags.filter((t) => pattern.test(t)).forEach((t) => (reqs.get(t) ?? reqs.set(t, []).get(t)!).push(s.id)));
  expected.map((e) => (e.startsWith('@') ? e : '@' + e)).forEach((e) => { if (!reqs.has(e)) reqs.set(e, []); });
  const rows = [...reqs].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([req, ids]) => ({ req, scenarios: ids }));
  const untraced = scenarios.filter((s) => !s.tags.some((t) => pattern.test(t)));
  return { rows, uncovered: rows.filter((r) => !r.scenarios.length).map((r) => r.req), untraced, coverage: rows.length ? rows.filter((r) => r.scenarios.length).length / rows.length : 1 };
}

/* ------------------------------------------------------------------ L3 risk score */
/** Risk = likelihood × impact. Likelihood from failure history (Laplace-smoothed); impact from tag weights. */
export function riskScore(input: { id: string; tags: string[]; fails: number; runs: number; steps: number }[], weights: Record<string, number>) {
  return input.map((s) => {
    const likelihood = (s.fails + 1) / (s.runs + 2);
    const impact = Math.max(1, ...s.tags.map((t) => weights[t.toLowerCase()] ?? 1)) * (1 + Math.log10(1 + s.steps) / 2);
    return { id: s.id, likelihood, impact, risk: likelihood * impact };
  }).sort((a, b) => b.risk - a.risk);
}

/* ------------------------------------------------------------------ L4 quarantine */
/**
 * Quarantine when the test both passes and fails, fails in 1–50 % of recent runs and flips at least twice.
 * Leave quarantine after `exitPasses` consecutive passes. Always-failing tests are regressions, not flaky.
 */
export function quarantinePolicy(history: ('passed' | 'failed' | 'skipped')[], opts = { window: 20, exitPasses: 10 }) {
  const h = history.filter((o) => o !== 'skipped').slice(-opts.window);
  const fails = h.filter((o) => o === 'failed').length;
  const rate = h.length ? fails / h.length : 0;
  let flips = 0;
  for (let i = 1; i < h.length; i++) if (h[i] !== h[i - 1]) flips++;
  let streak = 0;
  for (let i = h.length - 1; i >= 0 && h[i] === 'passed'; i--) streak++;
  if (h.length && fails === h.length) return { action: 'fix' as const, reason: 'Fails every run: a regression, not flakiness.', rate };
  if (rate >= 0.01 && rate <= 0.5 && flips >= 2 && streak < opts.exitPasses) return { action: 'quarantine' as const, reason: `${Math.round(rate * 100)}% failures with ${flips} flips in the last ${h.length} runs.`, rate };
  if (fails && streak >= opts.exitPasses) return { action: 'release' as const, reason: `${streak} consecutive passes: leave quarantine.`, rate };
  return { action: 'keep' as const, reason: fails ? 'Too few flips to call it flaky.' : 'Stable.', rate };
}

/* ------------------------------------------------------------------ L5 knapsack */
/** 0/1 knapsack (DP over integer seconds): maximise value within the time budget. */
export function knapsack<T extends { cost: number; value: number }>(items: T[], budget: number): T[] {
  const W = Math.max(0, Math.floor(budget));
  const c = items.map((i) => Math.max(1, Math.round(i.cost)));
  const best = new Array(W + 1).fill(0);
  const take: boolean[][] = items.map(() => new Array(W + 1).fill(false));
  items.forEach((it, k) => { for (let w = W; w >= c[k]; w--) if (best[w - c[k]] + it.value > best[w]) { best[w] = best[w - c[k]] + it.value; take[k][w] = true; } });
  const out: T[] = [];
  let w = W;
  for (let k = items.length - 1; k >= 0; k--) if (take[k][w]) { out.push(items[k]); w -= c[k]; }
  return out.reverse();
}

/* ------------------------------------------------------------------ L6 Pareto front */
/** Non-dominated (cost, coverage) points: nothing else is both cheaper and covers more. */
export function paretoFront<T extends { cost: number; coverage: number }>(points: T[]) {
  return points.filter((p) => !points.some((q) => q !== p && q.cost <= p.cost && q.coverage >= p.coverage && (q.cost < p.cost || q.coverage > p.coverage))).sort((a, b) => a.cost - b.cost);
}

/* ------------------------------------------------------------------ L7 logistic regression */
export function logisticRegression(X: number[][], y: number[], opts = { epochs: 400, rate: 0.1, l2: 0.01 }) {
  const d = X[0]?.length ?? 0;
  // Standardise features so one learning rate suits all.
  const mean = Array.from({ length: d }, (_, j) => X.reduce((s, r) => s + r[j], 0) / (X.length || 1));
  const sd = Array.from({ length: d }, (_, j) => Math.sqrt(X.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / (X.length || 1)) || 1);
  const Z = X.map((r) => r.map((v, j) => (v - mean[j]) / sd[j]));
  const w = new Array(d).fill(0);
  let b = 0;
  const sig = (z: number) => 1 / (1 + Math.exp(-z));
  for (let e = 0; e < opts.epochs; e++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    Z.forEach((r, i) => { const err = sig(r.reduce((s, v, j) => s + v * w[j], b)) - y[i]; r.forEach((v, j) => (gw[j] += err * v)); gb += err; });
    for (let j = 0; j < d; j++) w[j] -= opts.rate * (gw[j] / Z.length + opts.l2 * w[j]);
    b -= opts.rate * (gb / Z.length);
  }
  return { predict: (x: number[]) => sig(x.reduce((s, v, j) => s + ((v - mean[j]) / sd[j]) * w[j], b)), weights: w, bias: b };
}

/* ------------------------------------------------------------------ L8 Gaussian naive Bayes */
export function naiveBayes(X: number[][], y: number[]) {
  const classes = [0, 1];
  const stats = classes.map((c) => {
    const rows = X.filter((_, i) => y[i] === c);
    const d = X[0]?.length ?? 0;
    const mean = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / (rows.length || 1));
    const variance = Array.from({ length: d }, (_, j) => rows.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / (rows.length || 1) + 1e-3);
    return { prior: (rows.length + 1) / (X.length + 2), mean, variance };
  });
  const logLik = (x: number[], s: (typeof stats)[number]) => Math.log(s.prior) + x.reduce((a, v, j) => a - 0.5 * Math.log(2 * Math.PI * s.variance[j]) - ((v - s.mean[j]) ** 2) / (2 * s.variance[j]), 0);
  return { predict: (x: number[]) => { const [l0, l1] = stats.map((s) => logLik(x, s)); const m = Math.max(l0, l1); return Math.exp(l1 - m) / (Math.exp(l0 - m) + Math.exp(l1 - m)); } };
}

/* ------------------------------------------------------------------ L9 k-means, L10 silhouette */
type Vec = Map<string, number>;
/** k-means++ over sparse vectors with cosine distance (spherical k-means). */
export function kMeans(vectors: Vec[], k: number, seed = 1, iterations = 30) {
  const rnd = mulberry32(seed);
  const n = vectors.length;
  if (!n) return { assign: [] as number[], k: 0 };
  k = Math.max(1, Math.min(k, n));
  const dist = (a: Vec, b: Vec) => 1 - cosine(a, b);
  const centroids: Vec[] = [vectors[Math.floor(rnd() * n)]];
  while (centroids.length < k) {
    const d2 = vectors.map((v) => Math.min(...centroids.map((c) => dist(v, c))) ** 2);
    const total = d2.reduce((a, x) => a + x, 0) || 1;
    let r = rnd() * total, i = 0;
    while (r > d2[i] && i < n - 1) { r -= d2[i]; i++; }
    centroids.push(vectors[i]);
  }
  let assign = new Array(n).fill(0);
  for (let it = 0; it < iterations; it++) {
    const next = vectors.map((v) => centroids.reduce((bi, c, ci) => (dist(v, c) < dist(v, centroids[bi]) ? ci : bi), 0));
    const same = next.every((a, i) => a === assign[i]);
    assign = next;
    for (let c = 0; c < k; c++) {
      const members = vectors.filter((_, i) => assign[i] === c);
      if (!members.length) continue;
      const m: Vec = new Map();
      members.forEach((v) => v.forEach((x, key) => m.set(key, (m.get(key) ?? 0) + x / members.length)));
      centroids[c] = m;
    }
    if (same && it) break;
  }
  return { assign, k };
}
/** Mean silhouette in [−1, 1]: how much closer items are to their own cluster than to the next one. */
export function silhouette(vectors: Vec[], assign: number[]) {
  const dist = (a: Vec, b: Vec) => 1 - cosine(a, b);
  const ks = [...new Set(assign)];
  if (ks.length < 2) return 0;
  const s = vectors.map((v, i) => {
    const own = vectors.filter((_, j) => j !== i && assign[j] === assign[i]);
    if (!own.length) return 0;
    const a = own.reduce((t, u) => t + dist(v, u), 0) / own.length;
    const b = Math.min(...ks.filter((c) => c !== assign[i]).map((c) => { const m = vectors.filter((_, j) => assign[j] === c); return m.reduce((t, u) => t + dist(v, u), 0) / m.length; }));
    return (b - a) / Math.max(a, b || 1e-9);
  });
  return s.reduce((a, x) => a + x, 0) / s.length;
}
