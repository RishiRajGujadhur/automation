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

/** One project's dependencies (NuGet packages, project references, target frameworks), read from its .csproj. */
export async function projectInfo(root: string, file: string) {
  const xml = await fs.readFile(path.join(root, file), 'utf8').catch(() => '');
  const dir = path.posix.dirname(file);
  return {
    packages: [...xml.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]+)")?/g)].map((m) => (m[2] ? `${m[1]} (${m[2]})` : m[1])).sort(),
    frameworks: [...xml.matchAll(/<TargetFrameworks?>([^<]+)</g)].flatMap((m) => m[1].split(';').map((f) => f.trim())).filter(Boolean),
    references: [...xml.matchAll(/<ProjectReference\s+Include="([^"]+)"/g)].map((m) => path.posix.normalize(`${dir === '.' ? '' : `${dir}/`}${m[1].replaceAll('\\', '/')}`)),
    missing: !xml,
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
