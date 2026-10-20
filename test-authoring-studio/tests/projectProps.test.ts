import { describe, expect, it } from 'vitest';
import { readEditorConfig, setEditorConfig } from '../src/project/editorconfig';
import { addNoWarn, tidyProject } from '../src/project/projectText';
import { configOf, readProperties, setProperty, setProperties, readEvents, setEvent, readUsings, setUsings, readReferences, setReferences, relativeProjectPath, readFileItem, setFileItem, isExcluded, setExcluded } from '../server/projectProps';

const CSPROJ = `<Project Sdk="Microsoft.NET.Sdk">
  <!-- comment kept -->
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='Release|AnyCPU'">
    <Optimize>true</Optimize>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="NUnit" Version="4.2.2" />
  </ItemGroup>
</Project>
`;

describe('project properties (CSHARP-20)', () => {
  it('C1 reads properties per configuration', () => {
    expect(configOf("'$(Configuration)'=='Debug'")).toBe('Debug');
    expect(configOf("'$(Configuration)|$(Platform)'=='Release|AnyCPU'")).toBe('Release');
    expect(configOf("'$(OS)'=='Windows_NT'")).toBe(null);
    expect(readProperties(CSPROJ)).toEqual({ all: { TargetFramework: 'net10.0', Nullable: 'enable' }, byConfig: { Release: { Optimize: 'true' } } });
  });
  it('C1 changes, adds and removes a property, keeping the layout', () => {
    const changed = setProperties(CSPROJ, { Nullable: 'disable', AssemblyName: 'Demo & Co', TargetFramework: null });
    expect(changed).toContain('    <Nullable>disable</Nullable>\n    <AssemblyName>Demo &amp; Co</AssemblyName>\n  </PropertyGroup>');
    expect(changed).not.toContain('TargetFramework');
    expect(changed).toContain('<!-- comment kept -->');
    expect(readProperties(changed).all).toEqual({ Nullable: 'disable', AssemblyName: 'Demo & Co' });
  });
  it('C1 adds a configuration group and removes it when emptied', () => {
    const debug = setProperty(CSPROJ, 'DefineConstants', 'TRACE;DEBUG', 'Debug');
    expect(debug).toContain(`  </PropertyGroup>\n  <PropertyGroup Condition="'$(Configuration)'=='Debug'">\n    <DefineConstants>TRACE;DEBUG</DefineConstants>\n  </PropertyGroup>\n  <ItemGroup>`);
    expect(setProperty(debug, 'DefineConstants', null, 'Debug')).toBe(CSPROJ);
    expect(setProperty(CSPROJ, 'Optimize', 'false', 'Release')).toContain('<Optimize>false</Optimize>');
  });
  it('C1 keeps CRLF line endings', () => {
    const crlf = CSPROJ.replace(/\n/g, '\r\n');
    expect(setProperty(crlf, 'RootNamespace', 'Demo')).toContain('    <RootNamespace>Demo</RootNamespace>\r\n  </PropertyGroup>');
  });
});

describe('project file items (CSHARP-20)', () => {
  it('C7 build events', () => {
    const x = setEvent(CSPROJ, 'post', 'echo "done" > out.txt');
    expect(x).toContain('  <Target Name="PostBuild" AfterTargets="PostBuildEvent">\n    <Exec Command="echo &quot;done&quot; &gt; out.txt" />\n  </Target>\n</Project>');
    expect(readEvents(x)).toEqual({ pre: '', post: 'echo "done" > out.txt' });
    expect(setEvent(x, 'post', null)).toBe(CSPROJ);
  });
  it('C8 global usings', () => {
    const x = setUsings(CSPROJ, [{ include: 'NUnit.Framework' }, { include: 'System.Math', static: true }]);
    expect(readUsings(x)).toEqual([{ include: 'NUnit.Framework' }, { include: 'System.Math', static: true }]);
    expect(setUsings(x, [])).toBe(CSPROJ);
  });
  it('C9 project references', () => {
    expect(relativeProjectPath('Tests/Tests.csproj', 'App/App.csproj')).toBe('..\\App\\App.csproj');
    expect(relativeProjectPath('Demo.csproj', 'Lib/Lib.csproj')).toBe('Lib\\Lib.csproj');
    const x = setReferences(CSPROJ, ['..\\App\\App.csproj']);
    expect(readReferences(x)).toEqual(['..\\App\\App.csproj']);
    expect(setReferences(x, [])).toBe(CSPROJ);
  });
  it('C11 build action and copy to output', () => {
    expect(readFileItem(CSPROJ, 'Data/users.json')).toEqual({ action: 'None', copy: 'Never' });
    const copy = setFileItem(CSPROJ, 'Data/users.json', { action: 'None', copy: 'PreserveNewest' });
    expect(copy).toContain('<None Update="Data\\users.json"><CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory></None>');
    expect(readFileItem(copy, 'Data/users.json')).toEqual({ action: 'None', copy: 'PreserveNewest' });
    const embedded = setFileItem(copy, 'Data/users.json', { action: 'EmbeddedResource', copy: 'Never' });
    expect(readFileItem(embedded, 'Data/users.json')).toEqual({ action: 'EmbeddedResource', copy: 'Never' });
    expect(embedded).toContain('<None Remove="Data\\users.json" />');
    expect(setFileItem(embedded, 'Data/users.json', { action: 'None', copy: 'Never' })).toBe(CSPROJ);
  });
});

