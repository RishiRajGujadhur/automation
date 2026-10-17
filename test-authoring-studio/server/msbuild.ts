import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { projectInfo, readSolution } from './solution.js';

/**
 * Classic (.NET Framework, non-SDK) projects build and test like in Visual Studio: with Visual Studio's (or Build
 * Tools') MSBuild.exe and vstest.console.exe, found with vswhere. The .NET SDK's `dotnet build` cannot load the
 * .NET Framework MSBuild tasks many of them use (SpecFlow 3.x code-behind generation, for one).
 */
export type VisualStudio = { msbuild: string; vstest?: string; installationPath: string };
let cached: Promise<VisualStudio | undefined> | undefined;
export function findVisualStudio(): Promise<VisualStudio | undefined> {
  if (process.env.STUDIO_MSBUILD) return Promise.resolve(existsSync(process.env.STUDIO_MSBUILD) ? { msbuild: process.env.STUDIO_MSBUILD, installationPath: path.dirname(process.env.STUDIO_MSBUILD) } : undefined);
  if (process.platform !== 'win32') return Promise.resolve(undefined);
  cached ??= new Promise((resolve) => {
    const vswhere = path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe');
    if (!existsSync(vswhere)) { resolve(undefined); return; }
    execFile(vswhere, ['-latest', '-prerelease', '-products', '*', '-requires', 'Microsoft.Component.MSBuild', '-property', 'installationPath'], { windowsHide: true }, (err, out) => {
      const install = err ? '' : out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
      const msbuild = install && path.join(install, 'MSBuild', 'Current', 'Bin', 'MSBuild.exe');
      if (!msbuild || !existsSync(msbuild)) { resolve(undefined); return; }
      const vstest = path.join(install, 'Common7', 'IDE', 'Extensions', 'TestPlatform', 'vstest.console.exe');
      resolve({ msbuild, installationPath: install, ...(existsSync(vstest) ? { vstest } : {}) });
    });
  });
  return cached;
}

/** The classic projects of a build target (a .sln / .slnx, a .csproj, or a folder's single project). */
export async function classicProjects(root: string, target: string) {
  const projects = /\.slnx?$/i.test(target) ? (await readSolution(root, target).catch(() => undefined))?.projects.map((p) => p.file) ?? [] : /\.csproj$/i.test(target) ? [target] : [];
  const out: string[] = [];
  for (const p of projects) if ((await projectInfo(root, p)).legacy) out.push(p);
  return out;
}

/** MSBuild arguments for Build / Rebuild / Clean of a target, restoring packages.config packages like Visual Studio. */
export function msbuildArgs(target: string, action: 'build' | 'rebuild' | 'clean', configuration: string) {
  const t = action === 'clean' ? 'Clean' : action === 'rebuild' ? 'Rebuild' : 'Build';
  return [target, `-t:${t}`, `-p:Configuration=${configuration}`, ...(action === 'clean' ? [] : ['-restore', '-p:RestorePackagesConfig=true']), '-nologo', '-v:minimal', '-clp:NoSummary'];
}

/** A classic project's test assembly: <OutputPath for the configuration>/<AssemblyName>.dll. */
export async function classicOutput(root: string, project: string, configuration: string) {
  const xml = await fs.readFile(path.join(root, project), 'utf8');
  const name = /<AssemblyName>([^<]+)<\/AssemblyName>/.exec(xml)?.[1]?.trim() ?? path.basename(project, '.csproj');
  const groups = [...xml.matchAll(/<PropertyGroup([^>]*)>([\s\S]*?)<\/PropertyGroup>/g)];
  const forConfig = groups.find((g) => new RegExp(`'${configuration}\\|`, 'i').test(g[1]));
  const out = (forConfig && /<OutputPath>([^<]+)<\/OutputPath>/.exec(forConfig[2])?.[1]) ?? `bin\\${configuration}\\`;
  return path.join(root, path.dirname(project), out.replaceAll('\\', path.sep), `${name}.dll`);
}

export const CLASSIC_HELP = [
  'This solution has classic .NET Framework projects (non-SDK .csproj, packages.config).',
  'Visual Studio builds them with its own MSBuild; the .NET SDK cannot load the .NET Framework MSBuild tasks they use (e.g. SpecFlow 3.x feature code-behind generation).',
  'Install Visual Studio 2026 or the Build Tools for Visual Studio (workload ".NET desktop build tools"), then build again: the studio finds MSBuild.exe with vswhere.',
].join('\n');
