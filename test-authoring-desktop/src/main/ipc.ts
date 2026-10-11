import { BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { ctx } from './context';
import { IPC } from '../shared/bridge';
import fs from 'node:fs';
import { openRepository, repositoryFile } from './workspace';
import { buildMenu } from './menu';
import { notify } from './notify';
import { openInPreferredEditor } from './tools';

/** Only the app's own page, loaded from the in-process API origin, may call privileged handlers. */
function trusted(e: IpcMainEvent | IpcMainInvokeEvent) {
  const url = e.senderFrame?.url ?? '';
  return !!ctx.origin && (url === ctx.origin || url.startsWith(ctx.origin + '/'));
}
const guard = <A extends unknown[], R>(fn: (e: IpcMainInvokeEvent, ...a: A) => R) => (e: IpcMainInvokeEvent, ...a: A) => {
  if (!trusted(e)) throw new Error('Untrusted sender.');
  return fn(e, ...a);
};
const safeUrl = (u: string) => { try { const p = new URL(u); return ['https:', 'http:', 'mailto:'].includes(p.protocol); } catch { return false; } };

export function registerIpc() {
  ipcMain.handle(IPC.pickFolder, guard(async (e, title?: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    const r = await (win ? dialog.showOpenDialog(win, { title: String(title ?? 'Choose a folder'), properties: ['openDirectory'], defaultPath: ctx.repository }) : dialog.showOpenDialog({ properties: ['openDirectory'] }));
    return r.canceled ? null : r.filePaths[0] ?? null;
  }));
  ipcMain.handle(IPC.openInEditor, guard(async (_e, file: string, line?: number) => openInPreferredEditor(await repositoryFile(String(file)), Number(line) || undefined)));
  ipcMain.handle(IPC.copyPath, guard(async (_e, file: string) => { const abs = await repositoryFile(String(file)); clipboard.writeText(abs); return abs; }));
  ipcMain.handle(IPC.reveal, guard(async (_e, file: string) => { shell.showItemInFolder(await repositoryFile(String(file))); }));
  ipcMain.handle(IPC.openExternal, guard(async (_e, url: string) => { if (!safeUrl(String(url))) throw new Error('Only http(s) and mailto links open externally.'); await shell.openExternal(String(url)); }));
  ipcMain.on(IPC.notify, (e, title: string, body: string) => { if (trusted(e)) notify(String(title), String(body)); });
  ipcMain.on(IPC.dropFolder, (e, folder: string) => {
    if (!trusted(e)) return;
    try { if (!fs.statSync(String(folder)).isDirectory()) return; } catch { return; }
    openRepository(String(folder)).then(buildMenu).catch((err) => dialog.showErrorBox('Could not open the repository', (err as Error).message));
  });
  ipcMain.on(IPC.progress, (e, value: number) => { if (trusted(e)) ctx.win?.setProgressBar(Number(value)); });
  ipcMain.on(IPC.theme, (e, c: { background: string; text: string; dark: boolean }) => {
    if (!trusted(e) || !ctx.win) return;
    const hex = (s: string) => (/^#[0-9a-f]{6}$/i.test(s) ? s : undefined);
    nativeTheme.themeSource = c.dark ? 'dark' : 'light';
    if (hex(c.background)) ctx.win.setBackgroundColor(c.background);
  });
}

/** D9: the window only ever shows the app; links leave for the system browser; no permissions are granted. */
export function lockDown(win: BrowserWindow) {
  const internal = (u: string) => u.startsWith(ctx.origin + '/') || u === ctx.origin || u.startsWith('data:text/html') || u.startsWith('blob:' + ctx.origin) || u === 'about:blank';
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (safeUrl(url) && !internal(url)) shell.openExternal(url);
    // The studio prints living docs through window.open('') — allow same-app blank windows only.
    return url === 'about:blank' || url === '' ? { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { sandbox: true, contextIsolation: true } } } : { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!internal(url)) { e.preventDefault(); if (safeUrl(url)) shell.openExternal(url); } });
  win.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'clipboard-sanitized-write' || permission === 'notifications' || permission === 'fullscreen'));
}
