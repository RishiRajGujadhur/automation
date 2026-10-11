import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { git, status, stage, unstage, discard, commit, headText, log } from '../server/git';

// The workspace is a sub-folder of the repository (a test project inside a larger repo).
describe('Git Changes', () => {
  let top: string;
  let root: string;
  beforeAll(async () => {
    top = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-git-'));
    root = path.join(top, 'tests');
    await fs.mkdir(path.join(root, 'Steps'), { recursive: true });
    await git(top, ['init', '-q', '-b', 'main']);
    await git(top, ['config', 'user.email', 'test@example.com']);
    await git(top, ['config', 'user.name', 'Test']);
    await git(top, ['config', 'core.autocrlf', 'false']); // deterministic line endings whatever the machine's global setting
    await fs.writeFile(path.join(root, 'Steps/A.cs'), 'class A {}\n');
    await fs.writeFile(path.join(top, 'outside.txt'), 'x\n');
    await git(top, ['add', '-A']);
    await git(top, ['commit', '-q', '-m', 'first']);
  });
  afterAll(() => fs.rm(top, { recursive: true, force: true }));

  it('reports branch and workspace-relative changes, ignoring files outside the workspace', async () => {
    await fs.writeFile(path.join(root, 'Steps/A.cs'), 'class A { int x; }\n');
    await fs.writeFile(path.join(root, 'New.feature'), 'Feature: N\n');
    await fs.writeFile(path.join(top, 'outside.txt'), 'changed\n');
    const s = await status(root);
    expect(s.repo).toBe(true);
    expect(s.branch).toBe('main');
    expect(s.files).toEqual([{ file: 'Steps/A.cs', staged: false, status: 'M' }, { file: 'New.feature', staged: false, status: '?' }]);
  });
  it('stages, unstages, commits and shows HEAD text and history', async () => {
    await stage(root, ['Steps/A.cs', 'New.feature']);
    expect((await status(root)).files.filter((f) => f.staged).map((f) => f.status).sort()).toEqual(['A', 'M']);
    await unstage(root, ['New.feature']);
    expect((await status(root)).files.find((f) => f.file === 'New.feature')).toMatchObject({ staged: false, status: '?' });
    expect(await commit(root, 'Change A')).toMatch(/main [0-9a-f]+/);
    expect(await headText(root, 'Steps/A.cs')).toBe('class A { int x; }\n');
    expect(await headText(root, 'New.feature')).toBeNull();
    expect((await log(root)).map((c) => c.subject)).toEqual(['Change A', 'first']);
  });
  it('discards: tracked files return to HEAD, untracked files are removed', async () => {
    await fs.writeFile(path.join(root, 'Steps/A.cs'), 'broken\n');
    await discard(root, ['Steps/A.cs', 'New.feature']);
    expect(await fs.readFile(path.join(root, 'Steps/A.cs'), 'utf8')).toBe('class A { int x; }\n');
    await expect(fs.access(path.join(root, 'New.feature'))).rejects.toThrow();
    expect((await status(root)).files).toEqual([]);
  });
  it('a folder outside any repository is not a repo', async () => {
    const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-nogit-'));
    expect((await status(plain)).repo).toBe(false);
    await fs.rm(plain, { recursive: true, force: true });
  });
});

describe('Commit All', () => {
  it('stages everything in the workspace folder (top level or sub-folder) and commits', async () => {
    const top = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-git-all-'));
    try {
      await git(top, ['init', '-q', '-b', 'main']);
      await git(top, ['config', 'user.email', 'test@example.com']);
      await git(top, ['config', 'user.name', 'Test']);
      await fs.writeFile(path.join(top, 'A.cs'), 'class A {}\n');
      expect(await commit(top, 'All at the top', { all: true })).toMatch(/main/);
      await fs.mkdir(path.join(top, 'sub'));
      await fs.writeFile(path.join(top, 'sub/B.cs'), 'class B {}\n');
      await fs.writeFile(path.join(top, 'C.cs'), 'class C {}\n');
      await commit(path.join(top, 'sub'), 'Only the sub-folder', { all: true });
      expect((await status(top)).files).toEqual([{ file: 'C.cs', staged: false, status: '?' }]);
    } finally { await fs.rm(top, { recursive: true, force: true }); }
  });
});

describe('Branches and sync', () => {
  it('creates and switches branches, pushes (setting upstream), fetches and pulls', async () => {
    const { branches, checkout, createBranch, sync } = await import('../server/git');
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-git-sync-'));
    const remote = path.join(base, 'remote.git');
    const a = path.join(base, 'a');
    const b = path.join(base, 'b');
    const setup = async (dir: string) => { await git(dir, ['config', 'user.email', 't@example.com']); await git(dir, ['config', 'user.name', 'T']); await git(dir, ['config', 'core.autocrlf', 'false']); };
    try {
      await git(base, ['init', '-q', '--bare', '-b', 'main', remote]);
      await git(base, ['clone', '-q', remote, a]);
      await setup(a);
      await fs.writeFile(path.join(a, 'A.cs'), 'class A {}\n');
      await commit(a, 'first', { all: true });
      await sync(a, 'push'); // no upstream yet: push -u origin main
      expect((await status(a)).upstream).toBe('origin/main');

      await createBranch(a, 'feature/login');
      expect((await branches(a)).local.find((x) => x.current)?.name).toBe('feature/login');
      await expect(createBranch(a, 'bad name')).rejects.toThrow('not a valid branch name');
      await checkout(a, 'main');
      expect((await status(a)).branch).toBe('main');

      // A second clone pushes; the first fetches (behind 1) and pulls.
      await git(base, ['clone', '-q', remote, b]);
      await setup(b);
      await fs.writeFile(path.join(b, 'B.cs'), 'class B {}\n');
      await commit(b, 'from b', { all: true });
      await sync(b, 'push');
      await sync(a, 'fetch');
      expect((await status(a)).behind).toBe(1);
      await sync(a, 'pull');
      expect(await fs.readFile(path.join(a, 'B.cs'), 'utf8')).toBe('class B {}\n');
      expect((await status(a)).behind).toBe(0);
    } finally { await fs.rm(base, { recursive: true, force: true }); }
  }, 60_000);
});
