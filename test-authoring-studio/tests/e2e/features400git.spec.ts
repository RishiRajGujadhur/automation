import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Git features of RIDER-VSCODE-FEATURES.md, on a temporary Git repository made from the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-f400git-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'Initial');
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function open(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
}
const gitChanges = async (page: Page) => { await page.getByRole('button', { name: 'Git Changes', exact: true }).click(); return page.getByRole('region', { name: 'Git Changes' }); };

test('165 Commit message templates', async ({ page }) => {
  await fs.writeFile(path.join(root, '.gitmessage'), 'Summary\n\n# Why is this change needed?\nWhy: \n');
  git('add', '.gitmessage');
  git('commit', '-q', '-m', 'Template');
  await fs.appendFile(path.join(root, 'Steps/AuthSteps.cs'), '// change\n');
  await open(page);
  const view = await gitChanges(page);
  const box = view.getByLabel('Commit message');
  await expect(box).toHaveValue('Summary\n\n# Why is this change needed?\nWhy: \n');
  // Untouched: nothing to commit yet.
  await expect(view.getByRole('button', { name: /Commit (All|Staged)/ })).toBeDisabled();
  await box.fill('Fix the steps\n\n# Why is this change needed?\nWhy: a test\n');
  await view.getByRole('button', { name: /Commit (All|Staged)/ }).click();
  await expect.poll(() => git('log', '-1', '--format=%B').trim()).toBe('Fix the steps\n\nWhy: a test');
  // The box starts again with the template.
  await expect(box).toHaveValue('Summary\n\n# Why is this change needed?\nWhy: \n');
});

test('162 Compare commits', async ({ page }) => {
  await fs.appendFile(path.join(root, 'Steps/AuthSteps.cs'), '// one\n');
  git('commit', '-q', '-am', 'One');
  await fs.appendFile(path.join(root, 'Steps/SearchSteps.cs'), '// two\n');
  git('commit', '-q', '-am', 'Two');
  await open(page);
  await page.keyboard.press('Alt+9');
  const log = page.getByRole('region', { name: 'Git Log' });
  const commits = log.getByRole('listbox', { name: 'Commits' });
  await commits.getByRole('option', { name: /Two/ }).click();
  await commits.getByRole('option', { name: /Initial/ }).click({ modifiers: ['Control'] });
  const cmp = log.getByLabel('Commit comparison');
  await expect(cmp).toContainText(/Comparing [0-9a-f]{7} → [0-9a-f]{7}/);
  const files = cmp.getByLabel('Files that differ');
  await expect(files.getByRole('button')).toHaveText(['Steps/AuthSteps.cs', 'Steps/SearchSteps.cs']);
  await expect(cmp.getByLabel('Comparison patch')).toContainText('+// two');
  await cmp.getByRole('button', { name: 'Stop comparing' }).click();
  await expect(cmp).toHaveCount(0);
});

const logOf = () => git('log', '--format=%s').trim().split('\n');
async function commitsAB(page: Page) {
  for (const n of ['A', 'B', 'C']) { await fs.appendFile(path.join(root, 'Steps/AuthSteps.cs'), `// ${n}\n`); git('commit', '-q', '-am', `Change ${n}`); }
  await open(page);
  await page.keyboard.press('Alt+9');
  const log = page.getByRole('region', { name: 'Git Log' });
  return { log, commits: log.getByRole('listbox', { name: 'Commits' }) };
}
test('146 Interactive rebase: reword, squash, drop, reorder', async ({ page }) => {
  const { log, commits } = await commitsAB(page);
  await commits.getByRole('option', { name: /Change A/ }).click();
  await log.getByRole('button', { name: 'Interactively Rebase from Here…' }).click();
  const ed = log.getByLabel('Interactive Rebase');
  await expect(ed.locator('.git-rebase-row')).toHaveCount(3);
  await ed.getByLabel('Action for Change A').selectOption('reword');
  await ed.getByLabel('Message for Change A').fill('Change A, reworded');
  await ed.getByLabel('Action for Change B').selectOption('fixup');
  await ed.getByRole('button', { name: 'Move Change C up' }).click();
  await ed.getByLabel('Action for Change C').selectOption('drop');
  await ed.getByRole('button', { name: 'Start Rebasing' }).click();
  await expect(ed.getByRole('alert')).toHaveCount(0);
  await expect.poll(logOf, { timeout: 30_000 }).toEqual(['Change A, reworded', 'Initial']);
  const text = await fs.readFile(path.join(root, 'Steps/AuthSteps.cs'), 'utf8');
  expect(text).toContain('// A\n// B\n');
  expect(text).not.toContain('// C');
});
test('147 Commit squashing', async ({ page }) => {
  const { log, commits } = await commitsAB(page);
  await commits.getByRole('option', { name: /Change B/ }).click();
  page.once('dialog', (d) => void d.accept('B and C'));
  await log.getByRole('button', { name: 'Squash to HEAD…' }).click();
  await expect.poll(logOf).toEqual(['B and C', 'Change A', 'Initial']);
});
