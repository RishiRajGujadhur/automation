import fs from 'node:fs/promises';
import path from 'node:path';

/** EditorConfig glob → RegExp (`*`, `**`, `?`, `{a,b}`, `[...]`), matched against the path relative to the file's folder. */
export function globToRegex(glob: string) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') { if (glob[i + 1] === '*') { re += '.*'; i++; } else re += '[^/]*'; }
    else if (c === '?') re += '[^/]';
    else if (c === '{') { const end = glob.indexOf('}', i); if (end < 0) { re += '\\{'; continue; } re += `(?:${glob.slice(i + 1, end).split(',').map((p) => globToRegex(p).source.slice(1, -1)).join('|')})`; i = end; }
    else if (c === '[') { const end = glob.indexOf(']', i); if (end < 0) { re += '\\['; continue; } re += `[${glob.slice(i + 1, end).replace(/^!/, '^')}]`; i = end; }
    else re += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

/** Sections of one .editorconfig: [glob, properties][], plus `root = true`. */
export function parseEditorConfig(text: string) {
  const sections: [string, Record<string, string>][] = [];
  let root = false;
  let current: Record<string, string> | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) { current = {}; sections.push([sec[1], current]); continue; }
    const kv = /^([^=:]+?)\s*[=:]\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].trim().toLowerCase(), value = kv[2].trim();
    if (current) current[key] = value; else if (key === 'root') root = value.toLowerCase() === 'true';
  }
  return { root, sections };
}

/**
 * The properties that apply to a file: .editorconfig files from the file's folder up to `root = true` (or the
 * workspace root), outer files first so nearer ones override. `__feature_section` marks that a section named the file.
 */
export async function editorConfigFor(root: string, file: string) {
  const full = path.resolve(root, file);
  const chain: { dir: string; cfg: ReturnType<typeof parseEditorConfig> }[] = [];
  for (let dir = path.dirname(full); ; dir = path.dirname(dir)) {
    const text = await fs.readFile(path.join(dir, '.editorconfig'), 'utf8').catch(() => undefined);
    if (text !== undefined) { const cfg = parseEditorConfig(text); chain.unshift({ dir, cfg }); if (cfg.root) break; }
    if (path.resolve(dir) === path.resolve(root) || path.dirname(dir) === dir) break;
  }
  const props: Record<string, string> = {};
  for (const { dir, cfg } of chain) {
    const rel = path.relative(dir, full).replaceAll('\\', '/');
    for (const [glob, values] of cfg.sections) {
      const pattern = glob.includes('/') ? glob.replace(/^\//, '') : `**/${glob}`;
      if (globToRegex(pattern).test(rel) || (!glob.includes('/') && globToRegex(glob).test(path.basename(full)))) {
        Object.assign(props, values);
        if (/feature/i.test(glob)) props.__feature_section = 'true';
      }
    }
  }
  return props;
}
