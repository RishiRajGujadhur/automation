import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ctx } from './context';
import { apiCall } from './server';
import { addRecent, read, write } from './store';
import { updateTray } from './tray';
import { dataRoot, resourcesRoot } from './paths';
import { watchRepository } from './watcher';

type Config = { repositoryRoot: string; [k: string]: unknown };

export async function currentConfig(): Promise<Config> {
  try {
    const r = await apiCall<{ config: Config }>(ctx.origin, '/workspace');
    ctx.repository = r.config.repositoryRoot;
    return r.config;
  } catch {
    // GET /workspace scans first; if scanning fails the saved config (or the bundled fixtures) still names the repository.
    let saved: Config | undefined;
    try { saved = JSON.parse(fs.readFileSync(path.join(dataRoot(), '.local/workspace.json'), 'utf8')) as Config; } catch { /* first run */ }
    const config = saved ?? { repositoryRoot: path.join(resourcesRoot(), 'fixtures') };
    ctx.repository = config.repositoryRoot;
    return config;
  }
}

/** Points the studio at a repository folder (keeps the other scan settings) and reloads the UI. */
export async function openRepository(folder: string, opts: { reload?: boolean } = {}) {
  const dir = path.resolve(folder);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Not a folder: ${dir}`);
  // R6: a folder with no feature or C# files is probably the wrong one.
  if (!looksLikeTestRepo(dir) && ctx.win) {
    const r = await dialog.showMessageBox(ctx.win, { type: 'warning', buttons: ['Open anyway', 'Cancel'], defaultId: 1, cancelId: 1, message: 'No .feature or .cs files found', detail: `${dir}\n\nThe studio looks for SpecFlow feature files and C# step bindings. Open this folder anyway?` });
    if (r.response !== 0) throw new Error('Cancelled.');
  }
  const previous = ctx.repository;
  const config = await currentConfig();
  ctx.win?.setProgressBar(2);
  try {
    await apiCall(ctx.origin, '/workspace', { ...config, repositoryRoot: dir, targetProject: '.' });
  } finally {
    ctx.win?.setProgressBar(-1);
  }
  ctx.repository = dir;
  if (previous && previous.toLowerCase() !== dir.toLowerCase()) write({ lastClosed: previous }); // R4
  watchRepository(dir);
  addRecent(dir);
  app.addRecentDocument(dir); // Windows jump list / macOS Dock menu
  updateTitle();
  updateTray();
  if (opts.reload !== false && ctx.win) {
    const saved = read().lastPage?.[dir.toLowerCase()];
    await ctx.win.loadURL(`${ctx.origin}/${saved && /^#\/[\w/-]+$/.test(saved) ? saved : '#/dashboard'}`); // W2
  }
  return dir;
}

/** Any .feature or .cs file within four levels (skipping build output). */
export function looksLikeTestRepo(dir: string, depth = 0): boolean {
  if (depth > 4) return false;
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return false; }
  if (entries.some((e) => e.isFile() && /\.(feature|cs)$/i.test(e.name))) return true;
  return entries.some((e) => e.isDirectory() && !/^(\.|bin$|obj$|node_modules$)/.test(e.name) && looksLikeTestRepo(path.join(dir, e.name), depth + 1));
}

export async function pickAndOpenRepository() {
  if (!ctx.win) return;
  const r = await dialog.showOpenDialog(ctx.win, { title: 'Open repository', properties: ['openDirectory'], defaultPath: ctx.repository });
  if (r.canceled || !r.filePaths[0]) return;
  try { await openRepository(r.filePaths[0]); } catch (e) { dialog.showErrorBox('Could not open the repository', (e as Error).message); }
}

export const recentRepositories = () => (read().recent ?? []).filter((f) => fs.existsSync(f));

/** Q5: "<repository> — TestAuthoring Studio". The page title itself stays as the studio sets it. */
export function updateTitle() {
  if (!ctx.win) return;
  const repo = ctx.repository ? path.basename(ctx.repository) : '';
  const page = ctx.win.webContents.getTitle().replace(/ · TestAuthoring Studio$/, '');
  ctx.win.setTitle([page, repo, 'TestAuthoring Studio'].filter(Boolean).join(' — '));
}

/** Resolves a repository-relative file and refuses anything outside the repository. */
export async function repositoryFile(file: string) {
  const root = ctx.repository ?? (await currentConfig()).repositoryRoot;
  const abs = path.resolve(root, file);
  const rel = path.relative(root, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('That file is outside the repository.');
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${rel}`);
  return abs;
}
