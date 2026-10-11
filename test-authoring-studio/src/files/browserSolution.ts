import type { Solution } from '../SolutionExplorer';
import { listFiles, readText } from './fsa';
import { parseSln, parseSlnx } from '../solutionFormat';

/** Explorer layer of a file, matching the server's project model closely enough for icons and filters. */
function layer(file: string) {
  if (file.endsWith('.feature')) return 'Feature';
  if (file.endsWith('.feature.cs')) return 'Generated';
  if (/(^|\/)(steps?|stepdefinitions|bindings)\//i.test(file) && file.endsWith('.cs')) return 'Step';
  if (/(^|\/)(pages?|pageobjects)\//i.test(file) && file.endsWith('.cs')) return 'Page object';
  if (/(^|\/)(hooks|support)\//i.test(file)) return 'Support';
  if (file.endsWith('.xml')) return 'Selector data';
  if (/\.(csproj|sln|props|targets|json|config|runsettings)$/.test(file)) return 'Build';
  return 'Source';
}

/**
 * Solution model for a folder opened in the browser: projects and NuGet packages from the .csproj files, file
 * layers by convention, and each feature's generated code-behind nested under it. Built from the files on disk
 * with the File System Access API (no server, no upload).
 */
export async function browserSolution(name: string): Promise<Solution> {
  const files = await listFiles();
  const projects = files.filter((f) => f.endsWith('.csproj')).map((file) => {
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
    return { file, name: file.split('/').pop()!.replace(/\.csproj$/i, ''), dir };
  });
  const packages = new Set<string>();
  const frameworks = new Set<string>();
  for (const p of projects.slice(0, 20)) {
    const xml = await readText(p.file).catch(() => '');
    for (const m of xml.matchAll(/<PackageReference\s+Include="([^"]+)"/g)) packages.add(m[1]);
    for (const m of xml.matchAll(/<TargetFrameworks?>([^<]+)</g)) m[1].split(';').forEach((f) => frameworks.add(f.trim()));
  }
  const all = new Set(files);
  const nesting: Solution['nesting'] = {};
  for (const f of files) if (f.endsWith('.feature') && all.has(`${f}.cs`)) nesting[f] = [{ file: `${f}.cs`, kind: 'code-behind' }];
  // A solution file at the top of the folder (or one level down) gives solution folders and the project list.
  const slnFile = files.filter((f) => /\.slnx?$/i.test(f) && f.split('/').length <= 2).sort((a, b) => a.split('/').length - b.split('/').length)[0];
  const sln = slnFile ? await readText(slnFile).then((t) => (slnFile.toLowerCase().endsWith('.slnx') ? parseSlnx(t) : parseSln(t)), () => undefined) : undefined;
  const slnDir = slnFile?.includes('/') ? slnFile.slice(0, slnFile.lastIndexOf('/')) : '';
  const rebase = (p: string) => (slnDir ? `${slnDir}/${p}` : p).split('/').reduce<string[]>((a, s) => (s === '..' ? a.slice(0, -1) : s === '.' ? a : [...a, s]), []).join('/');
  type N = NonNullable<Solution['tree']>[number];
  const fix = (ns: N[]): N[] => ns.map((n) => (n.kind === 'folder' ? { ...n, children: fix(n.children) } : { ...n, file: rebase(n.file) }));
  return {
    name: slnFile ? slnFile.split('/').pop()!.replace(/\.slnx?$/i, '') : name,
    solutionFile: slnFile ?? null,
    tree: sln ? fix(sln.tree) : undefined,
    projects: projects.length ? projects : [{ file: '.', name, dir: '' }],
    packages: [...packages].sort(),
    frameworks: [...frameworks],
    files: files.map((file) => ({ file, layer: layer(file) })),
    nesting,
  };
}
