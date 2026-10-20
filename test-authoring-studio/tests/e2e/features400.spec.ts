import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Rider and VS Code features (RIDER-VSCODE-FEATURES.md), on a temporary copy of the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-f400-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** Opens the studio (and a file, when given) with clean state and the given VS Code settings. */
async function open(page: Page, file?: string, settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); localStorage.setItem('tas:settings', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, settings);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  if (!file) return;
  await page.getByRole('navigation').getByRole('button', { name: path.basename(file), exact: true }).first().click();
  await expect(page.getByLabel(file.endsWith('.feature') ? 'Gherkin source' : `Source of ${file}`)).toBeVisible();
}
const openSettings = async (page: Page) => { await page.keyboard.press('Control+,'); const d = page.getByRole('dialog', { name: 'Preferences' }); await expect(d).toBeVisible(); return d; };
void path;

test('S2 Settings categories as a collapsible tree', async ({ page }) => {
  await open(page);
  const d = await openSettings(page);
  const nav = d.getByRole('navigation', { name: 'Settings categories' });
  const minimap = nav.getByRole('button', { name: 'Minimap', exact: true });
  await expect(minimap).toBeVisible();
  await nav.getByRole('button', { name: 'Collapse Text Editor' }).click();
  await expect(minimap).toBeHidden();
  await expect(nav.getByRole('button', { name: 'Text Editor', exact: true })).toHaveAttribute('aria-expanded', 'false');
  // Remembered.
  await page.keyboard.press('Escape');
  const d2 = await openSettings(page);
  const nav2 = d2.getByRole('navigation', { name: 'Settings categories' });
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeHidden();
  // Arrow keys: → expands, ← collapses.
  await nav2.getByRole('button', { name: 'Text Editor', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeHidden();
  // A search shows every category again.
  await d2.getByRole('searchbox', { name: 'Search settings' }).fill('minimap scale');
  await expect(nav2.getByRole('button', { name: /Minimap/ })).toBeVisible();
});
