import fs from 'node:fs/promises';
import path from 'node:path';
import type { Config } from './core.js';
import { bindingMatches, keywordMatches, relative, ignoredDirsFor } from './core.js';
import { findEntry, selectorRank, normalizeXRef } from './dictionaries.js';
import type { Index, DictionaryEntry } from '../src/types.js';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip';
export type Check = { id: string; label: string; status: CheckStatus; detail: string; file?: string; line?: number };
export type ValidationInput = {
  steps?: { keyword: string; text: string }[];
  page?: string;
  section?: string;
  field?: string;
  featureFile?: string;
  dictionaryFile?: string;
};

async function walk(root: string, ignored: string[], test: (name: string) => boolean, out: string[] = [], dir = root) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.isSymbolicLink() || ignored.includes(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await walk(root, ignored, test, out, full);
    else if (test(e.name)) out.push(full);
    if (out.length > 5000) break;
  }
  return out;
}
/** MSBuild item glob → RegExp over '/'-separated paths relative to the project directory. */
export function msbuildGlob(pattern: string) {
  const p = pattern.replaceAll('\\', '/').replace(/^\.\//, '');
  let re = '';
  for (let i = 0; i < p.length; i++) {
    if (p.startsWith('**/', i)) { re += '(?:.*/)?'; i += 2; }
    else if (p.startsWith('**', i)) { re += '.*'; i += 1; }
    else if (p[i] === '*') re += '[^/]*';
    else if (p[i] === '?') re += '[^/]';
    else re += p[i].replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, 'i');
}
/** Finds the nearest .csproj containing `file` and whether an item copies it to the output directory. */
export async function outputInclusion(root: string, file: string, ignored: string[]) {
  const projects = await walk(root, ignored, (n) => n.endsWith('.csproj'));
  const abs = path.resolve(root, file);
  const owner = projects
    .filter((p) => abs.startsWith(path.dirname(p) + path.sep))
    .sort((a, b) => b.length - a.length)[0];
  if (!owner) return { status: 'warn' as CheckStatus, detail: 'No .csproj folder contains this file.', project: undefined };
  const xml = await fs.readFile(owner, 'utf8');
  const rel = path.relative(path.dirname(owner), abs).replaceAll('\\', '/');
  const item = /<(None|Content|EmbeddedResource)\s+(?:Include|Update)="([^"]+)"([^>]*?)(\/>|>([\s\S]*?)<\/\1>)/g;
  let m: RegExpExecArray | null;
  while ((m = item.exec(xml))) {
    const copy = /CopyToOutputDirectory="?(?:>)?\s*(Always|PreserveNewest)/i.test(m[3] + (m[5] ?? '')) ||
      /<CopyToOutputDirectory>\s*(Always|PreserveNewest)/i.test(m[5] ?? '');
    if (!m[2].split(';').some((g) => msbuildGlob(g.trim()).test(rel))) continue;
    if (m[1] === 'EmbeddedResource') return { status: 'pass' as CheckStatus, detail: `Embedded resource via ${m[2]}`, project: owner };
    if (copy) return { status: 'pass' as CheckStatus, detail: `Copied to output by <${m[1]} ${m[2]}>`, project: owner };
    return { status: 'fail' as CheckStatus, detail: `Matched by <${m[1]} ${m[2]}> without CopyToOutputDirectory.`, project: owner };
  }
  return { status: 'fail' as CheckStatus, detail: `No item in ${path.basename(owner)} copies ${rel} to the output directory.`, project: owner };
}

