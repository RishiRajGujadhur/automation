import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(300_000);

test('Build ▸ Build Solution: Error List with the compiler error, double-click goes to the line, fix and rebuild succeeds', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-build-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  const steps = path.join(root, 'Steps/CalculatorSteps.cs');
  const good = await fs.readFile(steps, 'utf8');
  await fs.writeFile(steps, good.replace('result = calculator.Add();', 'result = calculator.Add() + missingName;'));
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    // Restore on open: the copied project has no obj/ yet, so packages restore in the background.
    await expect.poll(async () => (await (await request.get('/api/restore')).json()).status, { timeout: 180_000, intervals: [500] }).toBe('done');
    expect(await fs.stat(path.join(root, 'obj/project.assets.json')).then(() => true, () => false)).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();

    await page.getByRole('button', { name: 'Build menu' }).click();
    await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
    const panel = page.getByRole('region', { name: 'Build' });
    await expect(panel.getByRole('status')).toHaveText(/Build failed/, { timeout: 240_000 });
    const list = panel.getByRole('grid', { name: 'Error List' });
    const row = list.getByRole('row').filter({ hasText: 'CS0103' });
    await expect(row).toContainText("The name 'missingName' does not exist");
    await expect(row).toContainText('CalculatorSteps.cs');
    await expect(row).toContainText('Calculator');
    // Double-click goes to the line in the editor.
    await row.dblclick();
    await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/CalculatorSteps.cs');
    await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('missingName');
    // The Output window has the build log.
    await panel.getByRole('tab', { name: 'Output' }).click();
    await expect(panel.getByLabel('Build output')).toContainText('Build failed: 1 error(s)');

    // Build on save: fix the line in the editor and save (Ctrl+S); the build starts by itself.
    await panel.getByLabel('Build on save').check();
    await page.locator('.code-editor:not([hidden]) .cm-activeLine').click();
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowLeft');
    for (let i = 0; i < ' + missingName'.length; i++) await page.keyboard.press('Backspace');
    await page.keyboard.press('Control+S');
    await expect.poll(async () => fs.readFile(steps, 'utf8')).toBe(good);
    await expect(panel.getByRole('status')).toHaveText(/Build succeeded/, { timeout: 240_000 });
    await panel.getByRole('tab', { name: /Error List/ }).click();
    await expect(panel.getByText('No errors or warnings.')).toBeVisible();
  } finally {
    await request.post('/api/build/cancel').catch(() => {});
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
