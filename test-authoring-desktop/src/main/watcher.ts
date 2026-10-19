import fs from 'node:fs';
import { ctx } from './context';
import { IPC } from '../shared/bridge';
import { read, write } from './store';

/** D18: recursive watch of the repository for authoring files; tells the web app to refresh its index. */
let watcher: fs.FSWatcher | undefined;
let timer: NodeJS.Timeout | undefined;
let generation = 0;
const relevant = /\.(feature|cs|xml|csproj)$/i;
const ignored = /(^|[\\/])(bin|obj|\.git|\.vs|node_modules|TestResults|playwright-report)([\\/]|$)/i;

export const autoRescanEnabled = () => read().autoRescan !== false;
export function setAutoRescan(on: boolean) {
  write({ autoRescan: on });
  watchRepository(on ? ctx.repository : undefined);
}

export function watchRepository(folder = ctx.repository) {
  stopWatching();
  const activeGeneration = generation;
  if (!folder || !autoRescanEnabled() || !fs.existsSync(folder)) return;
  try {
    watcher = fs.watch(folder, { recursive: true }, (_event, name) => {
      if (activeGeneration !== generation) return;
      const file = String(name ?? '');
      if (!relevant.test(file) || ignored.test(file)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (activeGeneration === generation && autoRescanEnabled() && !ctx.win?.isDestroyed()) ctx.win?.webContents.send(IPC.menu, 'repository-changed');
      }, 1200);
    });
    watcher.on('error', () => { if (activeGeneration === generation) stopWatching(); });
  } catch { /* recursive watch unsupported on this platform/filesystem */ }
}
export const stopWatching = () => {
  generation++;
  clearTimeout(timer);
  timer = undefined;
  watcher?.close();
  watcher = undefined;
};
