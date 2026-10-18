import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Runs git in a folder; resolves stdout, rejects with git's message. */
export function git(cwd: string, args: string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = execFile('git', ['-c', 'core.quotepath=off', ...args], { cwd, maxBuffer: 50 * 1024 * 1024, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout);
    });
    if (input !== undefined) { p.stdin?.end(input); }
  });
}

export type GitFile = { file: string; staged: boolean; status: 'M' | 'A' | 'D' | 'R' | 'U' | '?'; from?: string };
export type GitStatus = { repo: boolean; branch?: string; upstream?: string; ahead: number; behind: number; files: GitFile[]; top?: string };

/** Repository top level and the workspace folder's path inside it ('' = the top). */
async function locate(root: string) {
  const top = (await git(root, ['rev-parse', '--show-toplevel'])).trim();
  const prefix = path.relative(path.resolve(top), path.resolve(root)).replaceAll('\\', '/');
  return { top, prefix };
}
const toWorkspace = (prefix: string, p: string) => (prefix ? (p.startsWith(`${prefix}/`) ? p.slice(prefix.length + 1) : undefined) : p);
const toRepo = (prefix: string, f: string) => (prefix ? `${prefix}/${f}` : f);

/**
 * Git Changes (Visual Studio) / Source Control (VS Code) for the workspace folder: branch, ahead/behind, staged and
 * unstaged changes (paths relative to the workspace; changes outside it are left out).
 */
export async function status(root: string): Promise<GitStatus> {
  let loc: { top: string; prefix: string };
  try { loc = await locate(root); } catch { return { repo: false, ahead: 0, behind: 0, files: [] }; }
  const out = await git(loc.top, ['status', '--porcelain=v1', '-b', '-z', '--untracked-files=all']);
  const parts = out.split('\0');
  const files: GitFile[] = [];
  let branch: string | undefined, upstream: string | undefined, ahead = 0, behind = 0;
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (!entry) continue;
    if (entry.startsWith('## ')) {
      const m = /^## (?:No commits yet on )?([^.\s]+)(?:\.\.\.(\S+))?(?: \[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\])?/.exec(entry);
      branch = m?.[1]; upstream = m?.[2]; ahead = Number(m?.[3] ?? 0); behind = Number(m?.[4] ?? 0);
      continue;
    }
    const x = entry[0], y = entry[1];
    let p = entry.slice(3);
    let from: string | undefined;
    if (x === 'R' || x === 'C') { from = parts[++i]; }
    const rel = toWorkspace(loc.prefix, p);
    if (rel === undefined) continue;
    const fromRel = from ? toWorkspace(loc.prefix, from) ?? from : undefined;
    if (x === '?' && y === '?') { files.push({ file: rel, staged: false, status: '?' }); continue; }
    if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) { files.push({ file: rel, staged: false, status: 'U' }); continue; }
    if (x !== ' ') files.push({ file: rel, staged: true, status: (x === 'C' ? 'A' : x) as GitFile['status'], from: fromRel });
    if (y !== ' ') files.push({ file: rel, staged: false, status: y as GitFile['status'] });
    p = '';
  }
  return { repo: true, top: loc.top, branch, upstream, ahead, behind, files };
}

