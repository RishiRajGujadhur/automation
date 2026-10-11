import fs from 'node:fs';
import path from 'node:path';
import { dataRoot } from './paths';

/** Tiny JSON store in the user-data folder (window state, zoom, recent repositories). */
type Shape = {
  window?: { x?: number; y?: number; width: number; height: number; maximized: boolean };
  zoom?: number;
  recent?: string[];
  autoRescan?: boolean;
  chromiumOffered?: boolean;
};
const file = () => path.join(dataRoot(), 'desktop.json');
let cache: Shape | undefined;
export function read(): Shape {
  if (!cache) { try { cache = JSON.parse(fs.readFileSync(file(), 'utf8')) as Shape; } catch { cache = {}; } }
  return cache;
}
export function write(patch: Partial<Shape>) {
  cache = { ...read(), ...patch };
  try { fs.mkdirSync(path.dirname(file()), { recursive: true }); fs.writeFileSync(file(), JSON.stringify(cache, null, 2)); } catch { /* read-only profile: keep in memory */ }
}
export function addRecent(folder: string) {
  const recent = [folder, ...(read().recent ?? []).filter((f) => f.toLowerCase() !== folder.toLowerCase())].slice(0, 8);
  write({ recent });
  return recent;
}
