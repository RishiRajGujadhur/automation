import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Test Explorer features of the third batch (IDE-FEATURES.md X71–X75) on the runnable Calculator sample.
const langServer = path.resolve(import.meta.dirname, '../../langserver/bin/Release/net10.0/LangServer.dll');
test.skip(!existsSync(langServer), 'The C# language service is not built (npm run langserver:build).');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(400_000);

let previous: unknown;
let root: string;
test.beforeEach(async ({ request, page }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-te-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
const status = async (page: Page) => (await (await page.request.get('/api/tests/run')).json()).status as string;
async function start(page: Page) {
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get('/api/tests')).json()).tests ?? []).length, { timeout: 240_000, intervals: [3000] }).toBeGreaterThan(0);
}

test('X74 / QL99 / QL100 Run All Tests in File: every test of the active file; result message and status bar', async ({ page }) => {
  await start(page);
  await page.getByRole('navigation').getByRole('button', { name: 'CalculatorTests.cs', exact: true }).first().click();
  await expect(page.locator('.cm-line', { hasText: 'AddsTwoNumbers' }).first()).toBeVisible();
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await page.getByRole('menuitem', { name: /Run All Tests in File/ }).click();
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  const all = (await (await page.request.get('/api/tests')).json()).tests as { id: string; file: string }[];
  const mine = all.filter((t) => t.file === 'Tests/CalculatorTests.cs').map((t) => t.id).sort();
  expect(mine.length).toBeGreaterThan(0);
  expect((JSON.parse(runs[0]).ids as string[]).sort()).toEqual(mine);
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
  // QL99 the result message; QL100 the status bar result opens Test Explorer.
  await expect(page.getByText(/^Tests (passed|failed)( in [\d.]+ s)?: \d+ passed, \d+ failed/).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Tests: \d+ passed, \d+ failed$/ }).click();
  await expect(page.getByRole('region', { name: 'Test Explorer' })).toBeVisible();
});

test('X71 X72 X73 X75 Y58 Y59 Test Explorer: group by outcome, search filters, Copy, Collapse / Expand All, Copy Test Name, Export', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible({ timeout: 60_000 });
  // Run the C# tests only (the scenario stays "Not run").
  await tree.locator('.t-label', { hasText: /Calculator\.Tests\.CalculatorTests/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).getByLabel('Passed')).toBeVisible({ timeout: 240_000 });

  // X71 Group by outcome.
  await te.getByLabel('Group by').selectOption('outcome');
  await expect(tree.locator('.t-label', { hasText: /^Passed/ }).first()).toBeVisible();
  await expect(tree.locator('.t-label', { hasText: /^Not run/ })).toBeVisible();
  // X72 Search filters.
  await te.getByLabel('Search Test Explorer').fill('outcome:passed');
  await expect(tree.locator('.t-label', { hasText: /Add two numbers/ })).toHaveCount(0);
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible();
  await te.getByLabel('Search Test Explorer').fill('');
  // X75 Collapse All / Expand All.
  await te.getByRole('button', { name: 'Collapse All' }).click();
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toHaveCount(0);
  await te.getByRole('button', { name: 'Expand All' }).click();
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible();
  // X73 Copy.
  await tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Test Outcome:\tPassed');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Test FullName:\tCalculator.Tests.CalculatorTests.AddsTwoNumbers');
  // Y58 Copy Test Name; Y59 Export results as CSV.
  await tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy Test Name' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Calculator.Tests.CalculatorTests.AddsTwoNumbers');
  const download = page.waitForEvent('download');
  await te.getByRole('button', { name: 'Export results as CSV' }).click();
  const csv = await fs.readFile((await (await download).path())!, 'utf8');
  expect(csv).toMatch(/^Test,Project,Outcome,Duration \(ms\),Message\r\n/);
  expect(csv).toMatch(/Calculator\.Tests\.CalculatorTests\.AddsTwoNumbers,[^,]*,passed,\d+,/);
});

test('X78 Run Tagged Scenarios: the Tags window runs a tag\'s scenarios', async ({ page }) => {
  const feature = (await fs.readdir(path.join(root, 'Features'))).find((f) => f.endsWith('.feature'))!;
  const file = path.join(root, 'Features', feature);
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('  Scenario:', '  @smoke\n  Scenario:'));
  await page.request.post('/api/scan', { data: {} });
  await start(page);
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /^Tags/ }).click();
  await page.getByRole('region', { name: 'Tags' }).getByRole('button', { name: 'Run scenarios tagged @smoke' }).click();
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  const ids = JSON.parse(runs[0]).ids as string[];
  const all = (await (await page.request.get('/api/tests')).json()).tests as { id: string; kind: string }[];
  expect(ids).toEqual(all.filter((t) => t.kind === 'scenario').map((t) => t.id));
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
});

