import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DapClient } from './dap.js';
import { command, dotnet, projectRoot, relative } from './core.js';

const localDebugger = path.resolve(projectRoot, '../.tools/netcoredbg/netcoredbg.exe');
/** netcoredbg (Samsung, MIT): a .NET debugger speaking the Debug Adapter Protocol. The desktop app bundles one. */
export const netcoredbg = process.env.STUDIO_NETCOREDBG || (existsSync(localDebugger) ? localDebugger : 'netcoredbg');

/** A breakpoint as Visual Studio has it: condition, hit count ("5", ">= 5", "% 3"), log message (tracepoint), enabled. */
export type BreakpointSpec = { line: number; condition?: string; hitCondition?: string; logMessage?: string; enabled?: boolean };
/** Whether the n-th hit satisfies a hit condition: "5" / "= 5" (equal), ">= 5", "% 3" (every third). */
export function hitMatches(hits: number, condition?: string) {
  const c = (condition ?? '').trim();
  if (!c) return true;
  const m = /^(>=|=|==|%)?\s*(\d+)$/.exec(c);
  if (!m) return true;
  const n = Number(m[2]);
  return m[1] === '>=' ? hits >= n : m[1] === '%' ? n > 0 && hits % n === 0 : hits === n;
}
export type DebugFrame = { id: number; name: string; file?: string; line: number; column: number; external: boolean };
export type DebugStatus = 'idle' | 'building' | 'starting' | 'running' | 'paused' | 'ended';
export type DebugState = {
  status: DebugStatus;
  version: number;
  target?: { project: string; filter: string; label: string };
  reason?: string;
  exception?: string;
  error?: string;
  threadId?: number;
  frames: DebugFrame[];
  output: string;
  /** Breakpoint lines per repository file, with whether the debugger resolved them. */
  breakpoints: Record<string, (BreakpointSpec & { verified: boolean })[]>;
};

const MAX_OUTPUT = 60_000;

/**
 * One debugging session at a time, like Visual Studio's debugger: builds the test project, starts
 * `dotnet test` with VSTEST_HOST_DEBUG so the test host waits, attaches netcoredbg to it, and relays
 * breakpoints, stepping, call stacks, locals and watch expressions. SpecFlow/Reqnroll code-behind
 * carries `#line` directives, so breakpoints on .feature lines stop on the Gherkin step itself.
 */
export class Debugger extends EventEmitter {
  state: DebugState = { status: 'idle', version: 0, frames: [], output: '', breakpoints: {} };
  private dap?: DapClient;
  private test?: ChildProcess;
  private root = '';
  private generation = 0;
  /** Hits per breakpoint (file:line) in the current session, for hit conditions. */
  private hits = new Map<string, number>();
  /** Run to Cursor: a one-shot breakpoint, removed at the next stop (netcoredbg has no native "run to"). */
  private runTo?: { file: string; line: number };

  private update(patch: Partial<DebugState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    this.emit('state', this.state);
  }
  private log(text: string) {
    const output = (this.state.output + text).slice(-MAX_OUTPUT);
    this.update({ output });
  }
  get active() { return ['building', 'starting', 'running', 'paused'].includes(this.state.status); }

  /** Replaces the breakpoints of one repository file; sent to the debugger right away when a session is live. */
  async setBreakpoints(root: string, file: string, specs: BreakpointSpec[]) {
    const byLine = new Map<number, BreakpointSpec>();
    for (const b of specs) if (Number.isInteger(b.line) && b.line > 0) byLine.set(b.line, b);
    const unique = [...byLine.values()].sort((a, b) => a.line - b.line);
    const breakpoints = { ...this.state.breakpoints };
    if (unique.length) breakpoints[file] = unique.map((b) => ({ ...b, verified: false })); else delete breakpoints[file];
    this.update({ breakpoints });
    if (this.dap && this.root === root && this.state.status !== 'building' && this.state.status !== 'ended') await this.send(file);
    return this.state.breakpoints[file] ?? [];
  }
  private async send(file: string) {
    const all = this.state.breakpoints[file] ?? [];
    // Disabled breakpoints stay listed but are not set; conditions go to the debugger, hit counts and log messages are ours.
    const active = all.filter((b) => b.enabled !== false);
    try {
      const oneShot = this.runTo?.file === file && !active.some((b) => b.line === this.runTo!.line) ? [{ line: this.runTo.line }] : [];
      const r = await this.dap!.request<{ breakpoints: { line?: number; verified: boolean }[] }>('setBreakpoints', { source: { path: path.resolve(this.root, file) }, breakpoints: [...active.map((b) => ({ line: b.line, ...(b.condition?.trim() ? { condition: b.condition.trim() } : {}) })), ...oneShot] });
      // netcoredbg reports pending breakpoints as unverified until the module loads; they still bind.
      const marks = all.map((b) => { const i = active.indexOf(b); return { ...b, verified: i >= 0 && !!r.breakpoints[i]?.verified }; });
      if (this.state.breakpoints[file]) this.update({ breakpoints: { ...this.state.breakpoints, [file]: marks } });
    } catch (e) {
      this.log(`Breakpoints for ${file}: ${(e as Error).message}\n`);
    }
  }

