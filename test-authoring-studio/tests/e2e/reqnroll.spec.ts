import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Reqnroll features for feature files (https://docs.reqnroll.net/latest/): hooks, define steps, unused steps…
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-reqnroll-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  await fs.writeFile(path.join(root, 'Support/MoreHooks.cs'), `using TechTalk.SpecFlow;
namespace Fixtures.Support;
[Binding]
public class MoreHooks
{
    [BeforeTestRun] public static void Run() { }
    [BeforeFeature("authentication")] public static void AuthFeature() { }
    [BeforeScenario("@authentication", Order = 1)] public void SeedUsers() { }
    [BeforeScenario("checkout")] public void NotForLogin() { }
    [AfterStep] public void Screenshot() { }
    [Before, Scope(Tag = "slow")] public void OnlySlow() { }
}
`);
  await fs.writeFile(path.join(root, 'Steps/Unused.cs'), ['using TechTalk.SpecFlow;', 'namespace Demo;', '[Binding]', 'public class Leftovers', '{', '    [Given("nobody calls this anymore")]', '    public void Old() { }', '}', ''].join('\n'));
  await fs.writeFile(path.join(root, 'Features/Cart.feature'), [
    'Feature: Shopping cart',
    '  Scenario: Add items',
    '    Given a cart with 2 items',
    '    And these products exist',
    '      | name | price |',
    '      | Pen  | 1.50  |',
    '    When the user checks out',
    '  Scenario Outline: Discounts',
    '    Given a customer of type <type>',
    '    Then the receipt says',
    '      """',
    '      Thank you',
    '      """',
    '    Examples:',
    '      | type |',
    '      | gold |',
    '',
  ].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function openFeature(page: Page, name: string) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
}

test('Go To Hooks: the hooks for the scenario at the cursor, in execution order, filtered by tags and scope', async ({ page }) => {
  await openFeature(page, 'Login.feature');
  await page.getByLabel('Gherkin source').locator('.cm-line', { hasText: 'When the user signs in' }).click();
  await page.getByLabel('Gherkin source').click({ button: 'right', position: { x: 200, y: 120 } });
  await page.getByRole('menuitem', { name: 'Go To Hooks' }).click();
  const list = page.getByRole('list', { name: 'Hooks' });
  await expect(list.locator('li')).toHaveText([
    /BeforeTestRun\s*MoreHooks\.Run/,
    /BeforeFeature\s*MoreHooks\.AuthFeature/,
    /BeforeScenario\s*MoreHooks\.SeedUsers.*Order 1/,
    /BeforeScenario\s*Hooks\.StartBrowser/,
    /AfterStep\s*MoreHooks\.Screenshot/,
    /AfterScenario\s*Hooks\.StopBrowser/,
  ]);
  await list.getByRole('button', { name: /SeedUsers/ }).click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Support/MoreHooks.cs');
  await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('SeedUsers');
});

test('Define Steps: skeletons for every unbound step of a feature, then the steps are bound', async ({ page, request }) => {
  await openFeature(page, 'Cart.feature');
  await page.getByLabel('Gherkin source').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Define Steps…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Define Steps' });
  const list = dialog.getByRole('list', { name: 'Unbound steps' });
  await expect(list.locator('li')).toHaveCount(5);
  await expect(list).toContainText('Given these products exist');
  await expect(list).toContainText('data table');
  await expect(dialog.getByLabel('Class name')).toHaveValue('ShoppingCartSteps');
  await expect(dialog.getByLabel('Step definition file')).toHaveValue('Steps/ShoppingCartSteps.cs');
  await dialog.getByRole('button', { name: /Create/ }).click();
  await dialog.getByRole('button', { name: /Approve and write/ }).click();
  await expect(dialog).toHaveCount(0);
  const cs = await fs.readFile(path.join(root, 'Steps/ShoppingCartSteps.cs'), 'utf8');
  expect(cs).toContain('public class ShoppingCartSteps');
  expect(cs).toContain('public void TheseProductsExist(Table table)');
  expect(cs).toContain('public void ACustomerOfType(string type)');
  expect(cs).toContain('public void TheReceiptSays(string docString)');
  // The fixtures' plain-text patterns count as Cucumber expressions (Reqnroll's rules), so that is the style.
  expect(cs).toContain('[Given("a cart with {int} items")]');
  expect(cs).toContain('[Given("a customer of type {}")]');
  // Indexed: no unbound steps left.
  await expect.poll(async () => (await (await request.get('/api/steps/unbound?file=Features/Cart.feature')).json()).steps.length, { timeout: 30_000 }).toBe(0);
});

test('Find Unused Step Definitions lists bindings no feature uses and opens them', async ({ page }) => {
  await openFeature(page, 'Login.feature');
  await page.getByRole('button', { name: 'Test menu' }).click();
  await page.getByRole('menuitem', { name: 'Find Unused Step Definitions' }).click();
  const list = page.getByRole('list', { name: 'Unused step definitions' });
  await expect(list).toContainText('nobody calls this anymore');
  await expect(list).not.toContainText('the login page is open');
  await list.getByRole('button', { name: /nobody calls this anymore/ }).click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/Unused.cs');
});

test('Highlighting like the Reqnroll extension: unbound steps, bound steps and their parameters', async ({ page }) => {
  await openFeature(page, 'Login.feature');
  const src = page.getByLabel('Gherkin source');
  await expect(src.locator('.cm-step-param', { hasText: 'test-user' })).toBeVisible({ timeout: 15_000 });
  await expect(src.locator('.cm-step-bound').first()).toBeVisible();
  await expect(src.locator('.cm-step-unbound')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Cart.feature', exact: true }).first().click();
  await expect(src.locator('.cm-step-unbound', { hasText: 'a cart with 2 items' })).toBeVisible({ timeout: 15_000 });
});
