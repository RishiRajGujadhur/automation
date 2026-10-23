import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

test('Git Changes: see changes, stage, unstage, discard, commit; history', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-git-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'Initial');
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    // A change, a new file and a change to discard.
    await fs.appendFile(path.join(root, 'Steps/SearchSteps.cs'), '// changed\n');
    await fs.writeFile(path.join(root, 'Features/New.feature'), 'Feature: New\n  Scenario: S\n    Given the browser is started\n');
    await fs.appendFile(path.join(root, 'Steps/AuthSteps.cs'), '// mistake\n');
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('button', { name: 'Git Changes', exact: true }).click();
    const view = page.getByRole('region', { name: 'Git Changes' });
    await expect(view.getByText('main', { exact: true })).toBeVisible();
    const changes = view.getByRole('region', { name: 'Changes' });
    await expect(changes.getByRole('button', { name: /^SearchSteps.cs/ })).toBeVisible();
    await expect(changes.getByRole('button', { name: /^New.feature/ })).toBeVisible();
    await expect(changes.getByLabel('Untracked')).toHaveCount(1);

    // Change bars: the appended line is marked as added against HEAD.
    await changes.getByRole('button', { name: /^SearchSteps.cs/ }).click();
    const bars = page.locator('.code-editor:not([hidden]) .cm-change-added');
    await expect(bars).toHaveCount(1);
    // Compare with Unmodified: a diff against HEAD with the added line.
    await expect(page.getByLabel('Source of Steps/SearchSteps.cs').locator('.cm-line').first()).toBeVisible();
    await page.getByLabel('Source of Steps/SearchSteps.cs').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Compare with Unmodified' }).click();
    const diff = page.getByRole('region', { name: 'Changes in Steps/SearchSteps.cs' });
    await expect(diff).toContainText('@@');
    await expect(diff.locator('.cm-line', { hasText: /^\+/ }).first()).toBeVisible();
    await diff.getByRole('button', { name: 'Close compare' }).click();
    await expect(diff).toHaveCount(0);
    // Discard the mistake (asks first).
    await view.getByRole('button', { name: 'Discard changes to Steps/AuthSteps.cs' }).click();
    await page.getByRole('button', { name: 'Discard', exact: true }).click();
    await expect(changes.getByRole('button', { name: /^AuthSteps.cs/ })).toHaveCount(0);
    expect(await fs.readFile(path.join(root, 'Steps/AuthSteps.cs'), 'utf8')).not.toContain('// mistake');

    // Stage one, unstage it again, stage it, commit staged only.
    await view.getByRole('button', { name: 'Stage Steps/SearchSteps.cs' }).click();
    const staged = view.getByRole('region', { name: 'Staged Changes' });
    await expect(staged.getByRole('button', { name: /^SearchSteps.cs/ })).toBeVisible();
    await view.getByRole('button', { name: 'Unstage Steps/SearchSteps.cs' }).click();
    await expect(staged).toHaveCount(0);
    await view.getByRole('button', { name: 'Stage Steps/SearchSteps.cs' }).click();
    await view.getByLabel('Commit message').fill('Change search steps');
    await view.getByRole('button', { name: 'Commit Staged' }).click();
    await expect(page.getByText(/Committed main [0-9a-f]+/).first()).toBeVisible();
    expect(git('log', '-1', '--pretty=%s').trim()).toBe('Change search steps');
    // Committed: no more change bars.
    await expect(bars).toHaveCount(0);
    // Attribution is absent until Annotate is selected.
    await expect(page.locator('.code-editor:not([hidden]) .cm-blame')).toHaveCount(0);
    await expect(page.locator('.code-editor:not([hidden]) .cm-inline-blame')).toHaveCount(0);
    // Annotate: each block of lines shows the commit that last changed it.
    await page.getByLabel('Source of Steps/SearchSteps.cs').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Annotate (Git Blame)' }).click();
    const blame = page.locator('.code-editor:not([hidden]) .cm-blame:not(.cont)');
    await expect(blame.filter({ hasText: 'Test,' }).first()).toBeVisible();
    await expect(page.locator('.code-editor:not([hidden]) .cm-blame[title*="Change search steps"]').first()).toBeVisible();
    expect(git('status', '--porcelain').trim()).toBe('?? Features/New.feature');

    // Commit All (Ctrl+Enter) takes the remaining new file.
    await view.getByLabel('Commit message').fill('Add new feature');
    await view.getByLabel('Commit message').press('Control+Enter');
    await expect(view.getByText('No changes.')).toBeVisible();
    await view.getByRole('button', { name: 'Expand History' }).click();
    await expect(view.getByRole('region', { name: 'History' })).toContainText('Add new feature');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('Git branches: New Branch, publish with Push, switch back, Fetch', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-branch-'));
  const remote = path.join(base, 'remote.git');
  const root = path.join(base, 'work');
  const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  run(base, 'init', '-q', '--bare', '-b', 'main', remote);
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  run(root, 'init', '-q', '-b', 'main');
  run(root, 'config', 'user.email', 'test@example.com');
  run(root, 'config', 'user.name', 'Test');
  run(root, 'add', '-A');
  run(root, 'commit', '-q', '-m', 'Initial');
  run(root, 'remote', 'add', 'origin', remote);
  run(root, 'push', '-q', '-u', 'origin', 'main');
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('button', { name: 'Git Changes', exact: true }).click();
    const view = page.getByRole('region', { name: 'Git Changes' });
    await view.getByRole('button', { name: 'Branch main' }).click();
    await page.getByRole('menuitem', { name: 'New Branch…' }).click();
    await view.getByLabel('New branch name').fill('feature/login');
    await view.getByRole('button', { name: 'Create' }).click();
    await expect(view.getByRole('button', { name: 'Branch feature/login' })).toBeVisible();
    expect(run(root, 'branch', '--show-current').trim()).toBe('feature/login');
    // Publish: Push sets the upstream.
    await view.getByRole('button', { name: /^Push/ }).click();
    await expect(page.getByText('Pushed.').first()).toBeVisible();
    expect(run(remote, 'branch', '--list', 'feature/login').trim()).toContain('feature/login');
    await fs.writeFile(path.join(root, 'login.txt'), 'login');
    run(root, 'add', 'login.txt');
    run(root, 'commit', '-q', '-m', 'Login work');
    // Switch back to main from the branch list.
    await view.getByRole('button', { name: 'Branch feature/login' }).click();
    await page.getByRole('menuitem', { name: 'main', exact: true }).click();
    await expect(view.getByRole('button', { name: 'Branch main' })).toBeVisible();
    await view.getByRole('button', { name: 'Fetch' }).click();
    await expect(page.getByText('Fetched.').first()).toBeVisible();
    // Merge the branch into main.
    await view.getByRole('button', { name: 'Branch main' }).click();
    await page.getByRole('menuitem', { name: 'Merge feature/login into main' }).click();
    await expect(page.getByText('Merged feature/login into main.').first()).toBeVisible();
    expect(run(root, 'log', '-1', '--format=%s').trim()).toBe('Login work');
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(base, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});


