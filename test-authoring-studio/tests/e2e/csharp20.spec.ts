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

test('C7–C11 Build Events, Global Usings, Project References, Upgrade Target Framework, Build Action', async ({ page }) => {
  await fs.mkdir(path.join(root, 'Lib'), { recursive: true });
  await fs.writeFile(path.join(root, 'Lib/Lib.csproj'), '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n');
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const dlg = await properties(page);
  const pages = dlg.getByRole('navigation', { name: 'Property pages' });
  // C7
  await pages.getByRole('button', { name: 'Build Events' }).click();
  await dlg.getByLabel('Post-build event').fill('echo built');
  // C8
  await pages.getByRole('button', { name: 'Global Usings' }).click();
  await dlg.getByLabel('Namespace to add').fill('NUnit.Framework');
  await dlg.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(dlg.getByRole('list', { name: 'Global usings' })).toContainText('NUnit.Framework');
  // C9
  await pages.getByRole('button', { name: 'Project References' }).click();
  await dlg.getByLabel('Reference Lib/Lib.csproj').check();
  await approve(page, dlg);
  const text = await csproj();
  expect(text).toContain('<Target Name="PostBuild" AfterTargets="PostBuildEvent">\n    <Exec Command="echo built" />\n  </Target>');
  expect(text).toContain('<Using Include="NUnit.Framework" />');
  expect(text).toContain('<ProjectReference Include="Lib\\Lib.csproj" />');
  await dlg.getByRole('button', { name: 'Close dialog' }).click();
  // C10: one diff per project; approve the library's.
  page.once('dialog', (d) => void d.accept('net10.0'));
  await menuItem(page, 'Tools', /^Upgrade Target Framework/);
  const up = page.getByRole('dialog', { name: 'Upgrade Target Framework' });
  await expect(up.getByRole('button', { name: /^Approve and write / })).toHaveCount(2);
  await up.getByRole('button', { name: 'Approve and write Lib.csproj' }).click();
  await expect.poll(async () => fs.readFile(path.join(root, 'Lib/Lib.csproj'), 'utf8')).toContain('<TargetFramework>net10.0</TargetFramework>');
  expect(await csproj()).toContain('<TargetFramework>net8.0</TargetFramework>');
  await up.getByRole('button', { name: 'Close dialog' }).click();
  // C11: Copy to Output for a feature file.
  await page.getByRole('navigation', { name: 'Solution' }).getByRole('button', { name: 'Login.feature', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Build Action…' }).click();
  const fp = page.getByRole('dialog', { name: 'File Properties' });
  await expect(fp.getByLabel('Build Action')).toHaveValue('None');
  await fp.getByLabel('Copy to Output Directory').selectOption('PreserveNewest');
  await fp.getByRole('button', { name: 'Preview changes' }).click();
  await fp.getByRole('button', { name: 'Approve and write Fixtures.csproj' }).click();
  await expect.poll(csproj).toContain('<None Update="Features\\Auth\\Login.feature"><CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory></None>');
});

test('C12 / C14 / C15 / C16 Exclude From Project, launch profiles, user secrets, EditorConfig designer', async ({ page }) => {
  // C12
  await open(page, 'AuthSteps.cs');
  await page.getByRole('navigation', { name: 'Solution' }).getByRole('button', { name: 'Login.feature', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Exclude From Project…' }).click();
  const fp = page.getByRole('dialog', { name: 'File Properties' });
  await expect(fp.getByLabel('Exclude from project')).toBeChecked();
  await fp.getByRole('button', { name: 'Preview changes' }).click();
  await fp.getByRole('button', { name: 'Approve and write Fixtures.csproj' }).click();
  await expect.poll(csproj).toContain('<None Remove="Features\\Auth\\Login.feature" />');
  await fp.getByRole('button', { name: 'Close dialog' }).click();
  // C14: a launch profile.
  await projectNode(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Properties', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Project Properties' });
  await dlg.getByRole('navigation', { name: 'Property pages' }).getByRole('button', { name: 'Debug' }).click();
  page.once('dialog', (d) => void d.accept('Fixtures'));
  await dlg.getByRole('button', { name: 'New profile' }).click();
  await dlg.getByLabel('Command line arguments').fill('--headed');
  await dlg.getByLabel('Environment variables').fill('BASE_URL=https://x.test');
  await dlg.getByRole('button', { name: 'Preview launchSettings.json' }).click();
  await dlg.getByRole('button', { name: 'Approve and write launchSettings.json' }).click();
  await expect.poll(async () => JSON.parse(await fs.readFile(path.join(root, 'Properties/launchSettings.json'), 'utf8').catch(() => '{}'))).toEqual({ profiles: { Fixtures: { commandName: 'Project', commandLineArgs: '--headed', environmentVariables: { BASE_URL: 'https://x.test' } } } });
  await dlg.getByRole('button', { name: 'Close dialog' }).click();
  // C15: a UserSecretsId first (previewed), then secrets.json in the profile.
  await projectNode(page).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Manage User Secrets' }).click();
  const add = page.getByRole('dialog', { name: 'Add a UserSecretsId, then Manage User Secrets again' });
  await add.getByRole('button', { name: 'Approve and write Fixtures.csproj' }).click();
  await expect.poll(csproj).toMatch(/<UserSecretsId>[0-9a-f-]{36}<\/UserSecretsId>/);
  await add.getByRole('button', { name: 'Close dialog' }).click();
  const id = /<UserSecretsId>([0-9a-f-]{36})<\/UserSecretsId>/.exec(await csproj())![1];
  const where = (await (await page.request.get(`/api/project/secrets?id=${id}`)).json()).path as string;
  try {
    await projectNode(page).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Manage User Secrets' }).click();
    const sec = page.getByRole('dialog', { name: 'Manage User Secrets' });
    await sec.getByLabel('secrets.json').fill('{ "Login:Password": "s3cret" }');
    await sec.getByRole('button', { name: 'Save' }).click();
    await expect.poll(() => fs.readFile(where, 'utf8').catch(() => '')).toBe('{ "Login:Password": "s3cret" }');
    await sec.getByRole('button', { name: 'Close dialog' }).click();
  } finally {
    await fs.rm(path.dirname(where), { recursive: true, force: true });
  }
  // C16
  await menuItem(page, 'Tools', /^EditorConfig/);
  const ec = page.getByRole('dialog', { name: 'EditorConfig' });
  await ec.getByLabel('Indent size').selectOption('4');
  await ec.getByLabel('Rule code').fill('CA1707');
  await ec.getByRole('button', { name: 'Add rule' }).click();
  await expect(ec.getByLabel('Severity of CA1707')).toHaveValue('none');
  await ec.getByRole('button', { name: 'Preview changes' }).click();
  await ec.getByRole('button', { name: 'Approve and write .editorconfig' }).click();
  await expect.poll(() => fs.readFile(path.join(root, '.editorconfig'), 'utf8').catch(() => '')).toBe('[*]\nindent_size = 4\n\n[*.cs]\ndotnet_diagnostic.CA1707.severity = none\n');
});

test('C17–C20 Tidy Project File, value completions, Directory.Build.props, dependency graph', async ({ page }) => {
  await fs.mkdir(path.join(root, 'Lib'), { recursive: true });
  await fs.writeFile(path.join(root, 'Lib/Lib.csproj'), '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <TargetFramework>net8.0</TargetFramework>\n  </PropertyGroup>\n</Project>\n');
  await fs.writeFile(path.join(root, 'Fixtures.csproj'), (await fs.readFile(path.join(root, 'Fixtures.csproj'), 'utf8')).replace('</Project>', '  <ItemGroup>\n    <ProjectReference Include="Lib/Lib.csproj" />\n  </ItemGroup>\n</Project>'));
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await open(page, 'AuthSteps.cs');
  // C20
  await menuItem(page, 'Tools', /^Project Dependency Graph/);
  const graph = page.getByRole('img', { name: 'Project dependency graph' });
  await expect(graph.getByRole('button', { name: 'Project Fixtures' })).toBeVisible();
  await expect(graph.getByRole('button', { name: 'Project Lib' })).toBeVisible();
  await expect(graph.locator('.pg-edge')).toHaveCount(1);
  await graph.getByRole('button', { name: 'Project Lib' }).click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Lib/Lib.csproj');
  // C17
  await setDoc(page, '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n  </PropertyGroup>\n  <ItemGroup>\n    <PackageReference Include="NUnit" Version="4.2.2" />\n    <PackageReference Include="coverlet.collector" Version="6.0.2" />\n  </ItemGroup>\n</Project>\n', 0);
  await menuItem(page, 'Tools', /^Tidy Project File/);
  await expect.poll(() => doc(page)).toBe('<Project Sdk="Microsoft.NET.Sdk">\n  <ItemGroup>\n    <PackageReference Include="coverlet.collector" Version="6.0.2" />\n    <PackageReference Include="NUnit" Version="4.2.2" />\n  </ItemGroup>\n</Project>\n');
  // C18
  await setDoc(page, '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <Nullable></Nullable>\n  </PropertyGroup>\n</Project>\n', '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n    <Nullable>'.length);
  await page.keyboard.press('Control+Space');
  await expect(page.getByRole('option', { name: /^enable/ })).toBeVisible();
  await page.keyboard.press('Escape');
  // C19: none yet: previewed at the root; then it opens.
  await menuItem(page, 'Tools', /^Open Directory\.Build\.props/);
  const create = page.getByRole('dialog', { name: 'Create Directory.Build.props' });
  await create.getByRole('button', { name: 'Approve and write Directory.Build.props' }).click();
  await expect.poll(() => fs.readFile(path.join(root, 'Directory.Build.props'), 'utf8').catch(() => '')).toContain('<Project>');
  await create.getByRole('button', { name: 'Close dialog' }).click();
  await menuItem(page, 'Tools', /^Open Directory\.Build\.props/);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Directory.Build.props');
});
