import { app, dialog } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ctx } from './context';
import { resourcesRoot } from './paths';
import { read, write } from './store';
import { notify } from './notify';

/** Playwright as bundled beside the API (resources/studio/node_modules). */
const playwrightDir = () => path.join(resourcesRoot(), 'node_modules/playwright');

/** D20: whether the Chromium build Playwright expects is installed in the user's cache. */
export function chromiumInstalled() {
  try {
    const pw = createRequire(path.join(resourcesRoot(), 'server/index.mjs'))('playwright') as { chromium: { executablePath(): string } };
    return fs.existsSync(pw.chromium.executablePath());
  } catch {
    return false;
  }
}

let installing = false;
/** Runs `playwright install chromium` with Electron's bundled Node, showing taskbar progress. */
export function installChromium(): Promise<boolean> {
  if (installing) return Promise.resolve(false);
  installing = true;
  const cli = path.join(playwrightDir(), 'cli.js');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, 'install', 'chromium'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true });
    let log = '';
    const onData = (d: Buffer) => {
      const s = d.toString();
      log = (log + s).slice(-4000);
      const pct = [...s.matchAll(/(\d{1,3})%/g)].pop();
      ctx.win?.setProgressBar(pct ? Number(pct[1]) / 100 : 2);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (e) => { log += e.message; });
    child.on('close', (code) => {
      installing = false;
      ctx.win?.setProgressBar(-1);
      const ok = code === 0;
      const title = ok ? 'Playwright Chromium installed' : 'Playwright install failed';
      const body = ok ? 'Recording and browser verification are ready.' : 'See Help → Open Log File.';
      write({ lastBrowserInstall: { ok, completedAt: new Date().toISOString(), message: `${title}. ${body}` } });
      notify(title, body, { always: true });
      if (!ok) console.error('playwright install chromium failed:\n' + log);
      resolve(ok);
    });
  });
}

/** Offers the install once when Chromium is missing (skipped in automated tests). */
export async function offerChromium() {
  if (process.env.TAS_TEST || chromiumInstalled() || read().chromiumOffered || !ctx.win) return;
  write({ chromiumOffered: true });
  const r = await dialog.showMessageBox(ctx.win, {
    type: 'question', buttons: ['Install now', 'Later'], defaultId: 0, cancelId: 1, title: 'Playwright browser',
    message: 'Install Playwright Chromium?',
    detail: 'The recorder and browser selector verification need Playwright’s Chromium (about 150 MB, downloaded once into your user cache). You can install it later from Help.',
  });
  if (r.response === 0) installChromium();
}

/** Help → Playwright Browsers. */
export async function browsersMenu() {
  if (!ctx.win) return;
  const installed = chromiumInstalled();
  const last = read().lastBrowserInstall;
  const r = await dialog.showMessageBox(ctx.win, {
    type: 'info', title: 'Playwright browsers', buttons: installed ? ['Reinstall', 'Close'] : ['Install Chromium', 'Close'], defaultId: installed ? 1 : 0, cancelId: 1,
    message: installed ? 'Playwright Chromium is installed.' : 'Playwright Chromium is not installed.',
    detail: `Used by the recorder and selector verification. Playwright ${app.isPackaged ? '(bundled)' : '(development)'}.${last ? `\n\nLast installation (${new Date(last.completedAt).toLocaleString()}):\n${last.message}` : ''}`,
  });
  if (r.response === 0) installChromium();
}
