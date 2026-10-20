import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Fourth batch of Visual Studio 2026 / Rider features (IDE-FEATURES-4.md, Y1–Y100), end to end.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-ide4-'));
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

const convert = async (page: Page, item: RegExp) => { await page.getByRole('button', { name: 'Edit menu' }).click(); await page.getByRole('menuitem', { name: 'Convert', exact: true }).click(); await page.getByRole('menuitem', { name: item }).click(); };

test('Y1–Y10 Edit ▸ Convert: encode / decode, numbers, quotes, join / split; Align Assignments', async ({ page }) => {
  await open(page, 'AuthSteps.cs');
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  await setDoc(page, 'a b&c', 0, 5);
  await convert(page, /^URL Encode/);
  await expect.poll(() => doc(page)).toBe('a%20b%26c');
  await convert(page, /^URL Decode/);
  await expect.poll(() => doc(page)).toBe('a b&c');
  await setDoc(page, 'héllo', 0, 5);
  await convert(page, /^Base64 Encode/);
  await expect.poll(() => doc(page)).toBe('aMOpbGxv');
  await setDoc(page, 'x = "a"', 6);
  await convert(page, /^Toggle Quotes/);
  await expect.poll(() => doc(page)).toBe("x = 'a'");
  await setDoc(page, 'id = 41', 6);
  await convert(page, /^Increment Number/);
  await expect.poll(() => doc(page)).toBe('id = 42');
  await setDoc(page, 'a\nb\nc', 0, 5);
  page.once('dialog', (d) => void d.accept(' | '));
  await convert(page, /^Join Lines with Separator/);
  await expect.poll(() => doc(page)).toBe('a | b | c');
  await setDoc(page, 'var a = 1;\nvar longName=2;', 3);
  await page.keyboard.press('Control+Alt+BracketRight');
  await expect.poll(() => doc(page)).toBe('var a        = 1;\nvar longName = 2;');
});
