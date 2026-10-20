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
const menuItem = async (page: Page, menu: string, item: RegExp) => { await page.getByRole('button', { name: `${menu} menu` }).click(); await page.getByRole('menuitem', { name: item }).click(); };

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

const top = async (request: APIRequestContext) => { const s = await debugState(request); const f = s.frames.find((x: { external: boolean }) => !x.external); return { status: s.status as string, at: f ? `${f.file}:${f.line}` : '', name: f?.name as string, hits: (s.hits ?? {}) as Record<string, number> }; };

test('DB6–DB10 When-changed condition, Step Out to Here, Force Run to Cursor, function breakpoint, Just My Code', async ({ page, request }) => {
  const src = await openSteps(page);
  // DB6: stops at Add's body only when First differs from the last hit (the first hit only records it).
  await breakpointAt(page, request, 44);
  const form = await settings(page, 44);
  await form.getByLabel('Condition mode').selectOption('changed');
  await form.getByLabel('Condition', { exact: true }).fill('First');
  await form.getByRole('button', { name: 'Close' }).click();
  // The whole project (three unit tests and the scenario call Add four times).
  expect((await request.post('/api/debug/start', { data: { project: 'Calculator.csproj' } })).ok()).toBe(true);
  await pausedAt(page, request, 44);
  expect((await top(request)).hits[`${STEPS}:44`]).toBe(2);
  // DB8: Step Out to the caller's frame.
  await panel(page).getByRole('tab', { name: 'Call Stack' }).click();
  const caller = panel(page).getByRole('list', { name: 'Call Stack' }).locator('li').nth(1);
  const callerName = (await caller.locator('.dbg-frame-name').textContent())!;
  await caller.locator('button').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Step Out to Here' }).click();
  await expect.poll(async () => (await top(request)).name, { timeout: 60_000 }).toBe(callerName);
  // DB7: Force Run to Cursor to line 45 skips the breakpoint on 44 on the way.
  const hits = (await top(request)).hits[`${STEPS}:44`];
  await page.getByRole('navigation').getByRole('button', { name: 'CalculatorSteps.cs', exact: true }).first().click();
  await src.locator('.cm-line').nth(44).click();
  await menuItem(page, 'Tools', /^Force Run to Cursor/);
  await expect.poll(async () => (await top(request)).at, { timeout: 60_000 }).toBe(`${STEPS}:45`);
  expect((await top(request)).hits[`${STEPS}:44`]).toBe(hits);
  await request.post('/api/debug/control', { data: { action: 'stop' } });
  await expect.poll(async () => (await debugState(request)).status, { timeout: 30_000 }).toMatch(/ended|idle/);
  // DB9: a function breakpoint on Add, the line breakpoint removed.
  await panel(page).getByRole('tab', { name: /^Breakpoints/ }).click();
  await panel(page).getByRole('button', { name: 'Delete all breakpoints' }).click();
  page.once('dialog', (d) => void d.accept('Calculator.Add'));
  await panel(page).getByRole('button', { name: 'New Function Breakpoint…' }).click();
  await expect(panel(page).getByRole('list', { name: 'Function breakpoints' })).toContainText('Calculator.Add()');
  expect((await request.post('/api/debug/start', { data: { project: 'Calculator.csproj' } })).ok()).toBe(true);
  await expect.poll(async () => { const s = await debugState(request); return s.status === 'paused' ? JSON.stringify(s.frames.slice(0, 2).map((f: { name: string; file?: string; line: number }) => `${f.name}@${f.file}:${f.line}`)) : s.status; }, { timeout: 240_000, intervals: [1000] }).toMatch(/Calculator\.Add\(\)@Steps\/CalculatorSteps\.cs:4[34]/);
  await panel(page).getByRole('button', { name: 'Delete function breakpoint Calculator.Add' }).click();
  // DB10
  await panel(page).getByLabel('Just My Code').uncheck();
  await expect.poll(async () => (await (await request.get('/api/debug/options')).json()).justMyCode).toBe(false);
  await panel(page).getByLabel('Just My Code').check();
});

test('DB11–DB15 Edit value, search Locals, JSON visualizer, table visualizer, Threads window', async ({ page, request }) => {
  const steps = path.join(temp, STEPS);
  await fs.writeFile(steps, (await fs.readFile(steps, 'utf8')).replace('        var sum = First + Second;', '        var json = "{\\"a\\":[1,2]}"; var items = new System.Collections.Generic.List<Calculator> { new Calculator { First = 1, Second = 2 }, new Calculator { First = 3 } }; var sum = First + Second;'));
  await openSteps(page);
  await breakpointAt(page, request, 45);
  expect((await request.post('/api/debug/start', { data: { project: 'Calculator.csproj' } })).ok()).toBe(true);
  await pausedAt(page, request, 45);
  await panel(page).getByRole('tab', { name: 'Locals' }).click();
  const locals = panel(page).getByRole('treegrid', { name: 'Locals' });
  const row = (name: string) => locals.getByRole('row').filter({ has: page.locator('.dbg-name', { hasText: new RegExp(`^${name}$`) }) }).first();
  await expect(row('items')).toBeVisible();
  // DB12
  await panel(page).getByLabel('Search Locals').fill('json');
  await expect(locals.getByRole('row')).toHaveCount(2);
  await panel(page).getByLabel('Search Locals').fill('');
  // DB13
  await row('json').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'JSON Visualizer' }).click();
  await expect(panel(page).getByLabel('Visualizer text')).toHaveText('{\n  "a": [\n    1,\n    2\n  ]\n}');
  await panel(page).getByRole('button', { name: 'Close visualizer' }).click();
  // DB14
  await row('items').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'View as Table' }).click();
  const table = panel(page).getByRole('table', { name: 'Visualizer table' });
  await expect(table.locator('th')).toContainText(['#', 'First', 'Second']);
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await panel(page).getByRole('button', { name: 'Close visualizer' }).click();
  // DB11
  await row('sum').locator('.dbg-value').dblclick();
  await panel(page).getByLabel('New value of sum').fill('99');
  await panel(page).getByLabel('New value of sum').press('Enter');
  await expect(row('sum').locator('.dbg-value')).toHaveText('99');
  const frameId = (await debugState(request)).frames.find((f: { external: boolean }) => !f.external).id;
  expect((await (await request.post('/api/debug/evaluate', { data: { expressions: ['sum'], frameId } })).json())[0].result).toBe('99');
  // DB15
  await panel(page).getByRole('tab', { name: 'Threads' }).click();
  const threads = panel(page).getByRole('list', { name: 'Threads' });
  await expect(threads.locator('[aria-current="true"]')).toHaveCount(1);
});
