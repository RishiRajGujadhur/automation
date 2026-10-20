import { featureOn } from '../features';
import { useSyncExternalStore } from 'react';
import { api } from '../api';

/** Breakpoint settings (Visual Studio's Breakpoint Settings): condition, hit count, log message (tracepoint), enabled. */
export type BreakpointSpec = { line: number; condition?: string; hitCondition?: string; logMessage?: string; enabled?: boolean; temporary?: boolean; labels?: string[]; disableOnceHit?: boolean; dependsOn?: string; whenChanged?: boolean };
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
  breakpoints: Record<string, (BreakpointSpec & { verified: boolean })[]>;
  hits?: Record<string, number>;
};
export type Variable = { name: string; value: string; type?: string; variablesReference: number; parentRef?: number };

/**
 * Debugger state shared by the editors (breakpoint gutters, execution line) and the debug windows.
 * Breakpoints and watch expressions are kept per browser, like Visual Studio's .suo, and pushed to the
 * server, which forwards them to the live session. Session state streams from /api/debug/events.
 */
type Snapshot = { state: DebugState; breakpoints: Record<string, BreakpointSpec[]>; watches: string[]; frameIndex: number };
const read = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) ?? '') as T; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } };

let snapshot: Snapshot = {
  state: { status: 'idle', version: 0, frames: [], output: '', breakpoints: {} },
  // Earlier versions stored plain line numbers.
  breakpoints: Object.fromEntries(Object.entries(read<Record<string, (number | BreakpointSpec)[]>>('tas:breakpoints', {})).map(([f, list]) => [f, list.map((b) => (typeof b === 'number' ? { line: b } : b))])),
  watches: read<string[]>('tas:watches', []),
  frameIndex: 0,
};
const listeners = new Set<() => void>();
let source: EventSource | undefined;
let prevStatus: DebugStatus = 'idle';
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
    // Temporary breakpoints (Rider: "Remove once hit") go once the debugger stops on them.
    const top = state.status === 'paused' ? state.frames.find((f) => !f.external) : undefined;
    if (top?.file && specAt(top.file, top.line)?.temporary) setBreakpoints(top.file, breakpointsOf(top.file).filter((l) => l !== top.line));
    // Dependent breakpoints: hitting a breakpoint enables those waiting for it; a new session waits again.
    if (featureOn('bp-dependent')) {
      const wasLive = isLive(prevStatus);
      prevStatus = state.status;
      const all = Object.entries(snapshot.breakpoints).flatMap(([file, specs]) => specs.map((b) => ({ file, b })));
      if (top?.file && state.reason === 'breakpoint') for (const { file, b } of all) if (b.dependsOn === `${top.file}:${top.line}` && b.enabled === false) updateBreakpoint(file, b.line, { enabled: true });
      if (wasLive && !isLive(state.status)) for (const { file, b } of all) if (b.dependsOn && b.enabled !== false) updateBreakpoint(file, b.line, { enabled: false });
    }
    // Disable once hit (Visual Studio's breakpoint action).
    if (top?.file && state.reason === 'breakpoint' && featureOn('bp-disable-once')) { const s = specAt(top.file, top.line); if (s?.disableOnceHit && s.enabled !== false) updateBreakpoint(top.file, top.line, { enabled: false }); }
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

// Mute Breakpoints (Rider): every breakpoint is sent disabled while muted; their own enabled state is kept.
let muted = read<boolean>('tas:breakpointsMuted', false);
const sent = (specs: BreakpointSpec[]) => (muted ? specs.map((b) => ({ ...b, enabled: false })) : specs);
const markMuted = () => { if (typeof document !== 'undefined') { if (muted) document.documentElement.dataset.breakpointsMuted = 'true'; else delete document.documentElement.dataset.breakpointsMuted; } };
markMuted();
export const breakpointsMuted = () => muted;
export function muteBreakpoints(on: boolean) {
  muted = on;
  write('tas:breakpointsMuted', on);
  markMuted();
  set({});
  void pushAll();
}
async function pushAll() {
  for (const [file, breakpoints] of Object.entries(snapshot.breakpoints)) await api('/debug/breakpoints', { file, breakpoints: sent(breakpoints) }).catch(() => {});
}
/** Breakpoint lines of a file (the editor margin). */
export function breakpointsOf(file: string) { return (snapshot.breakpoints[file] ?? []).map((b) => b.line); }
export function specsOf(file: string) { return snapshot.breakpoints[file] ?? []; }
export function specAt(file: string, line: number) { return specsOf(file).find((b) => b.line === line); }
function store(file: string, specs: BreakpointSpec[]) {
  const breakpoints = { ...snapshot.breakpoints };
  if (specs.length) breakpoints[file] = specs; else delete breakpoints[file];
  write('tas:breakpoints', breakpoints);
  set({ breakpoints });
  void api('/debug/breakpoints', { file, breakpoints: sent(specs) }).catch(() => {});
}
/**
 * New breakpoint lines for a file. Settings stay with their breakpoint: same line, or (when edits moved every line
 * and the count is unchanged) the breakpoint in the same position.
 */
