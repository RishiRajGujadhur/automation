import { app, Menu, nativeImage, Tray } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ctx } from './context';
import { devIcon } from './paths';
import { read, write } from './store';
import { IPC } from '../shared/bridge';
import { state } from './status';

let tray: Tray | undefined;
export let quittingFromTray = false;

function icon() {
  const dev = devIcon();
  const img = dev && fs.existsSync(dev) ? nativeImage.createFromPath(dev) : app.isPackaged ? nativeImage.createFromPath(process.execPath) : nativeImage.createEmpty();
  return img.isEmpty() ? img : img.resize({ width: 16, height: 16 });
}
export function toggleWindow() {
  const w = ctx.win;
  if (!w) return;
  if (w.isVisible() && w.isFocused()) w.hide();
  else { if (w.isMinimized()) w.restore(); w.show(); w.focus(); }
}

/** T1–T3, T6, T8: tray icon, menu, click to toggle, tooltip with repository and recording state. */
export function createTray(actions: { openRepository: () => void; openRecent: (f: string) => void; rescan: () => void }) {
  if (tray) return tray;
  tray = new Tray(icon());
  tray.on('click', toggleWindow);
  trayActions = actions;
  updateTray();
  return tray;
}
let trayActions: Parameters<typeof createTray>[0] | undefined;

export function updateTray() {
  if (!tray || !trayActions) return;
  const a = trayActions;
  const repo = ctx.repository ? path.basename(ctx.repository) : 'No repository';
  tray.setToolTip(`TestAuthoring Studio — ${repo}${state.recording ? ' · recording' : ''}${state.running ? ' · running tests' : ''}`);
  const recent = (read().recent ?? []).filter((f) => fs.existsSync(f)).slice(0, 6);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: ctx.win?.isVisible() ? 'Hide TestAuthoring Studio' : 'Show TestAuthoring Studio', click: toggleWindow },
    { type: 'separator' },
    { label: 'Open Folder…', click: a.openRepository },
    { label: 'Open Recent', submenu: recent.length ? recent.map((f) => ({ label: path.basename(f), sublabel: f, click: () => a.openRecent(f) })) : [{ label: 'No recent repositories', enabled: false }] },
    { label: 'Rescan Repository', click: a.rescan },
    { label: state.recording ? 'Recording…' : 'Start a Recording', enabled: !state.recording, click: () => { toggleWindowOpen(); ctx.win?.webContents.send(IPC.menu, 'record'); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { quittingFromTray = true; app.quit(); } },
  ]));
}
const toggleWindowOpen = () => { const w = ctx.win; if (w) { w.show(); w.focus(); } };

/** T7: tell the user once that closing/minimizing keeps the app in the tray. */
export function trayHint() {
  if (read().trayHintShown || !tray) return;
  write({ trayHintShown: true });
  tray.displayBalloon?.({ title: 'Still running', content: 'TestAuthoring Studio is in the notification area. Right-click the icon for options.', iconType: 'info' });
}
export const destroyTray = () => { tray?.destroy(); tray = undefined; };
