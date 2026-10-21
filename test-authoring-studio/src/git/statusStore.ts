import { useEffect, useSyncExternalStore } from 'react';
import { api } from '../api';
import { GIT_CHANGED_EVENT } from '../editor/events';

export type GitSummary = { repo: boolean; branch?: string; ahead: number; behind: number; changes: number };

/**
 * The repository's branch and pending changes, shared by the status bar and the activity bar badge: one poll (every
 * 10 s while the window is visible, on focus and after Git commands), however many components read it.
 */
let state: GitSummary | undefined;
const listeners = new Set<() => void>();
let users = 0;
let stop: (() => void) | undefined;
const load = () => api<{ repo: boolean; branch?: string; ahead: number; behind: number; files: unknown[] }>('/git/status')
  .then((s) => { state = { repo: s.repo, branch: s.branch, ahead: s.ahead, behind: s.behind, changes: s.files.length }; listeners.forEach((l) => l()); }, () => {});
function start() {
  void load();
  const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 10_000);
  window.addEventListener(GIT_CHANGED_EVENT, load);
  window.addEventListener('focus', load);
  stop = () => { clearInterval(t); window.removeEventListener(GIT_CHANGED_EVENT, load); window.removeEventListener('focus', load); };
}

/** Git summary; `repository` reloads it when the workspace changes. */
export function useGitSummary(repository?: string) {
  useEffect(() => {
    if (users++ === 0) start(); else void load();
    return () => { if (--users === 0) { stop?.(); stop = undefined; } };
  }, [repository]);
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}
