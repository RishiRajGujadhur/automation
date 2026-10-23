import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

/** Run with TAS_README_SCREENSHOTS=1 to refresh the web gallery in docs/screenshots. */
test.skip(!process.env.TAS_README_SCREENSHOTS, 'README capture only');
test.use({
  viewport: { width: 1440, height: 900 },
  storageState: { cookies: [], origins: [] },
});

const out = path.resolve(import.meta.dirname, '../../../docs/screenshots');

test('capture current web workbench pages', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', layout: 'vscode', autoSave: 'off' }));
  });

  const shot = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(2, 2);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(out, name), animations: 'disabled' });
  };

  await page.goto('/#/dashboard');
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  await shot('web-dashboard.png');

  await page.goto('/#/features/editor');
  await expect(page.locator('.solution-explorer')).toBeVisible();
  await shot('web-feature-editor.png');

  await page.goto('/#/dashboard');
  await page.getByRole('button', { name: 'Generate a test from inputs' }).click();
  await expect(page.getByText('Test Generator', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Next: Scenario' }).click();
  await shot('web-test-generator.png');

  await page.keyboard.press('Control+,');
  const settings = page.getByRole('dialog');
  await expect(settings).toBeVisible();
  await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Buttons' }).click();
  await shot('web-button-settings.png');
  await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await settings.getByRole('navigation', { name: 'Settings categories' }).evaluate((nav) => { nav.scrollTop = 0; });
  await shot('web-page-settings.png');
});

test('capture Monokai inspired themes', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', layout: 'vscode', theme: 'monokai', editorTheme: 'auto' }));
  });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, 'web-monokai-dark.png'), animations: 'disabled' });
  await page.keyboard.press('Control+,');
  const settings = page.getByRole('dialog', { name: 'Preferences' });
  await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance' }).click();
  await page.screenshot({ path: path.join(out, 'web-monokai-themes.png'), animations: 'disabled' });
  await settings.getByRole('radiogroup', { name: 'App theme' }).getByRole('radio', { name: 'Monokai Inspired · Light' }).click();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(out, 'web-monokai-light.png'), animations: 'disabled' });
});

test('capture Linear inspired theme', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', layout: 'vscode', theme: 'linear', editorTheme: 'auto' }));
  });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, 'web-linear-theme.png'), animations: 'disabled' });
});

test('capture frontend snippet completion', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-readme-snippets-'));
  try {
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'profile.feature'), 'Feature: Profile form\n  Scenario: Save profile\n    Given the form is open\n    When I submit my details\n    Then the profile is saved\n');
    await fs.writeFile(path.join(root, 'src', 'ProfileForm.tsx'), 'export function ProfileForm() {\n  return <form>\n    labeledInput\n  </form>;\n}\n');
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', layout: 'vscode', theme: 'monokai', editorTheme: 'auto' })));
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: 'src/ProfileForm.tsx', line: 1 } })));
    await page.getByRole('group', { name: 'Open editors' }).getByRole('button', { name: /ProfileForm\.tsx/ }).first().click();
    const editor = page.getByLabel('Source of src/ProfileForm.tsx');
    await expect(editor).toBeVisible();
    await page.evaluate(() => {
      const view = (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } }; dispatch(change: unknown): void; focus(): void } } }).__activeEditor().view;
      const source = view.state.doc.toString();
      view.dispatch({ selection: { anchor: source.indexOf('labeledInput') + 'labeledInput'.length } });
      view.focus();
    });
    await page.keyboard.press('Control+Space');
    const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^labeledInput$/ }) }).first();
    await expect(option).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(out, 'web-frontend-snippets.png'), animations: 'disabled' });
    await option.click();
    await expect(editor).toContainText('htmlFor="field"');
    await page.screenshot({ path: path.join(out, 'web-frontend-snippet-expanded.png'), animations: 'disabled' });
  } finally {
    await request.post('/api/workspace', { data: previous });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
});
