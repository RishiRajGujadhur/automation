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
