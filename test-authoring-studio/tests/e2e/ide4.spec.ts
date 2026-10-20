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

/** Several selections in the active editor (test setup only). */
const select = (page: Page, ranges: [number, number][]) => page.evaluate((rs) => { type ES = { create(r: unknown[]): unknown; range(a: number, b: number): unknown }; const v = (window as unknown as { __activeEditor: () => { view: { state: { selection: { constructor: ES } }; dispatch(s: unknown): void } } }).__activeEditor().view; const E = v.state.selection.constructor; v.dispatch({ selection: E.create(rs.map(([a, b]) => E.range(a, b))) }); }, ranges);

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

test('Y11–Y20 Swap Selections, Count Occurrences, Reformat XML, Insert Date and Time', async ({ page }) => {
  await open(page, 'AuthSteps.cs');
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  await setDoc(page, 'user = user + user;', 1);
  await menuItem(page, 'Edit', /^Count Occurrences/);
  await expect(page.getByText('"user": 3 occurrences on 1 line.').first()).toBeVisible();
  await setDoc(page, '<a><b>x</b></a>', 0);
  await menuItem(page, 'Code', /^Reformat XML/);
  await expect.poll(() => doc(page)).toMatch(/^<a>\n( +|\t)<b>x<\/b>\n<\/a>$/);
  await setDoc(page, 'on ', 3);
  await menuItem(page, 'Code', /^Insert Date and Time/);
  await expect.poll(() => doc(page)).toMatch(/^on \d{4}-\d\d-\d\d \d\d:\d\d$/);
  await setDoc(page, 'left = right;', 0, 4);
  await select(page, [[0, 4], [7, 12]]);
  await convert(page, /^Swap Selections/);
  await expect.poll(() => doc(page)).toBe('right = left;');
});

const codeSub = async (page: Page, sub: string, item: RegExp) => { await page.getByRole('button', { name: 'Code menu' }).click(); await page.getByRole('menuitem', { name: sub, exact: true }).click(); await page.getByRole('menuitem', { name: item }).click(); };

test('Y21–Y30 Code ▸ C#: namespaces, raw string, interpolation; Code ▸ Markdown; Remove Comments', async ({ page }) => {
  await open(page, 'AuthSteps.cs');
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  await setDoc(page, 'namespace Demo\n{\n    class A\n    {\n    }\n}\n', 0);
  await codeSub(page, 'C#', /^Convert to File-Scoped Namespace/);
  await expect.poll(() => doc(page)).toBe('namespace Demo;\n\nclass A\n{\n}\n');
  await codeSub(page, 'C#', /^Convert to Block-Scoped Namespace/);
  await expect.poll(() => doc(page)).toBe('namespace Demo\n{\n    class A\n    {\n    }\n}\n');
  await setDoc(page, 'var s = "Hi " + name;', 8, 20);
  await codeSub(page, 'C#', /^Convert to Interpolated String/);
  await expect.poll(() => doc(page)).toBe('var s = $"Hi {name}";');
  await setDoc(page, 'buy milk', 0);
  await codeSub(page, 'Markdown', /^Toggle Task/);
  await expect.poll(() => doc(page)).toBe('- [ ] buy milk');
  await setDoc(page, 'int a; // note\n// gone\nint b;', 0);
  await menuItem(page, 'Code', /^Remove Comments/);
  await expect.poll(() => doc(page)).toBe('int a;\nint b;');
});

