import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// VS Code look and features (VSCODE-250.md, W1–W250), on a temporary copy of the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-w250-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** A clean studio on the editor page, with VS Code settings (settings.json values). */
async function start(page: Page, settings: Record<string, unknown> = {}, extra: Record<string, string> = {}) {
  await page.addInitScript(([s, x]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' }));
    localStorage.setItem('tas:settings', JSON.stringify(s));
    for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v);
    sessionStorage.setItem('seeded', '1');
  }, [settings, extra] as const);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
}
/** Opens a file in the editor and returns its source box. */
async function open(page: Page, file: string) {
  const editor = page.getByLabel(file.endsWith('.feature') ? 'Gherkin source' : `Source of ${file}`);
  // The shell may still be starting: ask again until the editor shows the file.
  await expect(async () => {
    await page.evaluate((f) => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: f, line: 1 } })), file);
    await expect(editor).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  return editor;
}
const quick = (page: Page) => page.getByRole('dialog', { name: 'Quick Input' });
const quickBox = (page: Page) => quick(page).getByRole('combobox', { name: 'Quick Input' });
const rows = (page: Page) => quick(page).getByRole('option');
const docText = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
void docText;

test('W1 Quick Open: files at the top, recently opened first, fuzzy highlights, Enter opens', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await page.keyboard.press('Control+p');
  await expect(quick(page)).toBeVisible();
  // The widget sits at the top centre, like VS Code's.
  const box = (await quick(page).boundingBox())!;
  expect(box.y).toBeLessThan(20);
  expect(Math.abs(box.x + box.width / 2 - (page.viewportSize()!.width / 2))).toBeLessThan(12);
  await expect(rows(page).first()).toContainText('AuthSteps.cs');
  await expect(quick(page).locator('.quick-input-separator').first()).toHaveText('recently opened');
  // Fuzzy: "hks" finds Hooks.cs with the matched letters highlighted.
  await quickBox(page).fill('hks');
  const hooks = rows(page).filter({ hasText: 'Hooks.cs' }).first();
  await expect(hooks).toBeVisible();
  await expect(hooks.locator('.highlight')).toHaveText(['H', 'ks']);
  await quickBox(page).fill('hooks');
  await expect(rows(page).first()).toContainText('Hooks.cs');
  await page.keyboard.press('Enter');
  await expect(quick(page)).toBeHidden();
  await expect(page.getByLabel(/^Source of .*Hooks\.cs$/)).toBeVisible();
  // Escape closes without opening anything.
  await page.keyboard.press('Control+p');
  await expect(rows(page).first()).toContainText('Hooks.cs');
  await page.keyboard.press('Escape');
  await expect(quick(page)).toBeHidden();
});

test('W2 Command Palette: > commands with keybinding chips, recently used first', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await page.keyboard.press('Control+Shift+P');
  await expect(quickBox(page)).toHaveValue('>');
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Type the name of a command to run.');
  await page.keyboard.type('sort lines');
  const sort = rows(page).filter({ hasText: /Sort Lines$/ }).first();
  await expect(sort).toBeVisible();
  await expect(sort.locator('.highlight')).toHaveText(['Sort', 'Lines']);
  await sort.click();
  await expect(quick(page)).toBeHidden();
  // Used once: it comes first, under "recently used"; the others follow under "other commands".
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>');
  await expect(rows(page).first()).toContainText('Sort Lines');
  await expect(rows(page).first().locator('.quick-input-separator')).toHaveText('recently used');
  await expect(quick(page).locator('.quick-input-separator').nth(1)).toHaveText('other commands');
  // Keybindings as chips.
  await quickBox(page).fill('>toggle case');
  await expect(rows(page).first().locator('kbd')).toHaveText(['Ctrl', 'Shift', 'U']);
  // Backspacing the prefix switches to Quick Open (files).
  await quickBox(page).fill('auth');
  await expect(rows(page).first()).toContainText('AuthSteps.cs');
  await page.keyboard.press('Escape');
});
