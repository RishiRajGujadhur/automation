import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Runs in a temporary copy of the sample repository: renames, deletes and saves never touch fixtures/.
const langServer = path.resolve(import.meta.dirname, '../../langserver/bin/Release/net10.0/LangServer.dll');
test.skip(!existsSync(langServer), 'The C# language service is not built (npm run langserver:build).');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-ide-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  // A second file that uses SearchPage, so a rename has to change two files.
  await fs.writeFile(path.join(temp, 'Steps/Extra.cs'), 'namespace Demo;\npublic class Extra\n{\n    private readonly SearchPage other = new();\n}\n');
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function open(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
}
const explorerFile = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).first();
const line = (page: Page, file: string, text: string) => page.getByLabel(`Source of ${file}`).locator('.cm-line', { hasText: text }).first();
const disk = (file: string) => fs.readFile(path.join(temp, file), 'utf8');

test('C# IntelliSense, quick info, go to definition (F12 and Ctrl+click), find references', async ({ page }) => {
  await open(page);
  await explorerFile(page, 'SearchSteps.cs').click();
  const file = 'Steps/SearchSteps.cs';
  // IntelliSense after "page." lists SearchPage's members.
  await line(page, file, 'public async Task Results()').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('  public void Probe() { page.');
  const list = page.locator('.cm-tooltip-autocomplete');
  await expect(list).toContainText('Search', { timeout: 30_000 });
  await expect(list).toContainText('Results');
  await page.keyboard.type('Sea');
  await page.keyboard.press('Enter');
  await expect(line(page, file, 'Probe()')).toContainText('page.Search');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');

  // Quick info on hover.
  await line(page, file, 'await page.Search(searchText)').getByText('Search', { exact: true }).last().hover();
  await expect(page.locator('.cm-quickinfo')).toContainText('SearchPage.Search(string text)', { timeout: 30_000 });

  // F12 on a call goes to the method (same file: the cursor moves to its line).
  await line(page, file, 'await page.Search(searchText)').getByText('Search', { exact: true }).last().click();
  await page.keyboard.press('F12');
  await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('public async Task Search(string text)');

  // Ctrl+click on a type in another file opens that file.
  await explorerFile(page, 'Extra.cs').click();
  await line(page, 'Steps/Extra.cs', 'SearchPage other').getByText('SearchPage').click({ modifiers: ['Control'] });
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', file);

  // Shift+F12: Find All References.
  await page.keyboard.press('Shift+F12');
  await expect(page.getByRole('region', { name: /References to/ })).toBeVisible({ timeout: 30_000 });
});

test('Rename symbol (F2) changes every reference across files; Remove and Sort Usings from the context menu', async ({ page }) => {
  await open(page);
  await explorerFile(page, 'SearchSteps.cs').click();
  const file = 'Steps/SearchSteps.cs';
  await line(page, file, 'public class SearchPage').getByText('SearchPage').click();
  await page.keyboard.press('F2');
  const box = page.getByLabel('Rename SearchPage');
  await box.fill('SearchPageObject');
  await box.press('Enter');
  await expect(page.getByText(/Renamed SearchPage to SearchPageObject: \d+ changes in 2 files/).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel(`Source of ${file}`)).toContainText('public class SearchPageObject');
  await expect(page.getByLabel(`Source of ${file}`)).toContainText('private readonly SearchPageObject page');
  expect(await disk('Steps/Extra.cs')).toContain('private readonly SearchPageObject other');

  // Organize usings: the unused System.Text goes, the rest is sorted.
  await page.getByLabel(`Source of ${file}`).click();
  await page.keyboard.press('Control+Home');
  await page.keyboard.type('using System.Text;\n');
  await page.getByLabel(`Source of ${file}`).click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Remove and Sort Usings/ }).click();
  await expect(page.getByLabel(`Source of ${file}`)).not.toContainText('using System.Text;', { timeout: 30_000 });
  await expect(page.getByLabel(`Source of ${file}`)).toContainText('using TechTalk.SpecFlow;');
  await page.keyboard.press('Control+s');
  await expect.poll(() => disk(file)).toContain('class SearchPageObject');
});

