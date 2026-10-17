import { useSyncExternalStore } from 'react';

/** Output ▸ Studio: the studio's own messages (notices, opened workspaces…), timestamped, last 500. */
let lines: string[] = [];
const listeners = new Set<() => void>();
export function studioLog(message: string) {
  if (!message) return;
  lines = [...lines, `[${new Date().toLocaleTimeString()}] ${message}`].slice(-500);
  for (const l of listeners) l();
}
export const useStudioLog = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lines);
