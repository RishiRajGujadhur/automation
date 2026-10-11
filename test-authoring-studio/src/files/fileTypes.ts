import { FileText, FileCode2, Braces, FileCog, FileJson, FileType, File, Hash, Settings2, BookOpen, Palette, type LucideIcon } from 'lucide-react';

/**
 * File type look shared by editor tabs and the Explorer: an icon and a colour per extension (VS Code's file icon
 * themes do the same), so .cs, .xml, .json, .feature… are told apart at a glance.
 */
type FileType = { icon: LucideIcon; color: string; label: string };
const types: Record<string, FileType> = {
  feature: { icon: FileText, color: '#3fb950', label: 'Gherkin feature' },
  cs: { icon: FileCode2, color: '#a371f7', label: 'C#' },
  xml: { icon: Braces, color: '#f0883e', label: 'XML' },
  json: { icon: FileJson, color: '#e3b341', label: 'JSON' },
  csproj: { icon: FileCog, color: '#58a6ff', label: 'C# project' },
  sln: { icon: FileCog, color: '#bc8cff', label: 'Solution' },
  props: { icon: FileCog, color: '#58a6ff', label: 'MSBuild' },
  targets: { icon: FileCog, color: '#58a6ff', label: 'MSBuild' },
  config: { icon: Settings2, color: '#8b949e', label: 'Config' },
  runsettings: { icon: Settings2, color: '#8b949e', label: 'Run settings' },
  resx: { icon: Braces, color: '#db61a2', label: 'Resources' },
  md: { icon: BookOpen, color: '#79c0ff', label: 'Markdown' },
  yml: { icon: Hash, color: '#ff7b72', label: 'YAML' },
  yaml: { icon: Hash, color: '#ff7b72', label: 'YAML' },
  ts: { icon: FileType, color: '#3178c6', label: 'TypeScript' },
  tsx: { icon: FileType, color: '#3178c6', label: 'TypeScript' },
  js: { icon: FileType, color: '#f1e05a', label: 'JavaScript' },
  css: { icon: Palette, color: '#56d4dd', label: 'CSS' },
  scss: { icon: Palette, color: '#c6538c', label: 'SCSS' },
  html: { icon: FileCode2, color: '#e34c26', label: 'HTML' },
  csv: { icon: FileText, color: '#7ee787', label: 'CSV' },
  txt: { icon: FileText, color: '#8b949e', label: 'Text' },
};
const fallback: FileType = { icon: File, color: '#8b949e', label: 'File' };
export const extOf = (file: string) => (file.endsWith('.feature.cs') ? 'cs' : file.split('.').pop()?.toLowerCase() ?? '');
export const fileType = (file: string) => types[extOf(file)] ?? fallback;
