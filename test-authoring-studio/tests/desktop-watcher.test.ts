import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';

const state = vi.hoisted(() => ({ autoRescan: true, send: vi.fn() }));
vi.mock('../../test-authoring-desktop/src/main/store', () => ({ read: () => state, write: (patch: object) => Object.assign(state, patch) }));
vi.mock('../../test-authoring-desktop/src/main/context', () => ({ ctx: { repository: 'B', win: { isDestroyed: () => false, webContents: { send: state.send } } } }));
import { watchRepository, stopWatching, setAutoRescan } from '../../test-authoring-desktop/src/main/watcher';

let watches: { events: EventEmitter; change: (event: string, name: string) => void; close: ReturnType<typeof vi.fn> }[];
beforeEach(() => {
  vi.useFakeTimers(); state.autoRescan = true; state.send.mockClear(); watches = [];
  vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  vi.spyOn(fs, 'watch').mockImplementation(((_folder: string, _options: unknown, change: (event: string, name: string) => void) => {
    const events = new EventEmitter(); const close = vi.fn();
    watches.push({ events, change, close });
    return Object.assign(events, { close });
  }) as unknown as typeof fs.watch);
});
afterEach(() => { stopWatching(); vi.restoreAllMocks(); vi.useRealTimers(); });

test('a repository switch cancels the old debounce and ignores late events and errors', () => {
  watchRepository('A'); watches[0].change('change', 'A.feature');
  watchRepository('B');
  watches[0].change('change', 'Late.feature'); watches[0].events.emit('error', new Error('old watcher'));
  vi.advanceTimersByTime(1500); expect(state.send).not.toHaveBeenCalled();
  expect(watches[1].close).not.toHaveBeenCalled();
  watches[1].change('change', 'B.feature'); vi.advanceTimersByTime(1200);
  expect(state.send).toHaveBeenCalledTimes(1);
});
test.each(['stop', 'disable', 'error'])('%s cancels a queued refresh', (action) => {
  watchRepository('A'); watches[0].change('change', 'A.cs');
  if (action === 'stop') stopWatching();
  if (action === 'disable') setAutoRescan(false);
  if (action === 'error') watches[0].events.emit('error', new Error('watch failed'));
  vi.advanceTimersByTime(1500); expect(state.send).not.toHaveBeenCalled();
});
