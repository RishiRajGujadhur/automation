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