test('X114–X116 Code coverage for selected tests; Run Not Run / Run Passed Tests', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible({ timeout: 60_000 });
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  // X114: one test with coverage.
  await tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Analyze Code Coverage' }).click();
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  expect(JSON.parse(runs[0])).toMatchObject({ coverage: true });
  expect(JSON.parse(runs[0]).ids).toHaveLength(1);
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).getByLabel('Passed')).toBeVisible({ timeout: 30_000 });
  // X115: the others (not run yet).
  await te.getByRole('button', { name: 'More run options' }).click();
  await page.getByRole('menuitem', { name: 'Run Not Run Tests' }).click();
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(2);
  expect(JSON.parse(runs[1]).ids).not.toContain(JSON.parse(runs[0]).ids[0]);
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
  // X116: the passed ones again.
  await te.getByRole('button', { name: 'More run options' }).click();
  await page.getByRole('menuitem', { name: 'Run Passed Tests' }).click();
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(3);
  expect(JSON.parse(runs[2]).ids).toContain(JSON.parse(runs[0]).ids[0]);
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
});

test('X144 / X145 Test Explorer: Group by Tag and tag: filter', async ({ page }) => {
  const feature = (await fs.readdir(path.join(root, 'Features'))).find((f) => f.endsWith('.feature'))!;
  const file = path.join(root, 'Features', feature);
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('  Scenario:', '  @smoke\n  Scenario:'));
  await page.request.post('/api/scan', { data: {} });
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible({ timeout: 60_000 });
  await te.getByLabel('Group by').selectOption('tag');
  await expect(tree.locator('.t-label', { hasText: /^@smoke/ })).toBeVisible();
  await expect(tree.locator('.t-label', { hasText: /^No tags/ })).toBeVisible();
  await te.getByLabel('Group by').selectOption('project');
  await te.getByLabel('Search Test Explorer').fill('tag:@smoke');
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toHaveCount(0);
  await expect(tree.locator('.t-label', { hasText: /Add two numbers/ })).toBeVisible();
});

test('X189 / X190 Test Explorer: Copy dotnet test Filter, failed tests only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible({ timeout: 60_000 });
  await tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy dotnet test Filter' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^dotnet test --filter ".*AddsTwoNumbers.*"$/);
  await te.getByRole('button', { name: 'Show only failed tests' }).click();
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toHaveCount(0);
  await te.getByRole('button', { name: 'Show only failed tests' }).click();
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible();
});

test('X199 Test Explorer: Copy Results Summary', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  await expect(te.getByRole('navigation', { name: 'Tests' }).locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible({ timeout: 60_000 });
  await te.getByRole('button', { name: 'Copy results summary' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Passed \d+, failed \d+, skipped \d+, not run \d+ \(\d+ tests\)/);
});

test('QL24–QL26 Test Explorer: remembers its view, shows the first failure, elapsed time', async ({ page }) => {
  const file = path.join(root, 'Tests/CalculatorTests.cs');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/\}\s*$/, '\n    [Test]\n    public void FailsOnPurpose()\n    {\n        Assert.That(1 + 1, Is.EqualTo(3));\n    }\n}\n'));
  await page.request.post('/api/scan', { data: {} });
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /FailsOnPurpose/ })).toBeVisible({ timeout: 60_000 });
  // The tree refreshes after discovery: retry the click until the run starts.
  await expect(async () => {
    await te.getByRole('button', { name: 'Run All Tests' }).click();
    await expect.poll(() => status(page), { timeout: 5_000 }).toBe('running');
  }).toPass({ timeout: 60_000 });
  await expect(te.getByRole('status')).toContainText(/running \d+ s/, { timeout: 30_000 });
  await expect(te.getByRole('region', { name: 'Test details' })).toContainText('FailsOnPurpose', { timeout: 240_000 });
  // QL24: collapse a group and search; both come back after a reload.
  await te.getByLabel('Search Test Explorer').fill('Adds');
  await page.reload();
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  await expect(te.getByLabel('Search Test Explorer')).toHaveValue('Adds');
});


test('QL67–QL69 Test details: Copy / Run / Debug; arrow keys in the tree', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const file = path.join(root, 'Tests/CalculatorTests.cs');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/\}\s*$/, '\n    [Test]\n    public void FailsOnPurpose()\n    {\n        Assert.That(1 + 1, Is.EqualTo(3));\n    }\n}\n'));
  await page.request.post('/api/scan', { data: {} });
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /FailsOnPurpose/ })).toBeVisible({ timeout: 60_000 });
  // QL69: arrows from the first row.
  await tree.locator('.t-label').first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(tree.locator('.t-label').nth(1)).toBeFocused();
  // QL68: run the selected test from its details.
  await tree.locator('.t-label', { hasText: /FailsOnPurpose/ }).click();
  const details = te.getByRole('region', { name: 'Test details' });
  await expect(async () => {
    await details.getByRole('button', { name: 'Run this test' }).click();
    await expect.poll(() => status(page), { timeout: 5_000 }).toBe('running');
  }).toPass({ timeout: 60_000 });
  await expect(details).toContainText('Expected: 3', { timeout: 240_000 });
  // QL67: copy the message.
  await details.getByRole('button', { name: 'Copy message' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Expected: 3');
});

