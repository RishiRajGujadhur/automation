import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// The Electron binary for the dev build, or the packaged exe.
const electronPath: string = process.env.TAS_EXE ? path.resolve(process.env.TAS_EXE) : (createRequire(import.meta.url)('electron') as unknown as string);

// The debugger test builds a .NET project: use the repository's local SDK when there is one (a packaged copy
// outside the repository cannot find it on its own).
const localSdk = path.resolve(import.meta.dirname, '../../.tools/dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
if (!process.env.DOTNET_PATH && fs.existsSync(localSdk)) process.env.DOTNET_PATH = localSdk;

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
  const info = await page.evaluate(() => ({ bridge: typeof (window as any).desktop?.pickFolder, openSolution: typeof (window as any).desktop?.openSolution, platform: (window as any).desktop?.platform, require: typeof (window as any).require, process: typeof (window as any).process }));
  expect(info).toEqual({ bridge: 'function', openSolution: 'function', platform: process.platform, require: 'undefined', process: 'undefined' });
});

test('native menu has the expected menus and navigates by deep link', async () => {
  const labels = await appProcess.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.map((i) => i.label.replace('&', '')));
  expect(labels).toEqual(expect.arrayContaining(['File', 'Edit', 'View', 'Build', 'Test', 'Debug', 'Go', 'Window', 'Help']));
  await appProcess.evaluate(({ Menu }) => {
    const go = Menu.getApplicationMenu()!.items.find((i) => i.label.includes('Go'))!;
    go.submenu!.items.find((i) => i.label === 'Test Design')!.click();
  });
  await expect(page).toHaveURL(/#\/test-design/);
  await expect(page.getByRole('tab', { name: 'Examples generator' })).toBeVisible();
});

test('File menu: Open Folder, Save, Save All, Close Editor; Debug keys are not swallowed by the menu', async () => {
  const file = await appProcess.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label.includes('File'))!.submenu!.items.map((i) => i.label));
  expect(file).toEqual(expect.arrayContaining(['Open Folder…', 'Save', 'Save All', 'Close Editor', 'Close All Editors']));
  // The web File menu is hidden in the desktop app (the native one replaces it).
  await expect(page.getByRole('button', { name: 'File menu' })).toHaveCount(0);
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

test('dropping a folder opens it, and file changes on disk refresh the index', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-repo-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../../test-authoring-studio/fixtures'), repo, { recursive: true });
  const features = () => page.evaluate(() => fetch('/api/workspace').then((r) => r.json()).then((d) => d.index.stats.features as number));
  // A second launch with a folder argument hands it to the running instance (also how the jump list reopens repositories).
  const second = spawn(electronPath, [...(process.env.TAS_EXE ? [] : ['.']), `--user-data-dir=${userData}`, repo], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'ignore' });
  await new Promise((r) => second.on('exit', r));
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), { timeout: 30_000 }).toContain(path.basename(repo));
  await page.waitForURL(/127\.0\.0\.1/);
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 30_000 });
  const before = await features();
  fs.writeFileSync(path.join(repo, 'Features', 'Added.feature'), 'Feature: Added on disk\n  Scenario: S\n    Given the browser is started\n');
  await expect(page.getByText('Files changed on disk. Repository index refreshed.').first()).toBeVisible({ timeout: 15_000 });
  expect(await features()).toBe(before + 1);
});

test('jump-list style --command arguments reach the running window', async () => {
  const second = spawn(electronPath, [...(process.env.TAS_EXE ? [] : ['.']), `--user-data-dir=${userData}`, '--command=palette'], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'ignore' });
  await new Promise((r) => second.on('exit', r));
  await expect(page.locator('[cmdk-input]')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
  const tasks = await appProcess.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label.includes('Help'))!.submenu!.items.map((i) => i.label));
  expect(tasks).toContain('Playwright Browsers…');
});

test('stores state in the user-data folder, not the app folder', async () => {
  const dataDir = await appProcess.evaluate(({ app }) => app.getPath('userData'));
  expect(path.resolve(dataDir)).toBe(path.resolve(userData));
  await page.evaluate(() => fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }));
  expect(fs.existsSync(path.join(userData, 'desktop.json')) || fs.existsSync(path.join(userData, '.local'))).toBeTruthy();
});

