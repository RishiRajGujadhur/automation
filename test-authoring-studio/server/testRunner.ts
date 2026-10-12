import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dotnet } from './core.js';

export type TestOutcome = 'passed' | 'failed' | 'skipped';
export type TestResult = { name: string; className: string; method: string; outcome: TestOutcome; durationMs: number; message?: string; stackTrace?: string; output?: string };
export type TestRunState = {
  status: 'idle' | 'running' | 'done' | 'failed' | 'cancelled';
  version: number;
  /** Test ids requested in the current/last run ('all' for Run All). */
  requested: string[];
  results: TestResult[];
  output: string;
  summary?: { passed: number; failed: number; skipped: number; durationMs: number };
  error?: string;
  /** Line coverage of the last run with coverage. */
  coverage?: Coverage;
};

const xmlText = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#xD;/g, '').replace(/&#xA;/g, '\n').replace(/&amp;/g, '&');
const durationMs = (d?: string) => { const m = /(\d+):(\d+):([\d.]+)/.exec(d ?? ''); return m ? Math.round(((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000) : 0; };

/** Visual Studio test results (.trx): per test its class, method, outcome, duration, message and stack trace. */
export function parseTrx(xml: string): TestResult[] {
  const definitions = new Map<string, { className: string; method: string }>();
  for (const m of xml.matchAll(/<UnitTest\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/UnitTest>/g)) {
    const tm = /<TestMethod\b[^>]*\bclassName="([^"]+)"[^>]*\bname="([^"]+)"/.exec(m[2]) ?? /<TestMethod\b[^>]*\bname="([^"]+)"[^>]*\bclassName="([^"]+)"/.exec(m[2]);
    if (!tm) continue;
    const [className, method] = /className="([^"]+)"[^>]*name=/.test(tm[0]) ? [tm[1], tm[2]] : [tm[2], tm[1]];
    // NUnit's className may carry the assembly (", Assembly"): keep the type name.
    definitions.set(m[1], { className: xmlText(className).split(',')[0].trim(), method: xmlText(method) });
  }
  const results: TestResult[] = [];
  for (const m of xml.matchAll(/<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g)) {
    const attrs = m[1];
    const attr = (n: string) => new RegExp(`\\b${n}="([^"]*)"`).exec(attrs)?.[1];
    const def = definitions.get(attr('testId') ?? '');
    const outcome = attr('outcome') === 'Passed' ? 'passed' : attr('outcome') === 'Failed' || attr('outcome') === 'Error' || attr('outcome') === 'Timeout' ? 'failed' : 'skipped';
    const body = m[2] ?? '';
    const pick = (tag: string) => { const x = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)?.[1]; return x === undefined ? undefined : xmlText(x).trim(); };
    results.push({
      name: xmlText(attr('testName') ?? def?.method ?? ''),
      className: def?.className ?? '',
      method: def?.method ?? xmlText(attr('testName') ?? ''),
      outcome,
      durationMs: durationMs(attr('duration')),
      message: pick('Message'),
      stackTrace: pick('StackTrace'),
      output: pick('StdOut'),
    });
  }
  return results;
}

export type Coverage = { lineRate: number; files: Record<string, { covered: number[]; uncovered: number[] }> };

/**
 * Cobertura XML (from `--collect "Code Coverage;Format=cobertura"`): covered and uncovered lines per file, with paths
 * made relative to the repository (files outside it are left out), plus the overall line rate.
 */
export function parseCobertura(xml: string, root: string): Coverage {
  const sources = [...xml.matchAll(/<source>([^<]*)<\/source>/g)].map((m) => m[1].trim()).filter(Boolean);
  const files: Coverage['files'] = {};
  const norm = (p: string) => path.resolve(p).replaceAll('\\', '/');
  const top = norm(root);
  for (const cls of xml.matchAll(/<class\b[^>]*\bfilename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g)) {
    const name = cls[1].replace(/&amp;/g, '&');
    const full = path.isAbsolute(name) ? norm(name) : norm(path.join(sources[0] ?? root, name));
    if (!full.toLowerCase().startsWith(`${top.toLowerCase()}/`)) continue;
    const rel = full.slice(top.length + 1);
    const f = (files[rel] ??= { covered: [], uncovered: [] });
    // Only the class's own <lines> (method <lines> repeat them).
    const body = cls[2].replace(/<methods>[\s\S]*?<\/methods>/, '');
    for (const l of body.matchAll(/<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g)) (Number(l[2]) > 0 ? f.covered : f.uncovered).push(Number(l[1]));
  }
  let covered = 0, total = 0;
  for (const f of Object.values(files)) {
    f.covered = [...new Set(f.covered)].sort((a, b) => a - b);
    f.uncovered = [...new Set(f.uncovered)].filter((n) => !f.covered.includes(n)).sort((a, b) => a - b);
    covered += f.covered.length; total += f.covered.length + f.uncovered.length;
  }
  return { lineRate: total ? covered / total : 0, files };
}
async function findFiles(dir: string, suffix: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await findFiles(p, suffix)); else if (e.name.endsWith(suffix)) out.push(p);
  }
  return out;
}

