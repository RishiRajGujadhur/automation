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
    await page.getByRole('button', { name: 'Git Changes' }).click();
    const view = page.getByRole('region', { name: 'Git Changes' });
    await expect(view.getByText('main', { exact: true })).toBeVisible();
    const changes = view.getByRole('region', { name: 'Changes' });
    await expect(changes.getByRole('button', { name: /^SearchSteps.cs/ })).toBeVisible();
    await expect(changes.getByRole('button', { name: /^New.feature/ })).toBeVisible();
    await expect(changes.getByLabel('Untracked')).toHaveCount(1);

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
