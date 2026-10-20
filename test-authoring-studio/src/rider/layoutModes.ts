import { useSyncExternalStore } from 'react';

/**
 * Rider's View ▸ Appearance modes: Distraction-Free (only the editor, centred), Presentation (that, full screen with a
 * large font) and Hide All Tool Windows. Applied as attributes on <html> so the shell's CSS hides the rest.
 */
export type LayoutMode = 'normal' | 'zen' | 'presentation' | 'vszen';
type State = { mode: LayoutMode; toolsHidden: boolean };
const KEY = 'tas:rider:layout';
let state: State = (() => { try { return { mode: 'normal', toolsHidden: false, ...JSON.parse(sessionStorage.getItem(KEY) ?? '{}') } as State; } catch { return { mode: 'normal', toolsHidden: false } as State; } })();
const listeners = new Set<() => void>();

function apply() {
  const html = document.documentElement;
  if (state.mode === 'normal') delete html.dataset.riderMode; else html.dataset.riderMode = state.mode;
  if (state.toolsHidden) html.dataset.riderTools = 'hidden'; else delete html.dataset.riderTools;
  // Editors measure again (their width changes).
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
}
if (typeof document !== 'undefined') apply();

function set(next: Partial<State>) {
  const was = state.mode;
  state = { ...state, ...next };
  try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
  apply();
  // Presentation Mode is full screen.
  if (state.mode === 'presentation' && was !== 'presentation') void document.documentElement.requestFullscreen?.().catch(() => {});
  if (was === 'presentation' && state.mode !== 'presentation' && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  for (const l of listeners) l();
}
export const layoutState = () => state;
export const useLayoutState = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
export const toggleMode = (mode: Exclude<LayoutMode, 'normal'>) => set({ mode: state.mode === mode ? 'normal' : mode });
export const exitMode = () => set({ mode: 'normal' });
export const toggleToolWindows = () => set({ toolsHidden: !state.toolsHidden });
export const onLayoutChanged = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
