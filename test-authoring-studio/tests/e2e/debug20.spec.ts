import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Advanced debugging features (DEBUG-20.md, DB1–DB20) in real netcoredbg sessions of samples/Calculator.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(400_000);

let previous: unknown;
let temp: string;
test.beforeEach(async ({ request, page }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-dbg20-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
});
test.afterEach(async ({ request }) => {
  await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
  await expect.poll(async () => (await (await request.get('/api/debug')).json()).status, { timeout: 30_000 }).not.toMatch(/building|starting|running|paused/);
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

const STEPS = 'Steps/CalculatorSteps.cs';
const debugState = async (request: APIRequestContext) => (await request.get('/api/debug')).json();
/** Opens the step definitions (and the debug windows' Breakpoints tab). */
async function openSteps(page: Page) {
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'CalculatorSteps.cs', exact: true }).first().click();
  const src = page.getByLabel(`Source of ${STEPS}`);
  await expect(src.locator('.cm-line').first()).toBeVisible();
  return src;
}
/** F9 on a line of the step definitions. */
async function breakpointAt(page: Page, request: APIRequestContext, line: number) {
  const src = page.getByLabel(`Source of ${STEPS}`);
  await src.locator('.cm-line').nth(line - 1).click();
  await page.keyboard.press('F9');
  await expect.poll(async () => ((await debugState(request)).breakpoints[STEPS] ?? []).map((b: { line: number }) => b.line)).toContain(line);
}
/** Breakpoint Settings of a breakpoint, in the Breakpoints window. */
async function settings(page: Page, line: number) {
  await page.evaluate((k) => window.dispatchEvent(new CustomEvent('tas:breakpoint-settings', { detail: k })), `${STEPS}:${line}`);
  return page.getByRole('form', { name: `Breakpoint settings for ${STEPS}:${line}` });
}
const panel = (page: Page) => page.getByRole('region', { name: 'Debugger' });
/** F5, then waits for a pause on the given line of the step definitions. */
async function pausedAt(page: Page, request: APIRequestContext, line: number) {
  await expect.poll(async () => { const s = await debugState(request); return s.status === 'paused' ? `${s.frames.find((f: { external: boolean }) => !f.external)?.file}:${s.frames.find((f: { external: boolean }) => !f.external)?.line}` : s.status; }, { timeout: 240_000, intervals: [1000] }).toBe(`${STEPS}:${line}`);
}
const go = async (page: Page) => { await page.keyboard.press('F5'); };

test('DB1–DB5 Breakpoints window: search, labels, hit counts; disable once hit; dependent breakpoints', async ({ page, request }) => {
  await openSteps(page);
  for (const l of [15, 21, 27]) await breakpointAt(page, request, l);
  // DB4: line 21 disables itself once hit. DB2: line 27 gets labels. DB5: line 15 waits for line 27.
  let form = await settings(page, 21);
  await form.getByLabel('Disable breakpoint once hit').check();
  await form.getByRole('button', { name: 'Close' }).click();
  form = await settings(page, 27);
  await form.getByLabel('Labels').fill('add, math');
  await form.getByRole('button', { name: 'Close' }).click();
  form = await settings(page, 15);
  await form.getByLabel('Only enable after breakpoint').selectOption(`${STEPS}:27`);
  await form.getByRole('button', { name: 'Close' }).click();
  const list = panel(page).getByRole('list', { name: 'Breakpoints' });
  await expect(list.locator('.bp-label')).toHaveText(['add', 'math']);
  await expect(panel(page).getByLabel(`Enable breakpoint ${STEPS}:15`)).not.toBeChecked();
  // DB1
  await panel(page).getByLabel('Search breakpoints').fill('math');
  await expect(list.locator('li')).toHaveCount(1);
  await panel(page).getByLabel('Search breakpoints').fill('');
  // Session: 15 is skipped (waits for 27), 21 stops and disables itself, 27 stops and enables 15.
  await page.getByLabel(`Source of ${STEPS}`).click();
  await go(page);
  await pausedAt(page, request, 21);
  await expect(panel(page).getByLabel(`Enable breakpoint ${STEPS}:21`)).not.toBeChecked();
  await go(page);
  await pausedAt(page, request, 27);
  await expect(panel(page).getByLabel(`Enable breakpoint ${STEPS}:15`)).toBeChecked();
  // DB3
  await panel(page).getByRole('tab', { name: /^Breakpoints/ }).click();
  await expect(list.locator('li', { hasText: 'line 21' }).locator('.bp-hits')).toHaveText('hit 1×');
  await expect(list.locator('li', { hasText: 'line 27' }).locator('.bp-hits')).toHaveText('hit 1×');
  await go(page);
  await expect.poll(async () => (await debugState(request)).status, { timeout: 120_000 }).toMatch(/ended|idle/);
  // A new session waits for line 27 again.
  await expect(panel(page).getByLabel(`Enable breakpoint ${STEPS}:15`)).not.toBeChecked();
});