export function setBreakpoints(file: string, lines: number[]) {
  const unique = [...new Set(lines)].sort((a, b) => a - b);
  const current = specsOf(file);
  if (unique.length === current.length && unique.every((l, i) => l === current[i].line)) return;
  const moved = unique.length === current.length;
  store(file, unique.map((line, i) => ({ ...(current.find((b) => b.line === line) ?? (moved ? current[i] : {})), line })));
}
/** Breakpoint Settings: condition, hit count, log message, enabled. */
export function updateBreakpoint(file: string, line: number, patch: Partial<BreakpointSpec>) {
  store(file, specsOf(file).map((b) => (b.line === line ? { ...b, ...patch, line } : b)));
}
export function toggleBreakpoint(file: string, line: number) {
  const lines = breakpointsOf(file);
  setBreakpoints(file, lines.includes(line) ? lines.filter((l) => l !== line) : [...lines, line]);
}
export function clearBreakpoints() { for (const file of Object.keys(snapshot.breakpoints)) store(file, []); }
/** Debug ▸ Disable All / Enable All Breakpoints. */
export function enableAllBreakpoints(enabled: boolean) { for (const file of Object.keys(snapshot.breakpoints)) store(file, specsOf(file).map((b) => ({ ...b, enabled }))); }

/** Export / Import Breakpoints (Visual Studio): every breakpoint with its settings, as JSON. */
export const exportBreakpoints = () => JSON.stringify({ version: 1, breakpoints: snapshot.breakpoints }, null, 2);
export function importBreakpoints(json: string) {
  const data = JSON.parse(json) as { breakpoints?: Record<string, BreakpointSpec[]> };
  if (!data.breakpoints || typeof data.breakpoints !== 'object') throw new Error('Not a breakpoints file.');
  let n = 0;
  for (const [file, list] of Object.entries(data.breakpoints)) {
    if (!Array.isArray(list)) continue;
    const valid = list.filter((b) => Number.isInteger(b?.line) && b.line > 0).map((b) => ({ line: b.line, condition: b.condition, hitCondition: b.hitCondition, logMessage: b.logMessage, enabled: b.enabled }));
    store(file, [...specsOf(file).filter((b) => !valid.some((v) => v.line === b.line)), ...valid].sort((a, b) => a.line - b.line));
    n += valid.length;
  }
  return n;
}
export function setWatches(watches: string[]) { write('tas:watches', watches); set({ watches }); }
export function selectFrame(frameIndex: number) { set({ frameIndex }); }
export function currentFrame() { const s = snapshot; return s.state.status === 'paused' ? s.state.frames[s.frameIndex] : undefined; }

export const startDebugging = (target: { file?: string; scenario?: string; project?: string; filter?: string }) => api<DebugState>('/debug/start', target);
/** Step Out to a frame of the call stack (Visual Studio's Run to Cursor on a frame): Step Out until it is on top. */
export async function stepOutTo(depth: number) {
  for (let i = 0; i < depth; i++) {
    const before = snapshot.state.version;
    await api('/debug/control', { action: 'stepOut' });
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => { listeners.delete(check); reject(new Error('Step Out did not stop.')); }, 60_000);
      const check = () => { if (snapshot.state.version > before && snapshot.state.status !== 'running') { clearTimeout(t); listeners.delete(check); resolve(); } };
      listeners.add(check);
    });
    if (snapshot.state.status !== 'paused') return;
  }
}
export const debugControl = (action: 'continue' | 'next' | 'stepIn' | 'stepOut' | 'pause' | 'stop') => api<DebugState>('/debug/control', { action });
export const isLive = (s: DebugStatus) => s === 'building' || s === 'starting' || s === 'running' || s === 'paused';

/** Right-click on a breakpoint in the margin: open its settings in the Breakpoints window. Detail: "file:line". */
export const BREAKPOINT_SETTINGS_EVENT = 'tas:breakpoint-settings';