/** Runs tests with `dotnet test` (one run at a time), collecting results from TRX files. */
export class TestRunner extends EventEmitter {
  state: TestRunState = { status: 'idle', version: 0, requested: [], results: [], output: '' };
  private proc?: ChildProcess;
  private update(patch: Partial<TestRunState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    this.emit('state', this.state);
  }
  get running() { return this.state.status === 'running'; }

  async run({ root, target, filter, requested, configuration, coverage }: { root: string; target: string; filter?: string; requested: string[]; configuration: string; coverage?: boolean }) {
    if (this.running) throw new Error('Tests are already running. Cancel the run first.');
    const results = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-trx-'));
    const args = ['test', target, '-c', configuration, '--nologo', '--logger', 'trx', '--results-directory', results, ...(filter ? ['--filter', filter] : []), ...(coverage ? ['--collect', 'Code Coverage;Format=cobertura'] : [])];
    const started = Date.now();
    this.update({ status: 'running', requested, output: `> dotnet ${args.map((a) => (/\s|\|/.test(a) ? `"${a}"` : a)).join(' ')}\n`, error: undefined, summary: undefined });
    const proc = spawn(dotnet, args, { cwd: root, windowsHide: true, env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en', MSBUILDTERMINALLOGGER: 'off' } });
    this.proc = proc;
    const read = (d: Buffer) => this.update({ output: (this.state.output + d.toString()).slice(-200_000) });
    proc.stdout!.on('data', read);
    proc.stderr!.on('data', read);
    proc.on('close', async (code) => {
      if (this.proc !== proc) return;
      this.proc = undefined;
      let fresh: TestResult[] = [];
      for (const f of await fs.readdir(results).catch(() => [] as string[])) if (f.endsWith('.trx')) fresh.push(...parseTrx(await fs.readFile(path.join(results, f), 'utf8')));
      // Code coverage: merge every project's report (line sets per file).
      let cov: Coverage | undefined;
      if (coverage) {
        cov = { lineRate: 0, files: {} };
        for (const f of await findFiles(results, '.cobertura.xml')) {
          const one = parseCobertura(await fs.readFile(f, 'utf8'), root);
          for (const [file, l] of Object.entries(one.files)) {
            const m = (cov.files[file] ??= { covered: [], uncovered: [] });
            m.covered = [...new Set([...m.covered, ...l.covered])];
            m.uncovered = [...new Set([...m.uncovered, ...l.uncovered])].filter((n) => !m.covered.includes(n));
          }
        }
        const c = Object.values(cov.files).reduce((n, f) => n + f.covered.length, 0), t = Object.values(cov.files).reduce((n, f) => n + f.covered.length + f.uncovered.length, 0);
        cov.lineRate = t ? c / t : 0;
      }
      await fs.rm(results, { recursive: true, force: true }).catch(() => {});
      if (this.state.status === 'cancelled') return;
      // Results from earlier runs stay (like Visual Studio's Test Explorer); this run replaces what it re-ran.
      const key = (r: TestResult) => `${r.className}.${r.name}`;
      const ran = new Set(fresh.map(key));
      const merged = [...this.state.results.filter((r) => !ran.has(key(r))), ...fresh];
      fresh = fresh.filter(Boolean);
      const summary = { passed: fresh.filter((r) => r.outcome === 'passed').length, failed: fresh.filter((r) => r.outcome === 'failed').length, skipped: fresh.filter((r) => r.outcome === 'skipped').length, durationMs: Date.now() - started };
      const buildFailed = code !== 0 && !fresh.length;
      this.update({ status: buildFailed ? 'failed' : 'done', results: merged, summary, ...(cov ? { coverage: cov } : {}), error: buildFailed ? 'The test run did not produce results (build error?). See the output.' : undefined });
    });
    return this.state;
  }

  /** Another repository or solution was opened: results of the previous one no longer apply. */
  reset() {
    if (this.running) this.cancel();
    this.update({ status: 'idle', requested: [], results: [], output: '', summary: undefined, error: undefined });
  }

  cancel() {
    const p = this.proc;
    if (!p) return this.state;
    this.proc = undefined;
    this.update({ status: 'cancelled' });
    if (process.platform === 'win32' && p.pid) execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => {}); else p.kill();
    return this.state;
  }
}
