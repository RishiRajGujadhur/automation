/** A VS Code glob ("**\/bin", "*.log", "**\/*.{js,map}") as a test of a workspace-relative path with '/'. */
export function globMatcher(glob: string): (path: string) => boolean {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*'; i += glob[i + 2] === '/' ? 2 : 1; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') { const end = glob.indexOf('}', i); if (end > i) { re += `(?:${glob.slice(i + 1, end).split(',').map((x) => x.replace(/[.+^$()|[\]\\]/g, '\\$&')).join('|')})`; i = end; } else re += '\\{'; }
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  const rx = new RegExp(`^${re}(?:/.*)?$`, 'i');
  // A pattern without a folder also matches at any depth, as VS Code's excludes do for "*.log".
  return glob.includes('/') ? (p) => rx.test(p) : (p) => p.split('/').some((_, i, a) => rx.test(a.slice(i).join('/')));
}
