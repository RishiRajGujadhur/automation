import { useSyncExternalStore } from 'react';
import { api } from '../api';

export type DebugFrame = { id: number; name: string; file?: string; line: number; column: number; external: boolean };
export type DebugStatus = 'idle' | 'building' | 'starting' | 'running' | 'paused' | 'ended';
export type DebugState = {
  status: DebugStatus;
  version: number;
  target?: { project: string; filter: string; label: string };
  reason?: string;
  exception?: string;
  error?: string;
  threadId?: number;
  frames: DebugFrame[];
  output: string;
  breakpoints: Record<string, { line: number; verified: boolean }[]>;
};
export type Variable = { name: string; value: string; type?: string; variablesReference: number };

/**
 * Debugger state shared by the editors (breakpoint gutters, execution line) and the debug windows.
 * Breakpoints and watch expressions are kept per browser, like Visual Studio's .suo, and pushed to the
 * server, which forwards them to the live session. Session state streams from /api/debug/events.
 */
type Snapshot = { state: DebugState; breakpoints: Record<string, number[]>; watches: string[]; frameIndex: number };
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } };

let snapshot: Snapshot = {
  state: { status: 'idle', version: 0, frames: [], output: '', breakpoints: {} },
  breakpoints: read<Record<string, number[]>>('tas:breakpoints', {}),
  watches: read<string[]>('tas:watches', []),
  frameIndex: 0,
};
const listeners = new Set<() => void>();
let source: EventSource | undefined;
let synced = false;

function set(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}
let heard = 0;
function connect() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/debug/events');
  heard = Date.now();
  source.addEventListener('ping', () => { heard = Date.now(); });
  source.onmessage = (e) => {
    heard = Date.now();
    const state = JSON.parse(e.data) as DebugState;
    const resetFrame = state.status !== 'paused' || snapshot.state.status !== 'paused' || state.frames[0]?.id !== snapshot.state.frames[0]?.id;
    set({ state, frameIndex: resetFrame ? firstUserFrame(state.frames) : snapshot.frameIndex });
    // The server forgets breakpoints when it restarts: push this browser's set once per connection.
    if (!synced) { synced = true; void pushAll(); }
  };
  source.onerror = () => { synced = false; };
}
const firstUserFrame = (frames: DebugFrame[]) => Math.max(0, frames.findIndex((f) => !f.external));

// The server pings every 10 s; a silent stream is reopened (the server may have restarted behind a proxy).
if (typeof window !== 'undefined') setInterval(() => { if (source && Date.now() - heard > 25_000) { source.close(); source = undefined; synced = false; connect(); } }, 5_000);

export function subscribe(l: () => void) {
  listeners.add(l);
  connect();
  return () => listeners.delete(l);
}
export const getSnapshot = () => snapshot;
export function useDebug() { return useSyncExternalStore(subscribe, getSnapshot); }

async function pushAll() {
  for (const [file, lines] of Object.entries(snapshot.breakpoints)) await api('/debug/breakpoints', { file, lines }).catch(() => {});
}
export function breakpointsOf(file: string) { return snapshot.breakpoints[file] ?? []; }
export function setBreakpoints(file: string, lines: number[]) {
  const unique = [...new Set(lines)].sort((a, b) => a - b);
  const current = snapshot.breakpoints[file] ?? [];
  if (unique.length === current.length && unique.every((l, i) => l === current[i])) return;
  const breakpoints = { ...snapshot.breakpoints };
  if (unique.length) breakpoints[file] = unique; else delete breakpoints[file];
  write('tas:breakpoints', breakpoints);
  set({ breakpoints });
  void api('/debug/breakpoints', { file, lines: unique }).catch(() => {});
}
export function toggleBreakpoint(file: string, line: number) {
  const lines = breakpointsOf(file);
  setBreakpoints(file, lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line]);
}
export function clearBreakpoints() { for (const file of Object.keys(snapshot.breakpoints)) setBreakpoints(file, []); }

export function setWatches(watches: string[]) { write('tas:watches', watches); set({ watches }); }
export function selectFrame(frameIndex: number) { set({ frameIndex }); }
export function currentFrame() { const s = snapshot; return s.state.status === 'paused' ? s.state.frames[s.frameIndex] : undefined; }

export const startDebugging = (target: { file?: string; scenario?: string; project?: string; filter?: string }) => api<DebugState>('/debug/start', target);
export const debugControl = (action: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause' | 'stop') => api<DebugState>('/debug/control', { action });
export const isLive = (s: DebugStatus) => s === 'building' || s === 'starting' || s === 'running' || s === 'paused';
