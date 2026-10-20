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
];
