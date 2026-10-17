import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LanguageService } from '../server/langService';

// Multi-project solution: Specs references Pages; Other references nothing.
const built = existsSync(path.resolve(import.meta.dirname, '../langserver/bin/Release/net10.0/LangServer.dll'));
describe.skipIf(!built)('C# language service: one Roslyn project per .csproj', () => {
  let root: string;
  const lang = new LanguageService();
  const write = async (f: string, t: string) => { await fs.mkdir(path.dirname(path.join(root, f)), { recursive: true }); await fs.writeFile(path.join(root, f), t); };
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-lang-'));
    await write('src/Pages/Pages.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>');
    await write('src/Pages/CartPage.cs', 'namespace Shop.Pages;\npublic class CartPage { public void Add() { } }\n');
    await write('tests/Specs/Specs.csproj', '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><ProjectReference Include="..\\..\\src\\Pages\\Pages.csproj" /></ItemGroup></Project>');
    await write('tests/Specs/CartSteps.cs', 'using Shop.Pages;\nnamespace Shop.Specs;\npublic class CartSteps { CartPage page = new(); void M() { page.Add(); } }\n');
    await write('tools/Other/Other.csproj', '<Project Sdk="Microsoft.NET.Sdk"></Project>');
    await write('tools/Other/X.cs', 'namespace Other;\nclass X { }\n');
  }, 60_000);
  afterAll(async () => { lang.stop(); await fs.rm(root, { recursive: true, force: true }); });

  it('goes to a definition in a referenced project', async () => {
    const r = await lang.request<{ locations: { file: string }[] }>(root, { op: 'definition', file: 'tests/Specs/CartSteps.cs', line: 3, column: 27 }, 120_000);
    expect(r.locations[0].file).toBe('src/Pages/CartPage.cs');
  }, 120_000);
  it('offers only what a project can see: Other has no reference to Pages', async () => {
    const source = 'namespace Other;\nclass X { void M() { Shop. } }\n';
    const r = await lang.request<{ items: { label: string }[] }>(root, { op: 'complete', file: 'tools/Other/X.cs', source, line: 2, column: 27 });
    expect(r.items.map((i) => i.label)).not.toContain('Pages');
    const specs = 'using Shop.Pages;\nnamespace Shop.Specs;\npublic class CartSteps { void M(CartPage p) { p. } }\n';
    const s = await lang.request<{ items: { label: string }[] }>(root, { op: 'complete', file: 'tests/Specs/CartSteps.cs', source: specs, line: 3, column: 50 });
    expect(s.items.map((i) => i.label)).toContain('Add');
  }, 120_000);
  it('renames across the projects that reference the symbol', async () => {
    const r = await lang.request<{ changes: { file: string }[] }>(root, { op: 'rename', file: 'tests/Specs/CartSteps.cs', source: 'using Shop.Pages;\nnamespace Shop.Specs;\npublic class CartSteps { CartPage page = new(); void M() { page.Add(); } }\n', line: 3, column: 27, newName: 'BasketPage' }, 120_000);
    expect(r.changes.map((c) => c.file).sort()).toEqual(['src/Pages/CartPage.cs', 'tests/Specs/CartSteps.cs']);
  }, 120_000);
});

// Classic .NET Framework project: assembly references with a HintPath into a local packages/ folder.
const specflowDll = path.join(os.homedir(), '.nuget/packages/specflow/3.9.74/lib/net461/TechTalk.SpecFlow.dll');
describe.skipIf(!built || !existsSync(specflowDll))('C# language service: classic (.NET Framework) projects', () => {
  let root: string;
  const lang = new LanguageService();
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-lang-legacy-'));
    await fs.mkdir(path.join(root, 'packages/SpecFlow.3.9.74/lib/net461'), { recursive: true });
    await fs.copyFile(specflowDll, path.join(root, 'packages/SpecFlow.3.9.74/lib/net461/TechTalk.SpecFlow.dll'));
    await fs.writeFile(path.join(root, 'Legacy.csproj'), String.raw`<?xml version="1.0" encoding="utf-8"?>
<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">
  <PropertyGroup><TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion></PropertyGroup>
  <ItemGroup>
    <Reference Include="TechTalk.SpecFlow, Version=3.9.0.0"><HintPath>packages\SpecFlow.3.9.74\lib\net461\TechTalk.SpecFlow.dll</HintPath></Reference>
  </ItemGroup>
</Project>
`);
    await fs.writeFile(path.join(root, 'Steps.cs'), 'using TechTalk.SpecFlow;\nnamespace Legacy\n{\n    public class Steps { public Steps(ScenarioContext context) { } }\n}\n');
  }, 60_000);
  afterAll(async () => { lang.stop(); await fs.rm(root, { recursive: true, force: true }); });
  it('resolves types from HintPath assemblies', async () => {
    const r = await lang.request<{ sections: { text: string }[] }>(root, { op: 'hover', file: 'Steps.cs', line: 4, column: 40 }, 120_000);
    expect(r.sections[0].text).toBe('class TechTalk.SpecFlow.ScenarioContext');
  }, 120_000);
});
