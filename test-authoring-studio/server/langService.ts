import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import { extraRootsOf } from './core.js';
import { existsSync, statSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { dotnet, projectRoot } from './core.js';

const dll = path.join(projectRoot, 'langserver/bin/Release/net10.0/LangServer.dll');
// The desktop app ships a self-contained build (STUDIO_LANGSERVER_EXE): no .NET install needed for IntelliSense.
// In development the build output is run from a shadow copy, so `npm run langserver:build` never fails on a locked
// DLL; a new build gets a new copy, used from the next start.
function shadowDll() {
  const dir = path.join(os.tmpdir(), 'tas-langserver', String(Math.round(statSync(dll).mtimeMs)));
  if (!existsSync(path.join(dir, 'LangServer.dll'))) cpSync(path.dirname(dll), dir, { recursive: true });
  return path.join(dir, 'LangServer.dll');
}
const command = (): [string, string[]] => (process.env.STUDIO_LANGSERVER_EXE ? [process.env.STUDIO_LANGSERVER_EXE, []] : [dotnet, [shadowDll()]]);
export const langServerAvailable = () => !!process.env.STUDIO_LANGSERVER_EXE || existsSync(dll);

export type Loc = { file: string; line: number; column: number; endLine?: number; endColumn?: number };

/**
 * Roslyn language service (langserver/): IntelliSense, quick info, go to definition, find references, rename
 * and organize usings over the whole repository. One long-running process per repository; requests are JSON lines.
 */
export class LanguageService {
  private proc?: ChildProcess;
  private root = '';
  private seq = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private ready?: Promise<unknown>;

  private start(root: string) {
    this.stop();
    // Each process has its own pending map: a replaced process exiting must not fail the new one's requests.
    const pending = (this.pending = new Map());
    if (!langServerAvailable()) throw new Error('The C# language service is not built. Run: npm run langserver:build');
    const [exe, args] = command();
    const proc = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc = proc;
    this.root = root;
    createInterface({ input: proc.stdout! }).on('line', (line) => {
      let msg: { id: number; result?: unknown; error?: string };
      try { msg = JSON.parse(line); } catch { return; }
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
    });
    proc.stderr!.on('data', () => {});
    proc.on('exit', () => {
      for (const p of pending.values()) p.reject(new Error('The C# language service stopped.'));
      pending.clear();
      if (this.proc === proc) { this.proc = undefined; this.ready = undefined; }
    });
    // Solution projects outside the folder are part of the workspace (see core.updateExtraRoots).
    this.ready = fs.realpath(root).catch(() => root).then((real) => this.send({ op: 'init', root, extra: extraRootsOf(real) }, 120_000));
  }
  private send<T>(body: Record<string, unknown>, timeout = 30_000): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`The C# language service did not answer (${body.op}).`)); }, timeout);
      this.pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.proc!.stdin!.write(`${JSON.stringify({ id, ...body })}\n`);
    });
  }
  /** Sends a request for a repository, starting (or restarting for another repository) the process first. */
  async request<T>(root: string, body: Record<string, unknown>, timeout?: number): Promise<T> {
    if (!this.proc || this.root !== root) this.start(root);
    await this.ready;
    return this.send<T>(body, timeout);
  }
  /** Files changed on disk (saved, renamed, deleted): re-read them if the service is running for this repository. */
  notify(root: string, files: string[]) { if (this.proc && this.root === root && files.length) void this.ready?.then(() => this.send({ op: 'update', files })).catch(() => {}); }
  /** Starts the service for a repository ahead of the first request (opening a workspace), so editors find it ready. */
  warm(root: string) { try { if (langServerAvailable() && (!this.proc || this.root !== root)) { this.start(root); this.ready?.catch(() => {}); } } catch { /* not built */ } }
  stop() { this.proc?.kill(); this.proc = undefined; this.ready = undefined; }
}
