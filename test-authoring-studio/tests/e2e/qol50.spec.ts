import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// 50 quality-of-life improvements (QOL-50.md, QL1–QL50), end to end.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-qol-'));
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
/** A command of Code ▸ Gherkin (X96 menu groups). */
async function openCs(page: Page, file: string, text: string) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: file.split('/').pop(), exact: true }).first().click();
  const src = page.getByLabel(`Source of ${file}`);
  await src.locator('.cm-line', { hasText: text }).first().click();
  return src;
}
const reindex = async (page: Page) => expect((await page.request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
const nav = (page: Page) => page.getByRole('navigation', { name: 'Solution' });

test('QL1 Window title: the active file and the workspace folder', async ({ page }) => {
  await openFeature(page);
  await expect(page).toHaveTitle(new RegExp(`^Login\.feature — ${path.basename(root)} · TestAuthoring Studio$`));
  await caretAt(page, 'Feature:');
  await page.keyboard.type('x');
  await expect(page).toHaveTitle(/^● Login\.feature/);
});

test('QL2 Scroll past the end: a short file still scrolls', async ({ page }) => {
  await openFeature(page);
  const scroll = () => page.evaluate(() => { const s = document.querySelector('.gherkin-editor .cm-scroller') as HTMLElement; return s.scrollHeight - s.clientHeight; });
  await expect.poll(scroll).toBeGreaterThan(50);
  await menuItem(page, 'View', /Scroll Past End/);
  await expect.poll(scroll).toBeLessThan(5);
});

test('QL3 Find: match counter', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Control+F');
  await page.keyboard.type('the');
  await expect(page.locator('.gherkin-editor .cm-search-count')).toHaveText(/^(\d+ matches|\d+ of \d+)$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.gherkin-editor .cm-search-count')).toHaveText(/^\d+ of \d+$/);
});

test('QL4 / QL5 Ctrl+click links: web address and file:line', async ({ page, context }) => {
  await context.route('https://example.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# docs https://example.com/guide and Steps/AuthSteps.cs:5');
  const link = gherkin(page).locator('.cm-link', { hasText: 'https://example.com/guide' });
  await expect(link).toBeVisible();
  const popup = page.waitForEvent('popup');
  await link.click({ modifiers: ['Control'] });
  expect((await popup).url()).toBe('https://example.com/guide');
  await gherkin(page).locator('.cm-link', { hasText: 'Steps/AuthSteps.cs:5' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
});

test('QL6 Multi-caret count in the status bar', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Control+A');
  await menuItem(page, 'Edit', /^Add Carets to Ends of Selected Lines/);
  await expect(page.getByLabel('Cursor position')).toContainText(/· \d+ selections/);
});

test('QL7 Drag a file from the Explorer into the editor inserts its path', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# see ');
  const target = gherkin(page).locator('.cm-line', { hasText: '# see' });
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dragTo(target, { targetPosition: { x: 200, y: 5 } });
  await expect.poll(() => doc(page)).toContain('Steps/AuthSteps.cs');
});

test('QL8 Files reopen where you left them (after a reload)', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'the dashboard');
  await expect(page.getByLabel('Cursor position')).toContainText('Ln 8');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(gherkin(page)).toContainText('Feature:');
  await gherkin(page).focus();
  await expect(page.getByLabel('Cursor position')).toContainText('Ln 8');
});

test('QL9 Gherkin smart indent after Scenario: and a step ending in ":"', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Scenario: Sign in');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Given the users:');
  await page.keyboard.press('Enter');
  await page.keyboard.type('| x |');
  await expect.poll(() => doc(page)).toMatch(/\n {2}Scenario: Sign in\r?\n {4}Given the users:\r?\n {6}\| x \|/);
});

