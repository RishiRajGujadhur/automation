import { app, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ctx } from './context';
import { apiCall } from './server';
import { addRecent, read } from './store';

type Config = { repositoryRoot: string; [k: string]: unknown };

export async function currentConfig() {
  const r = await apiCall<{ config: Config }>(ctx.origin, '/workspace');
  ctx.repository = r.config.repositoryRoot;
  return r.config;
}

/** Points the studio at a repository folder (keeps the other scan settings) and reloads the UI. */
export async function openRepository(folder: string) {
  const dir = path.resolve(folder);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new Error(`Not a folder: ${dir}`);
  const config = await currentConfig();
  ctx.win?.setProgressBar(2);
  try {
    await apiCall(ctx.origin, '/workspace', { ...config, repositoryRoot: dir, targetProject: '.' });
  } finally {
    ctx.win?.setProgressBar(-1);
  }
  ctx.repository = dir;
  addRecent(dir);
  app.addRecentDocument(dir); // Windows jump list / macOS Dock menu
  updateTitle();
  ctx.win?.webContents.reload();
  return dir;
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
