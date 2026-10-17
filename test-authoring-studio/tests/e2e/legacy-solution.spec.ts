import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// A classic Visual Studio solution: .NET Framework project (no Sdk), packages.config with a local packages/ folder,
// assembly references with HintPath, explicitly listed files (one in a different case than on disk).
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

const SLN = `Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Shop Tests", "Shop Tests.csproj", "{31631499-F5DB-4E06-99A6-728AAEE9BC40}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|Any CPU = Debug|Any CPU
	EndGlobalSection
EndGlobal
`;
const CSPROJ = `<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" DefaultTargets="Build" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup>
    <OutputType>Library</OutputType>
    <RootNamespace>Shop_Tests</RootNamespace>
    <TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion>
  </PropertyGroup>
  <ItemGroup>
    <Reference Include="System" />
    <Reference Include="TechTalk.SpecFlow, Version=3.1.0.0, Culture=neutral, processorArchitecture=MSIL">
      <HintPath>packages\\SpecFlow.3.1.86\\lib\\net45\\TechTalk.SpecFlow.dll</HintPath>
    </Reference>
  </ItemGroup>
  <ItemGroup>
    <Compile Include="Step Definitions\\CartSteps.cs" />
  </ItemGroup>
  <ItemGroup>
    <None Include="Feature\\ShoppingCart.feature" />
    <None Include="packages.config" />
  </ItemGroup>
  <Import Project="$(MSBuildToolsPath)\\Microsoft.CSharp.targets" />
</Project>
`;

test('a classic .NET Framework solution opens like in Visual Studio', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-legacy-'));
  const write = async (f: string, t: string) => { await fs.mkdir(path.dirname(path.join(root, f)), { recursive: true }); await fs.writeFile(path.join(root, f), t); };
  await write('Shop Tests.sln', SLN);
  await write('Shop Tests.csproj', CSPROJ);
  await write('packages.config', '<?xml version="1.0" encoding="utf-8"?>\n<packages>\n  <package id="SpecFlow" version="3.1.86" targetFramework="net472" />\n  <package id="NUnit" version="3.11.0" targetFramework="net472" />\n</packages>\n');
  await write('Feature/shoppingCart.feature', 'Feature: Shopping cart\n  Scenario: Add\n    Given a cart with 2 items\n');
  await write('Step Definitions/CartSteps.cs', 'using TechTalk.SpecFlow;\nnamespace Shop_Tests\n{\n    [Binding]\n    public class CartSteps\n    {\n        [Given(@"a cart with (.*) items")]\n        public void ACart(int n) { }\n    }\n}\n');
  await write('Notes/Unlisted.cs', 'class Unlisted { }\n');
  // A local NuGet packages folder (packages.config restore): skipped by the scan, never listed.
  await write('packages/SpecFlow.3.1.86/SpecFlow.3.1.86.nupkg', 'not a real package');
  await write('packages/SpecFlow.3.1.86/lib/net45/TechTalk.SpecFlow.xml', '<doc><members/></doc>');
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Shop Tests.sln') } })).ok()).toBe(true);
    const ws = await (await request.get('/api/workspace')).json();
    expect(ws.index.diagnostics.join('\n')).not.toContain('packages/'); // packages/ is not scanned
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    const se = page.getByRole('region', { name: 'Explorer' });
    await expect(se.getByText("Solution 'Shop Tests' (1 project)")).toBeVisible();
    // References (classic projects): framework, packages.config packages, assemblies.
    await se.getByRole('button', { name: 'Expand References' }).click();
    const deps = se.locator('.se-deps');
    await expect(deps).toContainText('net472');
    await expect(deps).toContainText('SpecFlow (3.1.86)');
    await expect(deps).toContainText('NUnit (3.11.0)');
    await expect(deps).toContainText('TechTalk.SpecFlow');
    // Only listed files; the feature shows with its real name; the unlisted file and packages/ do not.
    await expect(se.getByRole('button', { name: 'shoppingCart.feature', exact: true })).toBeVisible();
    await expect(se.getByRole('button', { name: 'CartSteps.cs', exact: true })).toBeVisible();
    await expect(se.getByRole('button', { name: 'Unlisted.cs', exact: true })).toHaveCount(0);
    await expect(se.getByText('TechTalk.SpecFlow.xml')).toHaveCount(0);
    // Show All Files reveals files the project does not list (as in Visual Studio).
    await se.getByRole('button', { name: 'Show all files' }).click();
    await expect(se.getByRole('button', { name: 'Unlisted.cs', exact: true })).toBeVisible();
    // The step binds: the feature is indexed against the project's step definitions.
    expect(ws.index.stats.steps).toBe(1);

    // Without Visual Studio's MSBuild (as on this machine), build / test / debug explain what a classic project needs.
    const vs = await (await request.get('/api/build')).json();
    if (!process.env.STUDIO_MSBUILD && !vs.output?.includes('MSBuild.exe')) {
      const run = await request.post('/api/tests/run', { data: {} });
      expect(run.ok()).toBe(false);
      expect((await run.json()).error).toContain('classic .NET Framework projects');
      const dbg = await request.post('/api/debug/start', { data: { file: 'Feature/shoppingCart.feature' } });
      expect((await dbg.json()).error).toContain('debugs .NET 6+ projects only');
      await page.getByRole('button', { name: 'Build menu' }).click();
      await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
      const panel = page.getByRole('region', { name: 'Build' });
      await expect(panel.getByRole('status')).toHaveText(/Build (failed|succeeded)/, { timeout: 180_000 });
      if ((await panel.getByRole('status').textContent())?.includes('failed')) {
        await expect(panel.getByRole('grid', { name: 'Error List' })).toContainText('Install Visual Studio 2026 or the Build Tools');
      }
    }
  } finally {
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
