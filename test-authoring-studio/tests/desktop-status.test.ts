import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), tray: vi.fn() }));
vi.mock('../../test-authoring-desktop/node_modules/electron/index.js', () => ({ nativeImage: { createFromDataURL: () => ({}) }, powerSaveBlocker: { start: () => 1, stop: vi.fn() } }));
vi.mock('../../test-authoring-desktop/src/main/context', () => ({ ctx: { origin: 'http://localhost:47310' } }));
vi.mock('../../test-authoring-desktop/src/main/notify', () => ({ notify: mocks.notify }));
vi.mock('../../test-authoring-desktop/src/main/tray', () => ({ updateTray: mocks.tray }));
import { startStatus, stopStatus, state } from '../../test-authoring-desktop/src/main/status';

beforeEach(() => { vi.useFakeTimers(); mocks.notify.mockClear(); mocks.tray.mockClear(); Object.assign(state, { recording: false, running: false, apiDown: false }); });
afterEach(() => { stopStatus(); vi.unstubAllGlobals(); vi.useRealTimers(); });

test('hung status requests time out without overlapping; offline is announced once and recovery clears it', async () => {
  let active = 0, peak = 0;
  const fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    active++; peak = Math.max(peak, active);
    options.signal!.addEventListener('abort', () => { active--; reject(new Error('aborted')); }, { once: true });
  }));
  vi.stubGlobal('fetch', fetch); startStatus();
  await vi.advanceTimersByTimeAsync(25_000);
  expect(peak).toBe(2); expect(active).toBe(0); expect(state.apiDown).toBe(true);
  expect(mocks.notify).toHaveBeenCalledTimes(1);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'idle' }))));
  await vi.advanceTimersByTimeAsync(2000);
  expect(state.apiDown).toBe(false); expect(mocks.tray).toHaveBeenCalled();
});
test('stopping polling aborts pending requests and never schedules another cycle or offline notification', async () => {
  let aborted = 0;
  const fetch = vi.fn((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => { aborted++; reject(new Error('stopped')); }, { once: true });
  }));
  vi.stubGlobal('fetch', fetch); startStatus(); await vi.advanceTimersByTimeAsync(2000);
  stopStatus(); await vi.advanceTimersByTimeAsync(30_000);
  expect(aborted).toBe(2); expect(fetch).toHaveBeenCalledTimes(2); expect(mocks.notify).not.toHaveBeenCalled();
});
test('non-success HTTP responses are offline even if the body contains a status', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 'idle' }), { status: 503 })));
  startStatus(); await vi.advanceTimersByTimeAsync(2000);
  expect(state.apiDown).toBe(true);
});