test('Explorer: rename (F2), copy and paste, cut and paste, delete; tabs follow', async ({ page }) => {
  await open(page);
  await explorerFile(page, 'Extra.cs').click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/Extra.cs');
  // Rename with F2 in the tree.
  await explorerFile(page, 'Extra.cs').press('F2');
  const box = page.getByLabel('New name for Extra.cs');
  await box.fill('Renamed.cs');
  await box.press('Enter');
  await expect(explorerFile(page, 'Renamed.cs')).toBeVisible();
  expect(existsSync(path.join(temp, 'Steps/Renamed.cs'))).toBe(true);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/Renamed.cs');

  // Copy + Paste beside it → "Renamed - Copy.cs".
  await explorerFile(page, 'Renamed.cs').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /^Copy( Ctrl|$)/ }).click();
  await explorerFile(page, 'Renamed.cs').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Paste' }).click();
  await expect(explorerFile(page, 'Renamed - Copy.cs')).toBeVisible();

  // Cut + Paste onto another folder moves it.
  await explorerFile(page, 'Renamed - Copy.cs').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Cut' }).click();
  await page.getByRole('button', { name: 'Collapse folder Support', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Paste' }).click();
  await expect.poll(() => existsSync(path.join(temp, 'Support/Renamed - Copy.cs'))).toBe(true);
  expect(existsSync(path.join(temp, 'Steps/Renamed - Copy.cs'))).toBe(false);

  // Delete asks first, then removes the file and closes its tab.
  await explorerFile(page, 'Renamed.cs').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(explorerFile(page, 'Renamed.cs')).toHaveCount(0);
  expect(existsSync(path.join(temp, 'Steps/Renamed.cs'))).toBe(false);
  await expect(page.getByRole('group', { name: 'Open editors' }).locator('.editor-tab', { hasText: 'Renamed.cs' })).toHaveCount(0);
});

test('Tabs: pin keeps a tab through Close All; closing the last tab closes the editor; file-type colours; saving is quiet', async ({ page }) => {
  await open(page);
  const strip = page.getByRole('group', { name: 'Open editors' });
  await explorerFile(page, 'SearchSteps.cs').click();
  await explorerFile(page, 'ShippingDetails.xml').click();
  await explorerFile(page, 'common.xml').click();
  await strip.locator('.editor-tab-label', { hasText: 'ShippingDetails.xml' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin' }).click();
  await expect(strip.locator('.editor-tab').first()).toHaveClass(/pinned/);
  await expect(strip.locator('.editor-tab').first()).toContainText('ShippingDetails.xml');
  // Colours differ by extension.
  const color = (name: string) => strip.locator('.editor-tab', { hasText: name }).evaluate((e) => getComputedStyle(e).getPropertyValue('--file-color'));
  expect(await color('SearchSteps.cs')).not.toBe(await color('common.xml'));

  await strip.locator('.editor-tab-label', { hasText: 'SearchSteps.cs' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close All' }).click();
  await expect(strip.locator('.editor-tab')).toHaveCount(1);

  // Saving shows no toast.
  await strip.locator('.editor-tab-label', { hasText: 'ShippingDetails.xml' }).click();
  await page.getByLabel('Source of Dictionaries/Checkout/ShippingDetails.xml').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n<!-- saved -->');
  await page.keyboard.press('Control+s');
  await expect.poll(() => disk('Dictionaries/Checkout/ShippingDetails.xml')).toContain('<!-- saved -->');
  await expect(page.getByText(/saved\.$/)).toHaveCount(0);

  // Unpin, close the last tab: the editor closes too.
  await strip.getByRole('button', { name: 'Unpin ShippingDetails.xml' }).click();
  await strip.getByRole('button', { name: /^Close ShippingDetails.xml/ }).click();
  await expect(strip.locator('.editor-tab')).toHaveCount(0);
  await expect(page.locator('.code-editor:not([hidden]), .editor-panel')).toHaveCount(0);
  await expect(page.getByText('Open a file from the Explorer')).toBeVisible();
});
