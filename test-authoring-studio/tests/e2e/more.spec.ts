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

async function openCs(page: Page, file: string, text: string) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: file.split('/').pop(), exact: true }).first().click();
  const src = page.getByLabel(`Source of ${file}`);
  await src.locator('.cm-line', { hasText: text }).first().click();
  return src;
}

test('X1–X24 smoke: menu text tools, /// doc comments, Ctrl+F3, Convert Case', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Doc.cs'), ['namespace Demo;', 'public class Doc', '{', '', '    public int Add(int first, int second) => first + second;', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const src = await openCs(page, 'Steps/Doc.cs', 'public class Doc');
  // X21: /// above a member.
  await src.locator('.cm-line').nth(3).click();
  await page.keyboard.type('    ///');
  await page.keyboard.type('Adds two numbers.');
  expect(await doc(page)).toContain('    /// <summary>\n    /// Adds two numbers.\n    /// </summary>\n    /// <param name="first"></param>\n    /// <param name="second"></param>\n    /// <returns></returns>');
  // X11: Ctrl+F3 finds the next "first".
  await src.locator('.cm-line', { hasText: 'public int Add' }).click();
  await page.keyboard.press('End');
  for (let i = 0; i < 'first + second;'.length - 2; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Control+F3');
  const sel = await page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { from: number; to: number } }; sliceDoc(a: number, b: number): string } } } }).__activeEditor().view; return v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to); });
  expect(sel).toBe('first');
  // X20: Convert Case on the class name.
  await src.locator('.cm-line', { hasText: 'public class Doc' }).click();
  await page.keyboard.press('End');
  await menuItem(page, 'Edit', /Convert Case/);
  await page.getByLabel('Filter case styles').fill('CONSTANT');
  await page.keyboard.press('Enter');
  expect(await doc(page)).toContain('public class DOC');
  // X1: Sort Lines from the Edit menu on a selection.
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'Given the login page');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await menuItem(page, 'Edit', /^Sort Lines/);
  expect(await doc(page)).toContain('    Given the login page is open\n    Then the dashboard is displayed\n    When the user signs in');
});

test('X28 Enable / Disable Breakpoint (Ctrl+F9) keeps the breakpoint, toggles it on and off', async ({ page, request }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('F9');
  const bp = async () => (await (await request.get('/api/debug')).json()).breakpoints['Features/Auth/Login.feature']?.map((b: { enabled?: boolean }) => b.enabled !== false);
  await expect.poll(bp).toEqual([true]);
  await page.keyboard.press('Control+F9');
  await expect.poll(bp).toEqual([false]);
  await page.keyboard.press('Control+F9');
  await expect.poll(bp).toEqual([true]);
  await page.keyboard.press('F9');
});

test('X32 Window Layouts: save the arrangement under a name and apply it later', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Alt+7'); // Structure open
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  await menuItem(page, 'View', /Window Layouts/);
  await page.getByLabel('Layout name').fill('Outline');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Saved layouts' })).toContainText('Outline');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Close Structure', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Structure' })).toHaveCount(0);
  await menuItem(page, 'View', /Window Layouts/);
  await page.getByRole('list', { name: 'Saved layouts' }).getByRole('button', { name: 'Outline', exact: true }).click();
  await page.waitForLoadState('load');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible({ timeout: 20_000 });
});

test('X33 Reset Window Layout: tool windows closed, side bar back', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Alt+7');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await menuItem(page, 'View', /Reset Window Layout/);
  await page.waitForLoadState('load');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Structure' })).toHaveCount(0);
});

test('X34 Reopen Closed Tab brings back the last closed editor; X35 Close Unmodified Tabs keeps edited ones', async ({ page }) => {
  await openFeature(page);
  const tabs = page.locator('.editor-tab-label');
  await page.getByRole('navigation').getByRole('button', { name: 'GoogleSearch.feature', exact: true }).first().click();
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(tabs).toHaveCount(3);
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  await page.getByRole('button', { name: 'Close AuthSteps.cs' }).click();
  await expect(tabs).toHaveCount(2);
  await expect(gherkin(page)).toBeVisible();
  await page.waitForTimeout(1000);
  await menuItem(page, 'View', /Reopen Closed Tab/);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  await page.waitForTimeout(1500);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  // Edit AuthSteps.cs (unsaved), make Login.feature active: Close Unmodified closes only GoogleSearch.feature.
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' // edited');
  await expect(page.locator('.save-state')).toContainText('Unsaved');
  await page.getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await menuItem(page, 'View', /Close Unmodified Tabs/);
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('.editor-tab-label[title="Features/GoogleSearch.feature"]')).toHaveCount(0);
});