  async start({ root, project, filter, label, featureFile, scenario }: { root: string; project: string; filter?: string; label: string; featureFile?: string; scenario?: string }) {
    if (this.active) throw new Error('A debugging session is already running. Stop it first (Shift+F5).');
    if (netcoredbg !== 'netcoredbg' && !existsSync(netcoredbg)) throw new Error(`The .NET debugger was not found at ${netcoredbg}.`);
    const generation = ++this.generation;
    this.root = root;
    this.hits.clear();
    this.update({ status: 'building', target: { project, filter: filter ?? '', label }, reason: undefined, exception: undefined, error: undefined, threadId: undefined, frames: [], output: `Building ${project}…\n` });
    const fail = (e: unknown) => {
      if (generation !== this.generation) return;
      this.cleanup();
      this.update({ status: 'ended', error: (e as Error).message });
    };
    try {
      const out = await command(dotnet, ['build', path.resolve(root, project), '-nologo', '-v:q', '-clp:NoSummary'], '', root);
      this.log(out.trim() ? `${out.trim()}\n` : 'Build succeeded.\n');
      if (generation !== this.generation) return;
      const testFilter = filter || (featureFile ? await featureFilter(root, featureFile, scenario) : '');
      this.update({ status: 'starting', target: { project, filter: testFilter, label } });
      const args = ['test', path.resolve(root, project), '--no-build', '--logger', 'console;verbosity=normal', ...(testFilter ? ['--filter', testFilter] : [])];
      this.log(`dotnet ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}\n`);
      const test = spawn(dotnet, args, { cwd: root, env: { ...process.env, VSTEST_HOST_DEBUG: '1', DOTNET_CLI_UI_LANGUAGE: 'en' }, windowsHide: true });
      this.test = test;
      const pid = await new Promise<number>((resolve, reject) => {
        let text = '';
        const t = setTimeout(() => reject(new Error('The test host did not start within 90 seconds.')), 90_000);
        const read = (d: Buffer) => {
          const s = d.toString();
          text += s;
          if (!/Host debugging is enabled|Process Id:/.test(s)) this.log(s);
          const m = /Process Id: (\d+)/.exec(text);
          if (m) { clearTimeout(t); resolve(Number(m[1])); }
        };
        test.stdout!.on('data', read);
        test.stderr!.on('data', read);
        test.on('exit', (code) => { clearTimeout(t); reject(new Error(`dotnet test exited (${code}) before the test host started. See the output.`)); });
      });
      test.on('exit', (code) => {
        if (generation !== this.generation) return;
        this.cleanup();
        this.update({ status: 'ended', threadId: undefined, frames: [], reason: code === 0 ? 'Tests passed' : 'Tests failed' });
      });
      await this.attach(pid, generation);
    } catch (e) {
      fail(e);
    }
  }

  private async attach(pid: number, generation: number) {
    const dap = new DapClient(netcoredbg);
    this.dap = dap;
    dap.on('event', (event: string, body: any) => { if (generation === this.generation) void this.onEvent(event, body); });
    dap.on('exit', () => { if (generation === this.generation && this.active) this.update({ status: 'ended', frames: [], threadId: undefined }); });
    await dap.request('initialize', { clientID: 'tas', adapterID: 'coreclr', linesStartAt1: true, columnsStartAt1: true, pathFormat: 'path' });
    await dap.request('attach', { processId: pid, justMyCode: true });
    for (const file of Object.keys(this.state.breakpoints)) await this.send(file);
    // netcoredbg rejects configurationDone after attach; the waiting test host continues once a debugger is attached.
    await dap.request('configurationDone').catch(() => {});
    this.log(`Debugger attached to the test host (process ${pid}).\n`);
    if (this.state.status === 'starting') this.update({ status: 'running' });
  }

