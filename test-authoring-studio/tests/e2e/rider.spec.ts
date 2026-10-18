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

test('J6 Add Carets to Ends of Selected Lines (Alt+Shift+G): type once at the end of each line', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Given the login page');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Alt+Shift+G');
  expect((await selection(page)).ranges).toHaveLength(3);
  await page.keyboard.type(' now');
  const doc = (await selection(page)).doc;
  expect(doc).toContain('Given the login page is open now');
  expect(doc).toContain('When the user signs in as "test-user" now');
  expect(doc).toContain('Then the dashboard is displayed now');
});

test('J7 Paste from History (Ctrl+Shift+V): earlier copies, filter, Enter pastes at the caret', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'the login page');
  await page.keyboard.press('Shift+Alt+ArrowRight');
  await page.keyboard.press('Control+C'); // "the"
  await caretAt(page, 'the dashboard');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+C'); // the whole step
  await caretAt(page, 'signs in');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Shift+V');
  const list = page.getByRole('listbox', { name: 'Clipboard history' });
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.getByRole('option').first()).toContainText('Then the dashboard is displayed');
  await page.getByLabel('Filter clipboard history').fill('the');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await selection(page)).doc).toContain('signs in as "test-user"the\n');
});

test('J8 Insert Live Template (Ctrl+J): a Scenario Outline template with fields, in a feature file', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Then the dashboard');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+J');
  const list = page.getByRole('listbox', { name: 'Live templates' });
  await expect(list).toContainText('outline');
  await page.getByLabel('Filter live templates').fill('outl');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.type('Many sign-ins');
  const doc = (await selection(page)).doc;
  expect(doc).toContain('Scenario Outline: Many sign-ins');
  expect(doc).toContain('Examples:');
  // Indented like the line it was inserted on, fields one level deeper.
  expect(doc).toMatch(/\n {4}Scenario Outline: Many sign-ins\n {8}Given /);
});

test('J9 Surround With (Ctrl+Alt+J): steps become a new scenario; a word gets quotes', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'When the user signs in');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+Alt+J');
  await expect(page.getByRole('listbox', { name: 'Surround templates' })).toContainText('Scenario Outline');
  await page.getByLabel('Filter surround templates').fill('Scenario');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Signed in');
  let doc = (await selection(page)).doc;
  expect(doc).toContain(['    Scenario: Signed in', '      When the user signs in as "test-user"', '      Then the dashboard is displayed'].join('\n'));
  await caretAt(page, 'dashboard');
  await page.keyboard.press('Control+Alt+J');
  await page.getByLabel('Filter surround templates').fill('step parameter');
  await page.keyboard.press('Enter');
  doc = (await selection(page)).doc;
  expect(doc).toContain('Then the "dashboard" is displayed');
});

test('J10 Soft-Wrap (View menu): long lines wrap in every editor; remembered', async ({ page }) => {
  await openFeature(page);
  const content = gherkin(page);
  await expect(content).not.toHaveClass(/cm-lineWrapping/);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Soft-Wrap/ }).click();
  await expect(content).toHaveClass(/cm-lineWrapping/);
  await page.reload();
  await expect(gherkin(page)).toHaveClass(/cm-lineWrapping/);
  await page.getByRole('button', { name: 'View menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Soft-Wrap/ })).toContainText('✓');
  await page.getByRole('menuitem', { name: /Soft-Wrap/ }).click();
  await expect(gherkin(page)).not.toHaveClass(/cm-lineWrapping/);
});

test('J11 Show Whitespaces (View menu): spaces and trailing whitespace are drawn', async ({ page }) => {
  await openFeature(page);
  await expect(gherkin(page).locator('.cm-highlightSpace')).toHaveCount(0);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Show Whitespaces/ }).click();
  await expect(gherkin(page).locator('.cm-highlightSpace').first()).toBeVisible();
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Show Whitespaces/ }).click();
  await expect(gherkin(page).locator('.cm-highlightSpace')).toHaveCount(0);
});

test('J12 Ctrl+Mouse Wheel changes the editor font size; View ▸ Reset Font Size', async ({ page }) => {
  await openFeature(page);
  const size = () => gherkin(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  await gherkin(page).hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(size).toBe(before + 2);
  // Page zoom is untouched.
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Decrease Font Size/ }).click();
  await expect.poll(size).toBe(before + 1);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Reset Font Size/ }).click();
  await expect.poll(size).toBe(before);
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

test('J13 Copy Reference (Ctrl+Alt+Shift+C): fully qualified C# member, path:line in a feature', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft'); // inside the method body
  await page.keyboard.press('Control+Alt+Shift+C');
  await expect(page.getByText('Copied reference: Demo.AuthSteps.SignIn')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Demo.AuthSteps.SignIn');
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Alt+Shift+C');
  await expect(page.getByText('Copied reference: Features/Auth/Login.feature:7')).toBeVisible();
});

test('J14 Highlight Usages in File (Ctrl+Shift+F7): Roslyn references in C#, words in features; F3 moves, Esc clears', async ({ page }) => {
  const src = await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.keyboard.press('End');
  // Caret on "userName" (the parameter).
  const doc = (await selection(page)).doc;
  await page.keyboard.press('Home');
  for (let i = 0; i < doc.split('\n').find((l) => l.includes('SignIn'))!.indexOf('userName') - doc.split('\n').find((l) => l.includes('SignIn'))!.search(/\S/); i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+Shift+F7');
  await expect(src.locator('.cm-usage-highlight')).toHaveCount(1, { timeout: 60_000 });
  await expect(src.locator('.cm-usage-highlight')).toHaveText('userName');
  await page.keyboard.press('Escape');
  await expect(src.locator('.cm-usage-highlight')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'the login');
  await page.keyboard.press('Control+Shift+F7');
  const n = (await selection(page)).doc.match(/\bthe\b/g)!.length;
  await expect(gherkin(page).locator('.cm-usage-highlight')).toHaveCount(n);
  await page.keyboard.press('F3');
  expect((await selection(page)).ranges[0].text).toBe('the');
});
