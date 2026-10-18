import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Rider debugger features (RIDER.md J30, J31) on the runnable SpecFlow sample (samples/Calculator).
const debuggerExe = path.resolve(import.meta.dirname, '../../../.tools/netcoredbg/netcoredbg.exe');
test.skip(!existsSync(debuggerExe), 'netcoredbg is not installed (npm run debugger:setup).');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(300_000);

let previous: unknown;
let temp: string;
test.beforeEach(async ({ request, page }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-rider-debug-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', layout: 'classic', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
});
test.afterEach(async ({ request }) => {
  await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

test('J30 Evaluate Expression (Alt+F8): the word at the caret, any expression, members expand, history', async ({ page }) => {
  await page.goto('/#/features/editor');
  await page.getByRole('button', { name: 'Add.feature', exact: true }).first().click();
  const line = (text: string) => page.locator('.gherkin-editor .cm-line', { hasText: text });
  await expect(line('the two numbers are added')).toBeVisible({ timeout: 20_000 });
  await line('the two numbers are added').click();
  await page.keyboard.press('F9');
  await page.keyboard.press('F5');
  const panel = page.getByRole('region', { name: 'Debugger' });
  await expect(panel.getByRole('status')).toHaveText(/Paused · breakpoint/, { timeout: 240_000 });
  await page.keyboard.press('F11');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/CalculatorSteps.cs');
  await expect(page.locator('.code-editor .cm-exec-line')).toBeVisible();
  await page.keyboard.press('F10');
  await expect(page.locator('.code-editor .cm-exec-line')).toHaveText(/result = calculator.Add\(\);/);
  // Caret on "calculator": Alt+F8 starts with it.
  await page.locator('.code-editor .cm-exec-line').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Alt+F8');
  const input = page.getByRole('dialog', { name: 'Evaluate Expression' }).getByLabel('Expression', { exact: true });
  await expect(input).toHaveValue('calculator');
  await page.keyboard.press('Enter');
  const tree = page.getByRole('tree', { name: 'Result' });
  await expect(tree).toContainText('calculator =');
  await tree.getByRole('button', { name: 'Expand calculator' }).click();
  await expect(tree).toContainText('First');
  await input.fill('calculator.First * 2');
  await page.keyboard.press('Enter');
  await expect(tree).toContainText('= 100');
  await input.fill('');
  await page.keyboard.press('ArrowUp');
  await expect(input).toHaveValue('calculator.First * 2');
  await input.fill('nope.Nothing');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Evaluate Expression' }).getByRole('alert')).toBeVisible();
});
