import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseSln, parseSlnx, readSolution, projectInfo, projectOf, findSolutions } from '../server/solution';

const sln = `
Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Shop.Tests", "tests\\Shop.Tests\\Shop.Tests.csproj", "{11111111-1111-1111-1111-111111111111}"
EndProject
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "Shop.Pages", "src\\Shop.Pages\\Shop.Pages.csproj", "{22222222-2222-2222-2222-222222222222}"
EndProject
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Tests", "Tests", "{33333333-3333-3333-3333-333333333333}"
EndProject
Project("{2150E333-8FDC-42A3-9474-1A3956D46DE8}") = "Solution Items", "Solution Items", "{44444444-4444-4444-4444-444444444444}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|Any CPU = Debug|Any CPU
		Release|Any CPU = Release|Any CPU
	EndGlobalSection
	GlobalSection(NestedProjects) = preSolution
		{11111111-1111-1111-1111-111111111111} = {33333333-3333-3333-3333-333333333333}
	EndGlobalSection
EndGlobal
`;
const slnx = `<Solution>
  <Configurations><BuildType Name="Debug" /><BuildType Name="Release" /></Configurations>
  <Folder Name="/Tests/">
    <Project Path="tests/Shop.Tests/Shop.Tests.csproj" />
  </Folder>
  <Folder Name="/Tests/Ui/">
    <Project Path="tests/Shop.Ui/Shop.Ui.csproj" />
  </Folder>
  <Project Path="src/Shop.Pages/Shop.Pages.csproj" />
</Solution>`;

describe('solution files', () => {
  it('parses a classic .sln: projects, solution folders, nesting, configurations', () => {
    const s = parseSln(sln);
    expect(s.projects.map((p) => p.file)).toEqual(['tests/Shop.Tests/Shop.Tests.csproj', 'src/Shop.Pages/Shop.Pages.csproj']);
    expect(s.configurations).toEqual(['Debug|Any CPU', 'Release|Any CPU']);
    // Folders first, then projects; Shop.Tests sits inside the Tests folder.
    expect(s.tree.map((n) => n.name)).toEqual(['Solution Items', 'Tests', 'Shop.Pages']);
    const tests = s.tree.find((n) => n.name === 'Tests');
    expect(tests?.kind === 'folder' && tests.children.map((c) => c.name)).toEqual(['Shop.Tests']);
  });
  it('parses an .slnx with nested folders', () => {
    const s = parseSlnx(slnx);
    expect(s.projects.map((p) => p.name)).toEqual(['Shop.Tests', 'Shop.Ui', 'Shop.Pages']);
    const tests = s.tree[0];
    expect(tests.kind === 'folder' && tests.name).toBe('Tests');
    expect(tests.kind === 'folder' && tests.children.map((c) => c.name)).toEqual(['Ui', 'Shop.Tests']);
    expect(s.configurations).toEqual(['Debug', 'Release']);
  });
  it('assigns files to the deepest project folder', () => {
    expect(projectOf('tests/Shop.Tests/Steps/A.cs', ['tests/Shop.Tests', 'src/Shop.Pages'])).toBe('tests/Shop.Tests');
    expect(projectOf('README.md', ['tests/Shop.Tests'])).toBeUndefined();
    expect(projectOf('Steps/A.cs', [''])).toBe('');
  });
});

describe('solutions on disk', () => {
  let root: string;
  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-sln-'));
    await fs.mkdir(path.join(root, 'build/tests/Shop.Tests'), { recursive: true });
    // A solution in a sub-folder: project paths are relative to it.
    await fs.writeFile(path.join(root, 'build/Shop.slnx'), '<Solution><Project Path="tests/Shop.Tests/Shop.Tests.csproj" /></Solution>');
    await fs.writeFile(path.join(root, 'build/tests/Shop.Tests/Shop.Tests.csproj'), '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup><ItemGroup><PackageReference Include="Reqnroll" Version="2.0.0" /><ProjectReference Include="..\\..\\src\\Pages\\Pages.csproj" /></ItemGroup></Project>');
  });
  afterAll(() => fs.rm(root, { recursive: true, force: true }));
  it('finds solutions, rebases project paths and reads project dependencies', async () => {
    expect(await findSolutions(root, ['bin', 'obj'])).toEqual(['build/Shop.slnx']);
    const s = await readSolution(root, 'build/Shop.slnx');
    expect(s.projects[0].file).toBe('build/tests/Shop.Tests/Shop.Tests.csproj');
    const info = await projectInfo(root, s.projects[0].file);
    expect(info).toMatchObject({ packages: ['Reqnroll (2.0.0)'], frameworks: ['net8.0'], references: ['build/src/Pages/Pages.csproj'], missing: false });
  });
});
