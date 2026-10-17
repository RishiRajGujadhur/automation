import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
async function fg(
  patterns: string | string[],
  options: { cwd: string; absolute?: boolean; ignore?: string[]; followSymbolicLinks?: boolean },
) {
  const files: string[] = [];
  for await (const file of fs.glob(patterns, { cwd: options.cwd, exclude: options.ignore })) {
    const full = path.resolve(options.cwd, file);
    if ((await fs.lstat(full)).isFile()) files.push(full);
  }
  return files;
}
import { Parser, AstBuilder, GherkinClassicTokenMatcher } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import { XMLParser } from 'fast-xml-parser';
import { parseDictionary } from './dictionaries.js';
import { parseSln, parseSlnx } from '../src/solutionFormat.js';
import { z } from 'zod';
import type { Index, Step, Binding, Action, Match, Feature } from '../src/types.js';
export const configSchema = z.object({
  repositoryRoot: z.string().min(1),
  targetProject: z.string().default('.'),
  /** Solution file (.sln / .slnx) relative to repositoryRoot; '' = folder (every .csproj is a project). */
  solution: z.string().default(''),
  featurePatterns: z.array(z.string()).default(['**/*.feature']),
  sourcePatterns: z.array(z.string()).default(['**/*.cs']),
  selectorPatterns: z.array(z.string()).default(['**/*.xml']),
  referenceScope: z.enum(['TargetOnly', 'DirectReferences']).default('DirectReferences'),
  ignoredDirectories: z
    .array(z.string())
    .default(['bin', 'obj', '.git', '.vs', 'node_modules', 'TestResults', 'playwright-report']),
});
export type Config = z.infer<typeof configSchema>;
// STUDIO_ROOT / STUDIO_DATA let a host (the Electron desktop app) put read-only resources and writable state elsewhere.
export const projectRoot = process.env.STUDIO_ROOT ? path.resolve(process.env.STUDIO_ROOT) : path.resolve(import.meta.dirname, '..');
export const dataRoot = process.env.STUDIO_DATA ? path.resolve(process.env.STUDIO_DATA) : projectRoot;
import { existsSync } from 'node:fs';
const localDotnet = path.resolve(projectRoot, '../.tools/dotnet/dotnet.exe');
export const dotnet = process.env.DOTNET_PATH || (existsSync(localDotnet) ? localDotnet : 'dotnet');
export const scannerDll = path.join(projectRoot, 'scanner/bin/Release/net10.0/Scanner.dll');
// A self-contained scanner build (the desktop app ships one) runs without an installed .NET runtime.
const scannerExe = process.env.STUDIO_SCANNER_EXE;
export const scanner = (args: string[] = []): [string, string[]] => (scannerExe ? [scannerExe, args] : [dotnet, [scannerDll, ...args]]);
export const relative = (root: string, file: string) =>
  path.relative(root, file).replaceAll('\\', '/');
/**
 * Folders of solution projects that live outside the opened folder (e.g. ../Shared/Shared.csproj), per opened folder
 * (real path). Only these exact project folders are added to the file boundary; nothing else outside it.
 */
const extraRoots = new Map<string, string[]>();
export const extraRootsOf = (base: string) => extraRoots.get(base) ?? [];
const inside = (p: string, dir: string) => p === dir || p.startsWith(dir + path.sep);
/** Recomputes the outside-project folders for a workspace from its solution file. */
export async function updateExtraRoots(config: { repositoryRoot: string; solution?: string }) {
  const base = await fs.realpath(config.repositoryRoot);
  const dirs: string[] = [];
  if (config.solution) {
    const text = await fs.readFile(path.join(base, config.solution), 'utf8').catch(() => '');
    const parsed = config.solution.toLowerCase().endsWith('.slnx') ? parseSlnx(text) : parseSln(text);
    const slnDir = path.dirname(path.join(base, config.solution));
    for (const p of parsed.projects) {
      const full = path.resolve(slnDir, p.file.replaceAll('\\', path.sep).replaceAll('/', path.sep));
      if (inside(full, base)) continue;
      const real = await fs.realpath(path.dirname(full)).catch(() => undefined);
      // A project folder that contains the opened folder (or a drive root) would open everything: refused.
      if (real && !inside(base, real) && path.parse(real).root !== real) dirs.push(real);
    }
  }
  extraRoots.set(base, [...new Set(dirs)]);
  return extraRoots.get(base)!;
}