export async function stage(root: string, files: string[]) { const { top, prefix } = await locate(root); await git(top, ['add', '-A', '--', ...files.map((f) => toRepo(prefix, f))]); }
export async function unstage(root: string, files: string[]) {
  const { top, prefix } = await locate(root);
  // A repository without commits has no HEAD to reset to.
  const hasHead = await git(top, ['rev-parse', '--verify', 'HEAD']).then(() => true, () => false);
  if (hasHead) await git(top, ['reset', '-q', 'HEAD', '--', ...files.map((f) => toRepo(prefix, f))]);
  else await git(top, ['rm', '--cached', '-q', '--', ...files.map((f) => toRepo(prefix, f))]);
}
/** Discard changes: tracked files go back to HEAD (index and worktree); untracked files are deleted. */
export async function discard(root: string, files: string[]) {
  const { top, prefix } = await locate(root);
  const st = await status(root);
  const untracked = files.filter((f) => st.files.some((x) => x.file === f && x.status === '?'));
  const tracked = files.filter((f) => !untracked.includes(f));
  if (tracked.length) await git(top, ['checkout', 'HEAD', '--', ...tracked.map((f) => toRepo(prefix, f))]);
  for (const f of untracked) await fs.rm(path.join(root, f), { force: true });
}
export async function commit(root: string, message: string, opts: { all?: boolean; amend?: boolean } = {}) {
  const { top } = await locate(root);
  // git prints the top level with forward slashes: compare resolved paths ('' = the workspace is the top).
  if (opts.all) await git(top, ['add', '-A', '--', path.relative(path.resolve(top), path.resolve(root)).replaceAll('\\', '/') || '.']);
  const args = ['commit', '-F', '-', ...(opts.amend ? ['--amend'] : [])];
  const out = await git(top, args, message);
  return /\[([^\]]+)\]/.exec(out)?.[1] ?? out.split('\n')[0];
}
/** The committed (HEAD) text of a workspace file, for change markers and Compare with Unmodified; null when new. */
export async function headText(root: string, file: string) {
  try {
    const { top, prefix } = await locate(root);
    return await git(top, ['show', `HEAD:${toRepo(prefix, file)}`]);
  } catch { return null; }
}
/** For change bars: whether the folder is under Git at all, and the file's HEAD text (null = new file). */
export async function headInfo(root: string, file: string) {
  try { await locate(root); } catch { return { repo: false, text: null }; }
  return { repo: true, text: await headText(root, file) };
}
export async function log(root: string, max = 30) {
  try {
    // History of the workspace folder (run from it so "." is the folder, not the whole repository).
    const out = await git(root, ['log', `-${max}`, '--pretty=format:%h%x1f%an%x1f%ar%x1f%s', '--', '.']);
    return out.split('\n').filter(Boolean).map((l) => { const [hash, author, when, subject] = l.split('\x1f'); return { hash, author, when, subject }; });
  } catch { return []; }
}

