import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Debugs the runnable SpecFlow sample (samples/Calculator) in a temporary copy, with the default VS Code layout.
const debuggerExe = path.resolve(import.meta.dirname, '../../../.tools/netcoredbg/netcoredbg.exe');
test.skip(!existsSync(debuggerExe), 'netcoredbg is not installed (npm run debugger:setup).');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(240_000);

test('breakpoint on a feature line, step into the C# step, watch, step out, call stack, continue to the end', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-debug-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), temp, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await page.getByRole('button', { name: 'Add.feature', exact: true }).first().click();
    const line = (text: string) => page.locator('.gherkin-editor .cm-line', { hasText: text });
    await expect(line('the two numbers are added')).toBeVisible({ timeout: 20_000 });

    // F9 on the cursor line sets a breakpoint (a red dot in the margin).
    await line('the two numbers are added').click();
    await page.keyboard.press('F9');
    await expect(page.locator('.gherkin-editor .cm-breakpoint-gutter .cm-bp:not(.pending):visible')).toBeVisible();
    await expect.poll(async () => (await (await request.get('/api/debug')).json()).breakpoints['Features/Add.feature']?.map((b: { line: number }) => b.line)).toEqual([6]);

    // F5: build, run the feature's tests under the debugger, stop on the Gherkin step.
    await page.keyboard.press('F5');
    const panel = page.getByRole('region', { name: 'Debugger' });
    await expect(panel.getByRole('status')).toHaveText(/Paused · breakpoint/, { timeout: 180_000 });
    await expect(page.locator('.gherkin-editor .cm-exec-line')).toHaveText(/When the two numbers are added/);
    await expect(panel).toBeInViewport();
    await page.screenshot({ path: 'test-results/debugger-feature-breakpoint.png' });

    // F11: Step Into goes from the Gherkin step into its C# step definition.
    await page.keyboard.press('F11');
    await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/CalculatorSteps.cs');
    await expect(page.locator('.code-editor .cm-exec-line')).toBeVisible();
    await page.keyboard.press('F10');
    await expect(page.locator('.code-editor .cm-exec-line')).toHaveText(/result = calculator.Add\(\);/);

    // Watch window: expressions evaluate in the current frame.
    await panel.getByRole('tab', { name: 'Watch 1' }).click();
    await panel.getByLabel('Add item to watch').fill('calculator.First + calculator.Second');
    await panel.getByLabel('Add item to watch').press('Enter');
    await expect(panel.getByRole('treegrid', { name: 'Watch 1' })).toContainText('120');

    // Step Into a method, then Step Out back to the caller.
    await page.keyboard.press('F11');
    await expect(page.locator('.code-editor .cm-exec-line')).toHaveText(/\{/);
    await panel.getByRole('tab', { name: 'Call Stack' }).click();
    await expect(panel.getByRole('list', { name: 'Call Stack' })).toContainText('Calculator.Calculator.Add()');
    await expect(panel.getByRole('list', { name: 'Call Stack' })).toContainText('[External Code]');
    await page.keyboard.press('Shift+F11');
    await expect(page.locator('.code-editor .cm-exec-line')).toHaveText(/result = calculator.Add\(\);/);

    // Locals show the step class and expand on demand.
    await panel.getByRole('tab', { name: 'Locals' }).click();
    await panel.getByRole('button', { name: 'Expand this' }).click();
    await expect(panel.getByRole('treegrid', { name: 'Locals' })).toContainText('calculator');
    await page.screenshot({ path: 'test-results/debugger-step-out.png' });

    // F5: continue to the end; the test passes.
    await page.keyboard.press('F5');
    await expect(panel.getByRole('status')).toHaveText(/Ended · Tests passed/, { timeout: 60_000 });
    await panel.getByRole('tab', { name: 'Output' }).click();
    await expect(panel.getByLabel('Debug output')).toContainText('Passed');
  } finally {
    await request.post('/api/debug/control', { data: { action: 'stop' } }).catch(() => {});
    await request.post('/api/workspace', { data: previous });
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
