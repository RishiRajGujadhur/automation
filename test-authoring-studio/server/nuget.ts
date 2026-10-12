import fs from 'node:fs/promises';
import path from 'node:path';
import { command, dotnet } from './core.js';

/**
 * Manage NuGet Packages (Visual Studio): installed packages per project, updates and search from nuget.org,
 * install / update / uninstall through `dotnet add|remove package` (which also restores).
 */
export type Installed = { id: string; version: string };

export async function installed(root: string, project: string): Promise<Installed[]> {
  const xml = await fs.readFile(path.join(root, project), 'utf8');
  return [...xml.matchAll(/<PackageReference\s+Include="([^"]+)"(?:\s+Version="([^"]*)")?\s*\/?>(?:\s*<Version>([^<]*)<\/Version>)?/g)]
    .map((m) => ({ id: m[1], version: m[2] ?? m[3] ?? '' }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

const isPrerelease = (v: string) => v.includes('-');
const cmp = (a: string, b: string) => {
  const pa = a.split(/[.-]/), pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0', y = pb[i] ?? '0';
    const nx = Number(x), ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) { if (nx !== ny) return nx - ny; } else if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

/** All published versions of a package (newest first), from the nuget.org flat container. */
export async function versions(id: string, prerelease = false): Promise<string[]> {
  const r = await fetch(`https://api.nuget.org/v3-flatcontainer/${encodeURIComponent(id.toLowerCase())}/index.json`);
  if (!r.ok) return [];
  const list = ((await r.json()) as { versions: string[] }).versions;
  return list.filter((v) => prerelease || !isPrerelease(v)).sort((a, b) => cmp(b, a));
}

export async function updates(root: string, project: string) {
  const list = await installed(root, project);
  const out: (Installed & { latest: string })[] = [];
  await Promise.all(list.map(async (p) => {
    const latest = (await versions(p.id).catch(() => []))[0];
    if (latest && p.version && cmp(latest, p.version) > 0) out.push({ ...p, latest });
  }));
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

export type SearchResult = { id: string; version: string; description: string; totalDownloads: number; authors: string[]; verified: boolean };
export async function search(q: string, prerelease = false, take = 25): Promise<SearchResult[]> {
  const url = `https://azuresearch-usnc.nuget.org/query?q=${encodeURIComponent(q)}&take=${take}&prerelease=${prerelease}&semVerLevel=2.0.0`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`nuget.org search failed (${r.status}).`);
  const data = (await r.json()) as { data: { id: string; version: string; description: string; totalDownloads: number; authors: string[] | string; verified: boolean }[] };
  return data.data.map((d) => ({ id: d.id, version: d.version, description: d.description, totalDownloads: d.totalDownloads, authors: Array.isArray(d.authors) ? d.authors : [d.authors], verified: d.verified }));
}

/** Package ids are restricted to NuGet's id characters; versions to SemVer characters (nothing reaches a shell). */
const validId = (id: string) => /^[A-Za-z0-9_.-]{1,100}$/.test(id);
const validVersion = (v: string) => /^[0-9A-Za-z.+-]{1,64}$/.test(v);

export async function install(root: string, project: string, id: string, version?: string) {
  if (!validId(id) || (version && !validVersion(version))) throw new Error('Invalid package id or version.');
  return command(dotnet, ['add', path.join(root, project), 'package', id, ...(version ? ['--version', version] : [])], '', root);
}
export async function uninstall(root: string, project: string, id: string) {
  if (!validId(id)) throw new Error('Invalid package id.');
  return command(dotnet, ['remove', path.join(root, project), 'package', id], '', root);
}
