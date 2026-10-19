import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('DQ27: packaged browser installer respects DND and retains its result in Help', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-browser-notify-'));
  fs.writeFileSync(path.join(profile, 'desktop.json'), JSON.stringify({ doNotDisturb: true, firstRunDone: true }));
  const args = [`--user-data-dir=${profile}`];
  const app = await electron.launch(process.env.TAS_EXE
    ? { executablePath: path.resolve(process.env.TAS_EXE), args, env: { ...process.env, TAS_TEST: '1' } }
    : { args: ['.', ...args], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
    await app.evaluate(async ({ dialog, Notification, Menu }) => {
      const cp = process.getBuiltinModule('child_process');
      const { EventEmitter } = process.getBuiltinModule('events');
      const { syncBuiltinESMExports } = process.getBuiltinModule('module');
      const g = globalThis as any;
      const spawn = cp.spawn, show = Notification.prototype.show, message = dialog.showMessageBox;
      g.browserProbe = { notifications: 0, installs: 0, details: '' };
      cp.spawn = ((...args: any[]) => {
        if (!Array.isArray(args[1]) || !args[1].includes('chromium')) throw new Error('Unexpected subprocess in installer test');
        g.browserProbe.installs++;
        const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
        setTimeout(() => child.emit('close', 0), 20);
        return child;
      }) as typeof cp.spawn;
      syncBuiltinESMExports();
      Notification.prototype.show = () => { g.browserProbe.notifications++; };
      dialog.showMessageBox = (async (...args: any[]) => {
        g.browserProbe.details = args.at(-1).detail;
        return { response: g.browserProbe.installs ? 1 : 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
      g.browserRestore = () => { cp.spawn = spawn; syncBuiltinESMExports(); Notification.prototype.show = show; dialog.showMessageBox = message; };
      Menu.getApplicationMenu()!.items.find((i) => i.label.replace('&', '') === 'Help')!.submenu!.items.find((i) => i.label === 'Playwright Browsers…')!.click();
    });
    await expect.poll(() => JSON.parse(fs.readFileSync(path.join(profile, 'desktop.json'), 'utf8')).lastBrowserInstall?.ok).toBe(true);
    await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label.replace('&', '') === 'Help')!.submenu!.items.find((i) => i.label === 'Playwright Browsers…')!.click());
    const probe = await app.evaluate(() => (globalThis as any).browserProbe);
    expect(probe.notifications).toBe(0);
    expect(probe.installs).toBe(1);
    expect(probe.details).toContain('Playwright Chromium installed');
  } finally {
    await app.evaluate(() => (globalThis as any).browserRestore?.());
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
