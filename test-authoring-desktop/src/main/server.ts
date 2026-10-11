import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataRoot, logFile, resourcesRoot } from './paths';

/** A free loopback port (falls back to the OS choice when the preferred one is taken). */
export function freePort(preferred = 4310): Promise<number> {
  const tryPort = (p: number) => new Promise<number>((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(p, '127.0.0.1', () => { const port = (s.address() as net.AddressInfo).port; s.close(() => resolve(port)); });
  });
  return tryPort(preferred).catch(() => tryPort(0));
}

/** Mirrors console output of the in-process API into <logs>/studio.log (Q3). */
function teeLogs() {
  fs.mkdirSync(path.dirname(logFile()), { recursive: true });
  const out = fs.createWriteStream(logFile(), { flags: 'a' });
  out.write(`\n--- ${new Date().toISOString()} ---\n`);
  for (const level of ['log', 'warn', 'error'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => { out.write(`[${level}] ${args.map(String).join(' ')}\n`); orig(...args); };
  }
}

/**
 * Starts the studio's Express API inside this process. The studio reads its ports and roots from the
 * environment at import time, so everything is set before the dynamic import.
 */
export async function startApi(): Promise<{ origin: string; port: number }> {
  teeLogs();
  const port = await freePort(Number(process.env.STUDIO_API_PORT) || 4310);
  process.env.STUDIO_API_PORT = String(port);
  process.env.STUDIO_WEB_PORT = String(port); // UI and API share one origin in the desktop app
  process.env.STUDIO_ROOT = resourcesRoot();
  process.env.STUDIO_DATA = dataRoot();
  const entry = path.join(resourcesRoot(), 'server/index.mjs');
  if (!fs.existsSync(entry)) throw new Error(`The bundled API is missing (${entry}). Run "npm run build".`);
  await import(pathToFileURL(entry).href);
  const origin = `http://127.0.0.1:${port}`;
  await waitForHealth(origin);
  return { origin, port };
}

export async function waitForHealth(origin: string, timeoutMs = 20_000) {
  const until = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < until) {
    try { const r = await fetch(`${origin}/api/health`); if (r.ok) return; } catch (e) { last = e; }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`The local API did not start: ${(last as Error)?.message ?? 'timeout'}`);
}

/** Calls the in-process API (used by native menu actions). */
export async function apiCall<T = unknown>(origin: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(`${origin}/api${url}`, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Request failed (${r.status})`);
  return data as T;
}