test('Y71 Run Scenarios with Tag at Caret', async ({ page }) => {
  const feature = (await fs.readdir(path.join(root, 'Features'))).find((f) => f.endsWith('.feature'))!;
  const file = path.join(root, 'Features', feature);
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace('  Scenario:', '  @smoke\n  Scenario:'));
  await page.request.post('/api/scan', { data: {} });
  await start(page);
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  await page.getByRole('navigation').getByRole('button', { name: feature, exact: true }).first().click();
  await page.getByLabel('Gherkin source').locator('.cm-line', { hasText: '@smoke' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('button', { name: 'Code menu' }).click();
  await page.getByRole('menuitem', { name: 'Gherkin', exact: true }).click();
  await page.getByRole('menuitem', { name: /^Run Scenarios with Tag at Caret/ }).click();
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  const all = (await (await page.request.get('/api/tests')).json()).tests as { id: string; kind: string }[];
  expect(JSON.parse(runs[0]).ids).toEqual(all.filter((t) => t.kind === 'scenario').map((t) => t.id));
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
});

test('Y93 / Y94 Slowest tests; continuous testing runs the failed tests again after a save', async ({ page }) => {
  const tests = path.join(root, 'Tests/CalculatorTests.cs');
  await fs.writeFile(tests, (await fs.readFile(tests, 'utf8')).replace('Is.EqualTo(5)', 'Is.EqualTo(6)'));
  await start(page);
  await page.getByRole('navigation').getByRole('button', { name: 'CalculatorTests.cs', exact: true }).first().click();
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible({ timeout: 60_000 });
  await tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
  await expect(tree.locator('.t-label', { hasText: /AddsTwoNumbers/ }).getByLabel('Failed')).toBeVisible({ timeout: 240_000 });
  // Y93
  await te.getByRole('button', { name: 'Slowest tests' }).click();
  await expect(page.getByText(/^Slowest: AddsTwoNumbers \d/).first()).toBeVisible();
  // Y94: turn it on, save a file from the editor: the failed test runs again.
  await te.getByRole('button', { name: 'Continuous testing' }).click();
  await expect(te.getByRole('button', { name: 'Continuous testing' })).toHaveAttribute('aria-pressed', 'true');
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  await page.locator('.editor-tab-label', { hasText: 'CalculatorTests.cs' }).click();
  const src = page.getByLabel('Source of Tests/CalculatorTests.cs');
  await src.locator('.cm-line', { hasText: /Is\.EqualTo\(\D*6\)/ }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' ');
  await page.keyboard.press('Control+S');
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  const all = (await (await page.request.get('/api/tests')).json()).tests as { id: string; method: string }[];
  expect(JSON.parse(runs[0]).ids).toEqual(all.filter((t) => t.method === 'AddsTwoNumbers').map((t) => t.id));
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
});

test('Z6 / Z7 Test history; Run Repeatedly', async ({ page }) => {
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  const tree = te.getByRole('navigation', { name: 'Tests' });
  const test1 = tree.locator('.t-label', { hasText: /AddsTwoNumbers/ });
  await expect(test1).toBeVisible({ timeout: 60_000 });
  page.once('dialog', (d) => void d.accept('2'));
  await test1.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Run Repeatedly…' }).click();
  await expect(page.getByText('Repeated 2×: AddsTwoNumbers 2/2 passed.').first()).toBeVisible({ timeout: 300_000 });
  await test1.click();
  await expect(te.getByLabel('Test history')).toContainText('✓✓');
  await expect(te.getByLabel('Test history')).toContainText('100% passed');
});

test('Z17 / Z20 Test environment variables; Run Impacted Tests', async ({ page }) => {
  const git = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=Ada', ...a], { cwd: root, encoding: 'utf8' });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'base');
  await fs.appendFile(path.join(root, 'Steps/CalculatorSteps.cs'), '\n// changed\n');
  await start(page);
  await page.getByRole('button', { name: 'Test Explorer' }).click();
  const te = page.getByRole('region', { name: 'Test Explorer' });
  await expect(te.getByRole('navigation', { name: 'Tests' }).locator('.t-label', { hasText: /AddsTwoNumbers/ })).toBeVisible({ timeout: 60_000 });
  // Z17
  page.once('dialog', (d) => void d.accept('TAS_PROBE=42'));
  await te.getByRole('button', { name: 'Test environment variables' }).click();
  await expect(te.getByRole('button', { name: 'Test environment variables' })).toHaveAttribute('aria-pressed', 'true');
  // Z20: the changed step file affects the scenarios only.
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  await te.getByRole('button', { name: 'Run impacted tests' }).click();
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  const body = JSON.parse(runs[0]);
  const all = (await (await page.request.get('/api/tests')).json()).tests as { id: string; kind: string }[];
  expect(body.ids).toEqual(all.filter((t) => t.kind === 'scenario').map((t) => t.id));
  expect(body.env).toEqual({ TAS_PROBE: '42' });
  await expect.poll(async () => (await (await page.request.get('/api/tests/run')).json()).output as string, { timeout: 60_000 }).toContain('(environment: TAS_PROBE)');
  await expect.poll(() => status(page), { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
});
