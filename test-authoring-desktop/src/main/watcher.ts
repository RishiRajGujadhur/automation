import fs from 'node:fs';
import { ctx } from './context';
import { IPC } from '../shared/bridge';
import { read, write } from './store';

/** D18: recursive watch of the repository for authoring files; tells the web app to refresh its index. */
let watcher: fs.FSWatcher | undefined;
let timer: NodeJS.Timeout | undefined;
const relevant = /\.(feature|cs|xml|csproj)$/i;
const ignored = /(^|[\\/])(bin|obj|\.git|\.vs|node_modules|TestResults|playwright-report)([\\/]|$)/i;

export const autoRescanEnabled = () => read().autoRescan !== false;
export function setAutoRescan(on: boolean) {
  write({ autoRescan: on });
  watchRepository(on ? ctx.repository : undefined);
}

export function watchRepository(folder = ctx.repository) {
  watcher?.close();
  watcher = undefined;
  if (!folder || !autoRescanEnabled() || !fs.existsSync(folder)) return;
  try {
    watcher = fs.watch(folder, { recursive: true }, (_event, name) => {
      const file = String(name ?? '');
      if (!relevant.test(file) || ignored.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => ctx.win?.webContents.send(IPC.menu, 'repository-changed'), 1200);
    });
    watcher.on('error', () => { watcher?.close(); watcher = undefined; });
  } catch { /* recursive watch unsupported on this platform/filesystem */ }
}
export const stopWatching = () => { watcher?.close(); watcher = undefined; };
