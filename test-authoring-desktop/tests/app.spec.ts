import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let appProcess: ElectronApplication;
let page: Page;
let userData: string;

test.beforeAll(async () => {
  // A throwaway profile: window state, workspace and settings never touch the real user-data folder.
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-desktop-'));
  appProcess = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1' } });
  page = await appProcess.firstWindow();
  await page.waitForURL(/127\.0\.0\.1:\d+\/#\//, { timeout: 30_000 });
});
test.afterAll(async () => {
  await appProcess?.close();
  fs.rmSync(userData, { recursive: true, force: true });
});

test('starts the bundled API and loads the studio', async () => {
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 30_000 });
  const health = await page.evaluate(() => fetch('/api/health').then((r) => r.json()));
  expect(health.ok).toBe(true);
  await expect(page).toHaveTitle(/TestAuthoring Studio/);
});

test('exposes the desktop bridge, and no Node globals', async () => {
  const info = await page.evaluate(() => ({ bridge: typeof (window as any).desktop?.pickFolder, platform: (window as any).desktop?.platform, require: typeof (window as any).require, process: typeof (window as any).process }));
  expect(info).toEqual({ bridge: 'function', platform: process.platform, require: 'undefined', process: 'undefined' });
});

test('stores state in the user-data folder, not the app folder', async () => {
  const dataDir = await appProcess.evaluate(({ app }) => app.getPath('userData'));
  expect(path.resolve(dataDir)).toBe(path.resolve(userData));
  await page.evaluate(() => fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  expect(fs.existsSync(path.join(userData, 'desktop.json')) || fs.existsSync(path.join(userData, '.local'))).toBeTruthy();
});
