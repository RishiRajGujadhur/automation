import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Advanced Visual Studio 2026 / Rider features (ADVANCED-20.md, Z1–Z20), end to end.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-adv-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function open(page: Page, file = 'Login.feature') {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: file, exact: true }).first().click();
}
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
/** Replaces the active editor's text and selection (test setup only). */
const setDoc = (page: Page, text: string, anchor = 0, head = anchor) => page.evaluate(([t, a, h]) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(s: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, selection: { anchor: a, head: h } }); v.focus(); }, [text, anchor, head] as const);
const menuItem = async (page: Page, menu: string, item: RegExp) => { await page.getByRole('button', { name: `${menu} menu` }).click(); await page.getByRole('menuitem', { name: item }).click(); };
const gherkinItem = async (page: Page, item: RegExp) => { await page.getByRole('button', { name: 'Code menu' }).click(); await page.getByRole('menuitem', { name: 'Gherkin', exact: true }).click(); await page.getByRole('menuitem', { name: item }).click(); };
void gherkinItem; void menuItem;
const codeSub = async (page: Page, sub: string, item: RegExp) => { await page.getByRole('button', { name: 'Code menu' }).click(); await page.getByRole('menuitem', { name: sub, exact: true }).click(); await page.getByRole('menuitem', { name: item }).click(); };
void codeSub;

test('Z2 / Z4 / Z5 Merge conflict actions, postfix templates, outline preview', async ({ page }) => {
  await open(page, 'AuthSteps.cs');
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  // Z2
  await setDoc(page, 'a\n<<<<<<< HEAD\nmine\n=======\ntheirs\n>>>>>>> feature\nz', 0);
  const bar = page.getByRole('toolbar', { name: 'Merge conflict' });
  await expect(bar).toBeVisible();
  await expect(page.locator('.cm-conflict-current')).toHaveText('mine');
  await bar.getByRole('button', { name: 'Accept Incoming' }).click();
  await expect.poll(() => doc(page)).toBe('a\ntheirs\nz');
  // Z4
  await setDoc(page, '    user.notnull', 16);
  await page.keyboard.press('Tab');
  await expect.poll(() => doc(page)).toBe('    if (user is not null)\n    {\n        \n    }');
  await setDoc(page, '        var t = 1;\n        page.GetTitle().var', 46);
  await page.keyboard.press('Tab');
  await expect.poll(() => doc(page)).toBe('        var t = 1;\n        var title = page.GetTitle();');
  // Z5
  await page.getByRole('navigation', { name: 'Solution' }).getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  const src = 'Feature: F\n  Scenario Outline: As <r>\n    Given I am <r>\n\n    Examples:\n      | r |\n      | a |\n      | b |\n';
  await setDoc(page, src, 20);
  await gherkinItem(page, /^Preview Expanded Outline/);
  await expect(page.getByLabel('Preview text')).toHaveText('  Scenario: As a\n    Given I am a\n\n  Scenario: As b\n    Given I am b');
  await page.keyboard.press('Escape');
  expect(await doc(page)).toBe(src);
});
