import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Third batch of Visual Studio 2026 / Rider features (IDE-FEATURES.md, X1–X200), end to end.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-more-'));
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
async function caretAt(page: Page, text: string) {
  const line = gherkin(page).locator('.cm-line', { hasText: text }).first();
  await line.click();
  const full = (await line.textContent()) ?? '';
  await page.keyboard.press('End');
  for (let i = 0; i < full.length - full.indexOf(text); i++) await page.keyboard.press('ArrowLeft');
}
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
const menuItem = async (page: Page, menu: string, item: RegExp) => { await page.getByRole('button', { name: `${menu} menu` }).click(); await page.getByRole('menuitem', { name: item }).click(); };

test('X16 Overtype mode (Insert): typing replaces characters; OVR in the status bar', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'login page');
  await page.keyboard.press('Insert');
  await expect(page.getByRole('button', { name: 'Overtype mode: on' })).toBeVisible();
  await page.keyboard.type('LOGIN');
  expect(await doc(page)).toContain('Given the LOGIN page is open');
  await page.keyboard.press('Insert');
  await expect(page.getByRole('button', { name: 'Overtype mode: on' })).toHaveCount(0);
  await page.keyboard.type('x');
  expect(await doc(page)).toContain('Given the LOGINx page is open');
});

test('X17 View ▸ Highlight Current Line turns the caret line background off and on', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'login page');
  const editor = page.locator('.gherkin-editor .cm-editor');
  await expect(editor).not.toHaveClass(/cm-no-active-line/);
  await menuItem(page, 'View', /Highlight Current Line/);
  await expect(editor).toHaveClass(/cm-no-active-line/);
  await expect(page.locator('.gherkin-editor .cm-activeLine').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await menuItem(page, 'View', /Highlight Current Line/);
  await expect(editor).not.toHaveClass(/cm-no-active-line/);
});
