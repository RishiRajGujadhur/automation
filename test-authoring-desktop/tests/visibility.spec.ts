import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('desktop starts in the editor with optional pages and buttons hidden', async () => {
  const cwd = path.resolve(import.meta.dirname, '..');
  const electronPath = createRequire(import.meta.url)('electron') as string;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-visibility-'));
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], cwd, env: { ...process.env, TAS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/#\/features\/editor$/);
    await expect(page.getByRole('button', { name: 'Guide me' })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
    await expect(page.locator('.solution-explorer button[aria-label="Refresh Explorer"]')).toBeHidden();

    await page.keyboard.press('Control+,');
    const settings = page.getByRole('dialog');
    await expect(settings).toBeVisible();
    await settings.locator('#setting-general-showGuideMe').click();
    await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
    await settings.locator('#setting-workbench-pages-dashboard').click();
    await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Buttons' }).click();
    await settings.locator('#setting-workbench-controls-explorer-refresh').click();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('button', { name: 'Guide me' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('.solution-explorer button[aria-label="Refresh Explorer"]')).toBeVisible();
  } finally {
    await app.close();
    fs.rmSync(userData, { recursive: true, force: true });
  }
});
