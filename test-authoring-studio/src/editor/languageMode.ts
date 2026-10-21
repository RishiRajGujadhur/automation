import { useSyncExternalStore } from 'react';
import type { Extension } from '@codemirror/state';
import { StreamLanguage } from '@codemirror/language';
import { json } from '@codemirror/legacy-modes/mode/javascript';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { python } from '@codemirror/legacy-modes/mode/python';
import { standardSQL } from '@codemirror/legacy-modes/mode/sql';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { webLanguage } from './web/languages';
import { xmlExtensions } from './xml';
import { gherkinSyntaxExtensions } from './gherkin';
import { setting } from '../vscode/settings';

/**
 * Language modes (VSCODE-250.md W23 / W24): VS Code's language ids with their names and file extensions. A file's
 * mode comes from Change Language Mode (per file), then files.associations, then its extension. A mode other than
 * the file's own gives its syntax colouring only (the language services follow the real file type).
 */
export type LanguageMode = { id: string; name: string; exts: string[]; syntax: () => Extension[] };
const legacy = (m: Parameters<typeof StreamLanguage.define>[0]) => () => [StreamLanguage.define(m)];
export const LANGUAGES: LanguageMode[] = [
  { id: 'plaintext', name: 'Plain Text', exts: ['txt', 'log'], syntax: () => [] },
  { id: 'csharp', name: 'C#', exts: ['cs', 'csx'], syntax: legacy(csharp) },
  { id: 'feature', name: 'Gherkin', exts: ['feature'], syntax: () => gherkinSyntaxExtensions() },
  { id: 'xml', name: 'XML', exts: ['xml', 'csproj', 'props', 'targets', 'config', 'runsettings', 'resx', 'xaml', 'svg'], syntax: () => xmlExtensions(false, false) },
  { id: 'json', name: 'JSON', exts: ['json', 'code-profile'], syntax: legacy(json) },
  { id: 'jsonc', name: 'JSON with Comments', exts: ['jsonc', 'code-workspace', 'code-snippets'], syntax: legacy(json) },
  { id: 'markdown', name: 'Markdown', exts: ['md', 'markdown'], syntax: () => [] },
  { id: 'javascript', name: 'JavaScript', exts: ['js', 'mjs', 'cjs'], syntax: () => webLanguage('x.js') },
  { id: 'javascriptreact', name: 'JavaScript JSX', exts: ['jsx'], syntax: () => webLanguage('x.jsx') },
  { id: 'typescript', name: 'TypeScript', exts: ['ts', 'mts', 'cts'], syntax: () => webLanguage('x.ts') },
  { id: 'typescriptreact', name: 'TypeScript JSX', exts: ['tsx'], syntax: () => webLanguage('x.tsx') },
  { id: 'html', name: 'HTML', exts: ['html', 'htm', 'xhtml'], syntax: () => webLanguage('x.html') },
  { id: 'css', name: 'CSS', exts: ['css'], syntax: () => webLanguage('x.css') },
  { id: 'scss', name: 'SCSS', exts: ['scss', 'sass'], syntax: () => webLanguage('x.scss') },
  { id: 'less', name: 'Less', exts: ['less'], syntax: () => webLanguage('x.less') },
  { id: 'yaml', name: 'YAML', exts: ['yml', 'yaml'], syntax: legacy(yaml) },
  { id: 'powershell', name: 'PowerShell', exts: ['ps1', 'psm1', 'psd1'], syntax: legacy(powerShell) },
  { id: 'shellscript', name: 'Shell Script', exts: ['sh', 'bash'], syntax: legacy(shell) },
  { id: 'python', name: 'Python', exts: ['py'], syntax: legacy(python) },
  { id: 'sql', name: 'SQL', exts: ['sql'], syntax: legacy(standardSQL) },
  { id: 'toml', name: 'TOML', exts: ['toml'], syntax: legacy(toml) },
  { id: 'dockerfile', name: 'Docker', exts: ['dockerfile'], syntax: legacy(dockerFile) },
  { id: 'ini', name: 'Ini', exts: ['ini', 'editorconfig', 'gitattributes', 'properties'], syntax: legacy(properties) },
  { id: 'diff', name: 'Diff', exts: ['diff', 'patch'], syntax: legacy(diff) },
  { id: 'http', name: 'HTTP', exts: ['http', 'rest'], syntax: () => [] },
];

export const languageById = (id: string) => LANGUAGES.find((l) => l.id === id);
const extOf = (file: string) => { const name = file.split('/').pop()!.toLowerCase(); return name === 'dockerfile' ? 'dockerfile' : name.startsWith('.') && !name.slice(1).includes('.') ? name.slice(1) : name.split('.').pop() ?? ''; };
/** The mode a file has by its extension alone. */
export const naturalLanguage = (file: string) => LANGUAGES.find((l) => l.exts.includes(extOf(file)))?.id ?? 'plaintext';

// Per-file choices from Change Language Mode (kept in this browser).
const KEY = 'tas:languageModes';
let chosen: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>; } catch { return {}; } })();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };
export const onLanguageModes = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useLanguageModes = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version);
export function setLanguageMode(file: string, id: string | undefined) {
  const { [file]: _, ...rest } = chosen;
  void _;
  chosen = id && id !== naturalLanguage(file) ? { ...rest, [file]: id } : rest;
  try { localStorage.setItem(KEY, JSON.stringify(chosen)); } catch { /* storage blocked */ }
  emit();
}

/** files.associations (W24): glob → language id; "*.ext" or a pattern with folders. */
const globTest = (glob: string, file: string) => {
  const re = new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`, 'i');
  return glob.includes('/') ? re.test(file) : re.test(file.split('/').pop()!);
};
export function associatedLanguage(file: string) {
  const map = setting<Record<string, string>>('files.associations') ?? {};
  for (const [glob, id] of Object.entries(map)) if (languageById(id) && globTest(glob, file)) return id;
  return undefined;
}
/** The language mode of a file: chosen, associated or by extension. */
export const languageOf = (file: string) => chosen[file] ?? associatedLanguage(file) ?? naturalLanguage(file);
