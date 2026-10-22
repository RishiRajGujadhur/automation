import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Workbench ease-of-use improvements in the style of Visual Studio 2026 and VS Code (GUI-QOL.md).
test.use({ storageState: { cookies: [], origins: [] } });

async function open(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.controls.layout-secondary': true })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
}
/** Opens the Structure tool window in the panel. */
async function structure(page: Page) {
  await page.getByLabel('Source of Steps/AuthSteps.cs').click();
  await page.keyboard.press('Alt+7');
  const dock = page.locator('.dock');
  await expect(dock).toBeVisible();
  return dock;
}

test('G1 Resize the panel with its sash; remembered; double-click resets', async ({ page }) => {
  await open(page);
  const dock = await structure(page);
  const before = (await dock.boundingBox())!.height;
  const sash = page.getByRole('separator', { name: 'Resize panel' });
  const s = (await sash.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2, s.y - 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await dock.boundingBox())!.height).toBeGreaterThan(before + 150);
  // The editors make room: they end where the panel starts.
  const editor = (await page.locator('.editor-split').boundingBox())!;
  expect(editor.y + editor.height).toBeLessThanOrEqual((await dock.boundingBox())!.y + 2);
  const grown = (await dock.boundingBox())!.height;
  // Remembered.
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  const dock2 = await structure(page);
  await expect.poll(async () => Math.round((await dock2.boundingBox())!.height)).toBe(Math.round(grown));
  // Keyboard: arrow up grows it by 20 px; double-click goes back to the default.
  await page.getByRole('separator', { name: 'Resize panel' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => Math.round((await dock2.boundingBox())!.height)).toBe(Math.round(grown) + 20);
  await page.getByRole('separator', { name: 'Resize panel' }).dblclick();
  await expect.poll(async () => Math.round((await dock2.boundingBox())!.height)).toBe(Math.round(before));
});

