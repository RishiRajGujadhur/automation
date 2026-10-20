import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { git, locate } from './git.js';

/* Git features of RIDER-VSCODE-FEATURES.md (commit templates, compare commits, squash / interactive rebase, worktrees,
   bisect). Each runs git in the repository that holds the workspace folder. */

/** Commit message template: git's commit.template, else .gitmessage at the top of the repository. */
export async function commitTemplate(root: string): Promise<{ text: string; source: string } | null> {
  const { top } = await locate(root);
  const configured = (await git(top, ['config', '--get', 'commit.template']).catch(() => '')).trim();
  const candidates = configured ? [configured.replace(/^~(?=[\/])/, os.homedir())] : [];
  candidates.push('.gitmessage');
  for (const c of candidates) {
    const file = path.isAbsolute(c) ? c : path.join(top, c);
    const text = await fs.readFile(file, 'utf8').catch(() => null);
    if (text !== null) return { text: text.replace(/\r\n/g, '\n'), source: configured && c !== '.gitmessage' ? `commit.template (${configured})` : '.gitmessage' };
  }
  return null;
}

/** Compare two commits (Rider's Compare Versions): the files that differ and the patch, inside the workspace folder. */
export async function compareCommits(root: string, from: string, to: string) {
  const { top, prefix } = await locate(root);
  const scope = ['--', prefix || '.'];
  const names = await git(top, ['diff', '--name-status', '--no-renames', from, to, ...scope]);
  const files = names.split('\n').filter(Boolean).map((l) => { const [status, file] = l.split('\t'); return { status: status[0], file: prefix && file.startsWith(`${prefix}/`) ? file.slice(prefix.length + 1) : file }; });
  const patch = await git(top, ['diff', '--no-color', from, to, ...scope]);
  return { files, patch: patch.length > 400_000 ? `${patch.slice(0, 400_000)}\n… (cut)` : patch };
}

/* Interactive rebase (Rider's Interactively Rebase from Here) and squash. The todo list is written by the studio
   (GIT_SEQUENCE_EDITOR copies it in); new messages are set with `exec git commit --amend -F`, so no editor opens. */
export type RebaseCommit = { hash: string; subject: string; message: string };
export type RebaseStep = { hash: string; action: 'pick' | 'reword' | 'squash' | 'fixup' | 'drop'; message?: string };
const run = (cwd: string, args: string[], env: Record<string, string>) => new Promise<string>((resolve, reject) => {
  execFile('git', ['-c', 'core.quotepath=off', ...args], { cwd, windowsHide: true, maxBuffer: 20 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', ...env } }, (err, stdout, stderr) => (err ? reject(new Error((stderr || stdout || err.message).trim())) : resolve(stdout)));
});
/** The commits from `base` (included) up to HEAD, oldest first. */
export async function rebaseCommits(root: string, base: string): Promise<RebaseCommit[]> {
  const { top } = await locate(root);
  const parent = (await git(top, ['rev-list', '--parents', '-n', '1', base])).trim().split(' ')[1];
  const range = parent ? `${parent}..HEAD` : 'HEAD';
  const out = await git(top, ['log', '--reverse', '--first-parent', '--format=%H%x1f%s%x1f%B%x1e', range]);
  return out.split('\x1e').map((r) => r.trim()).filter(Boolean).map((r) => { const [hash, subject, message] = r.split('\x1f'); return { hash, subject, message: (message ?? '').trim() }; });
}
/** The todo list for `steps` (written to `dir`). Pure apart from the message files; exported for the unit tests. */
export async function rebaseTodo(steps: RebaseStep[], dir: string) {
  const lines: string[] = [];
  let n = 0;
  for (const s of steps) {
    if (s.action === 'drop') { lines.push(`drop ${s.hash}`); continue; }
    lines.push(`${s.action === 'squash' || s.action === 'fixup' ? 'fixup' : 'pick'} ${s.hash}`);
    if ((s.action === 'reword' || s.action === 'squash') && s.message?.trim()) {
      const file = path.join(dir, `message-${n++}.txt`).replace(/\\/g, '/');
      await fs.writeFile(file, `${s.message.trim()}\n`, 'utf8');
      lines.push(`exec git commit --amend --allow-empty -F "${file}"`);
    }
  }
  return `${lines.join('\n')}\n`;
}
export async function interactiveRebase(root: string, base: string, steps: RebaseStep[]) {
  const { top } = await locate(root);
  const known = new Set((await rebaseCommits(root, base)).map((c) => c.hash));
  if (steps.length !== known.size || steps.some((s) => !known.has(s.hash))) throw new Error('The commits changed since the list was made. Open Interactive Rebase again.');
  if (steps[0] && (steps[0].action === 'squash' || steps[0].action === 'fixup')) throw new Error('The first commit cannot be squashed into an earlier one: pick it.');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-rebase-'));
  try {
    const todo = path.join(dir, 'todo.txt');
    await fs.writeFile(todo, await rebaseTodo(steps, dir), 'utf8');
    const copy = `node -e "require('fs').copyFileSync(process.argv[1], process.argv[2])" "${todo.replace(/\\/g, '/')}"`;
    const parent = (await git(top, ['rev-list', '--parents', '-n', '1', base])).trim().split(' ')[1];
    try {
      await run(top, ['rebase', '-i', '--autostash', ...(parent ? [parent] : ['--root'])], { GIT_SEQUENCE_EDITOR: copy, GIT_EDITOR: 'true' });
    } catch (e) {
      await git(top, ['rebase', '--abort']).catch(() => {});
      throw new Error(`Rebase stopped and was undone: ${(e as Error).message.split('\n').slice(0, 3).join(' ')}`);
    }
    return (await git(top, ['log', '-1', '--format=%h %s'])).trim();
  } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}); }
}
/** Squash the commits from `base` up to HEAD into one with `message`. */
export async function squashCommits(root: string, base: string, message: string) {
  const list = await rebaseCommits(root, base);
  // The first is picked, the others fixed up into it; the last step sets the message (one commit: a reword).
  const steps = list.map((c, i): RebaseStep => {
    const last = i === list.length - 1;
    const action: RebaseStep['action'] = i === 0 ? (last ? 'reword' : 'pick') : last ? 'squash' : 'fixup';
    return { hash: c.hash, action, message: last ? message : undefined };
  });
  return interactiveRebase(root, base, steps);
}

