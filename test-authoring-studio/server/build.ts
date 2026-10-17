import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { dotnet } from './core.js';

export type BuildDiagnostic = { severity: 'error' | 'warning'; code: string; message: string; file?: string; line?: number; column?: number; project?: string };
export type BuildAction = 'build' | 'rebuild' | 'clean';
export type BuildState = {
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  version: number;
  action?: BuildAction;
  target?: string;
  configuration?: string;
  output: string;
  diagnostics: BuildDiagnostic[];
  startedAt?: number;
  durationMs?: number;
};

const MAX_OUTPUT = 200_000;
// MSBuild / compiler lines: "path(12,5): error CS0103: The name 'x' does not exist [C:\…\App.csproj]"
// (also "path(12,5,12,9)", and location-less "MSBUILD : error MSB1009: …" / "CSC : warning CS…").
const located = /^\s*(.+?)\((\d+),(\d+)(?:,\d+,\d+)?\)\s*:\s+(error|warning)\s+([A-Za-z]+\d+)\s*:\s*(.*?)(?:\s+\[([^\]]+)\])?\s*$/;
const general = /^\s*(.+?)\s*:\s+(error|warning)\s+([A-Za-z]+\d+)\s*:\s*(.*?)(?:\s+\[([^\]]+)\])?\s*$/;

/** Parses build output into Error List rows (MSBuild prints each one twice: de-duplicated), paths repo-relative. */
export function parseDiagnostics(output: string, root: string): BuildDiagnostic[] {
  const seen = new Set<string>();
  const out: BuildDiagnostic[] = [];
  const rel = (p: string) => {
    const r = path.relative(root, path.resolve(root, p)).replaceAll('\\', '/');
    return r.startsWith('..') || path.isAbsolute(r) ? p.replaceAll('\\', '/') : r;
  };
  for (const raw of output.split(/\r?\n/)) {
    let d: BuildDiagnostic | undefined;
    const m = located.exec(raw);
    if (m) d = { file: rel(m[1]), line: +m[2], column: +m[3], severity: m[4] as 'error' | 'warning', code: m[5], message: m[6], project: m[7] ? path.basename(m[7]).replace(/\.\w+proj$/i, '') : undefined };
    else {
      const g = general.exec(raw);
      if (g && !/^\s*\d+ (Warning|Error)\(s\)/.test(raw)) d = { severity: g[2] as 'error' | 'warning', code: g[3], message: g[4], project: g[5] ? path.basename(g[5]).replace(/\.\w+proj$/i, '') : undefined, file: /[\\/.]/.test(g[1]) && !/^(MSBUILD|CSC)$/i.test(g[1]) ? rel(g[1]) : undefined };
    }
    if (!d) continue;
    const key = `${d.severity}|${d.code}|${d.file}|${d.line}|${d.column}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  return out;
}

/** Build / Rebuild / Clean with `dotnet`, one at a time, streaming output and diagnostics (Output + Error List). */
export class Builder extends EventEmitter {
  state: BuildState = { status: 'idle', version: 0, output: '', diagnostics: [] };
  private proc?: ChildProcess;
  private update(patch: Partial<BuildState>) {
    this.state = { ...this.state, ...patch, version: this.state.version + 1 };
    this.emit('state', this.state);
  }
  get running() { return this.state.status === 'running'; }

  /** `tool` replaces `dotnet` (Visual Studio's MSBuild for classic projects); `help` is appended when the build fails. */
  start({ root, target, action, configuration, tool, help }: { root: string; target: string; action: BuildAction; configuration: string; tool?: { exe: string; args: string[] }; help?: string }) {
    if (this.running) throw new Error('A build is already running. Cancel it first.');
    const exe = tool?.exe ?? dotnet;
    const args = tool?.args ?? (action === 'clean'
      ? ['clean', target, '-c', configuration, '-nologo', '-v:q']
      : ['build', target, '-c', configuration, '-nologo', '-v:q', '-clp:NoSummary', ...(action === 'rebuild' ? ['--no-incremental'] : [])]);
    const startedAt = Date.now();
    this.update({ status: 'running', action, target, configuration, output: `${action === 'clean' ? 'Clean' : action === 'rebuild' ? 'Rebuild' : 'Build'} started: ${target} (${configuration})\n> ${tool ? `"${exe}"` : 'dotnet'} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}\n`, diagnostics: [], startedAt, durationMs: undefined });
    const proc = spawn(exe, args, { cwd: root, windowsHide: true, env: { ...process.env, DOTNET_CLI_UI_LANGUAGE: 'en', MSBUILDTERMINALLOGGER: 'off' } });
    this.proc = proc;
    let pending = '';
    const read = (d: Buffer) => {
      const text = d.toString();
      pending += text;
      const output = (this.state.output + text).slice(-MAX_OUTPUT);
      // Re-parse only complete lines.
      const done = pending.lastIndexOf('\n');
      const diagnostics = done >= 0 ? parseDiagnostics(output, root) : this.state.diagnostics;
      if (done >= 0) pending = pending.slice(done + 1);
      this.update({ output, diagnostics });
    };
    proc.stdout!.on('data', read);
    proc.stderr!.on('data', read);
    proc.on('error', (e) => this.update({ status: 'failed', output: `${this.state.output}\n${e.message}\n` }));
    proc.on('close', (code) => {
      if (this.proc !== proc) return;
      this.proc = undefined;
      const durationMs = Date.now() - startedAt;
      const diagnostics = parseDiagnostics(this.state.output, root);
      const errors = diagnostics.filter((d) => d.severity === 'error').length;
      const warnings = diagnostics.length - errors;
      if (this.state.status === 'cancelled') return;
      const ok = code === 0;
      const word = action === 'clean' ? 'Clean' : action === 'rebuild' ? 'Rebuild' : 'Build';
      this.update({ status: ok ? 'succeeded' : 'failed', diagnostics: !ok && help ? [{ severity: 'error', code: 'TAS100', message: help.split('\n').join(' ') }, ...diagnostics] : diagnostics, durationMs, output: `${this.state.output}\n========== ${word} ${ok ? 'succeeded' : 'failed'}: ${errors} error(s), ${warnings} warning(s) · ${(durationMs / 1000).toFixed(1)} s ==========\n${!ok && help ? `\n${help}\n` : ''}` });
    });
    return this.state;
  }

  cancel() {
    const p = this.proc;
    if (!p) return this.state;
    this.update({ status: 'cancelled', output: `${this.state.output}\n========== Build cancelled ==========\n` });
    this.proc = undefined;
    if (process.platform === 'win32' && p.pid) execFile('taskkill', ['/pid', String(p.pid), '/T', '/F'], () => {}); else p.kill();
    return this.state;
  }
}
