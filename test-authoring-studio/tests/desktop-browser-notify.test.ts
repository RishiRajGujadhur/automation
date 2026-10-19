import { beforeEach, expect, test, vi } from 'vitest';
import { EventEmitter } from 'node:events';
const mocks = vi.hoisted(() => ({ state: {} as Record<string, any>, shown: vi.fn(), dialog: vi.fn(async () => ({ response: 1 })), child: undefined as any }));
vi.mock('../../test-authoring-desktop/node_modules/electron/index.js', () => ({
  app: { isPackaged: true }, dialog: { showMessageBox: mocks.dialog },
  Notification: class { static isSupported() { return true; } on() {} show() { mocks.shown(); } },
}));
vi.mock('node:child_process', () => ({ spawn: () => mocks.child }));
vi.mock('../../test-authoring-desktop/src/main/paths', () => ({ resourcesRoot: () => '/sample/resources' }));
vi.mock('../../test-authoring-desktop/src/main/context', () => ({ ctx: { win: { isFocused: () => false, setProgressBar() {} } } }));
vi.mock('../../test-authoring-desktop/src/main/store', () => ({ read: () => mocks.state, write: (patch: object) => Object.assign(mocks.state, patch) }));
import { installChromium, browsersMenu } from '../../test-authoring-desktop/src/main/browsers';
beforeEach(() => {
  mocks.state = {}; mocks.shown.mockClear(); mocks.dialog.mockClear();
  mocks.child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
});
test.each([0, 1])('DND suppresses install notifications but retains the %s outcome in Help', async (code) => {
  mocks.state.doNotDisturb = true;
  const pending = installChromium(); mocks.child.emit('close', code); await pending;
  expect(mocks.shown).not.toHaveBeenCalled();
  expect(mocks.state.lastBrowserInstall.ok).toBe(code === 0);
  await browsersMenu();
  expect((mocks.dialog.mock.calls[0] as unknown as [unknown, { detail: string }])[1].detail).toContain(mocks.state.lastBrowserInstall.message);
});
test('install completion still notifies when DND is off', async () => {
  const pending = installChromium(); mocks.child.emit('close', 0); await pending;
  expect(mocks.shown).toHaveBeenCalledTimes(1);
});
