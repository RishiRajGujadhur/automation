import { test, expect } from '@playwright/test';
import path from 'node:path';

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
