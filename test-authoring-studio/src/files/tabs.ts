import { useSyncExternalStore } from 'react';
import { fileSource, isBrowser } from './provider';

/**
 * Open editors, like VS Code's editor tabs: one tab per file, the active one shown. Feature files from the
 * indexed repository open in the feature editor (bindings, F12, debugging); every other file, and every file
 * of a browser folder, opens in the code editor. Kept per folder in this browser.
 */
export type EditorTab = { file: string; kind: 'feature' | 'code' };
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
export function openTab(file: string, kind = kindOf(file)) {
  const tabs = state.tabs.some((t) => t.file === file) ? state.tabs : [...state.tabs, { file, kind }];
  set({ tabs, active: file });
}
export function activateTab(file: string) { if (state.tabs.some((t) => t.file === file)) set({ ...state, active: file }); }
/** Closes a tab; the neighbour to its right (else left) becomes active, as in VS Code. */
export function closeTab(file: string) {
  const i = state.tabs.findIndex((t) => t.file === file);
  if (i < 0) return;
  const tabs = state.tabs.filter((t) => t.file !== file);
  const active = state.active === file ? (tabs[i] ?? tabs[i - 1])?.file : state.active;
  set({ tabs, active });
}
export function closeOthers(file: string) { set({ tabs: state.tabs.filter((t) => t.file === file), active: file }); }
export function closeToRight(file: string) { const i = state.tabs.findIndex((t) => t.file === file); const tabs = state.tabs.slice(0, i + 1); set({ tabs, active: tabs.some((t) => t.file === state.active) ? state.active : file }); }
export function closeAll() { set({ tabs: [] }); }
export function renameTab(from: string, to: string) { set({ tabs: state.tabs.map((t) => (t.file === from ? { ...t, file: to } : t)), active: state.active === from ? to : state.active }); }
/** Ctrl+Tab / Ctrl+Shift+Tab. */
export function cycleTab(step: 1 | -1) {
  if (!state.tabs.length) return;
  const i = Math.max(0, state.tabs.findIndex((t) => t.file === state.active));
  set({ ...state, active: state.tabs[(i + step + state.tabs.length) % state.tabs.length].file });
}
