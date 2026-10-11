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
  // TAS_EXE=release/win-unpacked/TestAuthoring Studio.exe runs the same checks against a packaged build.
  const exe = process.env.TAS_EXE;
  appProcess = exe
    ? await electron.launch({ executablePath: path.resolve(exe), args: [`--user-data-dir=${userData}`], env: { ...process.env, TAS_TEST: '1' } })
    : await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1' } });
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

test('native menu has the expected menus and navigates by deep link', async () => {
  const labels = await appProcess.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.map((i) => i.label.replace('&', '')));
  expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Go', 'Window', 'Help']));
  await appProcess.evaluate(({ Menu }) => {
    const go = Menu.getApplicationMenu()!.items.find((i) => i.label.includes('Go'))!;
    go.submenu!.items.find((i) => i.label === 'Test Design')!.click();
  });
  await expect(page).toHaveURL(/#\/test-design/);
  await expect(page.getByRole('tab', { name: 'Examples generator' })).toBeVisible();
});

test('menu commands reach the web app (Preferences)', async () => {
  await appProcess.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label.includes('File'))!.submenu!.items.find((i) => i.label.startsWith('Preferences'))!.click());
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('window title shows the page and the repository', async () => {
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle())).toMatch(/Test Design — fixtures — TestAuthoring Studio/);
});

test('bridge refuses files outside the repository and non-http links', async () => {
  const outside = await page.evaluate(() => (window as any).desktop.openInEditor('../../outside.txt').then(() => 'opened', (e: Error) => e.message));
  expect(outside).toMatch(/outside the repository/);
  const link = await page.evaluate(() => (window as any).desktop.openExternal('file:///C:/Windows').then(() => 'opened', (e: Error) => e.message));
  expect(link).toMatch(/Only http/);
});

test('navigation away from the app is blocked', async () => {
  const before = page.url();
  await page.evaluate(() => { location.href = 'https://example.com/'; }).catch(() => {});
  await page.waitForTimeout(500);
  expect(page.url()).toBe(before);
});

test('theme changes reach the native window', async () => {
  await page.evaluate(() => (window as any).desktop.setTheme({ background: '#f4f5f9', text: '#1f2430', dark: false }));
  await expect.poll(() => appProcess.evaluate(({ nativeTheme }) => nativeTheme.themeSource)).toBe('light');
});

test('stores state in the user-data folder, not the app folder', async () => {
  const dataDir = await appProcess.evaluate(({ app }) => app.getPath('userData'));
  expect(path.resolve(dataDir)).toBe(path.resolve(userData));
  await page.evaluate(() => fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  expect(fs.existsSync(path.join(userData, 'desktop.json')) || fs.existsSync(path.join(userData, '.local'))).toBeTruthy();
});
