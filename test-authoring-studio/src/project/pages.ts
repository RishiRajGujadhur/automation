/**
 * Project Properties pages (Visual Studio 2026's project property designer). Each page belongs to a feature switch
 * (CSHARP-20.md); a field edits one MSBuild property of the .csproj.
 */
export type Field = {
  name: string;
  label: string;
  kind: 'text' | 'select' | 'bool';
  options?: string[];
  /** For bool fields: the values written when checked / unchecked (default true / false). */
  on?: string;
  off?: string;
  placeholder?: string;
  help?: string;
};
export type Page = { id: string; title: string; feature: string; fields: Field[]; custom?: boolean };

export const PAGES: Page[] = [
  {
    id: 'application',
    title: 'Application',
    feature: 'project-properties',
    fields: [
      { name: 'TargetFramework', label: 'Target framework', kind: 'select', options: ['net10.0', 'net9.0', 'net8.0', 'net6.0', 'netstandard2.1', 'netstandard2.0', 'net48', 'net472'], help: 'The .NET version the project builds for.' },
      { name: 'TargetFrameworks', label: 'Target frameworks (multi-targeting)', kind: 'text', placeholder: 'net10.0;net8.0', help: 'Several frameworks separated by ";" (replaces Target framework).' },
      { name: 'OutputType', label: 'Output type', kind: 'select', options: ['Library', 'Exe', 'WinExe'], help: 'Test projects are libraries.' },
      { name: 'AssemblyName', label: 'Assembly name', kind: 'text', placeholder: 'project file name' },
      { name: 'RootNamespace', label: 'Default namespace', kind: 'text', placeholder: 'assembly name' },
      { name: 'IsPackable', label: 'Packable', kind: 'bool', help: 'Whether dotnet pack produces a NuGet package.' },
    ],
  },
  {
    id: 'build',
    title: 'Build',
    feature: 'pp-build',
    fields: [
      { name: 'Nullable', label: 'Nullable', kind: 'select', options: ['enable', 'disable', 'warnings', 'annotations'], help: 'Nullable reference types for the whole project.' },
      { name: 'ImplicitUsings', label: 'Implicit global usings', kind: 'bool', on: 'enable', off: 'disable' },
      { name: 'LangVersion', label: 'C# language version', kind: 'select', options: ['latest', 'preview', 'default', '14', '13', '12', '11', '10'] },
      { name: 'TreatWarningsAsErrors', label: 'Treat warnings as errors', kind: 'bool' },
      { name: 'WarningLevel', label: 'Warning level', kind: 'select', options: ['0', '1', '2', '3', '4', '5', '9999'] },
      { name: 'NoWarn', label: 'Suppress warnings', kind: 'text', placeholder: '$(NoWarn);CS1591', help: 'Warning codes separated by ";".' },
      { name: 'DefineConstants', label: 'Conditional compilation symbols', kind: 'text', placeholder: '$(DefineConstants);MY_SYMBOL' },
      { name: 'Optimize', label: 'Optimize code', kind: 'bool' },
      { name: 'PlatformTarget', label: 'Platform target', kind: 'select', options: ['AnyCPU', 'x64', 'x86', 'ARM64'] },
      { name: 'OutputPath', label: 'Output path', kind: 'text', placeholder: 'bin\\$(Configuration)\\' },
    ],
  },
  {
    id: 'package',
    title: 'Package',
    feature: 'pp-package',
    fields: [
      { name: 'PackageId', label: 'Package ID', kind: 'text', placeholder: 'assembly name' },
      { name: 'Version', label: 'Version', kind: 'text', placeholder: '1.0.0' },
      { name: 'Authors', label: 'Authors', kind: 'text' },
      { name: 'Company', label: 'Company', kind: 'text' },
      { name: 'Description', label: 'Description', kind: 'text' },
      { name: 'PackageTags', label: 'Tags', kind: 'text', placeholder: 'testing;playwright' },
      { name: 'RepositoryUrl', label: 'Repository URL', kind: 'text' },
      { name: 'PackageLicenseExpression', label: 'License expression', kind: 'text', placeholder: 'MIT' },
      { name: 'GeneratePackageOnBuild', label: 'Generate NuGet package on build', kind: 'bool' },
    ],
  },
  {
    id: 'analysis',
    title: 'Code Analysis',
    feature: 'pp-analysis',
    fields: [
      { name: 'EnableNETAnalyzers', label: 'Enable .NET analyzers', kind: 'bool' },
      { name: 'AnalysisLevel', label: 'Analysis level', kind: 'select', options: ['latest', 'latest-recommended', 'latest-all', 'latest-minimum', 'preview', '10.0', '9.0', '8.0'] },
      { name: 'AnalysisMode', label: 'Analysis mode', kind: 'select', options: ['Default', 'Minimum', 'Recommended', 'All', 'None'] },
      { name: 'EnforceCodeStyleInBuild', label: 'Enforce code style on build', kind: 'bool', help: 'IDE rules from .editorconfig are reported by dotnet build.' },
      { name: 'GenerateDocumentationFile', label: 'Generate documentation file', kind: 'bool', help: 'Also reports public members without XML docs (CS1591).' },
      { name: 'RunAnalyzersDuringBuild', label: 'Run analyzers on build', kind: 'bool' },
    ],
  },
  { id: 'events', title: 'Build Events', feature: 'pp-events', fields: [], custom: true },
  { id: 'usings', title: 'Global Usings', feature: 'pp-usings', fields: [], custom: true },
];
