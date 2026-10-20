import { describe, expect, it } from 'vitest';
import { configOf, readProperties, setProperty, setProperties } from '../server/projectProps';

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
