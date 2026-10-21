import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const langServer = path.resolve(import.meta.dirname, '../../langserver/bin/Release/net10.0/LangServer.dll');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

test('Find in Files (Ctrl+Shift+F), Replace in Files (Ctrl+Shift+H) and Go to All (Ctrl+P / Ctrl+T)', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-search-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();

    // Find in Files.
    await page.keyboard.press('Control+Shift+F');
    const view = page.getByRole('region', { name: 'Search' });
    await expect(view.getByLabel('Search in files')).toBeFocused();
    await page.keyboard.type('SearchPage');
    await expect(view.getByRole('status')).toHaveText(/\d+ results? in 1 file/);
    const results = view.getByRole('navigation', { name: 'Search results' });
    await expect(results).toContainText('SearchSteps.cs');
    await results.locator('.search-match').first().click();
    await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/SearchSteps.cs');
    // Match Case + Whole Word narrow it down; a regex finds the attribute patterns.
    await view.getByLabel('Search in files').fill('searchpage');
    await view.getByRole('button', { name: 'Match Case' }).click();
    await expect(view.getByRole('status')).toHaveText('No results found.');
    await view.getByRole('button', { name: 'Match Case' }).click();
    await view.getByLabel('Search in files').fill('\\[(Given|When|Then)\\(');
    await view.getByRole('button', { name: 'Use Regular Expression' }).click();
    await expect(view.getByRole('status')).toHaveText(/results? in 2 files/);
    await view.getByRole('button', { name: 'Use Regular Expression' }).click();

    // Replace in Files, limited to feature files.
    await page.keyboard.press('Control+Shift+H');
    const v2 = page.getByRole('region', { name: 'Search' });
    await v2.getByLabel('Search in files').fill('Google');
    await v2.getByRole('button', { name: 'Toggle search details' }).click();
    await v2.getByLabel('Files to include').fill('*.feature');
    await expect(v2.getByRole('status')).toHaveText(/in 1 file/);
    await v2.getByLabel('Replace with').fill('Bing');
    await v2.getByRole('button', { name: 'Replace All', exact: true }).click();
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await expect.poll(async () => fs.readFile(path.join(root, 'Features/GoogleSearch.feature'), 'utf8')).toContain('Feature: Bing Search');
    expect(await fs.readFile(path.join(root, 'Steps/SearchSteps.cs'), 'utf8')).toContain('opens Google'); // .cs not included

    // Go to All: files always; types and members when the C# language service is built.
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+t');
    const dialog = page.getByRole('dialog', { name: 'Go to All' });
    await dialog.getByLabel('Go to All').fill('hooks');
    await expect(dialog.getByRole('option', { name: /Hooks\.cs/ })).toBeVisible();
    if (existsSync(langServer)) {
      await dialog.getByLabel('Go to All').fill('SSt');
      await dialog.getByRole('radio', { name: 'Types' }).click();
      await expect(dialog.getByRole('option', { name: /SearchSteps/ })).toBeVisible({ timeout: 60_000 });
      await dialog.getByLabel('Go to All').press('Enter');
      await expect(dialog).toHaveCount(0);
      await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('public class SearchSteps');
    }
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
