import { app, BrowserWindow, dialog } from 'electron';
import { startApi } from './server';
import { preloadPath } from './paths';
import { initialBounds, trackWindowState } from './windowState';
import { read, write } from './store';

let win: BrowserWindow | undefined;
let origin = '';

// D3: one instance; a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

const loadingPage = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>TestAuthoring Studio</title><style>
body{margin:0;height:100vh;display:grid;place-items:center;background:#0b0e16;color:#9aa4bb;font:15px system-ui,sans-serif}
b{color:#aa94ff;font-weight:600}.bar{width:180px;height:3px;margin:14px auto 0;background:#252c3e;overflow:hidden;border-radius:2px}
.bar i{display:block;width:40%;height:100%;background:#aa94ff;animation:s 1.1s infinite ease-in-out}@keyframes s{from{transform:translateX(-100%)}to{transform:translateX(250%)}}
@media (prefers-reduced-motion:reduce){.bar i{animation:none;width:100%}}</style></head>
<body><div><div><b>TestAuthoring</b> Studio</div><div class="bar" role="progressbar" aria-label="Starting"><i></i></div></div></body></html>`)}`;

function createWindow() {
  const bounds = initialBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0e16',
    title: 'TestAuthoring Studio',
    autoHideMenuBar: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  if (bounds.maximized) win.maximize();
  trackWindowState(win);
  win.once('ready-to-show', () => win?.show());
  win.on('closed', () => { win = undefined; });
  const zoom = read().zoom;
  win.webContents.on('did-finish-load', () => { if (zoom) win?.webContents.setZoomLevel(zoom); });
  win.webContents.on('zoom-changed', () => write({ zoom: win?.webContents.getZoomLevel() }));
  return win;
}

async function boot() {
  const w = createWindow();
  await w.loadURL(loadingPage);
  try {
    ({ origin } = await startApi());
    await w.loadURL(`${origin}/#/dashboard`);
  } catch (e) {
    dialog.showErrorBox('TestAuthoring Studio could not start', (e as Error).message);
    app.quit();
  }
}

app.whenReady().then(boot);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length && origin) createWindow().loadURL(origin); });
export const appOrigin = () => origin;
export const mainWindow = () => win;
