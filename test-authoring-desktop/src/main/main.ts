import { app, BrowserWindow, crashReporter, dialog, globalShortcut, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiCall, startApi } from './server';
import { devIcon, logFile, preloadPath } from './paths';
import { initialBounds, trackWindowState } from './windowState';
import { read, write } from './store';
import { ctx } from './context';
import { applyGlobalShortcut, buildMenu, navigateBack, navigateForward, rescan, zoomToast } from './menu';
import { lockDown, registerIpc } from './ipc';
import { currentConfig, openRepository, pickAndOpenRepository, updateTitle } from './workspace';
import { stopWatching, watchRepository } from './watcher';
import { commandArg, registerTasks, runCommand } from './tasks';
import { offerChromium } from './browsers';
import { attachContextMenu } from './contextMenu';
import { linkArg, parseLink, registerProtocol } from './protocol';
import { createTray, destroyTray, trayHint } from './tray';
import { startStatus, stopStatus } from './status';
import { firstRunDefaults } from './diagnostics';
import { rotateLog } from './settingsIO';

// H5: local crash dumps only, never uploaded.
crashReporter.start({ uploadToServer: false });
// S2: must be decided before the app is ready.
if (read().hardwareAcceleration === false) app.disableHardwareAcceleration();
// S9
rotateLog(logFile());

// D3: one instance; a second launch focuses the existing window and hands over its folder / command / deep link.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (_e, argv) => {
  const win = ctx.win;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  handleArgs(argv, false);
});
app.on('open-url', (e, url) => { e.preventDefault(); handleLink(url); }); // macOS deep links
/** A directory given as a command-line argument (also how the Windows jump list reopens repositories). */
const folderArg = (argv: string[]) => argv.find((a) => !a.startsWith('-') && a !== '.' && !a.includes('://') && path.resolve(a) !== path.resolve(app.getAppPath()) && fs.existsSync(a) && fs.statSync(a).isDirectory());

const failOpen = (e: unknown) => dialog.showErrorBox('Could not open the repository', (e as Error).message);
function handleLink(raw: string) {
  const link = parseLink(raw);
  if (!link) return;
  if (link.kind === 'open') openRepository(link.folder).then(buildMenu).catch(failOpen); // L2
  else ctx.win?.webContents.executeJavaScript(`location.hash = ${JSON.stringify(link.hash)}`).catch(() => {}); // L3
}
function handleArgs(argv: string[], coldStart: boolean) {
  const link = linkArg(argv);
  if (link) { coldStart ? setTimeout(() => handleLink(link), 800) : handleLink(link); return; } // L4
  const folder = folderArg(argv.slice(1));
  if (folder && !coldStart) openRepository(folder).then(buildMenu).catch(() => {});
  const command = commandArg(argv);
  if (command) coldStart ? setTimeout(() => runCommand(command), 800) : runCommand(command);
}

/* ------------------------------------------------------------------ loading and failure pages (N5–N7) */
const page = (body: string, script = '') => `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TestAuthoring Studio</title><style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0e16;color:#9aa4bb;font:15px system-ui,sans-serif;text-align:center}
b{color:#aa94ff;font-weight:600}.bar{width:180px;height:3px;margin:14px auto 0;background:#252c3e;overflow:hidden;border-radius:2px}
.bar i{display:block;width:40%;height:100%;background:#aa94ff;animation:s 1.1s infinite ease-in-out}@keyframes s{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
#stage{margin-top:12px;font-size:13px}#hint{margin-top:6px;font-size:12px;opacity:0;transition:opacity .4s}pre{max-width:640px;white-space:pre-wrap;text-align:left;color:#e5e8f1;background:#121722;padding:12px;border-radius:8px}
button{font:inherit;margin:4px;padding:6px 14px;border-radius:6px;border:1px solid #3a4258;background:#1a2030;color:#e5e8f1;cursor:pointer}button:first-of-type{background:#6a46d8;border-color:#6a46d8}
@media (prefers-reduced-motion:reduce){.bar i{animation:none;width:100%}}</style></head><body>${body}${script}</body></html>`)}`;
const loadingPage = page(
  `<div><div><b>TestAuthoring</b> Studio</div><div class="bar" role="progressbar" aria-label="Starting"><i></i></div><div id="stage" role="status">Starting…</div><div id="hint">Large repositories take longer to index the first time.</div></div>`,
  `<script>setTimeout(()=>{document.getElementById('hint').style.opacity=1},8000)</script>`,
);
const setStage = (text: string) => ctx.win?.webContents.executeJavaScript(`{const s=document.getElementById('stage'); if(s) s.textContent=${JSON.stringify(text)}}`).catch(() => {});
const failurePage = (message: string) => page(
  `<div><div><b>TestAuthoring</b> Studio could not start</div><pre>${message.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;'))}</pre><div><button onclick="location.hash='retry'">Retry</button><button onclick="location.hash='log'">Open log</button><button onclick="location.hash='quit'">Quit</button></div></div>`,
);

