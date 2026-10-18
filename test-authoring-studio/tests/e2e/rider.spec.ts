import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// JetBrains Rider features (RIDER.md, J1–J37).
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-rider-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function openFeature(page: Page, name = 'Login.feature') {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
}
const gherkin = (page: Page) => page.getByLabel('Gherkin source');
/** Puts the caret on the first line containing `text`, at `text`'s first character. */
async function caretAt(page: Page, text: string) {
  const line = gherkin(page).locator('.cm-line', { hasText: text }).first();
  await line.click();
  const full = (await line.textContent()) ?? '';
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft', { delay: 0 });
  for (let i = 1; i < full.length - full.indexOf(text); i++) await page.keyboard.press('ArrowLeft');
}
const selected = (page: Page) => page.evaluate(() => getSelection()?.toString() ?? '');

test('J1 Extend / Shrink Selection: word, line, scenario; back again; also from the Edit menu', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Shift+Alt+ArrowRight');
  expect(await selected(page)).toBe('signs');
  await page.keyboard.press('Shift+Alt+ArrowRight');
  expect(await selected(page)).toMatch(/^When the user signs in/);
  await page.keyboard.press('Shift+Alt+ArrowRight');
  expect((await selected(page)).split('\n').length).toBeGreaterThan(1);
  await page.keyboard.press('Shift+Alt+ArrowLeft');
  await page.keyboard.press('Shift+Alt+ArrowLeft');
  expect(await selected(page)).toBe('signs');
  await page.getByRole('button', { name: 'Edit menu' }).click();
  await page.getByRole('menuitem', { name: /Extend Selection/ }).click();
  expect(await selected(page)).toMatch(/^When the user signs in/);
});
