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
import { z } from 'zod';
import type { Index, Step, Binding, Action, Match, Feature } from '../src/types.js';
export const configSchema = z.object({
  repositoryRoot: z.string().min(1),
  targetProject: z.string().default('.'),
  featurePatterns: z.array(z.string()).default(['**/*.feature']),
  sourcePatterns: z.array(z.string()).default(['**/*.cs']),
  selectorPatterns: z.array(z.string()).default(['**/*.xml']),
  referenceScope: z.enum(['TargetOnly', 'DirectReferences']).default('DirectReferences'),
  ignoredDirectories: z
    .array(z.string())
    .default(['bin', 'obj', '.git', '.vs', 'node_modules', 'TestResults', 'playwright-report']),
});
export type Config = z.infer<typeof configSchema>;
export const projectRoot = path.resolve(import.meta.dirname, '..');
import { existsSync } from 'node:fs';
const localDotnet = path.resolve(projectRoot, '../.tools/dotnet/dotnet.exe');
export const dotnet = process.env.DOTNET_PATH || (existsSync(localDotnet) ? localDotnet : 'dotnet');
export const scannerDll = path.join(projectRoot, 'scanner/bin/Release/net10.0/Scanner.dll');
export const relative = (root: string, file: string) =>
  path.relative(root, file).replaceAll('\\', '/');
export async function confined(root: string, file: string, existing = true) {
  const base = await fs.realpath(root);
  const target = path.resolve(base, file);
  if (target !== base && !target.startsWith(base + path.sep))
    throw new Error('Path is outside the repository.');
  let probe = target;
  while (true) {
    try {
      const real = await fs.realpath(probe);
      if (real !== base && !real.startsWith(base + path.sep))
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
export function bindingMatches(binding: Binding, text: string) {
  try {
    return new RegExp(`^(?:${binding.pattern})$`).test(text);
  } catch {
    return false;
  }
}
export function classify(steps: Step[], bindings: Binding[]) {
  let keyword = 'Given';
  return steps.map((s) => {
    if (['Given', 'When', 'Then'].includes(s.keyword.trim())) keyword = s.keyword.trim();
    const candidates = bindings.filter((b) => b.keyword === keyword && bindingMatches(b, s.text));
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
  const steps: { keyword: string; text: string }[] = [];
  for (const feature of features)
    for (const section of [...feature.backgrounds, ...feature.scenarios]) {
      let keyword = 'Given';
      for (const step of section.steps) {
        if (['Given', 'When', 'Then'].includes(step.keyword)) keyword = step.keyword;
        occurrences.push(step);
        steps.push({ keyword, text: step.text });
      }
    }
  const { results, diagnostics } = JSON.parse(
    await command(dotnet, [scannerDll, '--match'], JSON.stringify({ bindings, steps })),
  );
  results.forEach((result: { candidates: string[]; status: string }, i: number) =>
    Object.assign(occurrences[i], result),
  );
  return diagnostics as string[];
}
export async function scan(config: Config): Promise<Index> {
  const root = await fs.realpath(config.repositoryRoot);
  const target = await confined(root, config.targetProject);
  const stat = await fs.stat(target);
  const targetDir = stat.isFile() ? path.dirname(target) : target;
  const ignore = config.ignoredDirectories.map((d) => `**/${d}/**`);
  const dirs = [targetDir];
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
    const found = await fg(patterns, {
      cwd: targetDir,
      absolute: true,
      ignore,
      followSymbolicLinks: false,
    });
    return Promise.all(found.map((f) => confined(root, f)));
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
  const raw = JSON.parse(await command(dotnet, [scannerDll], JSON.stringify(sources)));
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