/** Annotate: the commit that last changed each line of a file (working-tree text; local edits show as zeros). */
export async function blame(root: string, file: string) {
  const { top, prefix } = await locate(root);
  const out = await git(top, ['blame', '--porcelain', '--', toRepo(prefix, file)]);
  const info = new Map<string, { author: string; time: number; summary: string }>();
  const lines: { hash: string; author: string; when: string; summary: string }[] = [];
  let cur = '';
  for (const l of out.split(/\r?\n/)) {
    const head = /^([0-9a-f]{40}) \d+ \d+/.exec(l);
    if (head) { cur = head[1]; if (!info.has(cur)) info.set(cur, { author: '', time: 0, summary: '' }); continue; }
    const i = info.get(cur);
    if (!i) continue;
    if (l.startsWith('author ')) i.author = l.slice(7);
    else if (l.startsWith('author-time ')) i.time = Number(l.slice(12));
    else if (l.startsWith('summary ')) i.summary = l.slice(8);
    else if (l.startsWith('\t')) lines.push({ hash: cur, author: i.author, when: new Date(i.time * 1000).toISOString().slice(0, 10), summary: i.summary });
  }
  return lines;
}
/** Clone a repository into a new folder under `parent` (named after the repository); returns that folder. */
export async function clone(url: string, parent: string) {
  if (!/^(https?:\/\/|git@|ssh:\/\/|file:\/\/)/i.test(url) && !path.isAbsolute(url)) throw new Error('Enter an https://, ssh:// or git@ repository address.');
  const name = url.replace(/[\\/]+$/, '').split(/[\\/:]/).pop()!.replace(/\.git$/i, '');
  if (!name) throw new Error('The repository address has no name.');
  const target = path.join(path.resolve(parent), name);
  if (await fs.stat(target).then(() => true, () => false)) throw new Error(`${target} already exists.`);
  await fs.mkdir(path.resolve(parent), { recursive: true });
  await git(path.resolve(parent), ['clone', '--', url, target]);
  return target;
}
/** Local and remote branches (remote ones without a local counterpart), current first. */
export async function branches(root: string) {
  const { top } = await locate(root);
  const out = await git(top, ['branch', '-a', '--format=%(HEAD)%00%(refname:short)%00%(upstream:short)%00%(committerdate:relative)']);
  const local: { name: string; current: boolean; upstream?: string; when: string }[] = [];
  const remote: string[] = [];
  for (const line of out.split('\n').filter(Boolean)) {
    const [head, name, upstream, when] = line.split('\0');
    if (name.endsWith('/HEAD') || name === 'HEAD' || name.startsWith('(')) continue;
    if (/^[^/]+\/.+/.test(name) && !local.some((l) => l.name === name) && (await git(top, ['show-ref', '--verify', '--quiet', `refs/remotes/${name}`]).then(() => true, () => false))) remote.push(name);
    else local.push({ name, current: head === '*', upstream: upstream || undefined, when });
  }
  return { local: local.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name)), remote: remote.filter((r) => !local.some((l) => r.endsWith(`/${l.name}`))) };
}
/** Switch branch (a remote branch gets a local tracking branch); refuses when local changes would be overwritten. */
export async function checkout(root: string, name: string) {
  const { top } = await locate(root);
  if (name.includes('/') && (await git(top, ['show-ref', '--verify', '--quiet', `refs/remotes/${name}`]).then(() => true, () => false))) await git(top, ['switch', '--track', name]);
  else await git(top, ['switch', name]);
}
export async function createBranch(root: string, name: string, checkoutIt = true) {
  const { top } = await locate(root);
  await git(top, ['check-ref-format', '--branch', name]).catch(() => { throw new Error(`'${name}' is not a valid branch name.`); });
  await git(top, checkoutIt ? ['switch', '-c', name] : ['branch', name]);
}
/**
 * Merge a branch into the current one (Visual Studio's "Merge into current branch"). A merge with conflicts is aborted
 * and reported with the conflicting files, so the working tree is never left half merged.
 */
export async function merge(root: string, name: string) {
  const { top } = await locate(root);
  try {
    return await git(top, ['merge', '--no-edit', name]);
  } catch (e) {
    const conflicts = (await git(top, ['diff', '--name-only', '--diff-filter=U']).catch(() => '')).split(/\r?\n/).filter(Boolean);
    if (!conflicts.length) throw e;
    await git(top, ['merge', '--abort']).catch(() => {});
    throw new Error(`Merging ${name} has conflicts in ${conflicts.join(', ')}. The merge was cancelled; resolve them from the command line.`);
  }
}
/** Fetch / Pull / Push for the current branch (Push sets the upstream the first time, like Visual Studio). */
export async function sync(root: string, action: 'fetch' | 'pull' | 'push') {
  const { top } = await locate(root);
  if (action === 'fetch') return git(top, ['fetch', '--prune']);
  if (action === 'pull') return git(top, ['pull', '--ff-only']);
  const st = await status(root);
  return st.upstream ? git(top, ['push']) : git(top, ['push', '-u', 'origin', st.branch ?? 'HEAD']);
}

/**
 * Shelf (JetBrains Rider): shelve uncommitted changes (tracked and new files) under a name, unshelve them later.
 * Stored as Git stashes, so they also show in other Git tools.
 */
