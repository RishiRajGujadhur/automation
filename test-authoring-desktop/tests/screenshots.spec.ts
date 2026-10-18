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
  // Every feature on for the screenshots (the desktop app starts with the Visual Studio essentials).
  await page.evaluate(() => { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); localStorage.setItem('tas:features', JSON.stringify({ preset: 'all' })); });
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

test('README screenshots: JetBrains Rider features', async () => {
  // Files for the HTTP Client and Markdown preview (the Explorer re-reads the folder).
  const origin = new URL(page.url()).origin;
  fs.writeFileSync(path.join(repo, 'api.http'), [`@host = ${origin}`, '', '### Studio health', 'GET {{host}}/api/health', 'Accept: application/json', '', '### Workspace', 'GET {{host}}/api/workspace', ''].join('\n'));
  fs.writeFileSync(path.join(repo, 'NOTES.md'), ['# Calculator tests', '', 'Scenarios for **Add**, run from the feature files.', '', '| Feature | Scenarios | Status |', '| --- | --- | --- |', '| Add | 2 | passing |', '', '- [x] Positive numbers', '- [ ] Overflow', '', '```csharp', 'var result = calculator.Add();', '```', ''].join('\n'));
  await call('/scan', {});
  await page.goto(page.url().replace(/#.*$/, '#/features/editor'));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  const explorer = page.getByRole('navigation');
  const open = async (name: string) => { await explorer.getByRole('button', { name, exact: true }).first().click(); };

  // 1. Structure tool window and the File Structure popup on a C# file.
  await open('CalculatorSteps.cs');
  const cs = page.getByLabel('Source of Steps/CalculatorSteps.cs');
  await cs.locator('.cm-line', { hasText: 'result = calculator.Add();' }).click();
  await page.keyboard.press('Alt+7');
  await expect(page.getByRole('list', { name: 'Structure of the file' }).getByRole('button').first()).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('Control+Alt+F12');
  await expect(page.getByRole('listbox', { name: 'File structure' }).getByRole('option').first()).toBeVisible({ timeout: 60_000 });
  await shot('rider-file-structure');
  await page.keyboard.press('Escape');

  // 2. Call Hierarchy of Calculator.Add.
  await cs.locator('.cm-line', { hasText: 'public int Add()' }).click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+Alt+H');
  await expect(page.getByRole('list', { name: 'Callers' })).toContainText('WhenTheTwoNumbersAreAdded', { timeout: 60_000 });
  await shot('rider-call-hierarchy');

  // 3. Terminal.
  await page.keyboard.press('Control+`');
  const term = page.getByRole('region', { name: 'Terminal' });
  const screen = term.locator('.terminal-host:not([hidden]) .xterm-rows');
  await expect(screen).toContainText('PS ', { timeout: 30_000 });
  await term.locator('.terminal-host:not([hidden])').click();
  await page.keyboard.type('Get-ChildItem -Recurse -Name -Include *.feature, *.cs | Where-Object { $_ -notmatch "obj|bin" }');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText('CalculatorSteps.cs', { timeout: 30_000 });
  await page.keyboard.type('git --version');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await shot('rider-terminal');

  // 4. Problems: solution-wide analysis.
  await app.evaluate(({ Menu }) => { const v = Menu.getApplicationMenu()!.items.find((x) => x.label.replace('&', '') === 'View')!; v.submenu!.items.find((x) => x.label === 'Problems')!.click(); });
  await expect(page.getByRole('region', { name: 'Problems' }).getByRole('toolbar').getByText(/error|warning/)).toBeVisible({ timeout: 120_000 });
  await shot('rider-problems');

  // 5. HTTP Client: send a request from an .http file.
  await page.getByRole('button', { name: 'Show all files' }).click();
  await open('api.http');
  await page.locator('.code-editor:not([hidden]) .cm-http-send').first().click();
  await expect(page.getByRole('region', { name: 'Response' }).getByRole('status')).toHaveText(/^200/, { timeout: 30_000 });
  await shot('rider-http-client');

  // 6. Markdown preview.
  await open('NOTES.md');
  await expect(page.getByRole('article', { name: 'Markdown preview' }).getByRole('heading', { name: 'Calculator tests' })).toBeVisible();
  await shot('rider-markdown-preview');

  // 7. Run Anything (Ctrl twice).
  await page.getByLabel('Source of NOTES.md').click();
  await page.keyboard.press('Control');
  await page.keyboard.press('Control');
  await expect(page.getByRole('listbox', { name: 'Run Anything' })).toContainText('dotnet test');
  await page.getByLabel('Command to run').fill('dotnet');
  await shot('rider-run-anything');
  await page.keyboard.press('Escape');

  // 8. Git Log (Alt+9): the sample as a small Git history with a branch.
  {
    const { execFileSync } = await import('node:child_process');
    const g = (...args: string[]) => execFileSync('git', ['-c', 'user.email=ada@example.com', '-c', 'user.name=Ada Lovelace', ...args], { cwd: repo });
    g('init', '-q', '-b', 'main'); g('add', '-A'); g('commit', '-qm', 'Calculator sample: Add feature and steps');
    g('checkout', '-qb', 'feature/subtract');
    fs.appendFileSync(path.join(repo, 'Features', 'Add.feature'), '\n  Scenario: Add a negative number\n    Given the first number is 50\n    And the second number is -20\n    When the two numbers are added\n    Then the result should be 30\n');
    g('commit', '-qam', 'Add a scenario with a negative number\n\nCovers the sign handling in Calculator.Add.');
    g('checkout', '-q', 'main');
  }
  await page.locator('.gherkin-editor .cm-content, .code-editor:not([hidden]) .cm-content').first().click().catch(() => {});
  await page.keyboard.press('Alt+9');
  const log = page.getByRole('region', { name: 'Git Log' });
  await expect(log.getByRole('listbox', { name: 'Commits' }).getByRole('option').first()).toBeVisible({ timeout: 30_000 });
  await log.getByRole('listbox', { name: 'Commits' }).getByRole('option').first().click();
  await expect(log.getByLabel('Patch')).toContainText('negative', { timeout: 15_000 });
  await shot('rider-git-log');

  // 9. Productivity Guide (from the native Help menu).
  await app.evaluate(({ Menu }) => { const help = Menu.getApplicationMenu()!.items.find((x) => x.label.replace('&', '') === 'Help')!; help.submenu!.items.find((x) => x.label === 'Productivity Guide')!.click(); });
  await expect(page.getByRole('table', { name: 'Feature usage' })).toBeVisible();
  await shot('rider-productivity-guide');
  await page.keyboard.press('Escape');
});
