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
export async function log(root: string, max = 30) {
  try {
    // History of the workspace folder (run from it so "." is the folder, not the whole repository).
    const out = await git(root, ['log', `-${max}`, '--pretty=format:%h%x1f%an%x1f%ar%x1f%s', '--', '.']);
    return out.split('\n').filter(Boolean).map((l) => { const [hash, author, when, subject] = l.split('\x1f'); return { hash, author, when, subject }; });
  } catch { return []; }
}
