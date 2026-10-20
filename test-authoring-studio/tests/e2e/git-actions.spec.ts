import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Git features of the third batch (IDE-FEATURES.md): Git Log commit actions and the branches popup.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
const g = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=Ada', ...args], { cwd: root, encoding: 'utf8' }).trim();
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-git-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  g('init', '-q', '-b', 'main'); g('config', 'user.email', 't@t'); g('config', 'user.name', 'Ada');
  g('add', '-A'); g('commit', '-qm', 'base');
  const login = path.join(root, 'Features/Auth/Login.feature');
  await fs.writeFile(login, (await fs.readFile(login, 'utf8')).replace('"test-user"', '"admin"'));
  g('commit', '-qam', 'Sign in as admin');
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function open(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed').first()).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
}
/** Opens the Git Log and selects the commit whose subject is `subject`. */
async function selectCommit(page: Page, subject: string) {
  await page.keyboard.press('Alt+9');
  const panel = page.getByRole('region', { name: 'Git Log' });
  await panel.getByRole('listbox', { name: 'Commits' }).getByRole('option', { name: new RegExp(subject) }).first().click();
  const actions = panel.getByRole('toolbar', { name: 'Commit actions' });
  await expect(actions).toBeVisible();
  return actions;
}
const answer = (page: Page, ...replies: (string | boolean)[]) => page.on('dialog', (d) => { const r = replies.shift(); if (r === false) void d.dismiss(); else void d.accept(typeof r === 'string' ? r : undefined); });

