import fs from 'node:fs/promises';
import path from 'node:path';

import { parseSln, parseSlnx, type ParsedSolution, type SolutionNode } from '../src/solutionFormat.js';
export { parseSln, parseSlnx, type ParsedSolution, type SolutionNode };

export async function readSolution(root: string, file: string): Promise<ParsedSolution> {
  const text = await fs.readFile(path.join(root, file), 'utf8');
  const parsed = file.toLowerCase().endsWith('.slnx') ? parseSlnx(text) : parseSln(text);
  // Project paths in a solution are relative to the solution file; make them repository-relative.
  const dir = path.posix.dirname(file.replaceAll('\\', '/'));
  const rebase = (p: string) => path.posix.normalize(dir === '.' ? p : `${dir}/${p}`);
  const fix = (nodes: SolutionNode[]): SolutionNode[] => nodes.map((n) => (n.kind === 'folder' ? { ...n, children: fix(n.children) } : { ...n, file: rebase(n.file) }));
  return { tree: fix(parsed.tree), projects: parsed.projects.map((p) => ({ ...p, file: rebase(p.file) })), configurations: parsed.configurations };
}

/** .NET Framework TargetFrameworkVersion (v4.7.2) as a target framework moniker (net472). */
export const frameworkMoniker = (v: string) => `net${v.replace(/^v/i, '').replace(/\./g, '')}`;

/**
 * One project's dependencies and, for classic (non-SDK) projects, its items — as Visual Studio reads them:
 * SDK-style: PackageReference, TargetFramework(s), ProjectReference; every file under the folder belongs to it.
 * Classic (.NET Framework, packages.config): TargetFrameworkVersion, packages.config, assembly References (HintPath),
 * and only the files listed as Compile / None / Content / EmbeddedResource / Page items (matched case-insensitively,
 * like Windows; SpecFlow code-behind files follow their feature).
 */
export async function projectInfo(root: string, file: string) {
  const xml = await fs.readFile(path.join(root, file), 'utf8').catch(() => '');
  const dir = path.posix.dirname(file);
  const prefix = dir === '.' ? '' : `${dir}/`;
  const legacy = !!xml && !/<Project[^>]*\bSdk\s*=/i.test(xml) && !/<Import[^>]*\bSdk\s*=/i.test(xml);
  const tfv = /<TargetFrameworkVersion>\s*([^<\s]+)\s*</i.exec(xml)?.[1];
  const packagesConfig = legacy ? await fs.readFile(path.join(root, prefix, 'packages.config'), 'utf8').catch(() => '') : '';
  const packages = [
    ...[...xml.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/g)].map((m) => (m[2] ? `${m[1]} (${m[2]})` : m[1])),
    ...[...packagesConfig.matchAll(/<package\s+[^>]*\bid="([^"]+)"[^>]*\bversion="([^"]+)"/g)].map((m) => `${m[1]} (${m[2]})`),
  ].sort((a, b) => a.localeCompare(b));
  const frameworks = [
    ...[...xml.matchAll(/<TargetFrameworks?>([^<]+)</g)].flatMap((m) => m[1].split(';').map((f) => f.trim())),
    ...(tfv ? [frameworkMoniker(tfv)] : []),
  ].filter(Boolean);
  // Assembly references: the GAC / framework ones (System.Xml) and package DLLs with a HintPath.
  const assemblies = legacy ? [...xml.matchAll(/<Reference\s+Include="([^"]+)"\s*(\/>|>([\s\S]*?)<\/Reference>)/g)].map((m) => {
    const hint = /<HintPath>([^<]+)<\/HintPath>/.exec(m[3] ?? '')?.[1];
    return { name: m[1].split(',')[0].trim(), hintPath: hint ? path.posix.normalize(prefix + hint.replaceAll('\\', '/')) : undefined };
  }) : [];
  let items: string[] | undefined;
  if (legacy) {
    const onDisk = new Map<string, string>();
    const walk = async (rel: string, depth: number) => {
      if (depth > 12) return;
      for (const e of await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => [])) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!['bin', 'obj', '.vs', '.git', 'packages', 'node_modules', 'TestResults'].includes(e.name)) await walk(r, depth + 1); }
        else onDisk.set(r.toLowerCase(), r);
      }
    };
    await walk(dir === '.' ? '' : dir, 0);
    const listed = [...xml.matchAll(/<(Compile|None|Content|EmbeddedResource|Page|Resource|SpecFlowFeatureFiles)\s+Include="([^"]+)"/g)].map((m) => path.posix.normalize(prefix + m[2].replaceAll('\\', '/')));
    const found = new Set<string>();
    for (const l of listed) {
      if (/[*?]/.test(l)) { const re = new RegExp('^' + l.toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*') + '$'); for (const [k, v] of onDisk) if (re.test(k)) found.add(v); continue; }
      const disk = onDisk.get(l.toLowerCase());
      if (disk) { found.add(disk); const cb = onDisk.get(`${l.toLowerCase()}.cs`); if (/\.feature$/i.test(l) && cb) found.add(cb); }
    }
    found.add(file);
    items = [...found].sort();
  }
  return {
    packages,
    frameworks,
    references: [...xml.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((m) => path.posix.normalize(`${prefix}${m[1].replaceAll('\\', '/')}`)),
    missing: !xml,
    legacy,
    assemblies,
    items,
  };
}

/** The project a file belongs to: the deepest project folder containing it ('' = solution items / no project). */
export function projectOf(file: string, projectDirs: string[]) {
  let best = '';
  for (const d of projectDirs) if ((d === '' || file === d || file.startsWith(`${d}/`)) && d.length >= best.length) best = d;
  return projectDirs.includes(best) ? best : undefined;
}

/** Solution files (.sln, .slnx) under a folder, nearest first (for File ▸ Open Solution and auto-detection). */
export async function findSolutions(root: string, ignored: string[], depth = 3) {
  const found: string[] = [];
  const walk = async (dir: string, level: number) => {
    for (const e of await fs.readdir(path.join(root, dir), { withFileTypes: true }).catch(() => [])) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isFile() && /\.slnx?$/i.test(e.name)) found.push(rel);
      else if (e.isDirectory() && level < depth && !e.name.startsWith('.') && !ignored.includes(e.name)) await walk(rel, level + 1);
    }
  };
  await walk('', 0);
  return found.sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
}
