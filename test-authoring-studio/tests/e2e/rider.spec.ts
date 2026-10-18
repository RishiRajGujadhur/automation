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
type Sel = { ranges: { from: number; to: number; text: string }[]; main: number; doc: string };
/** The active editor's selection ranges (development build hook). */
const selection = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { __activeEditor: () => { view: { state: { selection: { ranges: { from: number; to: number }[]; mainIndex: number }; doc: { toString(): string }; sliceDoc(a: number, b: number): string } } } | undefined }).__activeEditor();
  const st = a!.view.state;
  return { ranges: st.selection.ranges.map((r) => ({ from: r.from, to: r.to, text: st.sliceDoc(r.from, r.to) })), main: st.selection.mainIndex, doc: st.doc.toString() } as Sel;
});
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

test('J2 Toggle Case (Ctrl+Shift+U): word at the caret to upper case and back', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Shift+U');
  await expect(gherkin(page)).toContainText('the user SIGNS in');
  await page.keyboard.press('Control+Shift+U');
  await expect(gherkin(page)).toContainText('the user signs in');
});

test('J3 Join Lines (Ctrl+Shift+J): this line and the next become one, indentation dropped', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Shift+J');
  await expect(gherkin(page)).toContainText('When the user signs in as "test-user" Then the dashboard is displayed');
});

test('J4 Add Selection for Next Occurrence (Alt+J), Unselect (Alt+Shift+J), Select All (Ctrl+Alt+Shift+J)', async ({ page }) => {
  await openFeature(page);
  const carets = async () => (await selection(page)).ranges.length;
  await caretAt(page, 'the login page');
  await page.keyboard.press('Alt+J'); // the word
  await page.keyboard.press('Alt+J'); // the next "the"
  await page.keyboard.press('Alt+J');
  await expect.poll(carets).toBe(3);
  await page.keyboard.press('Alt+Shift+J');
  await expect.poll(carets).toBe(2);
  await page.keyboard.press('Control+Alt+Shift+J');
  const doc = (await selection(page)).doc;
  await expect.poll(carets).toBe(doc.match(/\bthe\b/g)!.length);
  await page.keyboard.type('a');
  await expect(gherkin(page)).toContainText('Given a login page is open');
  await expect(gherkin(page)).toContainText('Then a dashboard is displayed');
});

test('J5 Start New Line (Shift+Enter) and Start New Line Before Current (Ctrl+Alt+Enter)', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('And below');
  await page.keyboard.press('Control+Alt+Enter');
  await page.keyboard.type('And above');
  const doc = (await selection(page)).doc;
  expect(doc).toContain(['When the user signs in as "test-user"', '    And above', '    And below', '    Then'].join('\n'));
});
