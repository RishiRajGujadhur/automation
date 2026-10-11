import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

/** Minimal Debug Adapter Protocol client (Content-Length framed JSON over stdio), used to drive netcoredbg. */
export class DapClient extends EventEmitter {
  private proc: ChildProcess;
  private seq = 1;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; command: string }>();

  constructor(exe: string, args: string[] = ['--interpreter=vscode']) {
    super();
    this.proc = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc.stdout!.on('data', (d: Buffer) => this.read(d));
    this.proc.stderr!.on('data', (d: Buffer) => this.emit('stderr', d.toString()));
    this.proc.on('exit', (code) => {
      for (const p of this.pending.values()) p.reject(new Error(`Debugger exited (${code}) during ${p.command}`));
      this.pending.clear();
      this.emit('exit', code);
    });
    this.proc.on('error', (e) => this.emit('error', e));
  }

  private read(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);
    for (;;) {
      const head = this.buffer.indexOf('\r\n\r\n');
      if (head < 0) return;
      const length = Number(/Content-Length: *(\d+)/i.exec(this.buffer.subarray(0, head).toString())?.[1]);
      if (!Number.isFinite(length) || this.buffer.length < head + 4 + length) return;
      const body = this.buffer.subarray(head + 4, head + 4 + length).toString('utf8');
      this.buffer = this.buffer.subarray(head + 4 + length);
      let msg: any;
      try { msg = JSON.parse(body); } catch { continue; }
      if (msg.type === 'response') {
        const p = this.pending.get(msg.request_seq);
        if (!p) continue;
        this.pending.delete(msg.request_seq);
        if (msg.success) p.resolve(msg.body ?? {});
        else p.reject(new Error(msg.message || `${p.command} failed`));
      } else if (msg.type === 'event') this.emit('event', msg.event, msg.body ?? {});
    }
  }

  request<T = any>(command: string, args?: unknown, timeout = 30_000): Promise<T> {
    const seq = this.seq++;
    const json = JSON.stringify({ seq, type: 'request', command, arguments: args });
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(seq); reject(new Error(`Debugger did not answer ${command}`)); }, timeout);
      this.pending.set(seq, { command, resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.proc.stdin!.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
    });
  }

  kill() { if (this.proc.exitCode === null) this.proc.kill(); }
}
