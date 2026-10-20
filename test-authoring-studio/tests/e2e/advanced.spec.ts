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

test('Z8 / Z9 / Z10 Reformat on save, inline values, unused step definitions', async ({ page }) => {
  // Z10: a step definition no feature uses is faded.
  const steps = path.join(root, 'Steps/AuthSteps.cs');
  await fs.writeFile(steps, (await fs.readFile(steps, 'utf8')).replace(/\}\s*$/, ' [Then("nobody uses this step")] public void Unused() { }\n}\n'));
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await open(page, 'AuthSteps.cs');
  const src = page.getByLabel('Source of Steps/AuthSteps.cs');
  await expect(src.locator('.cm-unused-step')).toHaveAttribute('title', 'Step definition not used by any feature: nobody uses this step');
  await expect(src.locator('.cm-unused-step')).toHaveCount(1);
  // Z9: the Debugger window's locals show after the lines that use them.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:inline-values', { detail: { file: 'Steps/AuthSteps.cs', line: 6, values: [{ name: 'userName', value: '"admin"' }] } })));
  await expect(src.locator('.cm-inline-value')).toHaveText('userName = "admin"');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:inline-values', { detail: null })));
  await expect(src.locator('.cm-inline-value')).toHaveCount(0);
  // Z8: Ctrl+S formats the feature, then saves it.
  await page.getByRole('navigation', { name: 'Solution' }).getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  // The feature's editor becomes the active one when it has focus.
  await page.getByLabel('Gherkin source').click();
  await setDoc(page, 'Feature: F\nScenario: S\nGiven the login page is open\n', 0);
  await page.keyboard.press('Control+S');
  await expect.poll(() => doc(page)).toBe('Feature: F\n  Scenario: S\n    Given the login page is open\n');
  await expect.poll(async () => (await fs.readFile(path.join(root, 'Features/Auth/Login.feature'), 'utf8')).replace(/\r\n/g, '\n')).toBe('Feature: F\n  Scenario: S\n    Given the login page is open\n');
});

test('Z11 / Z13 / Z14 / Z15 Same-definition highlight, Go to All calculator, parameter hints, Import CSV', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  await setDoc(page, 'Feature: F\n  Scenario: S\n    When the user signs in as "a"\n    Then the dashboard is displayed\n    When the user signs in as "b"\n', 30);
  // Z14: the parameter's name before the argument.
  await expect(page.locator('.cm-param-hint').first()).toHaveText('userName:', { timeout: 15_000 });
  // Z11: both sign-in steps share a definition.
  await page.getByLabel('Gherkin source').locator('.cm-line', { hasText: '"a"' }).click();
  await expect(page.getByLabel('Gherkin source').locator('.cm-line', { has: page.locator('.cm-same-binding') })).toHaveCount(2);
  // Z15: a CSV file becomes a table under the caret.
  await page.getByLabel('Gherkin source').locator('.cm-line', { hasText: 'dashboard' }).click();
  const chooser = page.waitForEvent('filechooser');
  await gherkinItem(page, /^Import CSV as Table/);
  await (await chooser).setFiles({ name: 'users.csv', mimeType: 'text/csv', buffer: Buffer.from('name,role\nada,admin\n') });
  await expect.poll(() => doc(page)).toContain('    Then the dashboard is displayed\n      | name | role  |\n      | ada  | admin |');
  // Z13
  await page.keyboard.press('Control+T');
  await page.keyboard.type('2 * (3 + 4)');
  await expect(page.getByRole('option', { name: /= 14/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('14');
});

test('Z16 / Z19 Living documentation export; step hover shows the definition docs', async ({ page }) => {
  const steps = path.join(root, 'Steps/AuthSteps.cs');
  await fs.writeFile(steps, (await fs.readFile(steps, 'utf8')).replace(' [Given("the login page is open")]', ' /// <summary>Opens the sign-in page of the app.</summary>\n [Given("the login page is open")]'));
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await open(page);
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  // Z19
  await page.getByLabel('Gherkin source').locator('.cm-line', { hasText: 'the login page is open' }).hover({ position: { x: 120, y: 6 } });
  await expect(page.locator('.cm-binding-doc')).toHaveText('Opens the sign-in page of the app.', { timeout: 10_000 });
  await expect(page.locator('.cm-binding-method')).toHaveText(/OpenLogin\(\)$/);
  // Z16
  const download = page.waitForEvent('download');
  await menuItem(page, 'Tools', /^Export Living Documentation/);
  const html = await fs.readFile((await (await download).path())!, 'utf8');
  expect(html).toContain('<h2>Authentication');
  expect(html).toMatch(/not run<\/span> Sign in/);
});