export async function confined(root: string, file: string, existing = true) {
  const base = await fs.realpath(root);
  const target = path.resolve(base, file);
  const allowed = [base, ...extraRootsOf(base)];
  if (!allowed.some((d) => inside(target, d)))
    throw new Error('Path is outside the repository.');
  let probe = target;
  while (true) {
    try {
      const real = await fs.realpath(probe);
      if (!allowed.some((d) => inside(real, d)))
        throw new Error('Linked paths outside the repository are not allowed.');
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      if (existing) throw e;
      probe = path.dirname(probe);
    }
  }
  return target;
}
export function command(
  exe: string,
  args: string[],
  input = '',
  cwd = projectRoot,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd, windowsHide: true });
    let out = '',
      err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err || out))));
    p.stdin.end(input);
  });
}
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Reqnroll's detection (mirrors scanner IsCucumber): ^…$ → regex; {placeholders} → Cucumber; regex syntax → regex; else Cucumber. */
export function isCucumberExpression(p: string) {
  if (p.startsWith('^') || p.endsWith('$')) return false;
  if (/\{[A-Za-z_][\w.]*\}|\{\}/.test(p)) return true;
  if (/\\[dDwWsSbB.()[\]{}|*+?^$/]|\(\.\*\)|\(\.\+\)|[\[\]]|\([^()]*[*+?|][^()]*\)|[*+?]\)|\(\?/.test(p)) return false;
  return true;
}
/** Mirrors scanner ToRegex: Cucumber expressions (parameters, optional text, alternatives, escapes) become regex. */
export function expressionToRegex(p: string, cucumber = isCucumberExpression(p)) {
  if (!cucumber) return p;
  const tokens = p.match(/\\.|\{[^{}]*\}|\([^()]*\)|[^\s/{}()\\]+(?:\/[^\s/{}()\\]+)+|[\s\S]/g) ?? [];
  return tokens.map((x) => {
    if (x.length === 2 && x[0] === '\\') return escapeRegex(x[1]);
    if (['{int}', '{long}', '{byte}', '{short}', '{sbyte}', '{biginteger}'].includes(x)) return '(-?\\d+)';
    if (['{float}', '{double}', '{decimal}'].includes(x)) return '(-?\\d*[.,]?\\d+(?:[eE][-+]?\\d+)?)';
    if (x === '{word}') return '([^\\s]+)';
    if (x === '{string}') return `(?:"([^"]*)"|'([^']*)')`;
    if (x.startsWith('{')) return '(.*)';
    if (x.startsWith('(')) return `(?:${escapeRegex(x.slice(1, -1))})?`;
    if (x.includes('/')) return `(?:${x.split('/').map(escapeRegex).join('|')})`;
    return escapeRegex(x);
  }).join('');
}
/** [StepDefinition] binds steps of any keyword. */
export const keywordMatches = (binding: Binding, keyword: string) => binding.keyword === keyword || binding.keyword === 'StepDefinition';
export function bindingMatches(binding: Binding, text: string) {
  try {
    return new RegExp(`^(?:${expressionToRegex(binding.pattern, binding.expression ? binding.expression === 'Cucumber' : undefined)})$`).test(text);
  } catch {
    return false;
  }
}
export function classify(steps: Step[], bindings: Binding[]) {
  let keyword = 'Given';
  return steps.map((s) => {
    if (['Given', 'When', 'Then'].includes(s.keyword.trim())) keyword = s.keyword.trim();
    const candidates = bindings.filter((b) => keywordMatches(b, keyword) && bindingMatches(b, s.text));
    return {
      ...s,
      candidates: candidates.map((b) => b.id),
      status: candidates.length === 1 ? 'Matched' : candidates.length ? 'Ambiguous' : 'Unmatched',
    };
  });
}
export function parseFeature(source: string, file: string, bindings: Binding[]): Feature {
  const parser = new Parser(
    new AstBuilder(IdGenerator.incrementing()),
    new GherkinClassicTokenMatcher(),
  );
  const doc = parser.parse(source);
  if (!doc.feature) throw new Error('Missing Feature declaration');
  const f = doc.feature;
  const scenarios: Feature['scenarios'] = [],
    backgrounds: Feature['backgrounds'] = [];
  const steps = (items: any[]) =>
    classify(
      items.map((s) => ({
        keyword: s.keyword.trim(),
        text: s.text,
        file,
        line: s.location.line,
        candidates: [],
        status: 'Unmatched',
        argument: s.dataTable ?? s.docString,
      })),
      bindings,
    );
  const walk = (children: readonly any[]) => {
    for (const c of children) {
      if (c.background)
        backgrounds.push({
          name: c.background.name,
          line: c.background.location.line,
          steps: steps(c.background.steps),
        });
      if (c.scenario)
        scenarios.push({
          name: c.scenario.name,
          keyword: c.scenario.keyword,
          line: c.scenario.location.line,
          steps: steps(c.scenario.steps),
          tags: c.scenario.tags.map((t: any) => t.name),
          examples: c.scenario.examples,
        });
      if (c.rule) walk(c.rule.children);
    }
  };
  walk(f.children);
  return {
    file,
    line: f.location.line,
    name: f.name,
    source,
    tags: f.tags.map((t) => t.name),
    scenarios,
    backgrounds,
  };
}
export async function matchFeatureBindings(features: Feature[], bindings: Binding[]) {
  const occurrences: Step[] = [];
  const steps: { keyword: string; text: string; tags: string[]; feature: string; scenario: string }[] = [];
  for (const feature of features)
    for (const section of [...feature.backgrounds, ...feature.scenarios]) {
      let keyword = 'Given';
      const tags = [...feature.tags, ...(((section as { tags?: string[] }).tags) ?? [])];
      for (const step of section.steps) {
        if (['Given', 'When', 'Then'].includes(step.keyword)) keyword = step.keyword;
        occurrences.push(step);
        steps.push({ keyword, text: step.text, tags, feature: feature.name, scenario: section.name });
      }
    }
  // Each step's match depends only on the bindings and the step itself: unchanged steps reuse the last answer and
  // the matcher (a .NET process) runs only for new or edited steps, or not at all.
  const bindingsKey = JSON.stringify(bindings);
  if (matchCache.key !== bindingsKey) matchCache = { key: bindingsKey, steps: new Map(), diagnostics: [] };
  const keys = steps.map((st) => JSON.stringify([st.keyword, st.text, st.tags]));
  const todo = [...new Set(keys.filter((k) => !matchCache.steps.has(k)))];
  if (todo.length) {
    const first = new Map(keys.map((k, i) => [k, i] as const));
    const { results, diagnostics } = JSON.parse(
      await command(...scanner(['--match']), JSON.stringify({ bindings, steps: todo.map((k) => steps[first.get(k)!]) })),
    );
    results.forEach((result: { candidates: string[]; status: string }, i: number) => matchCache.steps.set(todo[i], result));
    matchCache.diagnostics = [...new Set([...matchCache.diagnostics, ...(diagnostics as string[])])];
    if (matchCache.steps.size > 50_000) matchCache.steps.clear();
  }
  keys.forEach((k, i) => Object.assign(occurrences[i], structuredClone(matchCache.steps.get(k))));
  return matchCache.diagnostics;
}
let matchCache: { key: string; steps: Map<string, { candidates: string[]; status: string }>; diagnostics: string[] } = { key: '', steps: new Map(), diagnostics: [] };
const scannerCache = new Map<string, { stamp: string; raw: any }>();
export async function scan(config: Config): Promise<Index> {
  const root = await fs.realpath(config.repositoryRoot);
  const target = await confined(root, config.targetProject);
  const stat = await fs.stat(target);
  const targetDir = stat.isFile() ? path.dirname(target) : target;
  const ignore = config.ignoredDirectories.map((d) => `**/${d}/**`);
  // Solution projects outside the opened folder are scanned too (their folders join the file boundary).
  const outside = await updateExtraRoots(config);
  const dirs = [targetDir, ...outside];
  if (config.referenceScope === 'DirectReferences') {
    const projects = stat.isFile()
      ? [target]
      : await fg('*.csproj', { cwd: targetDir, absolute: true });
    for (const project of projects) {
      const xml = await fs.readFile(project, 'utf8');
      for (const match of xml.matchAll(/<ProjectReference\s+[^>]*Include="([^"]+)"/g)) {
        const ref = await confined(
          root,
          path.resolve(path.dirname(project), match[1].replaceAll('\\', path.sep)),
        );
        dirs.push(path.dirname(ref));
      }
    }
  }
  async function files(patterns: string[]) {
    const found = (await Promise.all([targetDir, ...outside].map((cwd) => fg(patterns, {
      cwd,
      absolute: true,
      ignore,
      followSymbolicLinks: false,
    })))).flat();
    return Promise.all([...new Set(found)].map((f) => confined(root, f)));
  }
  const sources = [
    ...new Set(
      (
        await Promise.all(
          dirs.map((cwd) =>
            fg(config.sourcePatterns, { cwd, absolute: true, ignore, followSymbolicLinks: false }),
          ),
        )
      ).flat(),
    ),
  ];
  for (const file of sources) await confined(root, file);
  // The Roslyn scanner (a separate .NET process, ~1 s) only reruns when a C# source changed: saving a feature or
  // dictionary reuses the last result (keyed by every source's path, size and modification time).
  const stamp = (await Promise.all(sources.map(async (f) => { const st = await fs.stat(f).catch(() => undefined); return `${f}|${st?.size}|${st?.mtimeMs}`; }))).sort().join('\n');
  let raw = scannerCache.get(root)?.stamp === stamp ? scannerCache.get(root)!.raw : undefined;
  if (!raw) {
    raw = JSON.parse(await command(...scanner(), JSON.stringify(sources)));
    scannerCache.set(root, { stamp, raw });
  }
  const index: Index = {
    schemaVersion: 1,
    workspace: path.basename(targetDir),
    features: [],
    stepDefinitions: raw.stepDefinitions.map((b: any) => ({
      ...b,
      file: relative(root, b.file),
      usages: 0,
      examples: [],
    })),
    selectors: raw.selectors.map((s: any) => ({
      ...s,
      id: s.id ? `${relative(root, s.file)}:${s.line}` : undefined,
      file: relative(root, s.file),
    })),
    methods: raw.methods.map((m: any) => ({ ...m, file: relative(root, m.file) })),
    callEdges: raw.callEdges.map((e: any) => ({
      ...e,
      to: e.to.startsWith(root) ? relative(root, e.to) : e.to,
    })),
    diagnostics: [],
  };
  for (const file of await files(config.featurePatterns)) {
    try {
      index.features.push(parseFeature(await fs.readFile(file, 'utf8'), relative(root, file), []));
    } catch (e) {
      index.diagnostics.push(`${relative(root, file)}: ${(e as Error).message}`);
    }
  }
  index.diagnostics.push(...(await matchFeatureBindings(index.features, index.stepDefinitions)));
  const bindingsById=new Map(index.stepDefinitions.map(b=>[b.id,b]));
  for (const f of index.features)
    for (const section of [...f.scenarios, ...f.backgrounds])
      for (const s of section.steps)
        for (const id of s.candidates) {
          const b = bindingsById.get(id)!;
          b.usages++;
          if (b.examples.length < 3 && !b.examples.includes(s.text)) b.examples.push(s.text);
        }
  for (const file of await files(config.selectorPatterns)) {
    try {
      const entries=parseDictionary(await fs.readFile(file,'utf8'),relative(root,file));
      (index.dictionaryEntries ??= []).push(...entries);
      const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' }).parse(
        await fs.readFile(file, 'utf8'),
      );
      const visit = (o: any) => {
        if (!o || typeof o !== 'object') return;
        if (o.name && o.value)
          index.selectors.push({
            owner: path.basename(file),
            member: String(o.name),
            type: 'Dictionary',
            value: String(o.value),
            resolution: 'Static',
            file: relative(root, file),
            line: 1,
          });
        Object.values(o).forEach((v) => (Array.isArray(v) ? v.forEach(visit) : visit(v)));
      };
      visit(parsed);
    } catch {
      index.diagnostics.push(`Unable to parse ${relative(root, file)}`);
    }
  }
  const unresolved = index.callEdges.filter((e) => e.resolution === 'Unresolved').length;
  if (unresolved)
    index.diagnostics.push(
      `${unresolved} calls could not be statically resolved. External dependencies are not loaded or executed.`,
    );
  return index;
}
export function redact(action: Action): Action {
  const a = structuredClone(action);
  if (a.url) {
    try {
      const u = new URL(a.url);
      u.username = '';
      u.password = '';
      u.search = '';
      u.hash = '';
      a.url = u.href;
    } catch {
      a.url = '[REDACTED]';
    }
  }
  if (
    a.sensitive ||
    /password|secret|token|credential|authorization|api.?key/i.test(JSON.stringify(a.target))
  )
    a.value = '[REDACTED]';
  return a;
}
export function matchActions(actions: Action[], index: Index): Match[] {
  return actions.map((raw) => {
    const action = redact(raw);
    const context = [action.target?.name, action.target?.description, action.target?.testId]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const candidates = index.stepDefinitions
      .map((binding) => {
        let score = 0;
        const reasons: string[] = [];
        const wording = binding.pattern.toLowerCase();
        const verbs = {
          goto: /open|navigate|visit/,
          fill: /search|enter|fill|type|signs in/,
          press: /press|submit|search/,
          click: /click|select|opens/,
        };
        if (verbs[action.action].test(wording)) {
          score += 0.3;
          reasons.push('Compatible action wording');
        }
        const words = context.split(/\W+/).filter((w) => w.length > 2);
        if (words.some((w) => wording.includes(w))) {
          score += 0.25;
          reasons.push('Target name appears in binding');
        }
        if (
          action.action === 'goto' &&
          action.url &&
          wording.includes(new URL(action.url).hostname.replace(/^www\./, '').split('.')[0])
        ) {
          score += 0.3;
          reasons.push('Destination appears in binding');
        }
        if (action.action === 'fill' && binding.parameters.length === 1) {
          score += 0.1;
          reasons.push('One compatible value parameter');
        }
        if (binding.usages) {
          score += 0.05;
          reasons.push(`${binding.usages} repository usages`);
        }
        const calls = index.callEdges.filter(
          (e) => e.from === binding.method && e.resolution === 'Resolved',
        );
        if (calls.length && words.some((w) => calls.some((c) => c.to.toLowerCase().includes(w)))) {
          score += 0.1;
          reasons.push('Resolved method name supports target');
        }
        const value = action.value ?? action.key ?? '';
        let text = binding.pattern
          .replace(/^\^|\$$/g, '')
          .replace(/\(\.\*\)|\(\.\+\)|\(\[\^"\]\*\)/g, () => value);
        if (text.includes('(?') || text.includes('[') || text.includes('{'))
          text = binding.examples[0] ?? text;
        return { binding, score: Math.min(score, 0.95), reasons, text };
      })
      .filter((c) => c.score >= 0.5 && c.reasons.includes('Compatible action wording'))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    return { action, candidates };
  });
}
