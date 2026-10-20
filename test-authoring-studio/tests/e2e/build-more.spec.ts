import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Build window features of the third batch (IDE-FEATURES.md X102–X104) on the Calculator sample with a compile error.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(400_000);

test('X102–X104 Next Error goes to the compiler error; Output Clear All and Word Wrap', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-build-more-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  const steps = path.join(root, 'Steps/CalculatorSteps.cs');
  await fs.writeFile(steps, (await fs.readFile(steps, 'utf8')).replace('result = calculator.Add();', 'result = calculator.Add() + missingName;'));
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    await expect.poll(async () => (await (await request.get('/api/restore')).json()).status, { timeout: 180_000, intervals: [500] }).toBe('done');
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('button', { name: 'Build menu' }).click();
    await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
    const panel = page.getByRole('region', { name: 'Build' });
    await expect(panel.getByRole('status')).toHaveText(/Build failed/, { timeout: 240_000 });

    // X104 Next Error.
    await page.getByRole('button', { name: 'Navigate menu' }).click();
    await page.getByRole('menuitem', { name: /^Next Error/ }).click();
    await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/CalculatorSteps.cs');
    await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('missingName');

    // X102 Clear All, X103 Word Wrap.
    await panel.getByRole('tab', { name: 'Output' }).click();
    const out = panel.getByLabel('Build output');
    await expect(out).toContainText('Build failed');
    await panel.getByRole('button', { name: 'Toggle Word Wrap' }).click();
    await expect(out).toHaveClass(/wrap/);
    await panel.getByRole('button', { name: 'Clear All' }).click();
    await expect(out).toHaveText('No build output yet.');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('QL70 / QL71 Error List grouped by file; the build result message', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-build-group-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\/](bin|obj)$/.test(s) });
  const steps = path.join(root, 'Steps/CalculatorSteps.cs');
  await fs.writeFile(steps, (await fs.readFile(steps, 'utf8')).replace('result = calculator.Add();', 'result = calculator.Add() + missingName;'));
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    await expect.poll(async () => (await (await request.get('/api/restore')).json()).status, { timeout: 180_000, intervals: [500] }).toBe('done');
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('button', { name: 'Build menu' }).click();
    await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
    const panel = page.getByRole('region', { name: 'Build' });
    await expect(panel.getByRole('status')).toHaveText(/Build failed/, { timeout: 240_000 });
    await expect(page.getByText(/^Build failed in [\d.]+ s: 1 error, \d+ warnings?\.$/).first()).toBeVisible();
    await panel.getByRole('button', { name: 'Group by file' }).click();
    await expect(panel.locator('.error-group-name').first()).toContainText('CalculatorSteps.cs');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
