/**
 * Browser folder access with the File System Access API (Chromium: Chrome, Edge, Opera; and Electron).
 * Files are read and written in place on the user's disk: nothing is uploaded. The browser never reveals the
 * folder's absolute path, so server features (Roslyn index, debugger) need that path given separately.
 */
type DirHandle = FileSystemDirectoryHandle & {
  values(): AsyncIterable<FileSystemHandle>;
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
};
declare global {
  interface Window { showDirectoryPicker?: (o?: { id?: string; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle> }
}

export const fsaSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
const IGNORED = new Set(['bin', 'obj', '.git', '.vs', '.idea', 'node_modules', 'TestResults', 'playwright-report', 'test-results']);
const TEXT = /\.(feature|cs|csproj|sln|xml|json|config|runsettings|props|targets|md|ya?ml|txt|csv|resx|ts|tsx|js|mjs|cjs|html|css|scss|ps1|sh|gitignore|editorconfig)$/i;
export const MAX_FILES = 5000;

let root: DirHandle | undefined;
export const browserRoot = () => root;

/* Recent folders survive reloads in IndexedDB (handles are structured-cloneable, paths are not). */
const db = () => new Promise<IDBDatabase>((resolve, reject) => {
  const r = indexedDB.open('tas-fsa', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('handles');
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});
async function store(key: string, value?: FileSystemDirectoryHandle) {
  const d = await db();
  await new Promise<void>((resolve, reject) => {
    const t = d.transaction('handles', 'readwrite');
    if (value) t.objectStore('handles').put(value, key); else t.objectStore('handles').delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
async function load(key: string) {
  const d = await db();
  return new Promise<DirHandle | undefined>((resolve) => {
    const r = d.transaction('handles').objectStore('handles').get(key);
    r.onsuccess = () => resolve(r.result as DirHandle | undefined);
    r.onerror = () => resolve(undefined);
  });
}

async function permitted(h: DirHandle, ask: boolean) {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return ask && (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

/** File ▸ Open Folder… (needs a click: browsers only show the picker for a user gesture). */
export async function pickFolder() {
  const h = (await window.showDirectoryPicker!({ id: 'tas-open-folder', mode: 'readwrite' })) as DirHandle;
  root = h;
  await store('current', h).catch(() => {});
  return h.name;
}
/** Reopens the last browser folder; asks for permission again only when `ask` (a user gesture) allows it. */
export async function restoreFolder(ask = false) {
  const h = await load('current').catch(() => undefined);
  if (!h || !(await permitted(h, ask))) return undefined;
  root = h;
  return h.name;
}
export async function closeFolder() { root = undefined; await store('current').catch(() => {}); }
export async function lastFolderName() { return (await load('current').catch(() => undefined))?.name; }

function need() { if (!root) throw new Error('No folder is open in the browser. Use File ▸ Open Folder….'); return root; }
async function walk(dir: DirHandle, prefix: string, out: string[]) {
  for await (const entry of dir.values()) {
    if (out.length >= MAX_FILES) return;
    if (entry.kind === 'directory') { if (!IGNORED.has(entry.name) && !entry.name.startsWith('.')) await walk(entry as DirHandle, `${prefix}${entry.name}/`, out); }
    else if (TEXT.test(entry.name)) out.push(prefix + entry.name);
  }
}
export async function listFiles() { const out: string[] = []; await walk(need(), '', out); return out.sort(); }

async function resolve(file: string, create = false) {
  const parts = file.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '..' || p === '.')) throw new Error('Invalid path.');
  let dir: FileSystemDirectoryHandle = need();
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create });
  return dir.getFileHandle(parts[parts.length - 1], { create });
}
export async function readText(file: string) { return (await (await resolve(file)).getFile()).text(); }
export async function writeText(file: string, text: string) {
  const handle = await resolve(file, true);
  const w = await (handle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
  await w.write(text);
  await w.close();
}

/* Explorer file operations on a browser folder (files and folders). */
async function parentOf(path: string, create = false) {
  const parts = path.split('/').filter(Boolean);
  if (!parts.length || parts.some((p) => p === '..' || p === '.')) throw new Error('Invalid path.');
  let dir: FileSystemDirectoryHandle = need();
  for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create });
  return { dir, name: parts[parts.length - 1] };
}
async function entry(path: string): Promise<FileSystemHandle | undefined> {
  const { dir, name } = await parentOf(path);
  try { return await dir.getFileHandle(name); } catch { /* not a file */ }
  try { return await dir.getDirectoryHandle(name); } catch { return undefined; }
}
export const pathExists = async (path: string) => !!(await entry(path).catch(() => undefined));
async function copyInto(src: FileSystemHandle, to: string) {
  if (src.kind === 'file') {
    const { dir, name } = await parentOf(to, true);
    const out = await dir.getFileHandle(name, { create: true });
    const w = await (out as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
    await w.write(await (src as FileSystemFileHandle).getFile());
    await w.close();
    return;
  }
  const { dir, name } = await parentOf(to, true);
  await dir.getDirectoryHandle(name, { create: true });
  for await (const child of (src as DirHandle).values()) await copyInto(child, `${to}/${child.name}`);
}
/** Copy; an existing destination becomes "Name - Copy.ext" like Visual Studio. Returns the new path. */
export async function copyPath(from: string, to: string) {
  const src = await entry(from);
  if (!src) throw new Error(`${from} was not found.`);
  const dot = to.lastIndexOf('.') > to.lastIndexOf('/') ? to.lastIndexOf('.') : to.length;
  let dest = to;
  for (let n = 1; await pathExists(dest); n++) dest = `${to.slice(0, dot)} - Copy${n > 1 ? ` (${n})` : ''}${to.slice(dot)}`;
  await copyInto(src, dest);
  return dest;
}
export async function deletePath(path: string) {
  const { dir, name } = await parentOf(path);
  await dir.removeEntry(name, { recursive: true });
}
export async function renamePath(from: string, to: string) {
  if (from === to) return;
  if (from.toLowerCase() !== to.toLowerCase() && (await pathExists(to))) throw new Error(`${to} already exists.`);
  const src = await entry(from);
  if (!src) throw new Error(`${from} was not found.`);
  // Chromium's move() renames in place; otherwise copy, then delete the original.
  const movable = src as FileSystemHandle & { move?: (dir: FileSystemDirectoryHandle, name: string) => Promise<void> };
  if (movable.move) { const { dir, name } = await parentOf(to, true); await movable.move(dir, name); return; }
  await copyInto(src, to);
  await deletePath(from);
}