test('G2 Maximize Panel Size and restore', async ({ page }) => {
  await open(page);
  const dock = await structure(page);
  const before = (await dock.boundingBox())!.height;
  await page.getByRole('button', { name: 'Maximize Panel Size' }).click();
  await expect(page.locator('.editor-split')).toBeHidden();
  expect((await dock.boundingBox())!.height).toBeGreaterThan(before + 300);
  await expect(page.getByRole('separator', { name: 'Resize panel' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore Panel Size' }).click();
  await expect(page.locator('.editor-split')).toBeVisible();
  await expect.poll(async () => Math.round((await dock.boundingBox())!.height)).toBe(Math.round(before));
});

test('G3 Layout controls in the title bar: side bar, panel, secondary side bar', async ({ page }) => {
  await open(page);
  const layout = page.getByRole('group', { name: 'Layout' });
  const sidebar = layout.getByRole('button', { name: 'Toggle Primary Side Bar' });
  await expect(sidebar).toHaveAttribute('aria-pressed', 'true');
  await sidebar.click();
  await expect(page.locator('#feature-sidebar')).toBeHidden();
  await expect(sidebar).toHaveAttribute('aria-pressed', 'false');
  await sidebar.click();
  await expect(page.locator('#feature-sidebar')).toBeVisible();
  // Toggle Panel with nothing open: the Terminal; again hides the panel; again shows the same tool window.
  const panel = layout.getByRole('button', { name: 'Toggle Panel' });
  await panel.click();
  await expect(page.getByRole('region', { name: 'Terminal' })).toBeVisible();
  await expect(panel).toHaveAttribute('aria-pressed', 'true');
  const screen = page.locator('.terminal-host:not([hidden]) .xterm-rows');
  await expect(screen).toContainText('PS ', { timeout: 30_000 });
  await page.locator('.terminal-host:not([hidden])').click();
  await page.keyboard.type('echo kept-1234');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText('kept-1234');
  await panel.click();
  await expect(page.locator('.dock')).toBeHidden();
  await expect(panel).toHaveAttribute('aria-pressed', 'false');
  await panel.click();
  await expect(page.getByRole('region', { name: 'Terminal' })).toBeVisible();
  // Hidden, not closed: the same shell, with its output.
  await expect(screen).toContainText('kept-1234');
  // Secondary side bar.
  const secondary = layout.getByRole('button', { name: 'Toggle Secondary Side Bar' });
  await secondary.click();
  await expect(page.locator('.secondary-sidebar')).toBeVisible();
  await secondary.click();
  await expect(page.locator('.secondary-sidebar')).toHaveCount(0);
  await page.getByRole('button', { name: 'Close terminal 1' }).click();
});

test('G4 Activity bar badges: pending Git changes, failed tests', async ({ page, request }) => {
  test.setTimeout(400_000);
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'studio-gui-')), 'Calculator');
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (f) => !/[\/](bin|obj)$/.test(f) });
  const git = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=T', ...args], { cwd: root });
  await fs.writeFile(path.join(root, 'Tests/Failing.cs'), 'using NUnit.Framework;\n\nnamespace Calculator.Tests;\n\npublic class FailingTests\n{\n    [Test]\n    public void Fails() => Assert.That(1, Is.EqualTo(2));\n}\n');
  await fs.writeFile(path.join(root, '.gitignore'), 'bin/\nobj/\n');
  git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-qm', 'Initial');
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    const bar = page.getByRole('navigation', { name: 'Main' });
    await expect(bar.locator('[data-badge="Git"]')).toHaveCount(0);
    // Two changed files: a badge of 2 on Git Changes (refreshed on focus, like VS Code).
    await fs.appendFile(path.join(root, 'Features/Add.feature'), '\n');
    await fs.writeFile(path.join(root, 'NOTES.md'), '# Notes');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(bar.locator('[data-badge="Git"]')).toHaveText('2', { timeout: 15_000 });
    await expect(bar.locator('[data-badge="Git"]')).toHaveAttribute('title', '2 pending changes');
    // A failed test: a red badge of 1 on Test Explorer.
    await bar.getByRole('button', { name: 'Test Explorer' }).click();
    const te = page.getByRole('region', { name: 'Test Explorer' });
    await expect(te.getByRole('navigation', { name: 'Tests' }).locator('.t-label', { hasText: /Fails/ })).toBeVisible({ timeout: 120_000 });
    await te.getByRole('button', { name: 'Run All Tests' }).click();
    await expect(bar.locator('[data-badge="Testing"]')).toHaveText('1', { timeout: 300_000 });
    await expect(bar.locator('[data-badge="Testing"]')).toHaveClass(/error/);
    // The badges do not change the buttons' names.
    await expect(bar.getByRole('button', { name: 'Git Changes', exact: true })).toBeVisible();
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(path.dirname(root), { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('G5 Index status in the status bar; the Explorer gets the full height', async ({ page }) => {
  await open(page);
  const status = page.locator('footer.status-bar');
  const item = status.getByRole('button', { name: 'Rescan repository' });
  await expect(item).toHaveText('Repository indexed');
  await item.hover();
  await expect(page.getByRole('tooltip')).toContainText(/Rescan repository · \d+ steps · \d+ selectors · \d+ fields/);
  // The Explorer runs down to the status bar (no index card at its foot).
  const sidebar = (await page.locator('#feature-sidebar').boundingBox())!;
  const bar = (await status.boundingBox())!;
  expect(Math.abs(sidebar.y + sidebar.height - bar.y)).toBeLessThan(3);
  await item.click();
  await expect(page.getByText('Repository index refreshed.', { exact: true })).toBeVisible();
  // The full folder path on the workspace name.
  await expect(status.locator('span[title]').filter({ hasText: /^fixtures$/ })).toHaveAttribute('title', /fixtures$/);
});

test('G6 Back and Forward buttons beside the search box', async ({ page }) => {
  await open(page);
  const nav = page.getByRole('group', { name: 'Navigation' });
  const back = nav.getByRole('button', { name: 'Go Back' });
  const forward = nav.getByRole('button', { name: 'Go Forward' });
  await expect(forward).toBeDisabled();
  await page.getByRole('navigation').getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  const active = page.locator('.editor-tab-label[aria-current="true"]');
  await expect(active).toHaveAttribute('title', 'Steps/SearchSteps.cs');
  await expect(back).toBeEnabled();
  await back.click();
  await expect(active).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(active).toHaveAttribute('title', 'Steps/SearchSteps.cs');
  await expect(forward).toBeDisabled();
});

test('G7 Double-click an editor tab to maximize the editor; again to restore', async ({ page }) => {
  await open(page);
  await structure(page);
  const tab = page.locator('.editor-tab', { hasText: 'AuthSteps.cs' });
  // A preview tab is kept open first (as before).
  if (await tab.evaluate((e) => e.classList.contains('preview'))) { await tab.dblclick(); await expect(tab).not.toHaveClass(/preview/); }
  await tab.dblclick();
  await expect(page.locator('#feature-sidebar')).toBeHidden();
  await expect(page.locator('.dock')).toBeHidden();
  await tab.dblclick();
  await expect(page.locator('#feature-sidebar')).toBeVisible();
  await expect(page.locator('.dock')).toBeVisible();
});
