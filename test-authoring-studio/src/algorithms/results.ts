/* Test results: parsers and flakiness statistics. */
export type Outcome = 'passed' | 'failed' | 'skipped';
export type Result = { name: string; feature?: string; outcome: Outcome; duration?: number; message?: string };
export type Run = { id: string; at: number; source: string; results: Result[] };

/* ------------------------------------------------------------------ G1 JUnit XML */
export function parseJUnit(xml: string): Result[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Not well-formed XML.');
  return [...doc.getElementsByTagName('testcase')].map((tc) => {
    const failed = tc.getElementsByTagName('failure')[0] ?? tc.getElementsByTagName('error')[0];
    const skipped = tc.getElementsByTagName('skipped')[0];
    return {
      name: tc.getAttribute('name') ?? '(unnamed)',
      feature: tc.getAttribute('classname') ?? undefined,
      outcome: failed ? 'failed' : skipped ? 'skipped' : 'passed',
      duration: tc.getAttribute('time') ? Number(tc.getAttribute('time')) : undefined,
      message: failed?.getAttribute('message') ?? failed?.textContent?.slice(0, 300) ?? undefined,
    };
  });
}

/* ------------------------------------------------------------------ G2 Cucumber JSON */
type CukeStep = { result?: { status?: string; duration?: number; error_message?: string } };
type CukeElement = { name?: string; type?: string; steps?: CukeStep[] };
export function parseCucumberJson(text: string): Result[] {
  const data = JSON.parse(text) as { name?: string; uri?: string; elements?: CukeElement[] }[];
  if (!Array.isArray(data)) throw new Error('Expected a Cucumber JSON array of features.');
  return data.flatMap((f) => (f.elements ?? []).filter((e) => e.type !== 'background').map((e) => {
    const st = (e.steps ?? []).map((s) => s.result?.status ?? 'undefined');
    const outcome: Outcome = st.some((s) => s === 'failed' || s === 'undefined' || s === 'ambiguous') ? 'failed' : st.every((s) => s === 'skipped' || s === 'pending') && st.length ? 'skipped' : 'passed';
    return { name: e.name ?? '(unnamed)', feature: f.name ?? f.uri, outcome, duration: (e.steps ?? []).reduce((a, s) => a + (s.result?.duration ?? 0), 0) / 1e9, message: e.steps?.find((s) => s.result?.error_message)?.result?.error_message?.slice(0, 300) };
  }));
}
export function parseResults(text: string): Result[] {
  const t = text.trim();
  if (t.startsWith('[')) return parseCucumberJson(t);
  if (t.startsWith('<')) return parseJUnit(t);
  throw new Error('Unrecognised format. Use JUnit XML or Cucumber JSON.');
}

/* ------------------------------------------------------------------ G3 flip rate, G4 entropy */
const runs = (h: Outcome[]) => h.filter((o) => o !== 'skipped');
export function flipRate(history: Outcome[]) {
  const h = runs(history);
  if (h.length < 2) return 0;
  let flips = 0;
  for (let i = 1; i < h.length; i++) if (h[i] !== h[i - 1]) flips++;
  return flips / (h.length - 1);
}
export function entropy(history: Outcome[]) {
  const h = runs(history);
  if (!h.length) return 0;
  const p = h.filter((o) => o === 'failed').length / h.length;
  return p === 0 || p === 1 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
}

/* ------------------------------------------------------------------ G5 combined score */
/** score = 0.6 × transition rate + 0.4 × balance (closeness of the pass/fail split to 50/50). */
export function flakyScore(history: Outcome[], minRuns = 4) {
  const h = runs(history);
  const fails = h.filter((o) => o === 'failed').length;
  if (h.length < minRuns) return { score: 0, label: 'insufficient data' as const };
  const balance = 1 - Math.abs(fails / h.length - 0.5) * 2;
  const score = 0.6 * flipRate(h) + 0.4 * balance;
  const label = fails / h.length > 0.9 && flipRate(h) < 0.1 ? ('broken' as const) : score >= 0.15 && fails > 0 && fails < h.length ? ('flaky' as const) : ('stable' as const);
  return { score, label };
}

/* ------------------------------------------------------------------ G6 Wilson interval */
export function wilson(successes: number, n: number, z = 1.96) {
  if (!n) return { low: 0, high: 1, center: 0 };
  const p = successes / n, d = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half), center };
}

/* ------------------------------------------------------------------ G7 EWMA */
/** Exponentially weighted failure rate; recent runs count most. */
export function ewma(history: Outcome[], alpha = 0.3) {
  return runs(history).reduce((s, o) => alpha * (o === 'failed' ? 1 : 0) + (1 - alpha) * s, 0);
}

/* ------------------------------------------------------------------ G8 Beta posterior */
/** Beta(1+fails, 1+passes) posterior: mean failure probability and a 90% credible interval (normal approximation). */
export function betaPosterior(history: Outcome[], priorA = 1, priorB = 1) {
  const h = runs(history);
  const a = priorA + h.filter((o) => o === 'failed').length, b = priorB + h.filter((o) => o === 'passed').length;
  const mean = a / (a + b), sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
  return { mean, low: Math.max(0, mean - 1.645 * sd), high: Math.min(1, mean + 1.645 * sd) };
}

/** Outcome history per test, oldest run first. */
export function histories(all: Run[]) {
  const map = new Map<string, Outcome[]>();
  all.slice().sort((a, b) => a.at - b.at).forEach((r) => r.results.forEach((x) => { const k = `${x.feature ?? ''}::${x.name}`; (map.get(k) ?? map.set(k, []).get(k)!).push(x.outcome); }));
  return map;
}