test('X41 Git Log Copy Revision: copies the full hash', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const actions = await selectCommit(page, 'base');
  await actions.getByRole('button', { name: 'Copy Revision' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(g('rev-parse', 'HEAD~1'));
});

test('X42 Git Log New Branch: creates a branch at the commit', async ({ page }) => {
  await open(page);
  const actions = await selectCommit(page, 'base');
  answer(page, 'hotfix/one');
  await actions.getByRole('button', { name: 'New Branch…' }).click();
  await expect(page.getByText('Created branch hotfix/one').first()).toBeVisible();
  expect(g('rev-parse', 'hotfix/one')).toBe(g('rev-parse', 'HEAD~1'));
});

test('X43 Git Log New Tag: tags the commit', async ({ page }) => {
  await open(page);
  const actions = await selectCommit(page, 'base');
  answer(page, 'v1.0');
  await actions.getByRole('button', { name: 'New Tag…' }).click();
  await expect(page.getByText('Created tag v1.0').first()).toBeVisible();
  expect(g('rev-parse', 'v1.0^{commit}')).toBe(g('rev-parse', 'HEAD~1'));
});

test('X44 Git Log Cherry-Pick: applies a commit of another branch', async ({ page }) => {
  g('checkout', '-qb', 'side', 'HEAD~1');
  await fs.writeFile(path.join(root, 'NOTES.md'), 'side note\n');
  g('add', 'NOTES.md'); g('commit', '-qm', 'Add notes');
  g('checkout', '-q', 'main');
  await open(page);
  const actions = await selectCommit(page, 'Add notes');
  await actions.getByRole('button', { name: 'Cherry-Pick' }).click();
  await expect(page.getByText(/Cherry-picked/).first()).toBeVisible();
  expect(g('log', '-1', '--format=%s')).toBe('Add notes');
  expect((await fs.readFile(path.join(root, 'NOTES.md'), 'utf8')).trim()).toBe('side note');
});

test('X45 Git Log Revert Commit: a new commit undoes the selected one', async ({ page }) => {
  await open(page);
  const actions = await selectCommit(page, 'Sign in as admin');
  await actions.getByRole('button', { name: 'Revert Commit' }).click();
  await expect(page.getByText(/Reverted/).first()).toBeVisible();
  expect(g('log', '-1', '--format=%s')).toContain('Revert "Sign in as admin"');
  expect(await fs.readFile(path.join(root, 'Features/Auth/Login.feature'), 'utf8')).toContain('"test-user"');
});

test('X46 Git Log Checkout Revision: detached HEAD at the commit', async ({ page }) => {
  await open(page);
  const actions = await selectCommit(page, 'base');
  answer(page, true);
  await actions.getByRole('button', { name: 'Checkout Revision' }).click();
  await expect(page.getByText(/detached HEAD/).first()).toBeVisible();
  expect(g('rev-parse', 'HEAD')).toBe(g('rev-parse', 'main~1'));
  expect(g('branch', '--show-current')).toBe('');
});

test('X47 Git Log Reset to Here: mixed keeps the changes, hard asks again', async ({ page }) => {
  await open(page);
  const actions = await selectCommit(page, 'base');
  answer(page, 'mixed');
  await actions.getByRole('button', { name: 'Reset to Here…' }).click();
  await expect(page.getByText(/Reset the current branch/).first()).toBeVisible();
  expect(g('log', '-1', '--format=%s')).toBe('base');
  expect(g('status', '--porcelain')).toContain('Login.feature');
});

test('X48 Branches popup: the status bar branch switches to or creates a branch', async ({ page }) => {
  g('branch', 'feature/other');
  await open(page);
  await page.getByRole('button', { name: /^Branch main/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Branches' });
  const list = dlg.getByRole('listbox', { name: 'Branches' });
  await expect(list).toContainText('feature/other');
  await list.getByRole('option', { name: /feature\/other/ }).click();
  await expect(page.getByText('Switched to feature/other.').first()).toBeVisible();
  expect(g('branch', '--show-current')).toBe('feature/other');
  await page.getByRole('button', { name: /^Branch feature\/other/ }).click();
  await page.getByLabel('Filter branches').fill('topic/new');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Created and switched to topic/new.').first()).toBeVisible();
  expect(g('branch', '--show-current')).toBe('topic/new');
});

test('X108 Undo Last Commit: the commit goes, its changes stay staged', async ({ page }) => {
  await open(page);
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await page.getByRole('menuitem', { name: /Undo Last Commit/ }).click();
  await expect(page.getByText(/Undid the last commit/).first()).toBeVisible();
  expect(g('log', '-1', '--format=%s')).toBe('base');
  expect(g('diff', '--cached', '--name-only')).toContain('Login.feature');
});

test('X124–X128 Git Log: view at revision, compare with local, copy message, filters, current branch only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  g('checkout', '-qb', 'side', 'HEAD~1');
  await fs.writeFile(path.join(root, 'NOTES.md'), 'side\n');
  g('add', 'NOTES.md'); g('commit', '-qm', 'Side notes');
  g('checkout', '-q', 'main');
  const login = path.join(root, 'Features/Auth/Login.feature');
  await fs.writeFile(login, (await fs.readFile(login, 'utf8')).replace('"admin"', '"root"'));
  await open(page);
  const actions = await selectCommit(page, 'Sign in as admin');
  const panel = page.getByRole('region', { name: 'Git Log' });
  // X124 view at revision.
  await panel.getByRole('button', { name: 'View Features/Auth/Login.feature at this revision' }).click();
  await expect(panel.getByLabel('File at revision')).toContainText('"admin"');
  // X125 compare with the working copy.
  await panel.getByRole('button', { name: 'Compare Features/Auth/Login.feature with the working copy' }).click();
  await expect(panel.getByLabel('Difference from the working copy')).toContainText('+    When the user signs in as "root"');
  // X126 copy message.
  await actions.getByRole('button', { name: 'Copy Message' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('Sign in as admin');
  // X127 filter syntax.
  const list = panel.getByRole('listbox', { name: 'Commits' });
  await expect(list.getByRole('option')).toHaveCount(3);
  await panel.getByLabel('Filter commits').fill('branch:side');
  await expect(list.getByRole('option')).toHaveCount(1);
  await panel.getByLabel('Filter commits').fill('author:ada -side');
  await expect(list.getByRole('option')).toHaveCount(2);
  await panel.getByLabel('Filter commits').fill('');
  // X128 current branch only.
  await panel.getByLabel('Current branch only').check();
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list).not.toContainText('Side notes');
});

test('X152–X154 Git: Stage File, Undo Changes in File, Show History for File', async ({ page }) => {
  const steps = path.join(root, 'Steps/AuthSteps.cs');
  const committed = await fs.readFile(steps, 'utf8');
  await fs.writeFile(steps, committed.replace('public class AuthSteps', 'public class AuthSteps // changed'));
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line').first().click();
  const tool = async (item: RegExp) => { await page.getByRole('button', { name: 'Tools menu' }).click(); await page.getByRole('menuitem', { name: item }).click(); };
  // X153 stage.
  await tool(/^Git: Stage File/);
  await expect.poll(() => g('diff', '--cached', '--name-only')).toContain('Steps/AuthSteps.cs');
  g('reset', '-q');
  // X152 undo changes.
  page.once('dialog', (d) => void d.accept());
  await tool(/^Git: Undo Changes in File/);
  await expect.poll(() => fs.readFile(steps, 'utf8')).toBe(committed);
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).not.toContainText('// changed');
  // X154 history of the file: only the base commit touched it.
  await tool(/^Git: Show History for File/);
  const list = page.getByRole('region', { name: 'Git Log' }).getByRole('listbox', { name: 'Commits' });
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list).toContainText('base');
  await page.getByRole('button', { name: 'Show every file' }).click();
  await expect(list.getByRole('option')).toHaveCount(2);
});

test('QL28 / QL29 Git Changes: the commit message draft survives a reload; summary length hint', async ({ page }) => {
  await fs.appendFile(path.join(root, 'Steps/AuthSteps.cs'), '// change\n');
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('button', { name: 'Git Changes', exact: true }).click();
  const view = page.getByRole('region', { name: 'Git Changes' });
  await view.getByLabel('Commit message').fill(`Draft ${'x'.repeat(80)}`);
  await expect(view.getByRole('note')).toContainText('keep it under 72');
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('button', { name: 'Git Changes', exact: true }).click();
  await expect(view.getByLabel('Commit message')).toHaveValue(/^Draft x+$/);
});
