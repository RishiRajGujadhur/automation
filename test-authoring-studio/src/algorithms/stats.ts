/* Statistics over test-run history (oldest run first). */

/* ------------------------------------------------------------------ M1 CUSUM */
/** Tabular CUSUM on a 0/1 failure series; reports the run index where the failure rate rose above `target + k`. */
export function cusum(series: number[], target?: number, k = 0.05, h = 1.5) {
  const mu = target ?? (series.length ? series.slice(0, Math.max(3, Math.floor(series.length / 3))).reduce((a, x) => a + x, 0) / Math.max(3, Math.floor(series.length / 3)) : 0);
  let s = 0, start = -1;
  for (let i = 0; i < series.length; i++) {
    const prev = s;
    s = Math.max(0, s + series[i] - mu - k);
    if (prev === 0 && s > 0) start = i;
    if (s > h) return { changeAt: start, alarmAt: i, baseline: mu };
    if (s === 0) start = -1;
  }
  return { changeAt: -1, alarmAt: -1, baseline: mu };
}

/* ------------------------------------------------------------------ M2 SPRT */
/**
 * Wald's SPRT for "is this test flaky?": H0 failure rate p0 (stable), H1 p1 (flaky).
 * Returns the decision so far and how many more reruns are likely needed.
 */
export function sprt(outcomes: boolean[] /* true = failed */, p0 = 0.01, p1 = 0.2, alpha = 0.05, beta = 0.1) {
  const A = Math.log((1 - beta) / alpha), B = Math.log(beta / (1 - alpha));
  let llr = 0;
  for (const f of outcomes) {
    llr += f ? Math.log(p1 / p0) : Math.log((1 - p1) / (1 - p0));
    if (llr >= A) return { decision: 'flaky' as const, llr, upper: A, lower: B };
    if (llr <= B) return { decision: 'stable' as const, llr, upper: A, lower: B };
  }
  const perPass = Math.log((1 - p1) / (1 - p0));
  return { decision: 'continue' as const, llr, upper: A, lower: B, rerunsToStable: Math.max(0, Math.ceil((B - llr) / perPass)) };
}

/* ------------------------------------------------------------------ M3 Mann–Kendall */
/** Trend test on durations: S statistic, Z score and direction at ~95 % (|Z| > 1.96). */
export function mannKendall(x: number[]) {
  const n = x.length;
  let s = 0;
  for (let i = 0; i < n - 1; i++) for (let j = i + 1; j < n; j++) s += Math.sign(x[j] - x[i]);
  const variance = (n * (n - 1) * (2 * n + 5)) / 18;
  const z = n < 3 ? 0 : s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0;
  return { s, z, trend: Math.abs(z) > 1.96 ? (z > 0 ? 'increasing' : 'decreasing') : 'none' } as const;
}

/* ------------------------------------------------------------------ M4 MAD outliers, M5 percentiles */
export function quantile(xs: number[], q: number) {
  if (!xs.length) return NaN;
  const s = xs.slice().sort((a, b) => a - b);
  const pos = (s.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
export const percentiles = (xs: number[]) => ({ p50: quantile(xs, 0.5), p90: quantile(xs, 0.9), p95: quantile(xs, 0.95), max: xs.length ? Math.max(...xs) : NaN });
/** Robust z-score: 0.6745 × (x − median) / MAD; > 3.5 is an outlier (Iglewicz & Hoaglin). */
export function madOutliers<T>(items: T[], value: (t: T) => number, threshold = 3.5) {
  const xs = items.map(value);
  const med = quantile(xs, 0.5);
  const mad = quantile(xs.map((x) => Math.abs(x - med)), 0.5) || 1e-9;
  return items.map((t, i) => ({ item: t, score: (0.6745 * (xs[i] - med)) / mad })).filter((r) => r.score > threshold).sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------------ M6 MTBF */
/** Mean number of runs between failures (Infinity when it never failed). */
export function mtbf(failed: boolean[]) {
  const idx = failed.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return Infinity;
  if (idx.length === 1) return failed.length;
  return (idx[idx.length - 1] - idx[0]) / (idx.length - 1);
}

/* ------------------------------------------------------------------ M7 co-failure */
/** Pairs of tests that fail in the same runs (Jaccard over failing-run sets ≥ threshold). */
export function coFailures(runs: { failed: string[] }[], threshold = 0.6, minFails = 2) {
  const sets = new Map<string, Set<number>>();
  runs.forEach((r, i) => r.failed.forEach((t) => (sets.get(t) ?? sets.set(t, new Set()).get(t)!).add(i)));
  const tests = [...sets].filter(([, s]) => s.size >= minFails).map(([t]) => t);
  const out: { a: string; b: string; jaccard: number; together: number }[] = [];
  for (let i = 0; i < tests.length; i++) for (let j = i + 1; j < tests.length; j++) {
    const A = sets.get(tests[i])!, B = sets.get(tests[j])!;
    let inter = 0;
    A.forEach((x) => { if (B.has(x)) inter++; });
    const jac = inter / (A.size + B.size - inter);
    if (jac >= threshold) out.push({ a: tests[i], b: tests[j], jaccard: jac, together: inter });
  }
  return out.sort((x, y) => y.jaccard - x.jaccard);
}
