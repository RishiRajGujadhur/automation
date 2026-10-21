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

const shot = async (name: string, region?: string) => {
  await page.waitForTimeout(600); // let lenses, hints and fonts settle
  // No shortcut reminders, notifications or hover tooltips over the shot (clicked in the DOM: a modal dialog makes
  // the rest of the page inert to the mouse).
  await page.evaluate(() => document.querySelectorAll<HTMLElement>('.key-promoter button[aria-label="Dismiss"], .toast-close').forEach((b) => b.click()));
  await page.mouse.move(2, 2);
  await page.waitForTimeout(300);
  await (region ? page.getByRole('region', { name: region }) : page).screenshot({ path: path.join(out, `${name}.png`) });
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
  // Every feature on for the screenshots (the desktop app starts with the essentials).
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
  // 1. Feature editor beside the Explorer.
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

test('README screenshots: productivity tools', async () => {
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
  await shot('file-structure');
  await page.keyboard.press('Escape');

  // 2. Call Hierarchy of Calculator.Add.
  await cs.locator('.cm-line', { hasText: 'public int Add()' }).click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+Alt+H');
  await expect(page.getByRole('list', { name: 'Callers' })).toContainText('WhenTheTwoNumbersAreAdded', { timeout: 60_000 });
  await shot('call-hierarchy');

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
  await shot('terminal');

  // 4. Problems: solution-wide analysis.
  await app.evaluate(({ Menu }) => { const v = Menu.getApplicationMenu()!.items.find((x) => x.label.replace('&', '') === 'View')!; v.submenu!.items.find((x) => x.label === 'Problems')!.click(); });
  await expect(page.getByRole('region', { name: 'Problems' }).getByRole('toolbar').getByText(/error|warning/)).toBeVisible({ timeout: 120_000 });
  await shot('problems');

  // 5. HTTP Client: send a request from an .http file.
  await page.getByRole('button', { name: 'Show all files' }).click();
  await open('api.http');
  await page.locator('.code-editor:not([hidden]) .cm-http-send').first().click();
  await expect(page.getByRole('region', { name: 'Response' }).getByRole('status')).toHaveText(/^200/, { timeout: 30_000 });
  await shot('http-client');

  // 6. Markdown preview.
  await open('NOTES.md');
  await expect(page.getByRole('article', { name: 'Markdown preview' }).getByRole('heading', { name: 'Calculator tests' })).toBeVisible();
  await shot('markdown-preview');

  // 7. Run Anything (Ctrl twice).
  await page.getByLabel('Source of NOTES.md').click();
  await page.keyboard.press('Control');
  await page.keyboard.press('Control');
  await expect(page.getByRole('listbox', { name: 'Run Anything' })).toContainText('dotnet test');
  await page.getByLabel('Command to run').fill('dotnet');
  await shot('run-anything');
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
  await shot('git-log');

  // 9. Productivity Guide (from the native Help menu).
  await app.evaluate(({ Menu }) => { const help = Menu.getApplicationMenu()!.items.find((x) => x.label.replace('&', '') === 'Help')!; help.submenu!.items.find((x) => x.label === 'Productivity Guide')!.click(); });
  await expect(page.getByRole('table', { name: 'Feature usage' })).toBeVisible();
  await shot('productivity-guide');
  await page.keyboard.press('Escape');
});

test('README screenshots: advanced features', async () => {
  // Sources for the shots: a small type hierarchy and a collection local for the visualizer.
  fs.writeFileSync(path.join(repo, 'Steps', 'Shapes.cs'), ['namespace Calculator;', '', 'public abstract class Shape', '{', '    public abstract double Area();', '}', '', 'public class Circle : Shape', '{', '    public double Radius { get; init; }', '', '    public override double Area()', '    {', '        if (Radius < 0) throw new ArgumentOutOfRangeException(nameof(Radius));', '        var squared = Radius * Radius;', '        return Math.PI * squared;', '    }', '}', '', 'public class Square : Shape', '{', '    public double Side { get; init; }', '    public override double Area() => Side * Side;', '}', ''].join('\n'));
  const steps = path.join(repo, 'Steps', 'CalculatorSteps.cs');
  fs.writeFileSync(steps, fs.readFileSync(steps, 'utf8').replace('        var sum = First + Second;', '        var history = new List<Calculator> { new Calculator { First = 2, Second = 3 }, new Calculator { First = 50, Second = 70 }, new Calculator { First = -4, Second = 4 } };\n        var sum = First + Second;'));
  await call('/scan', {});
  await page.goto(page.url().replace(/#.*$/, '#/features/editor'));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  const explorer = page.getByRole('navigation');

  // 1. Project Properties: the Build page of the .csproj, effective values from the SDK.
  await explorer.getByRole('button', { name: /project Calculator$/ }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Properties', exact: true }).click();
  const props = page.getByRole('dialog', { name: 'Project Properties' });
  await props.getByRole('navigation', { name: 'Property pages' }).getByRole('button', { name: 'Build', exact: true }).click();
  await expect(props.getByText(/^Effective: /).first()).toBeVisible({ timeout: 120_000 });
  await props.getByLabel('Treat warnings as errors').check();
  await props.getByRole('button', { name: 'Preview changes' }).click();
  await expect(props.getByLabel('Diff for Calculator.csproj')).toBeVisible();
  await shot('project-properties');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click().catch(() => {});

  // 2. C#: inheritance gutter, inline blame, exit points and Refactor This.
  await explorer.getByRole('button', { name: 'Shapes.cs', exact: true }).first().click();
  const src = page.getByLabel('Source of Steps/Shapes.cs');
  await expect(page.locator('.cm-inherit button').first()).toBeVisible({ timeout: 120_000 });
  await src.locator('.cm-line', { hasText: 'return Math.PI' }).click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+Alt+Shift+T');
  await expect(page.getByRole('listbox', { name: 'Quick Actions' }).getByRole('option').first()).toBeVisible({ timeout: 60_000 });
  await shot('csharp-refactoring');
  await page.keyboard.press('Escape');

  // 3. Search with Pattern (structural search).
  await app.evaluate(({ Menu }) => { const nav = Menu.getApplicationMenu()!.items.find((x) => x.label.replace('&', '') === 'Navigate')!; nav.submenu!.items.find((x) => x.label.startsWith('Search with Pattern'))!.click(); });
  const ssr = page.getByRole('dialog', { name: 'Search with Pattern' });
  await ssr.getByLabel('Search pattern').fill('$a$ * $a$');
  await ssr.getByLabel('Replace pattern').fill('Math.Pow($a$, 2)');
  await ssr.getByRole('button', { name: 'Find' }).click();
  await expect(ssr.getByRole('list', { name: 'Pattern matches' }).getByRole('listitem').first()).toBeVisible();
  await shot('search-pattern');
  await ssr.getByRole('button', { name: 'Close dialog' }).click();

  // 4. Debugger: a collection local in the table visualizer, breakpoint with a label and its hit count.
  await explorer.getByRole('button', { name: 'CalculatorSteps.cs', exact: true }).first().click();
  await call('/debug/breakpoints', { file: 'Features/Add.feature', lines: [] });
  await call('/debug/breakpoints', { file: 'Steps/CalculatorSteps.cs', breakpoints: [{ line: 46 }] });
  await call('/debug/start', { project: 'Calculator.csproj' });
  await expect.poll(async () => (await call('/debug')).status, { timeout: 240_000, intervals: [1000] }).toBe('paused');
  const dbg = page.getByRole('region', { name: 'Debugger' });
  await dbg.getByRole('tab', { name: 'Locals' }).click();
  const row = dbg.getByRole('treegrid', { name: 'Locals' }).getByRole('row').filter({ has: page.locator('.dbg-name', { hasText: /^history$/ }) }).first();
  await row.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'View as Table' }).click();
  await expect(dbg.getByRole('table', { name: 'Visualizer table' }).locator('tbody tr')).toHaveCount(3, { timeout: 30_000 });
  await shot('debugger-visualizer');
  await call('/debug/control', { action: 'stop' });
});

test('README screenshots: refactoring, analysis, Git and coverage', async () => {
  /** Clicks a native menu item by its label, wherever it is in the menu bar. */
  const menu = (label: string) => app.evaluate(({ Menu }, l) => {
    const walk = (items: Electron.MenuItem[]): boolean => items.some((x) => (x.label === l ? (x.click(), true) : !!x.submenu && walk(x.submenu.items)));
    if (!walk(Menu.getApplicationMenu()!.items)) throw new Error(`No menu item ${l}`);
  }, label);
  const editor = () => page.locator('.code-editor:not([hidden]) .cm-content').first();
  /** Puts the caret in Pricing.cs at a text (through the DOM selection; the editor follows it). */
  const caretAt = async (text: string, offset = 0) => {
    await page.locator('[aria-label="Source of Steps/Pricing.cs"] .cm-line', { hasText: text }).first().click();
    await page.mouse.move(2, 2); // no hover tooltip from where it clicked
    await page.evaluate(([t, o]) => {
      const root = document.querySelector('[aria-label="Source of Steps/Pricing.cs"]')!;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
      const line = [...root.querySelectorAll('.cm-line')].find((l) => l.textContent!.includes(t))!;
      let at = line.textContent!.indexOf(t) + o;
      for (const n of nodes.filter((x) => line.contains(x))) {
        if (at <= n.length) { const r = document.createRange(); r.setStart(n, at); r.collapse(true); const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(r); return; }
        at -= n.length;
      }
    }, [text, offset] as const);
    await page.waitForTimeout(200);
  };
  const pricing = path.join(repo, 'Steps', 'Pricing.cs');
  fs.writeFileSync(pricing, ['using System.Text;', '', 'namespace Calculator;', '', 'public class Pricing', '{', '    public decimal Total(decimal unitPrice, int quantity, bool unused)', '    {', '        var total = unitPrice * quantity;', '        return quantity >= 10 ? total * 0.9m : total;', '    }', '', '    public string Receipt(decimal unitPrice, int quantity)', '    {', '        var text = new StringBuilder();', '        text.Append("Total: ").Append(Total(unitPrice, quantity, false));', '        return text.ToString();', '    }', '', '    public decimal Discount(decimal total) => total * 0.1m;', '}', ''].join('\n'));
  fs.writeFileSync(path.join(repo, 'Tests', 'PricingTests.cs'), ['using NUnit.Framework;', '', 'namespace Calculator.Tests;', '', 'public class PricingTests', '{', '    [Test]', '    public void SmallOrder() => Assert.That(new Pricing().Total(2m, 3, false), Is.EqualTo(6m));', '}', ''].join('\n'));
  await call('/scan', {});
  await page.goto(page.url().replace(/#.*$/, '#/features/editor'));
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'editor.minimap.enabled': true, 'editor.minimap.showSlider': 'always', 'editor.guides.bracketPairs': 'active' })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  const explorer = page.getByRole('navigation');
  const openPricing = async () => { await explorer.getByRole('button', { name: 'Pricing.cs', exact: true }).first().click(); await expect(page.getByLabel('Source of Steps/Pricing.cs')).toBeVisible(); };
  await openPricing();

  // 1. Settings editor: the category tree at Text Editor ▸ Minimap.
  await editor().click();
  await page.keyboard.press('Control+,');
  const prefs = page.getByRole('dialog', { name: 'Preferences' });
  await prefs.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Minimap', exact: true }).click();
  await shot('settings-editor');
  await page.keyboard.press('Escape');

  // 2. Public API: a baseline, then a removed and a changed member are breaking changes.
  await menu('Public API…');
  const api = () => page.getByLabel(/^Public API of /).first();
  await api().getByRole('button', { name: 'Save Baseline…' }).click({ timeout: 120_000 });
  const base = page.getByRole('dialog', { name: /Public API baseline/ });
  await base.getByRole('button', { name: /Apply|Approve/ }).first().click();
  await expect(base.getByRole('button', { name: 'Written' }).first()).toBeVisible();
  await base.getByRole('button', { name: 'Close dialog' }).click();
  const before = fs.readFileSync(pricing, 'utf8');
  fs.writeFileSync(pricing, before.replace(/\n {4}public decimal Discount[^\n]*\n/, '\n').replace('public string Receipt(decimal unitPrice, int quantity)', 'public string Receipt(decimal unitPrice, int quantity, string currency)').replace('return text.ToString();', 'return text.Append(currency).ToString();').replace(/\}\s*$/, '\n    public decimal Tax(decimal total) => total * 0.2m;\n}\n'));
  await page.keyboard.press('Escape');
  await menu('Public API…');
  await expect(api().getByRole('status')).toContainText('breaking change', { timeout: 120_000 });
  await shot('public-api');
  fs.writeFileSync(pricing, before);
  fs.rmSync(path.join(repo, 'PublicAPI.Shipped.txt'), { force: true });
  await page.keyboard.press('Escape');

  // 3. Change Signature: rename, remove and reorder parameters, with the new signature.
  await openPricing();
  await caretAt('decimal Total(', 9);
  await menu('Change Signature…');
  const sig = page.getByRole('dialog', { name: 'Change Signature' });
  await sig.getByLabel('Name of parameter unitPrice').fill('price', { timeout: 60_000 });
  await sig.getByLabel('Remove parameter unused').check();
  await sig.getByRole('button', { name: 'Move quantity up' }).click();
  await expect(sig.getByLabel('New signature')).toContainText('Total(int quantity, decimal price)');
  await shot('change-signature');
  await page.keyboard.press('Escape');

  // 4. Semantic search: methods by kind and attribute.
  await menu('Semantic Search…');
  const sem = page.getByLabel('Semantic Search');
  await sem.getByLabel('Semantic query').fill('kind:method attr:Given');
  await sem.getByLabel('Semantic query').press('Enter');
  await expect(sem.getByLabel('Semantic search results')).toContainText('GivenTheFirstNumberIs', { timeout: 60_000 });
  await shot('semantic-search');
  await page.keyboard.press('Escape');

  // 5. Decompiled source of a framework method.
  await openPricing();
  await caretAt('text.Append', 7);
  await menu('Go to Decompiled Source');
  const dec = page.getByRole('dialog', { name: /StringBuilder \[decompiled/ });
  await expect(dec.locator('.cm-preview-target')).toBeVisible({ timeout: 120_000 });
  await shot('decompiled-source');
  await page.keyboard.press('Escape');

  // 6. Branch coverage: a test that takes one branch of two; partly covered lines in yellow.
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /SmallOrder/ })).toBeVisible({ timeout: 120_000 });
  await tree.locator('.t-label', { hasText: /SmallOrder/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Analyze Code Coverage' }).click();
  await expect(te).toContainText(/Branch \d+(\.\d)?%/, { timeout: 300_000 });
  await page.getByRole('button', { name: 'Features (Explorer)' }).click();
  await openPricing();
  await caretAt('public class Pricing');
  await page.keyboard.press('Control+Home');
  await expect(page.locator('.cm-cov-partial').first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  await shot('branch-coverage');
  await page.getByRole('button', { name: 'Features (Explorer)' }).click();

  // 7. Interactive rebase from the Git Log.
  const { execFileSync } = await import('node:child_process');
  // The studio refreshes Git in the background: retry while its index.lock is held.
  const g = (...args: string[]): string => {
    for (let i = 0; ; i++) {
      try { return execFileSync('git', ['-c', 'user.email=ada@example.com', '-c', 'user.name=Ada Lovelace', ...args], { cwd: repo, encoding: 'utf8', stdio: 'pipe' }); }
      catch (e) { if (i > 20 || !/index\.lock/.test(String((e as { stderr?: string }).stderr))) throw e; execFileSync(process.execPath, ['-e', 'setTimeout(()=>{},250)']); }
    }
  };
  g('add', '-A'); g('commit', '-qm', 'Pricing with a bulk discount');
  for (const [msg, line] of [['Pricing: comment the discount rule', '// Ten or more items: 10% off.'], ['WIP', '// TODO: currencies'], ['Fix typo', '// Prices are in EUR.']]) { fs.appendFileSync(pricing, `${line}\n`); g('commit', '-qam', msg); }
  await editor().click();
  await page.keyboard.press('Alt+9');
  const log = page.getByRole('region', { name: 'Git Log' });
  await log.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: /comment the discount rule/ }).click({ timeout: 30_000 });
  await log.getByRole('button', { name: 'Interactively Rebase from Here…' }).click();
  const rb = log.getByLabel('Interactive Rebase');
  await expect(rb.locator('.git-rebase-row')).toHaveCount(3);
  // Actions without a message box, so the whole plan fits in the panel.
  await rb.getByLabel('Action for WIP').selectOption('fixup');
  await rb.getByRole('button', { name: 'Move Fix typo up' }).click();
  await rb.getByLabel('Action for Fix typo').selectOption('drop');
  await shot('interactive-rebase');
  await rb.getByRole('button', { name: 'Cancel' }).click();

  // 8. Three-way merge editor on a conflict.
  const steps = path.join(repo, 'Steps', 'CalculatorSteps.cs');
  const original = fs.readFileSync(steps, 'utf8');
  g('checkout', '-qb', 'feature/checked');
  fs.writeFileSync(steps, original.replace('var sum = First + Second;', 'var sum = checked(First + Second);'));
  g('commit', '-qam', 'Overflow check in Add');
  g('checkout', '-q', 'main');
  fs.writeFileSync(steps, original.replace('var sum = First + Second;', 'var sum = Math.Clamp(First + Second, int.MinValue, int.MaxValue);'));
  g('commit', '-qam', 'Clamp the sum');
  try { g('merge', 'feature/checked'); } catch { /* conflict expected */ }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Git Changes', exact: true }).click();
  const view = page.getByRole('region', { name: 'Git Changes' });
  await view.getByRole('button', { name: 'Open Merge Editor for Steps/CalculatorSteps.cs' }).click({ timeout: 30_000 });
  const me = page.getByRole('region', { name: 'Merge Editor Steps/CalculatorSteps.cs' });
  await expect(me).toContainText('1 conflict left');
  await shot('merge-editor');
  await me.getByRole('button', { name: 'Accept Incoming' }).click();
  await me.getByRole('button', { name: 'Complete Merge' }).click();
});
