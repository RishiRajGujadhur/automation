import { defineSetting } from '../vscode/settings';

/**
 * explorer.fileNesting (VSCODE-250.md W95): related files sit under a parent file in the Explorer. A pattern maps a
 * parent ("*.ts", "package.json") to the children it takes ("${capture}.js, ${capture}.d.ts"); ${capture} is what the
 * parent's * matched. VS Code's default patterns.
 */
const E = 'Features ▸ Explorer';
export const fileNesting = {
  enabled: defineSetting<boolean>({ key: 'explorer.fileNesting.enabled', category: E, title: 'File Nesting: Enabled', type: 'boolean', default: false, description: 'Controls whether file nesting is enabled in the Explorer. File nesting allows for related files in a directory to be visually grouped together under a single parent file.' }),
  patterns: defineSetting<Record<string, string>>({
    key: 'explorer.fileNesting.patterns', category: E, title: 'File Nesting: Patterns', type: 'object', description: 'Controls nesting of files in the Explorer. Each key is a parent file pattern (one * captures), each value a comma-separated list of child patterns using ${capture}.',
    default: {
      '*.ts': '${capture}.js',
      '*.js': '${capture}.js.map, ${capture}.min.js, ${capture}.d.ts',
      '*.jsx': '${capture}.js',
      '*.tsx': '${capture}.ts',
      'tsconfig.json': 'tsconfig.*.json',
      'package.json': 'package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock',
      '*.cs': '${capture}.*.cs',
      '*.csproj': '${capture}.csproj.user',
      'appsettings.json': 'appsettings.*.json',
    },
  }),
};

const esc = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&');
const globRe = (glob: string) => new RegExp(`^${glob.split('*').map(esc).join('.*')}$`, 'i');

/** Parent file → nested children, per folder, for the given files (relative paths with '/'). */
export function nestFiles(files: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  if (!fileNesting.enabled()) return out;
  const patterns = Object.entries(fileNesting.patterns() ?? {});
  const byFolder = new Map<string, string[]>();
  for (const f of files) { const i = f.lastIndexOf('/'); const d = i < 0 ? '' : f.slice(0, i); if (!byFolder.has(d)) byFolder.set(d, []); byFolder.get(d)!.push(f.slice(i + 1)); }
  const taken = new Set<string>();
  for (const [dir, names] of byFolder) {
    const full = (n: string) => (dir ? `${dir}/${n}` : n);
    for (const [parent, children] of patterns) {
      const star = parent.indexOf('*');
      const pre = star < 0 ? parent : parent.slice(0, star), post = star < 0 ? '' : parent.slice(star + 1);
      for (const name of names) {
        if (taken.has(full(name))) continue;
        let capture = '';
        if (star < 0) { if (name.toLowerCase() !== parent.toLowerCase()) continue; }
        else { if (!name.toLowerCase().startsWith(pre.toLowerCase()) || !name.toLowerCase().endsWith(post.toLowerCase()) || name.length < pre.length + post.length) continue; capture = name.slice(pre.length, name.length - post.length); }
        const res = children.split(',').map((c) => globRe(c.trim().replaceAll('${capture}', capture)));
        const kids = names.filter((n) => n !== name && !taken.has(full(n)) && res.some((r) => r.test(n)));
        if (!kids.length) continue;
        out.set(full(name), [...(out.get(full(name)) ?? []), ...kids.map(full)]);
        kids.forEach((k) => taken.add(full(k)));
      }
    }
  }
  return out;
}
