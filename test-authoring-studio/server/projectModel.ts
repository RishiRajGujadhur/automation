import fs from 'node:fs/promises';
import { extraRootsOf, ignoredDirsFor } from './core.js';
import path from 'node:path';
import type { Config } from './core.js';
import type { Index } from '../src/types.js';

export type Layer = 'Feature' | 'Step' | 'UI' | 'Selector data' | 'Support' | 'Config' | 'Data' | 'Build' | 'Output' | 'Other';
const layerFolders: [Layer, RegExp][] = [
  ['Feature', /^features$/i],
  ['Step', /^(steps|stepdefinitions|bindings)$/i],
  ['UI', /^(pages|pageobjects|helpers|utilities|ui)$/i],
  ['Selector data', /^(dictionaries|selectors)$/i],
  ['Support', /^(support|hooks)$/i],
  ['Config', /^(config|configuration)$/i],
  ['Data', /^(data|testdata|fixtures|resources)$/i],
  ['Output', /^(screenshots|reports|artifacts|testresults)$/i],
];
export function classifyFile(rel: string): Layer {
  const parts = rel.split('/');
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.feature') return 'Feature';
  if (['.csproj', '.sln', '.props', '.targets'].includes(ext)) return 'Build';
  for (const dir of parts.slice(0, -1).reverse()) for (const [layer, re] of layerFolders) if (re.test(dir)) return layer;
  if (['.runsettings', '.config', '.json', '.yml', '.yaml'].includes(ext)) return 'Config';
  if (['.trx', '.log', '.png', '.zip', '.html'].includes(ext)) return 'Output';
  return 'Other';
}
const tracked = /\.(feature|cs|xml|csproj|sln|slnx|props|targets|json|config|runsettings|ya?ml|csv|txt|resx|md|http|rest|ps1|sh|sql|ini)$/i;

/** Repository model: per-layer files plus classification indicators (rules §1–3, §11). */
export async function projectModel(config: Config, index: Index) {
  const root = config.repositoryRoot;
  const files: { file: string; layer: Layer }[] = [];
  const ignored = ignoredDirsFor(config);
  const walk = async (dir: string) => {
    for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (files.length >= 4000) return;
      if (e.isSymbolicLink() || e.name.startsWith('.') || ignored.includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (tracked.test(e.name)) {
        const rel = path.relative(root, full).replaceAll('\\', '/');
        files.push({ file: rel, layer: classifyFile(rel) });
      }
    }
  };
  await walk(root);
  // Solution projects outside the opened folder (their folders are inside the file boundary).
  for (const dir of extraRootsOf(await fs.realpath(root).catch(() => root))) await walk(dir);
  const csproj = files.filter((f) => f.file.endsWith('.csproj'));
  const packages = new Set<string>();
  const frameworks = new Set<string>();
  for (const p of csproj.slice(0, 50)) {
    const xml = await fs.readFile(path.join(root, p.file), 'utf8').catch(() => '');
    for (const m of xml.matchAll(/PackageReference\s+Include="([^"]+)"/g)) packages.add(m[1]);
    for (const m of xml.matchAll(/<TargetFrameworks?>([^<]+)</g)) for (const f of m[1].split(';')) frameworks.add(f.trim());
  }
  const has = (re: RegExp) => [...packages].some((p) => re.test(p));
  const indicators = [
    { label: 'BDD feature files', ok: index.features.length > 0 },
    { label: 'Step definitions', ok: index.stepDefinitions.length > 0 },
    { label: 'XML selector dictionaries', ok: (index.dictionaryEntries?.length ?? 0) > 0 },
    { label: 'Page objects / UI helpers', ok: files.some((f) => f.layer === 'UI') },
    { label: 'Hook-based lifecycle', ok: files.some((f) => f.layer === 'Support') },
    { label: 'BDD package (SpecFlow/Reqnroll)', ok: has(/specflow|reqnroll/i) },
    { label: 'Playwright package', ok: has(/playwright/i) },
    { label: 'Test SDK / adapter', ok: has(/Microsoft\.NET\.Test\.Sdk|nunit|xunit|mstest/i) },
  ];
  const layers: Record<string, number> = {};
  for (const f of files) layers[f.layer] = (layers[f.layer] ?? 0) + 1;
  return {
    root: path.basename(root),
    projects: csproj.map((p) => p.file),
    packages: [...packages].sort(),
    frameworks: [...frameworks].sort(),
    layers,
    indicators,
    files: files.sort((a, b) => a.file.localeCompare(b.file)),
    truncated: files.length >= 4000,
  };
}
