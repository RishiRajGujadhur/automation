import path from 'node:path';
import { dataRoot } from './paths';
import { readObject, writeObject } from './atomicJson';

export type Editor = 'system' | 'vscode' | 'visualstudio' | 'rider' | 'notepadpp';
/** Tiny JSON store in the user-data folder (window state, zoom, recent repositories, desktop toggles). */
export type Shape = {
  window?: { x?: number; y?: number; width: number; height: number; maximized: boolean };
  zoom?: number;
  recent?: string[];
  pinned?: string[];
  lastClosed?: string;
  lastPage?: Record<string, string>;
  autoRescan?: boolean;
  chromiumOffered?: boolean;
  alwaysOnTop?: boolean;
  autoHideMenu?: boolean;
  fullscreen?: boolean;
  minimizeToTray?: boolean;
  closeToTray?: boolean;
  trayHintShown?: boolean;
  doNotDisturb?: boolean;
  globalShortcut?: boolean;
  hardwareAcceleration?: boolean;
  spellcheck?: boolean;
  editor?: Editor;
  firstRunDone?: boolean;
  apiPort?: number;
  lastBrowserInstall?: { ok: boolean; completedAt: string; message: string };
};
const file = () => path.join(dataRoot(), 'desktop.json');
let cache: Shape | undefined;
export function read(): Shape {
  if (!cache) cache = (readObject(file()) ?? readObject(`${file()}.bak`) ?? {}) as Shape;
  return cache;
}
export function write(patch: Partial<Shape>) {
  cache = { ...read(), ...patch };
  try { writeObject(file(), cache); } catch (error) { console.error('Could not persist desktop settings; keeping the in-memory preferences.', error); }
}
/** S5: forget every desktop setting. */
export function reset() {
  cache = {};
  try {
    writeObject(file(), {});
    // The backup must also contain defaults, so recovery cannot undo a deliberate reset.
    writeObject(file(), {});
  } catch (error) { console.error('Could not reset desktop settings.', error); }
}
export const storeFile = file;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export function addRecent(folder: string) {
  const recent = [folder, ...(read().recent ?? []).filter((f) => !same(f, folder))].slice(0, 10);
  write({ recent });
  return recent;
}
/** R1 */
export function removeRecent(folder: string) { write({ recent: (read().recent ?? []).filter((f) => !same(f, folder)) }); }
/** R2 */
export function togglePin(folder: string) {
  const pinned = read().pinned ?? [];
  write({ pinned: pinned.some((p) => same(p, folder)) ? pinned.filter((p) => !same(p, folder)) : [...pinned, folder] });
}
export const isPinned = (folder?: string) => !!folder && (read().pinned ?? []).some((p) => same(p, folder));
