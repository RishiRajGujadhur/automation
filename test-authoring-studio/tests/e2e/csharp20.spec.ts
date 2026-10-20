import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Visual Studio 2026 features for C# developers (CSHARP-20.md, C1–C20), end to end.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-cs-'));
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
const projectNode = (page: Page) => page.getByRole('navigation', { name: 'Solution' }).getByRole('button', { name: /project Fixtures$/ }).first();
/** Opens Project Properties from the Explorer's project menu. */
async function properties(page: Page) {
  await open(page, 'AuthSteps.cs');
  await projectNode(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Properties', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Project Properties' });
  await expect(dlg.getByText('Fixtures.csproj')).toBeVisible();
  return dlg;
}
/** Previews the changes and approves the diff. */
async function approve(page: Page, dlg: ReturnType<Page['getByRole']>) {
  await dlg.getByRole('button', { name: 'Preview changes' }).click();
  await dlg.getByRole('button', { name: 'Approve and write Fixtures.csproj' }).click();
  await expect(dlg.getByRole('button', { name: 'Preview changes' })).toBeDisabled();
}
const csproj = () => fs.readFile(path.join(root, 'Fixtures.csproj'), 'utf8').then((t) => t.replace(/\r\n/g, '\n'));

test('C1 Project Properties: Application page writes the .csproj through an approved diff', async ({ page }) => {
  const dlg = await properties(page);
  await expect(dlg.getByLabel('Target framework', { exact: true })).toHaveValue('net8.0');
  await dlg.getByLabel('Assembly name').fill('Demo.Tests');
  await dlg.getByLabel('Output type').selectOption('Library');
  await dlg.getByRole('button', { name: 'Preview changes' }).click();
  await expect(dlg.getByLabel('Diff for Fixtures.csproj')).toContainText('+    <AssemblyName>Demo.Tests</AssemblyName>');
  await dlg.getByRole('button', { name: 'Approve and write Fixtures.csproj' }).click();
  await expect.poll(csproj).toContain('    <TargetFramework>net8.0</TargetFramework>\n    <AssemblyName>Demo.Tests</AssemblyName>\n    <OutputType>Library</OutputType>\n  </PropertyGroup>');
  // Reset removes the property again.
  await dlg.getByRole('button', { name: 'Reset Assembly name' }).click();
  await approve(page, dlg);
  await expect.poll(csproj).not.toContain('AssemblyName');
});

test('C2–C6 Build / Package / Code Analysis pages, effective values, per-configuration values', async ({ page }) => {
  const dlg = await properties(page);
  const pages = dlg.getByRole('navigation', { name: 'Property pages' });
  // C5: values the file does not set show what the SDK uses.
  await pages.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(dlg.getByText(/^Effective: /).first()).toBeVisible({ timeout: 60_000 });
  // C2
  await dlg.getByLabel('Nullable').selectOption('enable');
  await dlg.getByLabel('Treat warnings as errors').check();
  // C3
  await pages.getByRole('button', { name: 'Package' }).click();
  await dlg.getByLabel('Version').fill('2.1.0');
  // C4
  await pages.getByRole('button', { name: 'Code Analysis' }).click();
  await dlg.getByLabel('Analysis level').selectOption('latest-recommended');
  await approve(page, dlg);
  const text = await csproj();
  for (const s of ['<Nullable>enable</Nullable>', '<TreatWarningsAsErrors>true</TreatWarningsAsErrors>', '<Version>2.1.0</Version>', '<AnalysisLevel>latest-recommended</AnalysisLevel>']) expect(text).toContain(s);
  // C6: a Release-only value goes in a conditioned group.
  await dlg.getByLabel('Configuration').selectOption('Release');
  await pages.getByRole('button', { name: 'Build', exact: true }).click();
  await dlg.getByLabel('Optimize code').check();
  await approve(page, dlg);
  await expect.poll(csproj).toContain(`<PropertyGroup Condition="'$(Configuration)'=='Release'">\n    <Optimize>true</Optimize>\n  </PropertyGroup>`);
});