  private async onEvent(event: string, body: any) {
    if (event === 'output' && body.category !== 'telemetry') this.log(body.output ?? '');
    else if (event === 'stopped') {
      const threadId = body.threadId ?? this.state.threadId;
      // Any stop ends a Run to Cursor: take its one-shot breakpoint out again.
      if (this.runTo) { const done = this.runTo; this.runTo = undefined; await this.send(done.file); }
      if (body.reason === 'breakpoint' && (await this.tracepointOrSkip(threadId))) return;
      let exception: string | undefined;
      if (body.reason === 'exception') exception = await this.dap!.request('exceptionInfo', { threadId }).then((r: any) => `${r.details?.typeName ?? r.exceptionId}: ${r.description ?? r.details?.message ?? ''}`, () => body.text);
      const frames = await this.frames(threadId);
      this.update({ status: 'paused', reason: body.reason, threadId, frames, exception });
    } else if (event === 'continued') this.update({ status: 'running', frames: [], reason: undefined, exception: undefined });
    else if (event === 'terminated' || event === 'exited') { if (this.active) this.update({ status: 'ended', frames: [], threadId: undefined }); }
  }

  /**
   * Hit counts and tracepoints (log messages), which the debugger itself does not do: count the hit, log the message
   * (with {expressions} evaluated in the stopped frame) and continue without pausing when the breakpoint says so.
   */
  private async tracepointOrSkip(threadId: number) {
    const top = (await this.frames(threadId)).find((f) => !f.external);
    const bp = top?.file ? this.state.breakpoints[top.file]?.find((b) => b.line === top.line) : undefined;
    if (!bp || (!bp.hitCondition?.trim() && !bp.logMessage?.trim())) return false;
    const key = `${top!.file}:${bp.line}`;
    const hits = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, hits);
    if (!hitMatches(hits, bp.hitCondition)) { await this.dap!.request('continue', { threadId }).catch(() => {}); return true; }
    if (bp.logMessage?.trim()) {
      let message = bp.logMessage;
      for (const m of bp.logMessage.matchAll(/\{([^{}]+)\}/g)) {
        // Evaluated directly: the session is not shown as paused while a tracepoint runs.
        const r = await this.dap!.request<{ result: string }>('evaluate', { expression: m[1], frameId: top!.id, context: 'watch' }, 10_000).then((x) => x.result, (e) => `<${(e as Error).message.replace(/^Failed command 'evaluate' : /, '')}>`);
        message = message.replace(m[0], r);
      }
      this.log(`[Tracepoint] ${top!.file}:${bp.line}: ${message}\n`);
      await this.dap!.request('continue', { threadId }).catch(() => {});
      return true;
    }
    return false;
  }

  private async frames(threadId: number): Promise<DebugFrame[]> {
    try {
      const r = await this.dap!.request<{ stackFrames: any[] }>('stackTrace', { threadId, startFrame: 0, levels: 40 });
      return r.stackFrames.map((f) => {
        const abs = f.source?.path as string | undefined;
        const rel = abs ? relative(this.root, abs) : undefined;
        const inside = !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
        return { id: f.id, name: f.name, file: inside ? rel : undefined, line: f.line, column: f.column, external: !inside };
      });
    } catch { return []; }
  }

  /** Continue (F5), Step Over (F10), Step Into (F11), Step Out (Shift+F11), Break All. */
  async control(action: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause') {
    if (!this.dap) throw new Error('No debugging session.');
    const threadId = this.state.threadId ?? (await this.dap.request<{ threads: { id: number }[] }>('threads')).threads[0]?.id;
    if (action === 'pause') { await this.dap.request('pause', { threadId }); return; }
    if (this.state.status !== 'paused') throw new Error('The debugger is not paused.');
    this.update({ status: 'running', frames: [], reason: undefined, exception: undefined });
    await this.dap.request(action, { threadId });
  }

  /** Run to Cursor (Ctrl+F10): continue until the given line (or an earlier breakpoint). */
  async runToCursor(file: string, line: number) {
    if (!this.dap || this.state.status !== 'paused') throw new Error('The debugger is not paused.');
    this.runTo = { file, line };
    await this.send(file);
    await this.control('continue');
  }
  /** Immediate window: evaluate an expression (may have side effects, like Visual Studio's) in a frame. */
  async immediate(expression: string, frameId?: number) {
    if (!this.dap || this.state.status !== 'paused') return { error: 'The debugger is not paused.' };
    try {
      const r = await this.dap.request<{ result: string; type?: string }>('evaluate', { expression, frameId, context: 'repl' }, 15_000);
      return { result: r.result, type: r.type };
    } catch (e) { return { error: (e as Error).message.replace(/^Failed command 'evaluate' : /, '') }; }
  }

  async scopes(frameId: number) {
    if (!this.dap) throw new Error('No debugging session.');
    return (await this.dap.request<{ scopes: { name: string; variablesReference: number }[] }>('scopes', { frameId })).scopes;
  }
  async variables(variablesReference: number) {
    if (!this.dap) throw new Error('No debugging session.');
    return (await this.dap.request<{ variables: { name: string; value: string; type?: string; variablesReference: number }[] }>('variables', { variablesReference })).variables;
  }
  async evaluate(expression: string, frameId?: number) {
    if (!this.dap || this.state.status !== 'paused') return { error: 'Not available while running.' };
    try {
      const r = await this.dap.request<{ result: string; type?: string; variablesReference: number }>('evaluate', { expression, frameId, context: 'watch' }, 10_000);
      return { result: r.result, type: r.type, variablesReference: r.variablesReference };
    } catch (e) {
      return { error: (e as Error).message.replace(/^Failed command 'evaluate' : /, '').replace(/^(error: )+/i, 'error: ') };
    }
  }

  async stop() {
    this.generation++;
    const dap = this.dap;
    if (dap) await dap.request('disconnect', { terminateDebuggee: true }, 5_000).catch(() => {});
    this.cleanup();
    if (this.state.status !== 'idle') this.update({ status: 'ended', frames: [], threadId: undefined, reason: 'Stopped' });
  }
  private cleanup() {
    this.dap?.kill();
    this.dap = undefined;
    const test = this.test;
    this.test = undefined;
    if (test?.pid && test.exitCode === null) {
      // dotnet test owns the test host: end the whole tree.
      if (process.platform === 'win32') execFile('taskkill', ['/pid', String(test.pid), '/T', '/F'], () => {});
      else test.kill();
    }
  }
}