/** Worktrees (git worktree): every checkout of the repository, its branch and HEAD. */
export type Worktree = { path: string; branch?: string; head: string; main: boolean; locked: boolean; current: boolean };
export async function listWorktrees(root: string): Promise<Worktree[]> {
  const { top } = await locate(root);
  const out = await git(top, ['worktree', 'list', '--porcelain']);
  const norm = (p: string) => path.resolve(p).toLowerCase();
  return out.split(/\n\n+/).filter((b) => b.trim()).map((b, i) => {
    const get = (k: string) => b.split('\n').find((l) => l.startsWith(`${k} `))?.slice(k.length + 1);
    const p = get('worktree') ?? '';
    return { path: path.resolve(p), branch: get('branch')?.replace(/^refs\/heads\//, ''), head: (get('HEAD') ?? '').slice(0, 10), main: i === 0, locked: b.includes('\nlocked'), current: norm(p) === norm(top) };
  });
}
/** A new worktree at `dir` (next to the repository when relative) on an existing or a new branch. */
export async function addWorktree(root: string, dir: string, branch: string, create: boolean) {
  const { top } = await locate(root);
  const parent = path.dirname(path.resolve(top));
  const target = path.resolve(parent, dir);
  // Only beside the repository (in the folder that holds it), not anywhere on disk.
  if (path.relative(parent, target).startsWith('..') || path.isAbsolute(path.relative(parent, target))) throw new Error('A worktree goes in the folder that holds the repository.');
  await git(top, ['worktree', 'add', ...(create ? ['-b', branch, target] : [target, branch])]);
  return target;
}
export async function removeWorktree(root: string, dir: string, force: boolean) {
  const { top } = await locate(root);
  const list = await listWorktrees(root);
  const w = list.find((x) => path.resolve(x.path).toLowerCase() === path.resolve(dir).toLowerCase());
  if (!w) throw new Error('No such worktree.');
  if (w.main || w.current) throw new Error('The main worktree and the one open in the studio cannot be removed.');
  await git(top, ['worktree', 'remove', ...(force ? ['--force'] : []), w.path]);
}

/** Git bisect: whether one is in progress, the commit checked out, and git's last word (e.g. the first bad commit). */
export async function bisectStatus(root: string) {
  const { top } = await locate(root);
  const gitDir = path.resolve(top, (await git(top, ['rev-parse', '--git-dir'])).trim());
  const active = await fs.stat(path.join(gitDir, 'BISECT_LOG')).then(() => true, () => false);
  const head = (await git(top, ['log', '-1', '--format=%h %s']).catch(() => '')).trim();
  return { active, head };
}
export async function bisect(root: string, action: 'start' | 'good' | 'bad' | 'skip' | 'reset', ref?: string) {
  const { top } = await locate(root);
  if (action !== 'start' && action !== 'reset' && !(await bisectStatus(root)).active) await git(top, ['bisect', 'start']);
  const out = await git(top, ['bisect', action, ...(ref && action !== 'start' ? [ref] : [])]);
  // Older git: "is the first bad commit"; newer: "is the first 'bad' commit".
  const found = /^([0-9a-f]{7,40}) is the first '?bad'? commit/m.exec(out);
  return { output: out.trim().split('\n').slice(0, 6).join('\n'), firstBad: found?.[1], ...(await bisectStatus(root)) };
}
