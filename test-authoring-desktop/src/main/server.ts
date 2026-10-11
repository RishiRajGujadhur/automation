import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { dataRoot, logFile, resourcesRoot } from './paths';
import { read, write } from './store';

export const DESKTOP_PORT = 47310;

/** A free loopback port (falls back to the OS choice when the preferred one is taken). */
export function freePort(preferred = 0): Promise<number> {
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
  // Its own stable port (browser storage is per origin, so a changing port would forget preferences). Not 4310: that is the
  // web app's dev API, and Windows lets two servers share a port silently. Falls back to a free port when taken.
  const preferred = Number(process.env.STUDIO_API_PORT) || read().apiPort || DESKTOP_PORT;
  const port = await freePort(preferred);
  if (port !== read().apiPort) write({ apiPort: port });
  process.env.STUDIO_API_PORT = String(port);
  process.env.STUDIO_WEB_PORT = String(port); // UI and API share one origin in the desktop app
  process.env.STUDIO_ROOT = resourcesRoot();
  process.env.STUDIO_DATA = dataRoot();
  // Prefer the bundled self-contained scanner: indexing then works without any .NET install.
  const rid = process.platform === 'win32' ? 'win-x64' : process.platform === 'darwin' ? 'osx-arm64' : 'linux-x64';
  const bundled = path.join(resourcesRoot(), 'scanner', rid, process.platform === 'win32' ? 'Scanner.exe' : 'Scanner');
  if (!process.env.STUDIO_SCANNER_EXE && fs.existsSync(bundled)) process.env.STUDIO_SCANNER_EXE = bundled;
  const langExe = path.join(resourcesRoot(), 'langserver', rid, process.platform === 'win32' ? 'LangServer.exe' : 'LangServer');
  if (!process.env.STUDIO_LANGSERVER_EXE && fs.existsSync(langExe)) process.env.STUDIO_LANGSERVER_EXE = langExe;
  const debuggerExe = path.join(resourcesRoot(), 'netcoredbg', process.platform === 'win32' ? 'netcoredbg.exe' : 'netcoredbg');
  if (!process.env.STUDIO_NETCOREDBG && fs.existsSync(debuggerExe)) process.env.STUDIO_NETCOREDBG = debuggerExe;
  // The studio looks for a local SDK at <root>/../.tools; in the desktop app <root> moved, so look in the usual places.
  if (!process.env.DOTNET_PATH) {
    const exe = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
    const candidates = [
      path.resolve(resourcesRoot(), '../../.tools/dotnet', exe), // F:\Development\Automation\.tools during development
      path.resolve(resourcesRoot(), '../.tools/dotnet', exe),
      path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dotnet', exe),
    ];
    const found = candidates.find((c) => fs.existsSync(c));
    if (found) process.env.DOTNET_PATH = found;
  }
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
