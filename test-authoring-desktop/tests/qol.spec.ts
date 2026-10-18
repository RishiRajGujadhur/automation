import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const cwd = path.resolve(import.meta.dirname, '..');
const electronPath: string = process.env.TAS_EXE ? path.resolve(process.env.TAS_EXE) : (createRequire(import.meta.url)('electron') as unknown as string);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-qol-'));
let appProcess: ElectronApplication;
let page: Page;

async function launch() {
  appProcess = process.env.TAS_EXE
    ? await electron.launch({ executablePath: electronPath, args: [`--user-data-dir=${userData}`], env: { ...process.env, TAS_TEST: '1' } })
    : await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd, env: { ...process.env, TAS_TEST: '1' } });
  page = await appProcess.firstWindow();
  await page.waitForURL(/127\.0\.0\.1:\d+\/#\//, { timeout: 30_000 });
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 30_000 });
}
/** Clicks a menu item by its path of labels (ampersands ignored). */
const menu = (...labels: string[]) => appProcess.evaluate(({ Menu }, labels) => {
  let items = Menu.getApplicationMenu()!.items;
  for (const [i, l] of labels.entries()) {
    const item = items.find((x) => x.label.replace('&', '') === l);
    if (!item) throw new Error(`Menu item not found: ${l}`);
    if (i === labels.length - 1) { item.click(); return; }
    items = item.submenu!.items;
  }
}, labels);
const clipboardText = () => appProcess.evaluate(({ clipboard }) => clipboard.readText());
const second = (...args: string[]) => new Promise((r) => spawn(electronPath, [...(process.env.TAS_EXE ? [] : ['.']), `--user-data-dir=${userData}`, ...args], { cwd, stdio: 'ignore' }).on('exit', r));

test.beforeAll(launch);
test.afterAll(async () => { await appProcess?.close(); fs.rmSync(userData, { recursive: true, force: true }); });

test('C1–C3, C6: View menu changes studio preferences', async () => {
  await menu('View', 'Theme', 'Light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await menu('View', 'Density', 'Compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await menu('View', 'Text Size', 'Large (A+)');
  await expect(page.locator('html')).toHaveAttribute('data-text', 'large');
  await menu('View', 'Accent', 'Teal');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  await menu('View', 'Theme', 'Studio Dark');
});

test('VS Code layout by default; View → Layout and Algorithm Preset menus', async () => {
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'vscode');
  await expect(page.locator('.activity-bar')).toBeVisible();
  await menu('View', 'Layout', 'Classic (tabs)');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'classic');
  await menu('View', 'Layout', 'VS Code');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'vscode');
  const preset = () => page.evaluate(() => JSON.parse(localStorage.getItem('tas:prefs') ?? '{}'));
  expect((await preset()).algorithmPreset ?? 'essentials').toBe('essentials');
  await menu('View', 'Algorithm Preset', 'Everything');
  await expect.poll(async () => (await preset()).algorithmPreset).toBe('everything');
  await menu('View', 'Algorithm Preset', 'Custom…');
  await expect.poll(async () => (await preset()).algorithmPreset).toBe('custom');
  expect(Object.values((await preset()).algorithms).filter(Boolean).length).toBe(140); // Custom starts from Everything
  await page.keyboard.press('Escape');
});

test('C7/C8: Reduce Motion and High Contrast toggle', async () => {
  await menu('View', 'High Contrast');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await menu('View', 'High Contrast');
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'normal');
  await menu('View', 'Reduce Motion');
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduce');
});

test('W9 + W6: zoom presets apply and are announced', async () => {
  await menu('View', 'Zoom', '125 %');
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBeCloseTo(1.25, 2);
  await expect(page.getByText('Zoom 125%').first()).toBeVisible();
  await menu('View', 'Zoom', '100 %');
});

test('W3: Always on Top', async () => {
  await menu('View', 'Always on Top');
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(true);
  await menu('View', 'Always on Top');
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop())).toBe(false);
});

test('K4, C4, C5: Go and Help menus drive the studio', async () => {
  await menu('Go', 'Test Design Tools', 'Flow Generator');
  await expect(page.getByRole('tab', { name: 'Flow generator' })).toHaveAttribute('data-state', 'active');
  await menu('Help', 'Index Diagnostics');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await menu('File', 'Run Tests…');
  await expect(page.getByRole('dialog', { name: 'Run repository tests' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('K2 + L3: copy a deep link, and deep links navigate the running app', async () => {
  await menu('Go', 'Step Catalog');
  await expect(page).toHaveURL(/#\/step-catalog/);
  await menu('Edit', 'Copy Link to This Page');
  expect(await clipboardText()).toBe('testauthoring://page/step-catalog');
  await second('testauthoring://page/test-design');
  await expect(page).toHaveURL(/#\/test-design/);
});

test('H2: Copy Diagnostics puts versions and paths on the clipboard', async () => {
  await menu('Help', 'Copy Diagnostics');
  const text = await clipboardText();
  expect(text).toContain('Electron ');
  expect(text).toContain(userData);
});

test('R5, R4, R2: sample repository, reopen last closed, pin', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-r-'));
  fs.cpSync(path.resolve(cwd, '../test-authoring-studio/fixtures'), repo, { recursive: true });
  await second(repo);
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), { timeout: 30_000 }).toContain(path.basename(repo));
  await menu('File', 'Open Sample Repository');
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), { timeout: 30_000 }).toContain('fixtures');
  await menu('File', 'Reopen Last Closed Repository');
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), { timeout: 30_000 }).toContain(path.basename(repo));
  await menu('File', 'Pin Repository');
  const store = JSON.parse(fs.readFileSync(path.join(userData, 'desktop.json'), 'utf8'));
  expect(store.pinned.map((p: string) => p.toLowerCase())).toContain(repo.toLowerCase());
  const labels = await appProcess.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label.includes('File'))!.submenu!.items.map((i) => i.label));
  expect(labels).toContain('Unpin Repository');
});