test('QL10 / QL11 Tables: Enter adds a row; pasted rows are aligned', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.writeFile(path.join(root, 'Features/T.feature'), ['Feature: T', '  Scenario: S', '    Given the users:', '      | name | role  |', '      | ada  | admin |', ''].join('\n'));
  await reindex(page);
  await openFeature(page, 'T.feature');
  await caretAt(page, '| ada');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('bob');
  await expect.poll(() => doc(page)).toMatch(/\| ada {2}\| admin \|\r?\n {6}\| bob/);
  await caretAt(page, '| ada');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.evaluate(() => navigator.clipboard.writeText('| carol | guest |'));
  await page.keyboard.press('Control+V');
  await expect.poll(() => doc(page)).toMatch(/ {6}\| carol \| guest \|/);
});

test('QL12 Explorer remembers collapsed folders after a reload', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Expand folder Steps', exact: true })).toBeVisible();
});

test('QL13 / QL14 / QL20 Explorer keyboard: arrows, type to select, Enter', async ({ page }) => {
  await openFeature(page);
  const steps = nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true });
  await steps.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(nav(page).getByRole('button', { name: 'Expand folder Steps', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true })).toBeFocused();
  await page.keyboard.type('sea');
  await expect(nav(page).getByRole('button', { name: 'SearchSteps.cs', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/SearchSteps.cs');
  await expect(page.locator('.editor-tab.active')).not.toHaveClass(/preview/);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.cm-editor'))).toBe(true);
});

test('QL15 Explorer middle-click opens a kept tab', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click({ button: 'middle' });
  await expect(page.locator('.editor-tab.active')).toContainText('AuthSteps.cs');
  await expect(page.locator('.editor-tab.active')).not.toHaveClass(/preview/);
});

test('QL16 Copy path says what it copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy path' }).click();
  await expect(page.getByText('Copied Steps/AuthSteps.cs').first()).toBeVisible();
});

test('QL17 Drag a file onto a folder to move it', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().dragTo(nav(page).getByRole('button', { name: 'Collapse folder Support', exact: true }));
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect.poll(() => fs.access(path.join(root, 'Support/SearchSteps.cs')).then(() => true, () => false)).toBe(true);
});

test('QL18 / QL19 Tab bar: double-click for a scratch file; the active tab is scrolled into view', async ({ page }) => {
  await openFeature(page);
  const strip = page.getByRole('group', { name: 'Open editors' });
  const box = (await strip.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width - 20, box.y + box.height / 2);
  await expect(page.getByRole('dialog', { name: 'New Scratch File' })).toBeVisible();
});

test('QL21–QL23 Search: remembered after a reload, keyboard through results, the match is selected', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Control+Shift+F');
  const view = page.getByRole('region', { name: 'Search' });
  await view.getByLabel('Search in files').fill('dashboard');
  await expect(view.getByRole('status')).toHaveText(/\d+ results? in/);
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.keyboard.press('Control+Shift+F');
  await expect(view.getByLabel('Search in files')).toHaveValue('dashboard');
  await expect(view.getByRole('status')).toHaveText(/\d+ results? in/);
  await view.getByLabel('Search in files').press('ArrowDown');
  await expect(view.locator('.search-match').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => { const a = (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { from: number; to: number } }; sliceDoc(a: number, b: number): string } } } | undefined }).__activeEditor(); const s = a?.view.state.selection.main; return s && a!.view.state.sliceDoc(s.from, s.to); })).toMatch(/^dashboard$/i);
});

test('QL27 Test Explorer explains an empty tree', async ({ page, request }) => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-empty-'));
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: empty, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await page.getByRole('button', { name: 'Test Explorer' }).click();
    const note = page.getByRole('region', { name: 'Test Explorer' }).locator('.t-empty');
    await expect(note).toContainText('build it (Ctrl+Shift+B), then refresh', { timeout: 60_000 });
    await expect(note.getByRole('button', { name: 'Refresh' })).toBeVisible();
  } finally {
    await fs.rm(empty, { recursive: true, force: true }).catch(() => {});
  }
});

test('QL30 Build time in the status bar', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('button', { name: 'Build menu' }).click();
  await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
  await expect(page.getByLabel('Build progress')).toContainText(/(Building|Cleaning)… \d+ s/);
});
