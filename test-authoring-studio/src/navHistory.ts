import { useSyncExternalStore } from 'react';
import { fileSource } from './files/provider';
import { featureOn } from './features';

/**
 * Navigation history (JetBrains Rider / Visual Studio): every cursor position that jumps more than a few lines or to
 * another file, for Back / Forward (Ctrl+Alt+← / →, Ctrl+- / Ctrl+Shift+-), Recent Files (Ctrl+E) and Recent
 * Locations (Ctrl+Shift+E). Kept for this session.
 */
export type NavLocation = { file: string; line: number; column: number; text?: string };
let stack: NavLocation[] = [];
let index = -1;
// Recent Files survive a reload, per workspace (QOL-50): loaded for the workspace that is open when they are read.
const recentKey = () => { const s = fileSource(); return `tas:recentFiles:${s.kind === 'browser' ? `browser:${s.name}` : s.root ?? ''}`; };
let recent: string[] = [];
let recentFor = '';
const loadRecent = () => { const k = recentKey(); if (k === recentFor) return; recentFor = k; try { recent = featureOn('recent-files-kept') ? JSON.parse(localStorage.getItem(k) ?? '[]') as string[] : []; } catch { recent = []; } };
const keepRecent = () => { try { if (featureOn('recent-files-kept')) localStorage.setItem(recentKey(), JSON.stringify(recent.slice(0, 50))); } catch { /* storage blocked */ } };
let suppressed = 0;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };

/** A file became active (opened or switched to): it moves to the top of Recent Files. */
export function visitFile(file: string) {
  loadRecent();
  if (!file || recent[0] === file) return;
  recent = [file, ...recent.filter((f) => f !== file)].slice(0, 50);
  keepRecent();
  emit();
}
/** The cursor moved: a new history entry when it jumped (another file or more than 10 lines), else the entry moves. */
export function visit(loc: NavLocation) {
  visitFile(loc.file);
  if (Date.now() < suppressed) return; // positions caused by Back / Forward themselves
  const cur = stack[index];
  if (cur && cur.file === loc.file && Math.abs(cur.line - loc.line) <= 10) { stack[index] = loc; return; }
  stack = [...stack.slice(0, index + 1), loc].slice(-100);
  index = stack.length - 1;
  emit();
}
function move(step: number) {
  const next = index + step;
  if (next < 0 || next >= stack.length) return undefined;
  index = next;
  suppressed = Date.now() + 600;
  emit();
  return stack[index];
}
export const back = () => move(-1);
export const forward = () => move(1);
export const canGoBack = () => index > 0;
export const canGoForward = () => index >= 0 && index < stack.length - 1;
export const recentFiles = () => { loadRecent(); return recent; };
/** Clear Recent Files (Visual Studio's File ▸ Recent Files ▸ clear, Rider's Clear Recent Files). */
/** Removes one file from Recent Files (Quick Open's Remove from Recently Opened). */
export function removeRecent(file: string) { loadRecent(); recent = recent.filter((f) => f !== file); keepRecent(); emit(); }
export function clearRecent() { recent = []; keepRecent(); stack = stack.slice(index >= 0 ? index : 0, index + 1); index = stack.length - 1; emit(); }
/** Recent Locations: newest first, one per file and line. */
export const recentLocations = () => {
  const seen = new Set<string>();
  return [...stack].reverse().filter((l) => { const k = `${l.file}:${l.line}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40);
};
export const useNavHistory = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);

/** Ask the editor showing `file` to put the cursor at a line (and column) and scroll it into view. */
export const REVEAL_EVENT = 'tas:reveal';
export const reveal = (file: string, line: number, column = 1) => window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: { file, line, column } }));
