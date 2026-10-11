import { useSyncExternalStore } from 'react';
import { api } from '../api';

export type BuildDiagnostic = { severity: 'error' | 'warning'; code: string; message: string; file?: string; line?: number; column?: number; project?: string };
export type BuildState = {
  status: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  version: number;
  action?: 'build' | 'rebuild' | 'clean';
  target?: string;
  configuration?: string;
  output: string;
  diagnostics: BuildDiagnostic[];
  durationMs?: number;
};

/** Build state streamed from /api/build/events (the Output window and Error List read it). */
let state: BuildState = { status: 'idle', version: 0, output: '', diagnostics: [] };
const listeners = new Set<() => void>();
let source: EventSource | undefined;
let heard = 0;
function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/build/events');
  heard = Date.now();
  source.addEventListener('ping', () => { heard = Date.now(); });
  source.onmessage = (e) => { heard = Date.now(); state = JSON.parse(e.data) as BuildState; for (const l of listeners) l(); };
}
// Reopen a silent stream (the server may have restarted behind the dev proxy).
if (typeof window !== 'undefined') setInterval(() => { if (source && Date.now() - heard > 25_000) { source.close(); source = undefined; connect(); } }, 5_000);
export function useBuild() {
  return useSyncExternalStore((l) => { listeners.add(l); connect(); return () => listeners.delete(l); }, () => state);
}
export const getBuild = () => state;
export const startBuild = (action: 'build' | 'rebuild' | 'clean', configuration: string, project?: string) => api<BuildState>('/build', { action, configuration, project });
export const cancelBuild = () => api<BuildState>('/build/cancel', {});
