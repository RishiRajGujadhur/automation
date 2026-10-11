import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiCall, startApi } from './server';
import { devIcon, preloadPath } from './paths';
import { initialBounds, trackWindowState } from './windowState';
import { read, write } from './store';
import { ctx } from './context';
import { buildMenu } from './menu';
import { lockDown, registerIpc } from './ipc';
import { currentConfig, openRepository, updateTitle } from './workspace';
import { stopWatching, watchRepository } from './watcher';
import { commandArg, registerTasks, runCommand } from './tasks';
import { offerChromium } from './browsers';

// D3: one instance; a second launch focuses the existing window (and opens a folder passed on the command line).
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  const win = ctx.win;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  const folder = folderArg(argv.slice(1));
  if (folder) openRepository(folder).then(buildMenu).catch(() => {});
  const command = commandArg(argv);
  if (command) runCommand(command);
});
/** A directory given as a command-line argument (also how the Windows jump list reopens repositories). */
const folderArg = (argv: string[]) => argv.find((a) => !a.startsWith('-') && a !== '.' && path.resolve(a) !== path.resolve(app.getAppPath()) && fs.existsSync(a) && fs.statSync(a).isDirectory());

const loadingPage = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TestAuthoring Studio</title><style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0e16;color:#9aa4bb;font:15px system-ui,sans-serif}
b{color:#aa94ff;font-weight:600}.bar{width:180px;height:3px;margin:14px auto 0;background:#252c3e;overflow:hidden;border-radius:2px}
.bar i{display:block;width:40%;height:100%;background:#aa94ff;animation:s 1.1s infinite ease-in-out}@keyframes s{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){.bar i{animation:none;width:100%}}</style></head>
<body><div><div><b>TestAuthoring</b> Studio</div><div class="bar" role="progressbar" aria-label="Starting"><i></i></div></div></body></html>`)}`;

function createWindow() {
  const bounds = initialBounds();
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0e16',
    title: 'TestAuthoring Studio',
    icon: devIcon() && fs.existsSync(devIcon()!) ? devIcon() : undefined,
    webPreferences: { preload: preloadPath(), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  ctx.win = win;
  if (bounds.maximized) win.maximize();
  trackWindowState(win);
  lockDown(win);
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { if (ctx.win === win) ctx.win = undefined; });
  // Q1: zoom persists across launches.
  win.webContents.on('did-finish-load', () => { const z = read().zoom; if (z) win.webContents.setZoomLevel(z); });
  win.webContents.on('zoom-changed', () => setTimeout(() => write({ zoom: win.webContents.getZoomLevel() }), 0));
  // Q5: window title = page — repository — app.
  win.on('page-title-updated', (e) => { e.preventDefault(); updateTitle(); });
  // D12: dropping a folder makes the page try to navigate to file://…; open it as the repository instead.
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) return;
    e.preventDefault();
    try {
      const p = fileURLToPath(url);
      if (fs.statSync(p).isDirectory()) openRepository(p).then(buildMenu).catch((err) => dialog.showErrorBox('Could not open the repository', (err as Error).message));
    } catch { /* not a local folder */ }
  });
  return win;
}

async function boot() {
  registerIpc();
  const win = createWindow();
  await win.loadURL(loadingPage);
  try {
    ({ origin: ctx.origin } = await startApi());
    await currentConfig().catch(() => undefined);
    buildMenu();
    const folder = folderArg(process.argv.slice(1));
    if (folder) await openRepository(folder).catch(() => undefined);
    await win.loadURL(`${ctx.origin}/#/dashboard`);
    updateTitle();
    watchRepository();
    registerTasks();
    const command = commandArg(process.argv);
    if (command) setTimeout(() => runCommand(command), 800); // let the page subscribe to menu commands first
    offerChromium();
  } catch (e) {
    dialog.showErrorBox('TestAuthoring Studio could not start', (e as Error).message);
    app.quit();
  }
}

app.whenReady().then(boot);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length && ctx.origin) createWindow().loadURL(ctx.origin); });
// Q7: stop a running Playwright recording so its browser does not outlive the app.
let quitting = false;
app.on('before-quit', (e) => {
  if (quitting || !ctx.origin) return;
  e.preventDefault();
  quitting = true;
  stopWatching();
  Promise.race([apiCall(ctx.origin, '/recording/stop', {}).catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]).finally(() => app.quit());
});