describe('exclude from project (CSHARP-20)', () => {
  it('C12 excludes and includes a file again', () => {
    const x = setExcluded(CSPROJ, 'Steps/Old.cs', true);
    expect(x).toContain('<Compile Remove="Steps\\Old.cs" />');
    expect(isExcluded(x, 'Steps/Old.cs')).toBe(true);
    expect(setExcluded(x, 'Steps/Old.cs', false)).toBe(CSPROJ);
  });
});

describe('project text helpers (CSHARP-20)', () => {
  it('C13 NoWarn gains a code once', () => {
    expect(addNoWarn(undefined, 'CS0168')).toBe('$(NoWarn);CS0168');
    expect(addNoWarn('CS1591', 'CA1707')).toBe('$(NoWarn);CS1591;CA1707');
    expect(addNoWarn('$(NoWarn);CS0168', 'cs0168')).toBe(null);
  });
});

describe('.editorconfig designer (CSHARP-20)', () => {
  const EC = 'root = true\n\n[*]\nindent_style = space\n# comment\n\n[*.cs]\ncsharp_prefer_braces = true:warning\n';
  it('C16 reads, sets and removes options', () => {
    expect(readEditorConfig(EC)).toEqual({ '': { root: 'true' }, '*': { indent_style: 'space' }, '*.cs': { csharp_prefer_braces: 'true:warning' } });
    expect(setEditorConfig(EC, '*', 'indent_size', '4')).toBe('root = true\n\n[*]\nindent_style = space\n# comment\nindent_size = 4\n\n[*.cs]\ncsharp_prefer_braces = true:warning\n');
    expect(setEditorConfig(EC, '*.cs', 'csharp_prefer_braces', null)).toBe('root = true\n\n[*]\nindent_style = space\n# comment\n\n[*.cs]\n');
    expect(setEditorConfig(EC, '*.cs', 'dotnet_diagnostic.CA1707.severity', 'none')).toContain('[*.cs]\ncsharp_prefer_braces = true:warning\ndotnet_diagnostic.CA1707.severity = none\n');
    expect(setEditorConfig('', '*.feature', 'indent_size', '2')).toBe('[*.feature]\nindent_size = 2\n');
  });
});

describe('Tidy Project File (CSHARP-20)', () => {
  it('C17 sorts references, drops empty groups, trims', () => {
    const messy = '<Project Sdk="Microsoft.NET.Sdk">   \n  <PropertyGroup>\n  </PropertyGroup>\n\n\n\n  <ItemGroup>\n    <PackageReference Include="NUnit" Version="4.2.2" />\n    <PackageReference Include="coverlet.collector" Version="6.0.2" />\n  </ItemGroup>\n</Project>\n\n';
    expect(tidyProject(messy)).toBe('<Project Sdk="Microsoft.NET.Sdk">\n\n  <ItemGroup>\n    <PackageReference Include="coverlet.collector" Version="6.0.2" />\n    <PackageReference Include="NUnit" Version="4.2.2" />\n  </ItemGroup>\n</Project>\n');
  });
});
