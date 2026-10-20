import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// VS Code features and their settings (VSCODE-20.md, V1–V20), on a temporary copy of the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-vsc-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** Opens a file in the editor with the given VS Code settings (settings.json values). */
async function open(page: Page, file = 'Steps/AuthSteps.cs', settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); localStorage.setItem('tas:settings', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, settings);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: path.basename(file), exact: true }).first().click();
  const editor = page.getByLabel(file.endsWith('.feature') ? 'Gherkin source' : `Source of ${file}`);
  await expect(editor).toBeVisible();
  return editor;
}
const view = (page: Page) => page.locator('.cm-editor').filter({ has: page.locator('.cm-content[contenteditable=true]') }).first();
/** Puts the caret at the start of line `n` (1-based). */
const caretLine = (page: Page, n: number) => page.evaluate((line) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { line(n: number): { from: number } } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: v.state.doc.line(line).from } }); v.focus(); }, n);
const openSettings = async (page: Page) => { await page.keyboard.press('Control+,'); const d = page.getByRole('dialog', { name: 'Preferences' }); await expect(d).toBeVisible(); return d; };

test('V1 Settings editor: Text Editor category, modified bar, reset, @modified, settings.json; editor.lineNumbers', async ({ page }) => {
  await open(page);
  const numbers = view(page).locator('.cm-gutter.cm-lineNumbers').first();
  await expect(numbers).toBeVisible();
  const d = await openSettings(page);
  await d.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Text Editor', exact: true }).click();
  const row = d.locator('[data-setting-id="editor.lineNumbers"]');
  await expect(row).toContainText('editor.lineNumbers');
  await expect(row).not.toHaveClass(/modified/);
  await row.getByRole('combobox', { name: 'Line Numbers' }).click();
  await page.getByRole('option', { name: 'relative' }).click();
  await expect(row).toHaveClass(/modified/);
  await expect(row).toContainText('distance in lines to cursor position');
  // @modified lists only changed settings.
  await d.getByRole('searchbox', { name: 'Search settings' }).fill('@modified');
  await expect(d.locator('[data-setting-id="editor.lineNumbers"]')).toBeVisible();
  await expect(d.locator('[data-setting-id^="editor."]')).toHaveCount(1);
  await d.getByRole('button', { name: 'Clear settings search' }).click();
  expect(await page.evaluate(() => localStorage.getItem('tas:settings'))).toBe('{"editor.lineNumbers":"relative"}');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Relative numbers: the caret line shows its number, the others the distance.
  await caretLine(page, 5);
  const rel = view(page).locator('.cm-vsc-numbers .cm-gutterElement');
  await expect(rel.filter({ hasText: /^5$/ })).toHaveCount(1);
  await expect(rel.filter({ hasText: /^1$/ })).toHaveCount(2);
  await caretLine(page, 2);
  await expect(rel.filter({ hasText: /^2$/ })).toHaveCount(2);
  // Reset brings the absolute numbers back.
  const d2 = await openSettings(page);
  await d2.locator('[data-setting-id="editor.lineNumbers"]').getByRole('button', { name: 'Reset Line Numbers' }).click();
  await expect(d2.locator('[data-setting-id="editor.lineNumbers"]')).not.toHaveClass(/modified/);
  expect(await page.evaluate(() => localStorage.getItem('tas:settings'))).toBe('{}');
  await page.keyboard.press('Escape');
  await expect(view(page).locator('.cm-vsc-numbers')).toHaveCount(0);
});
