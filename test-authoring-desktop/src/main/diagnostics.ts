import { app, clipboard, dialog, shell, systemPreferences, nativeTheme } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ctx } from './context';
import { dataRoot, logFile, resourcesRoot } from './paths';
import { IPC } from '../shared/bridge';
import { read, write } from './store';

function folderSize(dir: string, depth = 0): number {
  if (depth > 6) return 0;
  let total = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      total += e.isDirectory() ? folderSize(p, depth + 1) : (() => { try { return fs.statSync(p).size; } catch { return 0; } })();
    }
  } catch { /* unreadable */ }
  return total;
}
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function diagnosticsText() {
  const v = process.versions;
  return [
    `TestAuthoring Studio ${app.getVersion()} (${app.isPackaged ? 'packaged' : 'development'})`,
    `Electron ${v.electron} · Chromium ${v.chrome} · Node.js ${v.node} · V8 ${v.v8}`,
    `OS ${os.type()} ${os.release()} ${os.arch()} · ${os.cpus()[0]?.model ?? 'CPU'} × ${os.cpus().length}`,
    `Memory ${mb(os.freemem())} free of ${mb(os.totalmem())} · app ${mb(process.memoryUsage().rss)} RSS`,
    `API ${ctx.origin}`,
    `Repository ${ctx.repository ?? '–'}`,
    `Data ${dataRoot()} (${mb(folderSize(dataRoot()))})`,
    `Resources ${resourcesRoot()}`,
    `Log ${logFile()}`,
    `Scanner ${process.env.STUDIO_SCANNER_EXE ?? process.env.DOTNET_PATH ?? 'dotnet on PATH'}`,
  ].join('\n');
}
/** H1 */ export function systemInfo() { if (ctx.win) dialog.showMessageBox(ctx.win, { type: 'info', title: 'System information', message: 'System information', detail: diagnosticsText(), buttons: ['Copy', 'Close'], cancelId: 1 }).then((r) => { if (r.response === 0) clipboard.writeText(diagnosticsText()); }); }
/** H2 */ export function copyDiagnostics() { clipboard.writeText(diagnosticsText()); }
/** H3 */ export async function checkHealth() {
  const t0 = Date.now();
  let msg: string;
  try { const r = await fetch(`${ctx.origin}/api/health`); const j = (await r.json()) as { scannedAt?: string }; msg = `The local API answered in ${Date.now() - t0} ms.\nLast scan: ${j.scannedAt ?? 'not yet'}`; } catch (e) { msg = `The local API did not answer: ${(e as Error).message}`; }
  if (ctx.win) dialog.showMessageBox(ctx.win, { type: 'info', title: 'API health', message: 'API health', detail: msg });
}
/** H4 */ export function reportIssue() {
  const body = `**What happened**\n\n\n**Steps to reproduce**\n1. \n\n**Environment**\n\`\`\`\n${diagnosticsText().split('\n').filter((l) => !/^(Data|Resources|Log|Repository) /.test(l)).join('\n')}\n\`\`\``;
  shell.openExternal(`https://github.com/RishiRajGujadhur/automation/issues/new?title=${encodeURIComponent('[Desktop] ')}&body=${encodeURIComponent(body)}`);
}
/** H5 */ export function crashFolder() { const d = app.getPath('crashDumps'); fs.mkdirSync(d, { recursive: true }); shell.openPath(d); }

/** Studio accent ids and their strong tones (src/accents.ts in the studio). */
const accents: [string, string][] = [['violet', '#6a46d8'], ['indigo', '#4338ca'], ['blue', '#2160c4'], ['cyan', '#0e6f86'], ['teal', '#0b7268'], ['green', '#15763b'], ['amber', '#8a5a00'], ['orange', '#b33c0a'], ['rose', '#be123c'], ['pink', '#b0185a'], ['slate', '#475569']];
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
/** Nearest accent by RGB distance. */
export function nearestAccent(hex: string) {
  const [r, g, b] = rgb('#' + hex.replace(/^#/, '').slice(0, 6));
  return accents.map(([id, h]) => { const [x, y, z] = rgb(h); return { id, d: (r - x) ** 2 + (g - y) ** 2 + (b - z) ** 2 }; }).sort((a, b) => a.d - b.d)[0].id;
}
/** H6–H8: on the very first launch, carry the OS theme, contrast and accent over into the studio. */
export function firstRunDefaults() {
  if (read().firstRunDone || !ctx.win) return;
  write({ firstRunDone: true });
  const patch: Record<string, string> = {};
  if (!nativeTheme.shouldUseDarkColors) patch.theme = 'light';
  if (nativeTheme.shouldUseHighContrastColors) patch.contrast = 'high';
  try { if (process.platform === 'win32' || process.platform === 'darwin') patch.accent = nearestAccent(systemPreferences.getAccentColor()); } catch { /* unsupported */ }
  if (Object.keys(patch).length) ctx.win.webContents.send(IPC.menu, 'set-pref', patch);
}