test('Y31–Y40 Code ▸ Gherkin: tags, tables, doc string, Expand Outline, Wrap in Rule', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  const outline = 'Feature: F\n\n  Scenario Outline: As <role>\n    Given the user signs in as "<role>"\n\n    Examples:\n      | role  |\n      | admin |\n      | admin |\n      | guest |\n';
  await setDoc(page, outline, outline.indexOf('| admin') + 2);
  await gherkinItem(page, /^Table: Remove Duplicate Rows/);
  await expect.poll(() => doc(page)).not.toMatch(/admin \|\n\s+\| admin/);
  await setDoc(page, (await doc(page)), 20);
  await gherkinItem(page, /^Expand Outline to Scenarios/);
  await expect.poll(() => doc(page)).toContain('Scenario: As guest\n    Given the user signs in as "guest"');
  page.once('dialog', (d) => void d.accept('@smoke'));
  await gherkinItem(page, /^Tag All Scenarios/);
  await expect.poll(() => doc(page)).toMatch(/@smoke\n  Scenario: As admin[\s\S]*@smoke\n  Scenario: As guest/);
  await gherkinItem(page, /^Promote Common Tags to Feature/);
  await expect.poll(() => doc(page)).toMatch(/^@smoke\nFeature: F/);
  await setDoc(page, 'Feature: F\n  Scenario: S\n    Given a body', 40);
  await gherkinItem(page, /^Insert Doc String/);
  await expect.poll(() => doc(page)).toBe(`Feature: F\n  Scenario: S\n    Given a body\n      ${'"'.repeat(3)}\n      \n      ${'"'.repeat(3)}`);
});

test('Y41–Y50 Gherkin: language header, column statistics, fill series, duplicate warnings', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  const src = 'Feature: F\n\n  Scenario Outline: Same\n    Given <n>\n\n    Examples:\n      | n |\n      | 4 |\n      |   |\n      | 4 |\n\n  Scenario: same\n    Given x\n';
  await setDoc(page, src, src.indexOf('| 4') + 2);
  await gherkinItem(page, /^Table: Column Statistics/);
  await expect(page.getByText('n: 2 numbers, sum 8, average 4, min 4, max 4.').first()).toBeVisible();
  await gherkinItem(page, /^Table: Fill Series/);
  await expect.poll(() => doc(page)).toContain('| 4 |\n      | 5 |\n      | 6 |');
  await setDoc(page, src, 0);
  await expect(page.locator('.cm-lintRange-warning', { hasText: 'Scenario: same' })).toBeVisible();
  await expect(page.locator('.cm-lintRange-warning', { hasText: '| 4 |' })).toBeVisible();
  page.once('dialog', (d) => void d.accept('fr'));
  await gherkinItem(page, /^Set Language Header/);
  await expect.poll(() => doc(page)).toMatch(/^# language: fr\nFeature: F/);
});

test('Y51–Y56 Move tab, memory indicator, Go to Offset, Caret Blinking, Pin Active Tab, problems in the file', async ({ page }) => {
  await open(page);
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  // Y51
  await page.locator('.editor-tab-label', { hasText: 'Login.feature' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Move Tab to End' }).click();
  await expect(page.locator('.editor-tab-label').last()).toHaveText(/Login\.feature/);
  // Y52
  await expect(page.getByLabel(/^Memory: \d+ MB$/)).toBeVisible();
  // Y53
  await page.locator('.editor-tab-label', { hasText: 'Login.feature' }).click();
  page.once('dialog', (d) => void d.accept('12'));
  await menuItem(page, 'Navigate', /^Go to Offset/);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { head: number } } } } } }).__activeEditor().view.state.selection.main.head)).toBe(12);
  // Y54
  await menuItem(page, 'View', /Caret Blinking/);
  await expect(page.locator('html')).toHaveAttribute('data-no-blink', '');
  await menuItem(page, 'View', /Caret Blinking/);
  await expect(page.locator('html')).not.toHaveAttribute('data-no-blink', '');
  // Y55
  await page.getByLabel('Gherkin source').click();
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.editor-tab.pinned .editor-tab-label', { hasText: 'Login.feature' })).toBeVisible();
  // Y56
  await setDoc(page, 'Feature: F\n  Scenario: A\n    Given x\n  Scenario: a\n    Given y\n', 0);
  await expect(page.getByRole('button', { name: /^Problems in this file: \d+ errors, [1-9]\d* warnings$/ })).toBeVisible({ timeout: 10_000 });
});
