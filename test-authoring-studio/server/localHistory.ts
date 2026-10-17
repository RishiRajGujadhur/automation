import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { dataRoot } from './core.js';

/**
 * Local History (JetBrains Rider): before the studio writes a file (save, approved change, delete), the previous
 * content is kept — up to 50 versions per file, consecutive duplicates skipped — independent of Git. Stored in the
 * studio's data folder, per repository and file.
 */
const MAX = 50;
const short = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 16);
const dirFor = (root: string, file: string) => path.join(dataRoot, '.local', 'history', short(path.resolve(root).toLowerCase()), short(file.toLowerCase()));

export async function recordHistory(root: string, file: string, previous: string, reason: 'save' | 'change' | 'delete') {
  if (!previous) return; // a new file has no earlier version
  const dir = dirFor(root, file);
  await fs.mkdir(dir, { recursive: true });
  const list = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.txt')).sort();
  const last = list.at(-1);
  if (last && (await fs.readFile(path.join(dir, last), 'utf8').catch(() => '')) === previous) return;
  await fs.writeFile(path.join(dir, `${Date.now()}-${reason}.txt`), previous, 'utf8');
  await fs.writeFile(path.join(dir, 'file.json'), JSON.stringify({ file }), 'utf8');
  for (const old of list.slice(0, Math.max(0, list.length + 1 - MAX))) await fs.rm(path.join(dir, old), { force: true });
}

/** The versions of a file, newest first. */
export async function historyOf(root: string, file: string) {
  const dir = dirFor(root, file);
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => /^\d+-\w+\.txt$/.test(f)).sort().reverse();
  return Promise.all(names.map(async (id) => {
    const [at, reason] = id.replace('.txt', '').split('-');
    const text = await fs.readFile(path.join(dir, id), 'utf8');
    return { id, at: new Date(Number(at)).toISOString(), reason, size: text.length, lines: text.split('\n').length };
  }));
}
export async function historyItem(root: string, file: string, id: string) {
  if (!/^\d+-\w+\.txt$/.test(id)) throw new Error('Invalid history id.');
  return fs.readFile(path.join(dirFor(root, file), id), 'utf8').catch(() => { throw new Error('That version is no longer in the local history.'); });
}
