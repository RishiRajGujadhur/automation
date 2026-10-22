import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('web workbench starts with essential controls and restores optional buttons from Settings', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });

  await expect(page.getByRole('button', { name: 'Guide me' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Test Design' })).toHaveCount(0);
  await expect(page.locator('.solution-explorer button[aria-label="Refresh Explorer"]')).toBeHidden();
  await expect(page.locator('.solution-explorer button[aria-label="New File…"]')).toBeVisible();

  await page.keyboard.press('Control+,');
  const settings = page.getByRole('dialog');
  await expect(settings).toBeVisible();
  await settings.locator('#setting-general-showGuideMe').click();
  await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await settings.locator('#setting-workbench-pages-test-design').click();
  await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Buttons' }).click();
  await expect(settings.getByText('workbench.controls.activity-dashboard')).toHaveCount(0);
  await expect(settings.getByText('Visible in the activity bar').first()).toBeVisible();
  await settings.locator('#setting-workbench-controls-explorer-refresh').click();
  await page.keyboard.press('Escape');

  await expect(page.getByRole('button', { name: 'Guide me' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Test Design' })).toBeVisible();
  await expect(page.locator('.solution-explorer button[aria-label="Refresh Explorer"]')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Guide me' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Test Design' })).toBeVisible();

  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Buttons' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Essentials' }).click();
  await page.getByRole('dialog').getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('dialog').locator('#setting-workbench-pages-test-design').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Test Design' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Guide me' })).toBeVisible();
});
