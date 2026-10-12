import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test.use({ storageState: { cookies: [], origins: [] } });

test('File ▸ Open Project/Solution… opens an .slnx: solution folders, projects, dependencies, files per project', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-sln-'));
  const write = async (file: string, text: string) => { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), text); };
  await write('Shop.slnx', '<Solution>\n  <Folder Name="/Tests/">\n    <Project Path="tests/Shop.Specs/Shop.Specs.csproj" />\n  </Folder>\n  <Project Path="src/Shop.Pages/Shop.Pages.csproj" />\n</Solution>\n');
  await write('tests/Shop.Specs/Shop.Specs.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Reqnroll.NUnit" Version="2.0.0" /><ProjectReference Include="..\\..\\src\\Shop.Pages\\Shop.Pages.csproj" /></ItemGroup></Project>');
  await write('tests/Shop.Specs/Features/Cart.feature', 'Feature: Cart\n  Scenario: Add\n    Given an empty cart\n');
  await write('tests/Shop.Specs/Steps/CartSteps.cs', 'namespace Shop.Specs;\npublic class CartSteps { }\n');
  await write('src/Shop.Pages/Shop.Pages.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
  await write('src/Shop.Pages/CartPage.cs', 'namespace Shop.Pages;\npublic class CartPage { }\n');
  await write('shared/settings.json', '{}\n');
  try {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('button', { name: 'File menu' }).click();
    await page.getByRole('menuitem', { name: /Open Project\/Solution/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Open Project/Solution' });
    await dialog.getByLabel('SOLUTION, PROJECT OR FOLDER PATH').fill(path.join(root, 'Shop.slnx'));
    await dialog.getByRole('button', { name: 'Open', exact: true }).click();
    await expect(dialog).toHaveCount(0);

    const se = page.getByRole('region', { name: 'Explorer' });
    await expect(se.getByText("Solution 'Shop' (2 projects)")).toBeVisible();
    await expect(se.getByRole('button', { name: 'Collapse solution folder Tests' })).toBeVisible();
    await expect(se.getByRole('button', { name: 'Collapse project Shop.Specs' })).toBeVisible();
    await expect(se.getByRole('button', { name: 'Collapse project Shop.Pages' })).toBeVisible();
    // Files show under their project, relative to it (no tests/Shop.Specs/ folders).
    await expect(se.getByRole('button', { name: 'Collapse folder tests/Shop.Specs/Features' })).toBeVisible();
    await expect(se.getByRole('button', { name: 'Cart.feature', exact: true })).toBeVisible();
    await expect(se.getByRole('button', { name: 'CartPage.cs', exact: true })).toBeVisible();
    // Dependencies of Shop.Specs: framework, package with version, project reference.
    await se.getByRole('button', { name: 'Expand Dependencies' }).first().click();
    await expect(se.getByText('Reqnroll.NUnit (2.0.0)')).toBeVisible();
    await expect(se.locator('.se-deps').getByText('Shop.Pages', { exact: true })).toBeVisible();
    // A file outside every project.
    await expect(se.getByRole('button', { name: 'Collapse Miscellaneous Files' })).toBeVisible();
    await expect(se.getByRole('button', { name: 'settings.json', exact: true })).toBeVisible();
    // Build project box: the whole solution or one project; the build request carries the choice.
    const sent: unknown[] = [];
    await page.route('**/api/build', async (route) => { if (route.request().method() === 'POST') { sent.push(route.request().postDataJSON()); await route.fulfill({ json: { status: 'idle', output: '', diagnostics: [] } }); } else await route.continue(); });
    await page.getByRole('button', { name: 'Build menu' }).click();
    await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
    const build = page.getByRole('region', { name: 'Build' });
    await build.getByLabel('Build project').selectOption({ label: 'Shop.Pages' });
    await build.getByRole('button', { name: 'Build Solution', exact: true }).click();
    await expect.poll(() => sent.length).toBe(2);
    expect(sent[0]).toMatchObject({ action: 'build' });
    expect((sent[0] as { project?: string }).project).toBeUndefined();
    expect(sent[1]).toMatchObject({ action: 'build', project: 'src/Shop.Pages/Shop.Pages.csproj' });
    await page.unroute('**/api/build');

    // Add ▸ New Project (dotnet new + sln add), Add ▸ Existing Project, Remove from Solution.
    await se.locator('.se-solution').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add New Project…' }).click();
    const form = se.getByRole('form', { name: 'Add New Project' });
    await form.getByLabel('Project template').selectOption('classlib');
    await form.getByLabel('Project name').fill('Shop.Api');
    await form.getByLabel('Project folder').fill('src');
    await form.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(se.getByText("Solution 'Shop' (3 projects)")).toBeVisible({ timeout: 60_000 });
    expect(await fs.readFile(path.join(root, 'Shop.slnx'), 'utf8')).toContain('Shop.Api.csproj');
    await write('lib/Shop.Data/Shop.Data.csproj', '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
    await se.locator('.se-solution').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Add Existing Project…' }).click();
    await se.getByLabel('Project file path').fill('lib/Shop.Data/Shop.Data.csproj');
    await se.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(se.getByText("Solution 'Shop' (4 projects)")).toBeVisible({ timeout: 60_000 });
    await se.getByRole('button', { name: 'Collapse project Shop.Data' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Remove from Solution' }).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await expect(se.getByText("Solution 'Shop' (3 projects)")).toBeVisible({ timeout: 60_000 });
    expect(await fs.readFile(path.join(root, 'Shop.slnx'), 'utf8')).not.toContain('Shop.Data');
    // The feature is indexed and opens.
    await se.getByRole('button', { name: 'Cart.feature', exact: true }).click();
    await expect(page.locator('.gherkin-editor .cm-content')).toContainText('Feature: Cart');

    // The dialog lists solutions found in the repository.
    await page.getByRole('button', { name: 'File menu' }).click();
    await page.getByRole('menuitem', { name: /Open Project\/Solution/ }).click();
    await expect(page.getByRole('region', { name: 'Solutions in this repository' }).getByRole('button', { name: /Shop\.slnx/ })).toBeVisible();
    await page.keyboard.press('Escape');
  } finally {
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('A solution project outside the opened folder is listed and labelled', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-ext-'));
  await fs.mkdir(path.join(base, 'sol/App'), { recursive: true });
  await fs.mkdir(path.join(base, 'shared'), { recursive: true });
  await fs.writeFile(path.join(base, 'sol/Shop.slnx'), '<Solution>\n  <Project Path="App/App.csproj" />\n  <Project Path="../shared/Shared.csproj" />\n</Solution>\n');
  await fs.writeFile(path.join(base, 'sol/App/App.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
  await fs.writeFile(path.join(base, 'shared/Shared.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>');
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(base, 'sol/Shop.slnx') } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    const se = page.getByRole('region', { name: 'Explorer' });
    await expect(se.getByText("Solution 'Shop' (2 projects)")).toBeVisible();
    await expect(se.getByRole('button', { name: 'Collapse project Shared' })).toContainText('(outside the folder)');
    await expect(se.getByRole('button', { name: 'Collapse project App' })).not.toContainText('(outside the folder)');
  } finally {
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(base, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
