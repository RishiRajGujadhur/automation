import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('Explorer shows C#, JavaScript, TypeScript, and HTML source files by default', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-source-explorer-'));
  try {
    for (const file of ['App.cs', 'app.js', 'app.ts', 'index.html']) await fs.writeFile(path.join(root, file), '');
    await fs.writeFile(path.join(root, 'output.log'), '');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.goto('/#/features/editor');
    const explorer = page.getByRole('region', { name: 'Explorer' });
    for (const file of ['App.cs', 'app.js', 'app.ts', 'index.html']) {
      await expect(explorer.getByRole('button', { name: file, exact: true })).toBeVisible();
    }
    await expect(explorer.getByRole('button', { name: 'output.log', exact: true })).toHaveCount(0);
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});

test('Solution Explorer: solution → project → dependencies → folders, nesting, open C#, search and filters', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.controls.explorer-pending': true })));
  await page.goto('/#/features/editor');
  const se = page.getByRole('region', { name: 'Explorer' });
  // First page after the dev server starts: the solution model can take a few seconds.
  await expect(se.getByText('Solution', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(se.getByRole('button', { name: 'Collapse project Fixtures' })).toBeVisible();
  await se.getByRole('button', { name: 'Expand Dependencies' }).click();
  await expect(se.getByText('SpecFlow.NUnit')).toBeVisible();
  // File nesting: a feature lists the step files its steps bind to.
  await se.getByRole('button', { name: 'Expand nested files of GoogleSearch.feature' }).click();
  await expect(se.locator('.nested-link').filter({ hasText: 'SearchSteps.cs' })).toBeVisible();
  // C# files open in the code editor.
  await se.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  // Ctrl+; searches.
  await page.keyboard.press('Control+;');
  await expect(se.getByRole('textbox', { name: 'Search Explorer' })).toBeFocused();
  await page.keyboard.type('login');
  await expect(se.getByRole('button', { name: 'Login.feature', exact: true })).toBeVisible();
  await expect(se.getByRole('button', { name: 'GoogleSearch.feature', exact: true })).toHaveCount(0);
  await se.getByRole('button', { name: 'Clear search' }).click();
  // Pending changes filter shows only files with unsaved edits (none here).
  await se.getByRole('button', { name: 'Pending changes filter' }).click();
  await expect(se.getByText('No unsaved changes.')).toBeVisible();
});