/** The vstest filter for a feature (or one scenario), read from the generated code-behind's namespace, class and test method. */
export async function featureFilter(root: string, featureFile: string, scenario?: string) {
  const behind = await fs.readFile(path.resolve(root, `${featureFile}.cs`), 'utf8').catch(() => '');
  const ns = /^\s*namespace\s+([\w.]+)/m.exec(behind)?.[1];
  const cls = /public\s+(?:partial\s+)?class\s+(\w+)/.exec(behind)?.[1];
  if (!cls) {
    const title = /^\s*Feature:\s*(.+)$/m.exec(await fs.readFile(path.resolve(root, featureFile), 'utf8').catch(() => ''))?.[1] ?? path.basename(featureFile, '.feature');
    return `FullyQualifiedName~${pascal(title)}Feature`;
  }
  const qualified = ns ? `${ns}.${cls}` : cls;
  if (scenario) {
    const at = behind.indexOf(`"${scenario.replaceAll('"', '\\"')}"`);
    const method = at >= 0 ? /public\s+(?:virtual\s+)?(?:async\s+)?[\w.<>]+\s+(\w+)\s*\(/.exec(behind.slice(at))?.[1] : undefined;
    if (method) return `FullyQualifiedName~${qualified}.${method}`;
  }
  return `FullyQualifiedName~${qualified}`;
}
const pascal = (s: string) => s.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');

/** The .csproj that owns a repository file: the nearest one in its folder or above. */
export async function owningProject(root: string, file: string) {
  let dir = path.dirname(path.resolve(root, file));
  const base = path.resolve(root);
  for (;;) {
    const proj = (await fs.readdir(dir).catch(() => [] as string[])).find((f) => f.endsWith('.csproj'));
    if (proj) return relative(root, path.join(dir, proj));
    if (dir === base || !dir.startsWith(base)) return undefined;
    dir = path.dirname(dir);
  }
}

/** The generated test class of a feature and each scenario's test method (from the SpecFlow/Reqnroll code-behind). */
export async function featureTests(root: string, featureFile: string, scenarios: string[]) {
  const behind = await fs.readFile(path.resolve(root, `${featureFile}.cs`), 'utf8').catch(() => '');
  const ns = /^\s*namespace\s+([\w.]+)/m.exec(behind)?.[1];
  const cls = /public\s+(?:partial\s+)?class\s+(\w+)/.exec(behind)?.[1];
  const className = cls ? (ns ? `${ns}.${cls}` : cls) : undefined;
  const methods: Record<string, string> = {};
  for (const name of scenarios) {
    const at = behind.indexOf(`"${name.replaceAll('"', '\\"')}"`);
    const method = at >= 0 ? /public\s+(?:virtual\s+)?(?:async\s+)?[\w.<>]+\s+(\w+)\s*\(/.exec(behind.slice(at))?.[1] : undefined;
    methods[name] = method ?? pascal(name);
  }
  return { className, methods, generated: !!cls };
}
