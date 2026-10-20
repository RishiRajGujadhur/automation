import { useSyncExternalStore } from 'react';
import { api } from '../api';
import { saveBeforeRun } from '../editor/saveFirst';

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
export const startBuild = async (action: 'build' | 'rebuild' | 'clean', configuration: string, project?: string) => { if (action !== 'clean') await saveBeforeRun(); return api<BuildState>('/build', { action, configuration, project }); };
export const cancelBuild = () => api<BuildState>('/build/cancel', {});

/** The build's diagnostics (connecting to the build stream when nothing else has). */
export const buildDiagnostics = () => { connect(); return state.diagnostics; };
/** Next / Previous Error (Visual Studio's View.NextError): the next diagnostic with a location, wrapping around. */
export function stepError(list: BuildDiagnostic[], current: number, step: 1 | -1) {
  const located = list.map((d, i) => (d.file && d.line ? i : -1)).filter((i) => i >= 0);
  if (!located.length) return -1;
  const pos = located.indexOf(current);
  if (pos < 0) return step > 0 ? located.find((i) => i > current) ?? located[0] : [...located].reverse().find((i) => i < current) ?? located[located.length - 1];
  return located[(pos + step + located.length) % located.length];
}
