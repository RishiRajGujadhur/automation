import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';

/**
 * README screenshots of the desktop app (not part of the normal run):
 *   TAS_SCREENSHOTS=1 TAS_EXE="release/win-unpacked/TestAuthoring Studio.exe" npx playwright test screenshots
 * Writes docs/screenshots/*.png at the repository root, from the Calculator sample.
 */
test.skip(!process.env.TAS_SCREENSHOTS, 'Set TAS_SCREENSHOTS=1 to capture the README screenshots.');
test.setTimeout(600_000);

const electronPath: string = process.env.TAS_EXE ? path.resolve(process.env.TAS_EXE) : (createRequire(import.meta.url)('electron') as unknown as string);
const localSdk = path.resolve(import.meta.dirname, '../../.tools/dotnet', process.platform === 'win32' ? 'dotnet.exe' : 'dotnet');
if (!process.env.DOTNET_PATH && fs.existsSync(localSdk)) process.env.DOTNET_PATH = localSdk;
const out = path.resolve(import.meta.dirname, '../../docs/screenshots');

let app: ElectronApplication;
let page: Page;
let userData: string;
let repo: string;

const shot = async (name: string) => {
  await page.waitForTimeout(600); // let lenses, hints and fonts settle
  await page.screenshot({ path: path.join(out, `${name}.png`) });
};
const call = (url: string, body?: unknown) => page.evaluate(async ([u, b]) => {
  const r = await fetch(`/api${u}`, b === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  return r.json();
}, [url, body] as const);

test.beforeAll(async () => {
  fs.mkdirSync(out, { recursive: true });
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-shots-'));
  // A clean folder name (it shows in the title bar and Explorer).
  repo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tas-shots-repo-')), 'Calculator');
  fs.cpSync(path.resolve(import.meta.dirname, '../../test-authoring-studio/samples/Calculator'), repo, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  app = process.env.TAS_EXE
    ? await electron.launch({ executablePath: electronPath, args: [`--user-data-dir=${userData}`], env: { ...process.env, TAS_TEST: '1', STUDIO_RECORDER_CDP: '1' } })
    : await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1', STUDIO_RECORDER_CDP: '1' } });
  page = await app.firstWindow();
  await page.waitForURL(/127\.0\.0\.1:\d+\/#\//, { timeout: 30_000 });
  await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.unmaximize(); w.setContentSize(1440, 900); w.center(); });
  await page.evaluate(() => { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); });
  await call('/solution/open', { path: path.join(repo, 'Calculator.csproj') });
  await page.goto(page.url().replace(/#.*$/, '#/features/editor'));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
});
test.afterAll(async () => {
  await call('/debug/control', { action: 'stop' }).catch(() => {});
  await app?.close();
  fs.rmSync(userData, { recursive: true, force: true });
  try { fs.rmSync(path.dirname(repo), { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch { /* in use */ }
});

test('README screenshots', async () => {
  // 1. Feature editor beside the Visual Studio-style Explorer.
  await page.getByRole('navigation').getByRole('button', { name: 'Add.feature', exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  await shot('feature-editor');

  // 2. C# editor: CodeLens (step usages, references), inlay hints, navigation bar.
  await page.getByRole('navigation').getByRole('button', { name: 'CalculatorSteps.cs', exact: true }).first().click();
  await expect(page.locator('.code-editor:not([hidden]) .cm-lens').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.code-editor:not([hidden]) .cm-inlay').first()).toBeVisible({ timeout: 30_000 }).catch(() => {});
  await shot('csharp-editor');

  // 3. Test Explorer after Run All.
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  await expect(te.getByRole('navigation', { name: 'Tests' }).locator('.t-label').first()).toBeVisible({ timeout: 120_000 });
  await te.getByRole('button', { name: 'Run All Tests' }).click();
  await expect(te.getByRole('status').first()).toContainText('last run', { timeout: 300_000 });
  await shot('test-explorer');
  await page.getByRole('button', { name: 'Features (Explorer)' }).click();

  // 4. Debugging a feature file: paused on a .feature breakpoint, debug windows docked below.
  await page.getByRole('navigation').getByRole('button', { name: 'Add.feature', exact: true }).first().click();
  await call('/debug/breakpoints', { file: 'Features/Add.feature', lines: [6] });
  await call('/debug/start', { file: 'Features/Add.feature' });
  await expect.poll(async () => (await call('/debug')).status, { timeout: 240_000, intervals: [1000] }).toBe('paused');
  await expect(page.getByRole('region', { name: 'Debugger' })).toBeVisible();
  await shot('debugger');
  await call('/debug/control', { action: 'stop' });
  await expect.poll(async () => (await call('/debug')).status, { timeout: 60_000 }).not.toBe('paused');

  // 5. Recorder page.
  await page.goto(page.url().replace(/#.*$/, '#/features/recorder'));
  await page.waitForTimeout(800);
  await shot('recorder');

  // 6. Spy: a sign-in page, its submit button picked in the Spy browser (headless with CDP for the capture).
  const site = createServer((_q, r) => { r.setHeader('Content-Type', 'text/html'); r.end('<!doctype html><title>Shop</title><main style="font:16px system-ui;padding:24px"><h1>Sign in</h1><form><p><label>Email <input data-testid="email" name="email"></label></p><p><label>Password <input type="password" id="password"></label></p><button type="submit" id="sign-in">Sign in</button> <a href="/forgot">Forgot password?</a></form></main>'); });
  await new Promise<void>((ok) => site.listen(0, '127.0.0.1', ok));
  const siteUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}/signin`;
  try {
    await page.goto(page.url().replace(/#.*$/, '#/features/spy'));
    const spy = page.getByRole('region', { name: 'Spy' });
    await spy.getByLabel('Page URL').fill(siteUrl);
    await spy.getByRole('button', { name: 'Start Spy' }).click();
    await expect(spy.getByRole('region', { name: 'Element browser' })).toContainText('Sign in', { timeout: 30_000 });
    const cdp = (await call('/spy')).cdpPort;
    const b = await chromium.connectOverCDP(`http://127.0.0.1:${cdp}`);
    const find = () => b.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(siteUrl));
    await expect.poll(() => !!find(), { timeout: 15_000 }).toBe(true);
    await find()!.locator('#sign-in').click();
    await expect(spy.getByRole('region', { name: 'Element properties' })).toContainText('#sign-in', { timeout: 15_000 });
    await shot('spy');
    await b.close().catch(() => {});
    await call('/spy/stop', {});
  } finally {
    site.close();
  }

  // 7. Start Window (every editor closed).
  await page.goto(page.url().replace(/#.*$/, '#/features/editor'));
  while (await page.locator('.editor-tab').count()) await page.locator('.editor-tab button[aria-label^="Close "]').first().click();
  await expect(page.getByRole('region', { name: 'Start Window' })).toBeVisible();
  await shot('start-window');
});
