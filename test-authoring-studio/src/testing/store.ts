import { useSyncExternalStore } from 'react';
import { api } from '../api';

export type DiscoveredTest = { id: string; kind: 'test' | 'scenario'; project: string; projectFile?: string; className: string; method: string; name: string; file: string; line: number; filter: string; feature?: string; cases?: number };
export type TestResult = { name: string; className: string; method: string; outcome: 'passed' | 'failed' | 'skipped'; durationMs: number; message?: string; stackTrace?: string; output?: string };
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
export type Coverage = { lineRate: number; files: Record<string, { covered: number[]; uncovered: number[] }> };

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
  source.onmessage = (e) => { heard = Date.now(); state = JSON.parse(e.data) as TestRunState; for (const l of listeners) l(); };
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
export const runTests = (tests: DiscoveredTest[] | 'all', configuration = 'Debug', coverage = false) =>
  api<TestRunState>('/tests/run', tests === 'all' ? { configuration, coverage } : { ids: tests.map((t) => t.id), filters: tests.map((t) => t.filter), configuration, coverage });
export const cancelTests = () => api<TestRunState>('/tests/cancel', {});