test('Start Window: clone a repository, it opens and appears under Open recent', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-clone-'));
  const source = path.join(base, 'shop');
  const run = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' });
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), source, { recursive: true });
  run(source, 'init', '-q', '-b', 'main');
  run(source, 'config', 'user.email', 'test@example.com');
  run(source, 'config', 'user.name', 'Test');
  run(source, 'add', '-A');
  run(source, 'commit', '-q', '-m', 'Initial');
  try {
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    // With every editor closed the Start Window shows.
    await page.getByRole('button', { name: 'Close GoogleSearch.feature' }).click();
    const start = page.getByRole('region', { name: 'Start Window' });
    await start.getByRole('button', { name: /Clone a repository/ }).click();
    await start.getByLabel('Repository location').fill(source);
    await start.getByLabel('Path').fill(path.join(base, 'clones'));
    await start.getByRole('button', { name: 'Clone', exact: true }).click();
    await expect(page.getByText(/Cloned into .*shop/).first()).toBeVisible({ timeout: 60_000 });
    const cloned = path.join(base, 'clones', 'shop');
    await expect.poll(async () => (await (await request.get('/api/workspace')).json()).config.repositoryRoot).toBe(cloned);
    expect(run(cloned, 'log', '-1', '--format=%s').trim()).toBe('Initial');
    await expect(start.getByRole('list', { name: 'Recent' })).toContainText('shop');
  } finally {
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(base, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