test('C# diagnostics run on the bundled self-contained scanner', async () => {
  const items = await page.evaluate(() => fetch('/api/csharp/diagnostics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'class A { void B() { x } }', path: 'A.cs' }) }).then((r) => r.json()));
  expect(items.some((d: { severity: string }) => d.severity === 'error')).toBe(true);
});

test('debugs a feature with the bundled netcoredbg: .feature breakpoint, step into C#, watch, run to the end', async () => {
  test.setTimeout(300_000);
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-debug-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../../test-authoring-studio/samples/Calculator'), repo, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  const call = (url: string, body?: unknown) => page.evaluate(({ url, body }) => fetch(url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()), { url, body });
  const state = () => call('/api/debug') as Promise<{ status: string; reason?: string; error?: string; output: string; frames: { id: number; file?: string; line: number }[] }>;
  const until = async (status: string, timeout = 60_000) => { await expect.poll(async () => { const s = await state(); return s.status === 'ended' && status !== 'ended' ? `ended: ${s.error ?? s.output.slice(-500)}` : s.status; }, { timeout, intervals: [500] }).toBe(status); return state(); };
  try {
    await call('/api/workspace', { repositoryRoot: repo, targetProject: '.' });
    await call('/api/debug/breakpoints', { file: 'Features/Add.feature', lines: [6] });
    await call('/api/debug/start', { file: 'Features/Add.feature' });
    let s = await until('paused', 240_000);
    expect(s.frames[0]).toMatchObject({ file: 'Features/Add.feature', line: 6 });
    await call('/api/debug/control', { action: 'stepIn' });
    s = await until('paused');
    expect(s.frames[0].file).toBe('Steps/CalculatorSteps.cs');
    const [watch] = await call('/api/debug/evaluate', { expressions: ['calculator.First + calculator.Second'], frameId: s.frames[0].id });
    expect(watch.result).toBe('120');
    await call('/api/debug/control', { action: 'continue' });
    s = await until('ended');
    expect(s.reason).toBe('Tests passed');
  } finally {
    await call('/api/debug/control', { action: 'stop' }).catch(() => {});
    // The stopped test host can hold files for a moment: retry, and never fail the test over a temp folder.
    try { fs.rmSync(repo, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* left for the OS to clean */ }
  }
});

test('C# IntelliSense and go to definition run on the bundled language service', async () => {
  test.setTimeout(120_000);
  const fixtures = path.resolve(import.meta.dirname, '../../test-authoring-studio/fixtures');
  await page.evaluate((root) => fetch('/api/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ repositoryRoot: root, targetProject: '.' }) }), fixtures);
  const call = (url: string, body: unknown) => page.evaluate(({ url, body }) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()), { url, body });
  const source = 'namespace Demo;\nclass Probe { void M(SearchPage page) { page. } }\n';
  const r = await call('/api/csharp/complete', { file: 'Steps/Probe.cs', source, line: 2, column: 46 });
  expect(r.items.map((i: { label: string }) => i.label)).toEqual(expect.arrayContaining(['Search', 'Results', 'Open']));
  const d = await call('/api/csharp/definition', { file: 'Steps/Probe.cs', source, line: 2, column: 25 });
  expect(d.locations[0].file).toBe('Steps/SearchSteps.cs');
});


test('a .slnx passed on the command line (double-click, jump list) opens as the solution', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-sln-'));
  fs.mkdirSync(path.join(repo, 'tests/Specs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'Shop.slnx'), '<Solution><Folder Name="/Tests/"><Project Path="tests/Specs/Specs.csproj" /></Folder></Solution>');
  fs.writeFileSync(path.join(repo, 'tests/Specs/Specs.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
  fs.writeFileSync(path.join(repo, 'tests/Specs/A.feature'), 'Feature: A\n  Scenario: S\n    Given x\n');
  const second = spawn(electronPath, [...(process.env.TAS_EXE ? [] : ['.']), `--user-data-dir=${userData}`, path.join(repo, 'Shop.slnx')], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'ignore' });
  await new Promise((r) => second.on('exit', r));
  await expect.poll(() => appProcess.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), { timeout: 30_000 }).toContain(path.basename(repo));
  await page.waitForURL(/127\.0\.0\.1/);
  const s = await page.evaluate(() => fetch('/api/solution').then((r) => r.json()));
  expect(s.solutionFile).toBe('Shop.slnx');
  expect(s.projects.map((p: { name: string }) => p.name)).toEqual(['Specs']);
  const file = await appProcess.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label.includes('File'))!.submenu!.items.map((i) => i.label));
  expect(file).toContain('Open Project/Solution…');
});
