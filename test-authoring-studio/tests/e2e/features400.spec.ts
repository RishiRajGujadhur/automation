import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Rider and VS Code features (RIDER-VSCODE-FEATURES.md), on a temporary copy of the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-f400-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** Opens the studio (and a file, when given) with clean state and the given VS Code settings. */
async function open(page: Page, file?: string, settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); localStorage.setItem('tas:settings', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, settings);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  if (!file) return;
  await page.getByRole('navigation').getByRole('button', { name: path.basename(file), exact: true }).first().click();
  await expect(page.getByLabel(file.endsWith('.feature') ? 'Gherkin source' : `Source of ${file}`)).toBeVisible();
}
const openSettings = async (page: Page) => { await page.keyboard.press('Control+,'); const d = page.getByRole('dialog', { name: 'Preferences' }); await expect(d).toBeVisible(); return d; };
void path;

test('S2 Settings categories as a collapsible tree', async ({ page }) => {
  await open(page);
  const d = await openSettings(page);
  const nav = d.getByRole('navigation', { name: 'Settings categories' });
  const minimap = nav.getByRole('button', { name: 'Minimap', exact: true });
  await expect(minimap).toBeVisible();
  await nav.getByRole('button', { name: 'Collapse Text Editor' }).click();
  await expect(minimap).toBeHidden();
  await expect(nav.getByRole('button', { name: 'Text Editor', exact: true })).toHaveAttribute('aria-expanded', 'false');
  // Remembered.
  await page.keyboard.press('Escape');
  const d2 = await openSettings(page);
  const nav2 = d2.getByRole('navigation', { name: 'Settings categories' });
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeHidden();
  // Arrow keys: → expands, ← collapses.
  await nav2.getByRole('button', { name: 'Text Editor', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeHidden();
  // A search shows every category again.
  await d2.getByRole('searchbox', { name: 'Search settings' }).fill('minimap scale');
  await expect(nav2.getByRole('button', { name: /Minimap/ })).toBeVisible();
});

const langServer = path.resolve(import.meta.dirname, '../../langserver/bin/Release/net10.0/LangServer.dll');
const needsLang = () => test.skip(!existsSync(langServer), 'The C# language service is not built (npm run langserver:build).');
const setDoc = (page: Page, text: string) => page.evaluate((t) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } }); v.focus(); }, text);
const caretAt = (page: Page, text: string, offset = 0) => page.evaluate(([t, o]) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf(t) + o } }); v.focus(); }, [text, offset] as const);
const docText = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
/** Ctrl+. at the caret, then the Quick Action whose title matches. */
async function quickAction(page: Page, title: RegExp) {
  await page.keyboard.press('Control+.');
  const option = page.getByRole('listbox', { name: 'Quick Actions' }).getByRole('option', { name: title });
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
}
const CS = 'Steps/AuthSteps.cs';

test('113 Roslyn analyzer integration: IDE suggestions in the editor, their fixes in Quick Actions', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public int Run(int a)\n    {\n        var x = 1;\n        x = a;\n        return x;\n    }\n    private void Never() { }\n}\n');
  // Unused private member and unnecessary assignment: faded; their messages are the IDE rule ids.
  await expect(page.locator('.cm-unnecessary').first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.locator('.cm-unnecessary').allTextContents(), { timeout: 60_000 }).toEqual(expect.arrayContaining(['Never', 'x']));
  await caretAt(page, 'Never', 1);
  await quickAction(page, /^Remove unused member$/);
  await expect.poll(() => docText(page), { timeout: 30_000 }).not.toContain('Never');
});