/* ------------------------------------------------------------------ windows */
function createWindow(primary = true) {
  const s = read();
  const bounds = primary ? initialBounds() : { width: 1280, height: 860, maximized: false };
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0e16',
    title: 'TestAuthoring Studio',
    icon: devIcon() && fs.existsSync(devIcon()!) ? devIcon() : undefined,
    alwaysOnTop: !!s.alwaysOnTop, // W3
    autoHideMenuBar: !!s.autoHideMenu, // W4
    fullscreen: primary && !!s.fullscreen, // W5
    webPreferences: { preload: preloadPath(), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: s.spellcheck !== false },
  });
  if (primary) { ctx.win = win; trackWindowState(win); }
  if (bounds.maximized) win.maximize();
  lockDown(win);
  attachContextMenu(win);
  win.once('ready-to-show', () => win.show());
  win.on('focus', () => { ctx.win = win; updateTitle(); });
  win.on('closed', () => { if (ctx.win === win) ctx.win = BrowserWindow.getAllWindows().find((w) => w !== win); });
  // Q1 + W6: zoom persists and is announced.
  win.webContents.on('did-finish-load', () => { const z = read().zoom; if (z) win.webContents.setZoomLevel(z); });
  win.webContents.on('zoom-changed', () => setTimeout(() => { write({ zoom: win.webContents.getZoomLevel() }); zoomToast(); }, 0));
  // Q5: window title = page — repository — app.
  win.on('page-title-updated', (e) => { e.preventDefault(); updateTitle(); });
  // W1/W2: remember the page per repository.
  win.webContents.on('did-navigate-in-page', (_e, url) => {
    const hash = new URL(url).hash;
    if (ctx.repository && hash.startsWith('#/')) write({ lastPage: { ...(read().lastPage ?? {}), [ctx.repository.toLowerCase()]: hash } });
  });
  // W5
  win.on('enter-full-screen', () => primary && write({ fullscreen: true }));
  win.on('leave-full-screen', () => primary && write({ fullscreen: false }));
  // K3: Esc leaves full screen; K7: mouse back/forward buttons.
  win.webContents.on('before-input-event', (_e, input) => { if (input.type === 'keyDown' && input.key === 'Escape' && win.isFullScreen()) win.setFullScreen(false); });
  win.on('app-command', (_e, cmd) => { if (cmd === 'browser-backward') navigateBack(); if (cmd === 'browser-forward') navigateForward(); });
  // T4 / T5
  win.on('minimize', () => { if (primary && read().minimizeToTray) { win.hide(); trayHint(); } });
  win.on('close', (e) => { if (primary && read().closeToTray && !ctx.quitting) { e.preventDefault(); win.hide(); trayHint(); } });
  // N8 / N9: crashed or hung page.
  win.webContents.on('render-process-gone', async (_e, d) => {
    if (d.reason === 'clean-exit') return;
    const r = await dialog.showMessageBox(win, { type: 'error', buttons: ['Reload', 'Close window'], message: 'The page stopped unexpectedly', detail: `Reason: ${d.reason}. Your repository files are safe; unsaved edits in the editor may be lost.` });
    if (r.response === 0) win.webContents.reload(); else win.close();
  });
  win.on('unresponsive', async () => {
    const r = await dialog.showMessageBox(win, { type: 'warning', buttons: ['Wait', 'Reload'], message: 'TestAuthoring Studio is not responding', detail: 'A long operation may still be running.' });
    if (r.response === 1) win.webContents.forcefullyCrashRenderer(), win.webContents.reload();
  });
  // Ask before closing with unsaved editor changes (the studio sets beforeunload).
  win.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(win, { type: 'question', buttons: ['Leave', 'Stay'], defaultId: 1, cancelId: 1, message: 'Discard unsaved changes?', detail: 'The feature editor has edits that have not been saved.' });
    if (choice === 0) e.preventDefault();
  });
  win.webContents.session.setSpellCheckerEnabled(s.spellcheck !== false);
  return win;
}
ctx.newWindow = () => { if (ctx.origin) createWindow(false).loadURL(`${ctx.origin}/#/dashboard`); };

const startPage = () => {
  const saved = ctx.repository ? read().lastPage?.[ctx.repository.toLowerCase()] : undefined;
  return saved && /^#\/[\w/-]+$/.test(saved) ? saved : '#/dashboard';
};

async function boot() {
  registerIpc();
  registerProtocol();
  const win = createWindow();
  await win.loadURL(loadingPage);
  try {
    setStage('Starting the local API…');
    ({ origin: ctx.origin } = await startApi());
    setStage('Indexing the repository…');
    await currentConfig().catch(() => undefined);
    const folder = folderArg(process.argv.slice(1));
    if (folder) await openRepository(folder, { reload: false }).catch(() => undefined);
    buildMenu();
    await win.loadURL(`${ctx.origin}/${startPage()}`);
    updateTitle();
    watchRepository();
    registerTasks();
    applyGlobalShortcut();
    createTray({ openRepository: () => pickAndOpenRepository().then(buildMenu), openRecent: (f) => openRepository(f).then(buildMenu).catch(failOpen), rescan: () => rescan() });
    startStatus();
    firstRunDefaults();
    handleArgs(process.argv, true);
    offerChromium();
  } catch (e) {
    showFailure(win, (e as Error).message);
  }
}
/** N7: retry, open the log or quit instead of a dead end. */
function showFailure(win: BrowserWindow, message: string) {
  win.loadURL(failurePage(message));
  const onHash = (_e: unknown, url: string) => {
    const action = new URL(url).hash.slice(1);
    if (action === 'retry') { win.webContents.off('did-navigate-in-page', onHash); app.relaunch(); app.exit(0); }
    if (action === 'log') shell.openPath(logFile());
    if (action === 'quit') { ctx.quitting = true; app.quit(); }
  };
  win.webContents.on('did-navigate-in-page', onHash);
}

app.whenReady().then(boot);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length && ctx.origin) createWindow().loadURL(ctx.origin); });
// Q7: stop a running Playwright recording so its browser does not outlive the app.
let quitting = false;
app.on('before-quit', (e) => {
  ctx.quitting = true;
  if (quitting || !ctx.origin) return;
  e.preventDefault();
  quitting = true;
  stopWatching();
  stopStatus();
  globalShortcut.unregisterAll();
  destroyTray();
  Promise.race([apiCall(ctx.origin, '/recording/stop', {}).catch(() => undefined), new Promise((r) => setTimeout(r, 1500))]).finally(() => app.quit());
});