test('K8: New Window opens a second window on the same API', async () => {
  await menu('Window', 'New Window');
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(2);
  await appProcess.evaluate(({ BrowserWindow }) => { const newest = BrowserWindow.getAllWindows().sort((a, b) => b.id - a.id)[0]; newest.close(); });
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
});

test('W1/W2: the last page is restored on the next launch', async () => {
  await menu('Go', 'Selectors');
  await expect(page).toHaveURL(/#\/selectors/);
  await page.waitForTimeout(300);
  const pid = appProcess.process().pid!;
  await appProcess.close();
  // The single-instance lock is held until the old process has fully exited.
  await expect.poll(() => { try { process.kill(pid, 0); return true; } catch { return false; } }, { timeout: 15_000 }).toBe(false);
  await launch();
  await expect(page).toHaveURL(/#\/selectors/);
});

test('E1: text fields get a native context menu', async () => {
  const shown = appProcess.evaluate(({ Menu }) => new Promise<string[]>((resolve) => {
    const orig = Menu.prototype.popup;
    Menu.prototype.popup = function (this: Electron.Menu, ...a: Parameters<Electron.Menu['popup']>) { Menu.prototype.popup = orig; resolve(this.items.map((i) => i.label || i.role || '')); return undefined as never; };
  }));
  await menu('Go', 'Step Catalog');
  const input = page.locator('input[type=search], input[type=text]').first();
  await input.click({ button: 'right' });
  const items = await shown;
  expect(items.join(' ').toLowerCase()).toContain('paste');
});

/** Labels of every native menu, by menu. */
const menuLabels = () => appProcess.evaluate(({ Menu }) => {
  const out: Record<string, string[]> = {};
  for (const m of Menu.getApplicationMenu()!.items) out[m.label.replace('&', '')] = (m.submenu?.items ?? []).filter((i) => i.visible !== false).map((i) => i.label);
  return out;
});
/** Settings ▸ Features ▸ a preset, through the studio's own settings page. */
async function featureSet(name: 'VS essentials' | 'All features') {
  await page.goto(page.url().replace(/#.*$/, '#/features/editor'));
  await menu('File', 'Preferences…');
  await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: /Features/ }).click();
  await page.getByRole('radio', { name }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();
}

test('Settings ▸ Features: the desktop app starts with the Visual Studio essentials; optional Rider features stay out of the menus', async () => {
  let labels = await menuLabels();
  expect(labels).toHaveProperty('Navigate');
  expect(labels.Code).toEqual(expect.arrayContaining(['Insert Live Template…', 'Collapse to Definitions (Ctrl+K, Ctrl+2)']));
  expect(labels.Tools).toEqual(expect.arrayContaining(['External Tools…', 'New File from Template…']));
  expect(labels.View).toEqual(expect.arrayContaining(['Structure', 'Terminal', 'Git Log', 'Show Indent Guides']));
  // Optional (not on in Visual Studio by default): off.
  expect(labels.Tools).not.toContain('Run Anything… (Ctrl twice)');
  expect(labels.Navigate).not.toContain('Select In…');
  expect(labels.Code).not.toContain('Move Statement Up');
  expect(labels.View).not.toContain('Distraction-Free Mode');
  // All features: they appear.
  await featureSet('All features');
  await expect.poll(async () => (await menuLabels()).Tools).toContain('Run Anything… (Ctrl twice)');
  labels = await menuLabels();
  expect(labels.Navigate).toEqual(expect.arrayContaining(['Select In…', 'Next Change', 'Go to Related Files…']));
  expect(labels.Code).toEqual(expect.arrayContaining(['Move Statement Up', 'Unwrap / Remove…']));
  expect(labels.Tools).toEqual(expect.arrayContaining(['Compare with Branch… (Git)']));
});

test('Rider features from the native menus: Structure, Run Anything, Terminal, New File from Template', async () => {
  await page.goto(page.url().replace(/#.*$/, '#/features/editor'));
  await menu('View', 'Structure');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  await menu('Tools', 'Run Anything… (Ctrl twice)');
  await expect(page.getByRole('listbox', { name: 'Run Anything' })).toBeVisible();
  await page.getByRole('dialog', { name: 'Run Anything' }).getByRole('button', { name: 'Close dialog' }).click();
  await menu('View', 'Terminal');
  const screen = page.getByRole('region', { name: 'Terminal' }).locator('.terminal-host:not([hidden]) .xterm-rows');
  await expect(screen).toContainText('PS ', { timeout: 30_000 });
  await page.getByRole('region', { name: 'Terminal' }).locator('.terminal-host:not([hidden])').click();
  await page.keyboard.type('Write-Output ("packaged-" + "shell")');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText('packaged-shell');
  await page.getByRole('button', { name: 'Close Terminal', exact: true }).click();
  await page.getByRole('button', { name: 'Close Structure', exact: true }).click();
  await menu('Tools', 'New File from Template…');
  await expect(page.getByRole('listbox', { name: 'File templates' })).toBeVisible();
  await page.getByRole('dialog', { name: 'New from Template' }).getByRole('button', { name: 'Close dialog' }).click();
  await featureSet('VS essentials');
  await expect.poll(async () => (await menuLabels()).Tools).not.toContain('Run Anything… (Ctrl twice)');
});
