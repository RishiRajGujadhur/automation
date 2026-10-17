import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { classicOutput, classicProjects, findVisualStudio, msbuildArgs } from '../server/msbuild';

describe('classic (.NET Framework) projects: Visual Studio MSBuild', () => {
  it('builds with MSBuild targets and packages.config restore, like Visual Studio', () => {
    expect(msbuildArgs('Shop.sln', 'rebuild', 'Release')).toEqual(['Shop.sln', '-t:Rebuild', '-p:Configuration=Release', '-restore', '-p:RestorePackagesConfig=true', '-nologo', '-v:minimal', '-clp:NoSummary']);
    expect(msbuildArgs('Shop.sln', 'clean', 'Debug')).toEqual(['Shop.sln', '-t:Clean', '-p:Configuration=Debug', '-nologo', '-v:minimal', '-clp:NoSummary']);
  });
  it('finds the classic projects of a solution and their test assembly', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-msb-'));
    try {
      await fs.mkdir(path.join(root, 'Legacy'), { recursive: true });
      await fs.mkdir(path.join(root, 'Modern'), { recursive: true });
      await fs.writeFile(path.join(root, 'S.sln'), 'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Legacy", "Legacy\\Legacy.csproj", "{1}"\nEndProject\nProject("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "Modern", "Modern\\Modern.csproj", "{2}"\nEndProject\n');
      await fs.writeFile(path.join(root, 'Legacy/Legacy.csproj'), '<Project ToolsVersion="15.0" xmlns="http://schemas.microsoft.com/developer/msbuild/2003">\n  <PropertyGroup><AssemblyName>Shop Tests</AssemblyName><TargetFrameworkVersion>v4.7.2</TargetFrameworkVersion></PropertyGroup>\n  <PropertyGroup Condition=" \'$(Configuration)|$(Platform)\' == \'Release|AnyCPU\' "><OutputPath>out\\rel\\</OutputPath></PropertyGroup>\n</Project>\n');
      await fs.writeFile(path.join(root, 'Modern/Modern.csproj'), '<Project Sdk="Microsoft.NET.Sdk"></Project>');
      expect(await classicProjects(root, 'S.sln')).toEqual(['Legacy/Legacy.csproj']);
      expect(await classicProjects(root, 'Modern/Modern.csproj')).toEqual([]);
      expect(await classicOutput(root, 'Legacy/Legacy.csproj', 'Release')).toBe(path.join(root, 'Legacy', 'out', 'rel', 'Shop Tests.dll'));
      expect(await classicOutput(root, 'Legacy/Legacy.csproj', 'Debug')).toBe(path.join(root, 'Legacy', 'bin', 'Debug', 'Shop Tests.dll'));
      // STUDIO_MSBUILD overrides vswhere (any MSBuild.exe, e.g. Build Tools in a custom folder).
      const fake = path.join(root, 'MSBuild.exe');
      await fs.writeFile(fake, '');
      process.env.STUDIO_MSBUILD = fake;
      expect((await findVisualStudio())?.msbuild).toBe(fake);
    } finally {
      delete process.env.STUDIO_MSBUILD;
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
