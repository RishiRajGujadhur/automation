import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
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

test('X74 Run All Tests in File: every test of the active file', async ({ page }) => {
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
});

test('X71 X72 X73 X75 Test Explorer: group by outcome, search filters, Copy, Collapse / Expand All', async ({ page, context }) => {
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
});
