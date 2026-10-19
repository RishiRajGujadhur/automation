import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Test and debugger features of the third batch (IDE-FEATURES.md) on the runnable Calculator sample.
const debuggerExe = path.resolve(import.meta.dirname, '../../../.tools/netcoredbg/netcoredbg.exe');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(400_000);

let previous: unknown;
let temp: string;
test.beforeEach(async ({ request, page }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-more-tests-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', layout: 'classic', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
});
test.afterEach(async ({ request }) => {
  await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function open(page: Page, name: string, text: string) {
  await page.goto('/#/features/editor');
  await page.getByRole('button', { name, exact: true }).first().click();
  const line = page.locator('.cm-line', { hasText: text }).first();
  await expect(line).toBeVisible({ timeout: 30_000 });
  await line.click();
}

test('X25 Run Tests in Context (Ctrl+R, T) and X27 Repeat Last Test Run (Ctrl+R, L)', async ({ page, request }) => {
  await open(page, 'CalculatorTests.cs', 'AddsTwoNumbers');
  // Discovery needs a build: wait until the test is known.
  await expect.poll(async () => ((await (await request.get('/api/tests')).json()).tests ?? []).length, { timeout: 240_000, intervals: [3000] }).toBeGreaterThan(0);
  await page.locator('.code-editor:not([hidden]) .cm-line', { hasText: 'AddsTwoNumbers' }).first().click();
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  await page.keyboard.press('Control+R');
  await page.keyboard.press('t');
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  expect(runs[0]).toContain('AddsTwoNumbers');
  expect(runs[0]).not.toContain('AddsCases');
  await expect.poll(async () => (await (await request.get('/api/tests/run')).json()).status, { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
  await page.keyboard.press('Control+R');
  await page.keyboard.press('l');
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(2);
  expect(runs[1]).toBe(runs[0]);
});

test('X26 Debug Tests in Context, X29 Show Next Statement, X30 Copy Call Stack', async ({ page, context, request }) => {
  test.skip(!existsSync(debuggerExe), 'netcoredbg is not installed (npm run debugger:setup).');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, 'CalculatorTests.cs', 'Assert.That(calculator.Add(), Is.EqualTo(5));');
  await expect.poll(async () => ((await (await request.get('/api/tests')).json()).tests ?? []).length, { timeout: 240_000, intervals: [3000] }).toBeGreaterThan(0);
  await page.waitForTimeout(1500); // the editor's run glyphs (and the context lookup) use the same discovery
  // The caret is still on the Assert line (from open()); focus the editor without moving it.
  await page.locator('.code-editor:not([hidden]) .cm-content').focus();
  await page.keyboard.press('F9');
  await page.keyboard.press('Control+R');
  await page.keyboard.press('Control+T');
  const panel = page.getByRole('region', { name: 'Debugger' });
  await expect(panel.getByRole('status')).toHaveText(/Paused · breakpoint/, { timeout: 300_000 });
  // Elsewhere, then Alt+Num * comes back to the paused line.
  await page.getByRole('button', { name: 'CalculatorSteps.cs', exact: true }).first().click();
  await page.keyboard.press('Alt+NumpadMultiply');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Tests/CalculatorTests.cs');
  // From the command palette (the menus re-render while the debugger streams its state).
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('Copy Call Stack');
  await page.getByRole('option', { name: /Copy Call Stack/ }).first().click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('AddsTwoNumbers');
  await page.keyboard.press('Shift+F5');
});

test('X64 Run Until Failure: repeats the last run until a failure or N passing runs', async ({ page, request }) => {
  await open(page, 'CalculatorTests.cs', 'AddsTwoNumbers');
  await expect.poll(async () => ((await (await request.get('/api/tests')).json()).tests ?? []).length, { timeout: 240_000, intervals: [3000] }).toBeGreaterThan(0);
  await page.locator('.code-editor:not([hidden]) .cm-line', { hasText: 'AddsTwoNumbers' }).first().click();
  const runs: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/tests/run')) runs.push(r.postData() ?? ''); });
  await page.keyboard.press('Control+R');
  await page.keyboard.press('t');
  await expect.poll(() => runs.length, { timeout: 30_000 }).toBe(1);
  await expect.poll(async () => (await (await request.get('/api/tests/run')).json()).status, { timeout: 240_000, intervals: [2000] }).toMatch(/done|failed/);
  page.once('dialog', (d) => void d.accept('2'));
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await page.getByRole('menuitem', { name: /Run Until Failure/ }).click();
  await expect(page.getByText('All 2 runs passed.').first()).toBeVisible({ timeout: 240_000 });
  expect(runs).toHaveLength(3);
  expect(runs[2]).toBe(runs[0]);
});
