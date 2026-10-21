import { featureOn } from '../features';
import { useSyncExternalStore } from 'react';
import { api } from '../api';
import { saveBeforeRun } from '../editor/saveFirst';

export type DiscoveredTest = { id: string; kind: 'test' | 'scenario'; project: string; projectFile?: string; className: string; method: string; name: string; file: string; line: number; filter: string; feature?: string; cases?: number };
export type TestResult = { name: string; className: string; method: string; outcome: 'passed' | 'failed' | 'skipped'; durationMs: number; message?: string; stackTrace?: string; output?: string; traces?: string[] };
export type TestRunState = {
  status: 'idle' | 'running' | 'done' | 'failed' | 'cancelled';
  version: number;
  requested: string[];
  results: TestResult[];
  output: string;
  summary?: { passed: number; failed: number; skipped: number; durationMs: number };
  error?: string;
  coverage?: Coverage;
};
export type Coverage = { lineRate: number; branchRate?: number; files: Record<string, { covered: number[]; uncovered: number[]; partial?: { line: number; covered: number; total: number }[] }> };

/** Test run state streamed from /api/tests/events (Test Explorer reads it). */
let state: TestRunState = { status: 'idle', version: 0, requested: [], results: [], output: '' };
const listeners = new Set<() => void>();
let source: EventSource | undefined;
let heard = 0;
function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/tests/events');
  heard = Date.now();
  source.addEventListener('ping', () => { heard = Date.now(); });
  source.onmessage = (e) => { heard = Date.now(); const before = state.status; state = JSON.parse(e.data) as TestRunState; if (before === 'running' && state.status !== 'running') recordHistory(state); for (const l of listeners) l(); };
}
if (typeof window !== 'undefined') setInterval(() => { if (source && Date.now() - heard > 25_000) { source.close(); source = undefined; connect(); } }, 5_000);
export function useTestRun() { return useSyncExternalStore((l) => { listeners.add(l); connect(); return () => listeners.delete(l); }, () => state); }
export const getTestRun = () => state;

/** Results of one discovered test: parameterized cases ("Method(1,2)") all belong to it. */
export function resultsOf(t: DiscoveredTest, results: TestResult[]) {
  // A scenario's class is guessed without its namespace until the code-behind is generated (first build).
  const sameClass = (c: string) => c === t.className || (t.kind === 'scenario' && c.endsWith(`.${t.className}`));
  return results.filter((r) => sameClass(r.className) && (r.method === t.method || r.method.startsWith(`${t.method}(`)));
}
export type Outcome = 'passed' | 'failed' | 'skipped' | 'none' | 'running';
export function outcomeOf(t: DiscoveredTest, run: TestRunState): Outcome {
  if (run.status === 'running' && (run.requested.includes('all') || run.requested.includes(t.id))) return 'running';
  const rs = resultsOf(t, run.results);
  if (!rs.length) return 'none';
  if (rs.some((r) => r.outcome === 'failed')) return 'failed';
  if (rs.every((r) => r.outcome === 'skipped')) return 'skipped';
  return 'passed';
}
export function combine(outcomes: Outcome[]): Outcome {
  if (outcomes.includes('running')) return 'running';
  if (outcomes.includes('failed')) return 'failed';
  if (outcomes.length && outcomes.every((o) => o === 'passed' || o === 'skipped') && outcomes.includes('passed')) return 'passed';
  if (outcomes.length && outcomes.every((o) => o === 'skipped')) return 'skipped';
  return 'none';
}

export const discoverTests = () => api<{ tests: DiscoveredTest[]; warning?: string }>('/tests');
// Repeat Last Test Run (Visual Studio Ctrl+R, L): the last selection run again.
let lastRun: { tests: DiscoveredTest[] | 'all'; configuration: string; coverage: boolean } | null = null;
export const lastTestRun = () => lastRun;
export const runTests = async (tests: DiscoveredTest[] | 'all', configuration = 'Debug', coverage = false) =>
  (lastRun = { tests, configuration, coverage }, await saveBeforeRun(), api<TestRunState>('/tests/run', { ...(tests === 'all' ? { configuration, coverage } : { ids: tests.map((t) => t.id), filters: tests.map((t) => t.filter), configuration, coverage }), ...envBody() }));
export const cancelTests = () => api<TestRunState>('/tests/cancel', {});