export async function validate(input: ValidationInput, index: Index, config: Config): Promise<Check[]> {
  const root = config.repositoryRoot;
  const checks: Check[] = [];
  // 1. Step patterns
  if (input.steps?.length) {
    let keyword = 'Given';
    const missing: string[] = [];
    let first: { file: string; line: number } | undefined;
    for (const s of input.steps) {
      if (['Given', 'When', 'Then'].includes(s.keyword)) keyword = s.keyword;
      const hit = index.stepDefinitions.filter((b) => keywordMatches(b, keyword) && bindingMatches(b, s.text));
      if (!hit.length) missing.push(`${keyword} ${s.text}`);
      else if (hit.length > 1) missing.push(`${keyword} ${s.text} (ambiguous: ${hit.length} bindings)`);
      else first ??= hit[0];
    }
    checks.push({
      id: 'steps', label: 'Step pattern match',
      status: missing.length ? (missing.length === input.steps.length ? 'fail' : 'warn') : 'pass',
      detail: missing.length ? `Needs a binding: ${missing.join('; ')}` : `All ${input.steps.length} steps match existing bindings${first ? ` (e.g. ${first.file})` : ''}.`,
      ...(first ?? {}),
    });
  } else checks.push({ id: 'steps', label: 'Step pattern match', status: 'skip', detail: 'No scenario steps supplied.' });
  // 2–4. Dictionary
  let entry: DictionaryEntry | undefined;
  if (input.section && input.field) {
    entry = findEntry(index.dictionaryEntries ?? [], input.page ?? '', input.section, input.field);
    checks.push(entry
      ? { id: 'dictionary', label: 'Dictionary existence', status: 'pass', detail: `${entry.page || 'Page'} / ${entry.section} / ${entry.field} found (normalized "${normalizeXRef(input.section)}"/"${normalizeXRef(input.field)}").`, file: entry.file, line: entry.line }
      : { id: 'dictionary', label: 'Dictionary existence', status: 'fail', detail: `No field "${normalizeXRef(input.field)}" in section "${normalizeXRef(input.section)}". Propose a dictionary entry.` });
    const supported = entry?.selectors.filter((s) => s.supported) ?? [];
    checks.push({ id: 'selectors', label: 'Field has selectors', status: !entry ? 'skip' : supported.length ? 'pass' : 'fail', detail: !entry ? 'Field not found.' : `${supported.length} of ${entry.selectors.length} selectors use a supported type.` });
    const top = supported[0];
    const rank = top ? selectorRank(top.type, top.value) : 9;
    checks.push({
      id: 'stability', label: 'Selector stability',
      status: !top ? 'skip' : rank <= 2 && !top.warnings.length ? 'pass' : rank <= 4 && !top.warnings.length ? 'warn' : 'fail',
      detail: !top ? 'No supported selector.' : `First selector is ${top.type} (priority ${rank})${top.warnings.length ? ' — ' + top.warnings.join(' ') : ''}.`,
      file: entry?.file, line: top?.line,
    });
  } else checks.push({ id: 'dictionary', label: 'Dictionary existence', status: 'skip', detail: 'Section and field not supplied.' });
  // 5. Lifecycle: hooks own browser creation; steps never launch browsers.
  const sources = await walk(root, ignoredDirsFor(config), (n) => n.endsWith('.cs'));
  const hooks: string[] = [], leaks: string[] = [];
  const stepFiles = new Set(index.stepDefinitions.map((b) => b.file));
  for (const f of sources.slice(0, 2000)) {
    const text = await fs.readFile(f, 'utf8');
    const rel = relative(root, f);
    if (/\[(BeforeScenario|AfterScenario|BeforeTestRun|AfterTestRun)\b/.test(text) && /(LaunchAsync|Playwright\.CreateAsync|IBrowser|IPage)/.test(text)) hooks.push(rel);
    if (stepFiles.has(rel) && /(LaunchAsync|Playwright\.CreateAsync)\s*\(/.test(text)) leaks.push(rel);
  }
  checks.push({
    id: 'lifecycle', label: 'Lifecycle compliance',
    status: leaks.length ? 'fail' : hooks.length ? 'pass' : 'warn',
    detail: leaks.length ? `Browser launched inside step definitions: ${leaks.join(', ')}` : hooks.length ? `Browser hooks in ${hooks.slice(0, 3).join(', ')}` : 'No [BeforeScenario]/[AfterScenario] browser hooks found.',
    file: leaks[0] ?? hooks[0],
  });
  // 6. Build output
  const dictFile = input.dictionaryFile ?? entry?.file;
  if (dictFile) {
    const out = await outputInclusion(root, dictFile, ignoredDirsFor(config));
    checks.push({ id: 'output', label: 'Output directory check', status: out.status, detail: out.detail, file: out.project ? relative(root, out.project) : undefined });
  } else checks.push({ id: 'output', label: 'Output directory check', status: 'skip', detail: 'No dictionary file selected.' });
  // 7. Conventions
  if (input.featureFile) {
    const ok = /(^|\/)Features\//i.test(input.featureFile) && /\/[A-Z][A-Za-z0-9]*\.feature$/.test('/' + input.featureFile);
    checks.push({ id: 'conventions', label: 'Naming & folder conventions', status: ok ? 'pass' : 'warn', detail: ok ? 'Feature file is PascalCase under Features/.' : 'Expected Features/<Area>/<PascalCase>.feature.' });
  }
  return checks;
}
