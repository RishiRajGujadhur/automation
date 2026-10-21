import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

/**
 * Terminal tool window (Rider, Alt+F12): a shell per session that reads one command line at a time from stdin (no
 * native pseudo-terminal, so it runs the same in the desktop app). After each command the shell prints a marker with
 * its working directory, which ends the command and gives the client its prompt.
 */
const MARK = '\u0001TAS-DONE\u0001';
const windows = process.platform === 'win32';

export type TerminalEvent = { kind: 'output'; text: string } | { kind: 'done'; cwd: string } | { kind: 'exit'; code: number | null };

class Session extends EventEmitter {
  proc!: ChildProcessWithoutNullStreams;
  cwd: string;
  /** Recent output, replayed to a client that (re)connects. */
  backlog: TerminalEvent[] = [];
  private pending = '';
  busy = false;
  constructor(readonly id: string, cwd: string) {
    super();
    this.cwd = cwd;
    this.start();
  }
  private start() {
    const [cmd, args] = windows
      ? ['powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-']]
      : [process.env.SHELL && !/fish$/.test(process.env.SHELL) ? process.env.SHELL : '/bin/sh', ['-s']];
    this.proc = spawn(cmd, args, { cwd: this.cwd, env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }, windowsHide: true });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (d: string) => this.data(d));
    this.proc.stderr.on('data', (d: string) => this.emitEvent({ kind: 'output', text: d }));
    this.proc.on('exit', (code) => { this.busy = false; this.emitEvent({ kind: 'exit', code }); });
    if (windows) this.proc.stdin.write('[Console]::OutputEncoding = [Text.Encoding]::UTF8; $ProgressPreference = "SilentlyContinue"\n');
    this.mark();
  }
  /** Asks the shell to print the marker and its directory (after the command before it finishes). */
  private mark() {
    this.proc.stdin.write(windows ? `Write-Output ("${MARK}" + (Get-Location).Path)\n` : `printf '%s%s\\n' '${MARK}' "$PWD"\n`);
  }
  private data(d: string) {
    this.pending += d;
    for (;;) {
      const at = this.pending.indexOf(MARK);
      if (at < 0) {
        // Keep a possible partial marker; send the rest.
        const keep = this.pending.lastIndexOf('\u0001');
        const out = keep >= 0 ? this.pending.slice(0, keep) : this.pending;
        this.pending = keep >= 0 ? this.pending.slice(keep) : '';
        if (out) this.emitEvent({ kind: 'output', text: out });
        return;
      }
      const end = this.pending.indexOf('\n', at);
      if (end < 0) return;
      if (at > 0) this.emitEvent({ kind: 'output', text: this.pending.slice(0, at) });
      this.cwd = this.pending.slice(at + MARK.length, end).replace(/\r$/, '');
      this.pending = this.pending.slice(end + 1);
      this.busy = false;
      this.emitEvent({ kind: 'done', cwd: this.cwd });
    }
  }
  private emitEvent(e: TerminalEvent) {
    this.backlog.push(e);
    if (this.backlog.length > 2000) this.backlog.splice(0, this.backlog.length - 2000);
    this.emit('event', e);
  }
  run(line: string) {
    if (this.proc.exitCode !== null) this.start();
    this.busy = true;
    this.proc.stdin.write(`${line}\n`);
    this.mark();
  }
  /** Ctrl+C: stops the running command (and everything it started); the shell starts again in the same folder. */
  interrupt() {
    if (!this.busy) return;
    this.kill();
    this.emitEvent({ kind: 'output', text: '^C\n' });
    this.start();
  }
  kill() {
    const pid = this.proc.pid;
    this.proc.removeAllListeners('exit');
    if (windows && pid) spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    else this.proc.kill('SIGKILL');
    this.busy = false;
  }
}

const sessions = new Map<string, Session>();
export function startTerminal(cwd: string) {
  if (sessions.size >= 8) { const [first] = sessions.values(); first.kill(); sessions.delete(first.id); }
  const s = new Session(randomUUID(), cwd);
  sessions.set(s.id, s);
  return { id: s.id, cwd: s.cwd, shell: windows ? 'PowerShell' : 'sh' };
}
export const terminal = (id: string) => sessions.get(id);
export function stopTerminal(id: string) { const s = sessions.get(id); if (s) { s.kill(); sessions.delete(id); } }
/**
 * A page that closes without stopping its terminal (closed tab, reload, crash) leaves no one listening: stop the shell
 * once nobody has reconnected for a while, so it does not keep running (and holding its folder) in the background.
 */
export function releaseWhenUnused(id: string, ms = 15_000) {
  setTimeout(() => { const s = sessions.get(id); if (s && s.listenerCount('event') === 0) stopTerminal(id); }, ms).unref();
}
export function stopAllTerminals() { for (const s of sessions.values()) s.kill(); sessions.clear(); }
process.once('exit', stopAllTerminals);
