import fs from 'node:fs/promises';
import path from 'node:path';

export type SearchOptions = { query: string; regex?: boolean; matchCase?: boolean; wholeWord?: boolean; include?: string; exclude?: string; preserveCase?: boolean; ignored?: boolean };
export type FileMatches = { file: string; matches: { line: number; column: number; length: number; preview: string }[] };

const TEXT = /\.(feature|cs|csproj|sln|slnx|xml|json|config|runsettings|props|targets|md|ya?ml|txt|csv|resx|ts|tsx|js|mjs|cjs|html|css|scss|ps1|sh|editorconfig|gitignore)$/i;
const MAX_FILE = 2_000_000;

/** Glob (`*.cs`, `Steps/**`, `*.feature,*.cs`) → test on a repository-relative path. */
export function globTest(globs?: string) {
  const parts = (globs ?? '').split(',').map((g) => g.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const res = parts.map((g) => {
    // "**/" = any folders, a trailing "**" = anything below, "*" = within one name.
    const body = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000').replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*');
    // A bare pattern without "/" matches the file name anywhere (like VS Code's files to include).
    return new RegExp(g.includes('/') ? `^${body}$` : `(^|/)${body}$`, 'i');
  });
  return (file: string) => res.some((r) => r.test(file));
}

/** The pattern a Find in Files query stands for (literal or regex, case, whole word). */
export function searchPattern({ query, regex, matchCase, wholeWord }: SearchOptions) {
  let source = regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (wholeWord) source = `\\b(?:${source})\\b`;
  return new RegExp(source, `g${matchCase ? '' : 'i'}${multiline({ query, regex }) ? 'm' : ''}`);
}
/** A regex that can match across lines (VS Code: a \n in the query searches the whole file, not line by line). */
export const multiline = ({ query, regex }: Pick<SearchOptions, 'query' | 'regex'>) => !!regex && /\\n|\\r/.test(query);
/** Preserve Case (VS Code's AB): the replacement takes the case of what it replaces. */
export function preserveCase(found: string, replacement: string) {
  if (!/[a-z]/i.test(found)) return replacement;
  if (found === found.toUpperCase()) return replacement.toUpperCase();
  if (found === found.toLowerCase()) return replacement.toLowerCase();
  if (found[0] === found[0].toUpperCase() && found.slice(1) === found.slice(1).toLowerCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  if (found[0] === found[0].toUpperCase()) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  return replacement.charAt(0).toLowerCase() + replacement.slice(1);
}

async function* walk(root: string, ignored: string[], dir = ''): AsyncGenerator<string> {
  for (const e of await fs.readdir(path.join(root, dir), { withFileTypes: true }).catch(() => [])) {
    if (e.isSymbolicLink() || e.name.startsWith('.') && e.name !== '.editorconfig') continue;
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!ignored.includes(e.name)) yield* walk(root, ignored, rel); }
    else if (TEXT.test(e.name)) yield rel;
  }
}

/** Find in Files: matches per file with line, column and the line's text (capped). */
export async function findInFiles(root: string, ignored: string[], options: SearchOptions, limit = 2000) {
  const pattern = searchPattern(options);
  const include = globTest(options.include);
  const exclude = globTest(options.exclude);
  const files: FileMatches[] = [];
  let total = 0;
  let truncated = false;
  for await (const file of walk(root, ignored)) {
    if ((include && !include(file)) || (exclude && exclude(file))) continue;
    const full = path.join(root, file);
    if ((await fs.stat(full)).size > MAX_FILE) continue;
    const text = await fs.readFile(full, 'utf8');
    const matches: FileMatches['matches'] = [];
    const lines = text.split(/\r?\n/);
    if (multiline(options)) {
      // Across lines: the match's first line is the preview; the length stops at its end.
      const lf = text.replace(/\r\n/g, '\n');
      const starts = [0];
      for (let i = 0; i < lf.length; i++) if (lf[i] === '\n') starts.push(i + 1);
      pattern.lastIndex = 0;
      for (let m = pattern.exec(lf); m; m = pattern.exec(lf)) {
        if (m[0].length === 0) { pattern.lastIndex++; continue; }
        const at = m.index;
        let l = starts.findIndex((s) => s > at) - 1;
        if (l < 0) l = starts.length - 1;
        const col = at - starts[l];
        matches.push({ line: l + 1, column: col + 1, length: Math.max(1, Math.min(m[0].length, lines[l].length - col)), preview: lines[l] });
        if (matches.length > 500) break;
      }
      if (matches.length) { files.push({ file, matches }); total += matches.length; if (total >= limit) { truncated = true; break; } }
      continue;
    }
    lines.forEach((line, i) => {
      pattern.lastIndex = 0;
      for (let m = pattern.exec(line); m; m = pattern.exec(line)) {
        if (m[0].length === 0) { pattern.lastIndex++; continue; }
        matches.push({ line: i + 1, column: m.index + 1, length: m[0].length, preview: line.length > 400 ? line.slice(Math.max(0, m.index - 100), m.index + 300) : line });
      }
    });
    if (!matches.length) continue;
    files.push({ file, matches });
    total += matches.length;
    if (total >= limit) { truncated = true; break; }
  }
  return { files, total, truncated };
}

/** Replace All in the given files (or every matching file): returns the files changed and how many replacements. */
export async function replaceInFiles(root: string, ignored: string[], options: SearchOptions, replacement: string, only?: string[]) {
  const pattern = searchPattern(options);
  const include = globTest(options.include);
  const exclude = globTest(options.exclude);
  const changed: { file: string; count: number }[] = [];
  for await (const file of walk(root, ignored)) {
    if ((include && !include(file)) || (exclude && exclude(file)) || (only && !only.includes(file))) continue;
    const full = path.join(root, file);
    if ((await fs.stat(full)).size > MAX_FILE) continue;
    const text = await fs.readFile(full, 'utf8');
    let count = 0;
    // Literal replacement unless the query is a regex (then $1 etc. work).
    const one = (found: string) => (options.regex ? found.replace(new RegExp(pattern.source, pattern.flags.replace('g', '')), replacement) : replacement);
    // A multiline pattern runs on LF text; CRLF files keep their line ends.
    const source = multiline(options) ? text.replace(/\r\n/g, '\n') : text;
    let next = source.replace(pattern, (found: string) => { count++; const r = one(found); return options.preserveCase ? preserveCase(found, r) : r; });
    if (source !== text) next = next.replace(/\n/g, '\r\n');
    if (!count) continue;
    await fs.writeFile(full, next, 'utf8');
    changed.push({ file, count });
  }
  return changed;
}
