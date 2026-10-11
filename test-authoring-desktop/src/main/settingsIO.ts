import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ctx } from './context';
import { dataRoot } from './paths';
import { read, reset, write, type Shape } from './store';

const studioFile = (name: string) => path.join(dataRoot(), '.local', name);
const readJson = (f: string) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };

/** S7: one JSON file with desktop, studio settings and workspace config. */
export async function exportSettings() {
  if (!ctx.win) return;
  const r = await dialog.showSaveDialog(ctx.win, { title: 'Export settings', defaultPath: 'testauthoring-settings.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePath) return;
  const { window: _w, ...desktop } = read(); // window bounds are machine-specific
  fs.writeFileSync(r.filePath, JSON.stringify({ format: 'testauthoring-settings', version: 1, exported: new Date().toISOString(), desktop, studio: readJson(studioFile('settings.json')), workspace: readJson(studioFile('workspace.json')) }, null, 2));
}

/** S8: restores what an export contains, then restarts so the API reads it. */
export async function importSettings() {
  if (!ctx.win) return;
  const r = await dialog.showOpenDialog(ctx.win, { title: 'Import settings', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
  if (r.canceled || !r.filePaths[0]) return;
  const data = readJson(r.filePaths[0]);
  if (data?.format !== 'testauthoring-settings') { dialog.showErrorBox('Import settings', 'That file is not a TestAuthoring Studio settings export.'); return; }
  const ok = await dialog.showMessageBox(ctx.win, { type: 'question', buttons: ['Import and restart', 'Cancel'], cancelId: 1, message: 'Replace your settings?', detail: 'Desktop settings, studio settings and the workspace configuration are replaced. The app restarts.' });
  if (ok.response !== 0) return;
  if (data.desktop && typeof data.desktop === 'object') write(data.desktop as Partial<Shape>);
  fs.mkdirSync(path.join(dataRoot(), '.local'), { recursive: true });
  if (data.studio) fs.writeFileSync(studioFile('settings.json'), JSON.stringify(data.studio, null, 2));
  if (data.workspace) fs.writeFileSync(studioFile('workspace.json'), JSON.stringify(data.workspace, null, 2));
  restart();
}

/** S5 */
export async function resetDesktopSettings() {
  if (!ctx.win) return;
  const ok = await dialog.showMessageBox(ctx.win, { type: 'warning', buttons: ['Reset and restart', 'Cancel'], cancelId: 1, message: 'Reset desktop settings?', detail: 'Window size, zoom, recent and pinned repositories, tray and other desktop toggles go back to their defaults. Studio preferences and the workspace are kept.' });
  if (ok.response !== 0) return;
  reset();
  restart();
}

/** S6 */
export async function clearWebData() {
  if (!ctx.win) return;
  const ok = await dialog.showMessageBox(ctx.win, { type: 'warning', buttons: ['Clear and reload', 'Cancel'], cancelId: 1, message: 'Clear web storage and cache?', detail: 'Removes studio drafts, preferences, imported test results and the HTTP cache stored by the window. Repository files and workspace settings are not affected.' });
  if (ok.response !== 0) return;
  await ctx.win.webContents.session.clearStorageData();
  await ctx.win.webContents.session.clearCache();
  ctx.win.webContents.reload();
}

/** S4 */
export function restart() { app.relaunch(); app.exit(0); }

/** S9: keep the log under 5 MB (older half dropped). */
export function rotateLog(file: string, max = 5 * 1024 * 1024) {
  try {
    const size = fs.statSync(file).size;
    if (size <= max) return;
    const buf = fs.readFileSync(file);
    fs.writeFileSync(file, Buffer.concat([Buffer.from(`--- log trimmed ${new Date().toISOString()} ---\n`), buf.subarray(buf.length - Math.floor(max / 2))]));
  } catch { /* no log yet */ }
}