export type Shelf = { ref: string; message: string; date: string; files: string[] };
const STASH = /^stash@\{\d+\}$/;
export async function shelves(root: string): Promise<Shelf[]> {
  let top: string;
  try { ({ top } = await locate(root)); } catch { return []; }
  const out = await git(top, ['stash', 'list', '--format=%gd%x00%gs%x00%cI']);
  const list: Shelf[] = [];
  for (const line of out.split('\n').filter(Boolean).slice(0, 50)) {
    const [ref, subject, date] = line.split('\0');
    // "On main: message" / "WIP on main: abc123 subject"
    const message = subject.replace(/^(?:WIP )?[Oo]n [^:]+:\s*/, '');
    const files = (await git(top, ['stash', 'show', '--name-only', '--include-untracked', ref]).catch(() => git(top, ['stash', 'show', '--name-only', ref]).catch(() => ''))).split('\n').filter(Boolean);
    list.push({ ref, message, date, files });
  }
  return list;
}
export async function shelve(root: string, message: string) {
  const { top } = await locate(root);
  const out = await git(top, ['stash', 'push', '--include-untracked', '-m', message]);
  if (/No local changes to save/i.test(out)) throw new Error('There are no changes to shelve.');
  return out.trim();
}
export async function unshelve(root: string, ref: string, remove: boolean) {
  if (!STASH.test(ref)) throw new Error('Unknown shelf.');
  const { top } = await locate(root);
  return (await git(top, ['stash', remove ? 'pop' : 'apply', ref])).trim();
}
export async function deleteShelf(root: string, ref: string) {
  if (!STASH.test(ref)) throw new Error('Unknown shelf.');
  const { top } = await locate(root);
  return (await git(top, ['stash', 'drop', ref])).trim();
}

/** Show History for Selection (Rider): the commits that changed lines start–end of a file, with each change. */
export async function lineHistory(root: string, file: string, start: number, end: number) {
  const { top, prefix } = await locate(root);
  const out = await git(top, ['log', `-L${start},${end}:${toRepo(prefix, file)}`, '--format=%x01%H%x1f%h%x1f%an%x1f%aI%x1f%s', '-n', '50']).catch((e: Error) => { if (/no path|does not exist|has only|unknown revision|bad revision/i.test(e.message)) return ''; throw e; });
  return out.split('\x01').filter((c) => c.trim()).map((chunk) => {
    const nl = chunk.indexOf('\n');
    const [hash, short, author, date, subject] = chunk.slice(0, nl < 0 ? undefined : nl).split('\x1f');
    return { hash, short, author, date, subject, patch: nl < 0 ? '' : chunk.slice(nl + 1).trim() };
  });
}
/** A commit for the Git Log window: message, author, date, changed files and the patch (capped). */
export async function commitDetails(root: string, hash: string) {
  if (!/^[0-9a-f]{4,40}$/i.test(hash)) throw new Error('Unknown commit.');
  const { top } = await locate(root);
  const head = await git(top, ['show', '-s', '--format=%H%x1f%an%x1f%ae%x1f%aI%x1f%B', hash]);
  const [full, author, email, date, ...msg] = head.split('\x1f');
  const files = (await git(top, ['show', '--format=', '--name-status', hash])).split('\n').filter(Boolean).map((l) => { const [status, ...p] = l.split('\t'); return { status: status[0], file: p.at(-1)! }; });
  const patch = (await git(top, ['show', '--format=', '--patch', '--stat=0', hash])).slice(0, 400_000);
  return { hash: full, author, email, date, message: msg.join('\x1f').trim(), files, patch };
}
/** Commits for the Git Log window, with the branch graph drawn by git. */
export async function graphLog(root: string, max = 200) {
  const { top } = await locate(root);
  const out = await git(top, ['log', '--all', '--graph', `-${max}`, '--date-order', '--format=%x01%h%x1f%an%x1f%ar%x1f%d%x1f%s']);
  return out.split('\n').filter(Boolean).map((l) => {
    const at = l.indexOf('\x01');
    if (at < 0) return { graph: l };
    const [hash, author, when, refs, subject] = l.slice(at + 1).split('\x1f');
    return { graph: l.slice(0, at), hash, author, when, refs: refs.trim().replace(/^\(|\)$/g, ''), subject };
  });
}
/** A file's text at a branch / tag / commit (Compare with Branch); null when it does not exist there. */
export async function fileAt(root: string, ref: string, file: string) {
  if (!/^[\w./@{}~^-]{1,200}$/.test(ref) || ref.startsWith('-')) throw new Error('Unknown branch.');
  const { top, prefix } = await locate(root);
  try { return await git(top, ['show', `${ref}:${toRepo(prefix, file)}`]); } catch { return null; }
}
