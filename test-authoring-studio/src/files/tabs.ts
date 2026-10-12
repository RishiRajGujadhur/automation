import { useSyncExternalStore } from 'react';
import { fileSource, isBrowser } from './provider';

/**
 * Open editors, like VS Code's editor tabs: one tab per file, the active one shown. Feature files from the
 * indexed repository open in the feature editor (bindings, F12, debugging); every other file, and every file
 * of a browser folder, opens in the code editor. Kept per folder in this browser.
 */
export type EditorTab = { file: string; kind: 'feature' | 'code'; pinned?: boolean; preview?: boolean };
type State = { tabs: EditorTab[]; active?: string };
const key = () => { const s = fileSource(); return s.kind === 'browser' ? `tas:editorTabs:browser:${s.name}` : `tas:editorTabs${s.root ? `:${s.root}` : ''}`; };
const read = (): State => { try { return JSON.parse(localStorage.getItem(key()) ?? '') as State; } catch { return { tabs: [] }; } };
let state: State = read();
let loadedFor = key();
const listeners = new Set<() => void>();
function set(next: State) {
  state = next;
  try { localStorage.setItem(key(), JSON.stringify(next)); } catch { /* storage blocked */ }
  for (const l of listeners) l();
}
/** Re-reads the tab list after the folder changes (each folder keeps its own open editors). */
export function reloadTabs() { if (loadedFor !== key()) { loadedFor = key(); state = read(); for (const l of listeners) l(); } }
export const getTabs = () => state;
export const useTabs = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getTabs);

export const kindOf = (file: string): EditorTab['kind'] => (file.endsWith('.feature') && !isBrowser() ? 'feature' : 'code');
/**
 * Opens (or activates) a tab. A preview tab (Explorer single click, when enabled) replaces the previous preview tab
 * in place; it becomes a normal tab when edited, double-clicked or opened again normally.
 */
export function openTab(file: string, kind = kindOf(file), preview = false) {
  const existing = state.tabs.find((t) => t.file === file);
  if (existing) { set({ tabs: !preview && existing.preview ? state.tabs.map((t) => (t.file === file ? { ...t, preview: false } : t)) : state.tabs, active: file }); return; }
  const tab: EditorTab = preview ? { file, kind, preview: true } : { file, kind };
  const i = preview ? state.tabs.findIndex((t) => t.preview) : -1;
  const tabs = i >= 0 ? state.tabs.map((t, j) => (j === i ? tab : t)) : [...state.tabs, tab];
  set({ tabs, active: file });
}
/** The preview tab stays open (no longer replaced by the next preview). */
export function keepTab(file: string) { if (state.tabs.some((t) => t.file === file && t.preview)) set({ ...state, tabs: state.tabs.map((t) => (t.file === file ? { ...t, preview: false } : t)) }); }
export function activateTab(file: string) { if (state.tabs.some((t) => t.file === file)) set({ ...state, active: file }); }
/** Closes a tab; the neighbour to its right (else left) becomes active, as in VS Code. */
export function closeTab(file: string) {
  const i = state.tabs.findIndex((t) => t.file === file);
  if (i < 0) return;
  const tabs = state.tabs.filter((t) => t.file !== file);
  const active = state.active === file ? (tabs[i] ?? tabs[i - 1])?.file : state.active;
  set({ tabs, active });
}
// Bulk closes keep pinned tabs, as in VS Code / Visual Studio.
export function closeOthers(file: string) { set({ tabs: state.tabs.filter((t) => t.file === file || t.pinned), active: file }); }
export function closeToRight(file: string) { const i = state.tabs.findIndex((t) => t.file === file); const tabs = state.tabs.filter((t, j) => j <= i || t.pinned); set({ tabs, active: tabs.some((t) => t.file === state.active) ? state.active : file }); }
export function closeAll() { const tabs = state.tabs.filter((t) => t.pinned); set({ tabs, active: tabs.some((t) => t.file === state.active) ? state.active : tabs[0]?.file }); }
/** Pinned tabs move to the front (in pin order) and survive Close Others / Close All. */
export function setPinned(file: string, pinned: boolean) {
  const tabs = state.tabs.map((t) => (t.file === file ? { ...t, pinned } : t));
  set({ ...state, tabs: [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)] });
}
/** A file or folder was renamed or moved: its tabs (and tabs of files inside it) follow. */
export function movedPath(from: string, to: string) {
  const map = (f: string) => (f === from ? to : f.startsWith(`${from}/`) ? to + f.slice(from.length) : f);
  set({ tabs: state.tabs.map((t) => ({ ...t, file: map(t.file) })), active: state.active && map(state.active) });
}
/** A file or folder was deleted: its tabs close. */
export function deletedPath(path: string) {
  const gone = (f: string) => f === path || f.startsWith(`${path}/`);
  const tabs = state.tabs.filter((t) => !gone(t.file));
  set({ tabs, active: state.active && !gone(state.active) ? state.active : tabs.at(-1)?.file });
}
export function renameTab(from: string, to: string) { set({ tabs: state.tabs.map((t) => (t.file === from ? { ...t, file: to } : t)), active: state.active === from ? to : state.active }); }
/** Ctrl+Tab / Ctrl+Shift+Tab. */
export function cycleTab(step: 1 | -1) {
  if (!state.tabs.length) return;
  const i = Math.max(0, state.tabs.findIndex((t) => t.file === state.active));
  set({ ...state, active: state.tabs[(i + step + state.tabs.length) % state.tabs.length].file });
}