/** Resolves when the run that `started` belongs to has finished. */
function finished(started: TestRunState) {
  connect();
  return new Promise<TestRunState>((resolve) => {
    const check = () => { if (state.version >= started.version && state.status !== 'running') { listeners.delete(check); resolve(state); } };
    listeners.add(check);
    check();
  });
}
/** Run Until Failure (Visual Studio's Test Explorer): the last run again and again, until a test fails or `max` runs pass. */
export async function runUntilFailure(max: number, progress: (run: number) => void) {
  const last = lastRun;
  if (!last) return undefined;
  for (let i = 1; i <= max; i++) {
    progress(i);
    const done = await finished(await runTests(last.tests, last.configuration, false));
    if (done.status !== 'done' || (done.summary?.failed ?? 0) > 0 || done.results.some((r) => r.outcome === 'failed')) return { runs: i, failed: true };
  }
  return { runs: max, failed: false };
}

/** Test history (Visual Studio 2026 / Rider test session history): the last 10 outcomes of each test, newest last. */
export type HistoryEntry = { at: number; outcome: 'passed' | 'failed' | 'skipped'; ms: number };
const HISTORY_KEY = 'tas:testHistory';
export function readHistory(): Record<string, HistoryEntry[]> { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '{}') as Record<string, HistoryEntry[]>; } catch { return {}; } }
/** Adds a finished run's results (one entry per test method; parameterized cases fold into one, failed if any failed). */
export function addToHistory(history: Record<string, HistoryEntry[]>, results: TestResult[], at = Date.now()) {
  const byTest = new Map<string, HistoryEntry>();
  for (const r of results) {
    const key = `${r.className}.${r.method.split('(')[0]}`;
    const e = byTest.get(key);
    const outcome = e?.outcome === 'failed' || r.outcome === 'failed' ? 'failed' : e?.outcome === 'passed' || r.outcome === 'passed' ? 'passed' : 'skipped';
    byTest.set(key, { at, outcome, ms: (e?.ms ?? 0) + r.durationMs });
  }
  const next = { ...history };
  for (const [k, e] of byTest) next[k] = [...(next[k] ?? []), e].slice(-10);
  return next;
}
function recordHistory(s: TestRunState) {
  if (!s.results.length) return;
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(addToHistory(readHistory(), s.results))); } catch { /* storage blocked */ }
}
/** The history of a discovered test (its class may lack the namespace before the first build). */
export function historyOf(t: DiscoveredTest, history = readHistory()) {
  const exact = history[`${t.className}.${t.method}`];
  if (exact) return exact;
  const k = Object.keys(history).find((key) => key.endsWith(`.${t.className}.${t.method}`));
  return k ? history[k] : [];
}

/** Run Repeatedly (flaky test check, Rider "Run until failure" / VS repeat): the tests n times; per test, how many runs passed. */
export async function runRepeatedly(tests: DiscoveredTest[], n: number, configuration: string, progress: (run: number) => void) {
  const tally = new Map<string, { passed: number; runs: number }>();
  for (let i = 1; i <= n; i++) {
    progress(i);
    const done = await finished(await runTests(tests, configuration, false));
    for (const t of tests) {
      const rs = resultsOf(t, done.results);
      const e = tally.get(t.method) ?? { passed: 0, runs: 0 };
      tally.set(t.method, { passed: e.passed + (rs.length && rs.every((r) => r.outcome === 'passed') ? 1 : 0), runs: e.runs + 1 });
    }
    if (done.status === 'cancelled') break;
  }
  return tally;
}
/** "AddsTwoNumbers 3/3 passed; DividesByZero 2/3 passed (flaky)". */
export const repeatSummary = (tally: Map<string, { passed: number; runs: number }>) => [...tally].map(([name, t]) => `${name} ${t.passed}/${t.runs} passed${t.passed && t.passed < t.runs ? ' (flaky)' : ''}`).join('; ');

/** Test run environment variables (Rider run configurations / .runsettings): "NAME=value" lines or "; "-separated. */
export function parseEnv(text: string) {
  const env: Record<string, string> = {};
  for (const part of text.split(/[;\n]/)) { const m = /^\s*([A-Za-z_][A-Za-z0-9_]{0,63})\s*=(.*)$/.exec(part); if (m) env[m[1]] = m[2].trim(); }
  return env;
}
export const testEnvText = () => { try { return localStorage.getItem('tas:testEnv') ?? ''; } catch { return ''; } };
export const setTestEnvText = (t: string) => { try { localStorage.setItem('tas:testEnv', t); } catch { /* storage blocked */ } };
function envBody() { const env = parseEnv(testEnvText()); return Object.keys(env).length && featureOn('test-env') ? { env } : {}; }
