import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('fresh web workbench shows the editor and lets users enable pages in Settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/#\/features\/editor$/);
  const activity = page.getByRole('navigation', { name: 'Main' });
  await expect(activity.getByRole('button', { name: 'Features (Explorer)' })).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
  await expect(activity.getByRole('button', { name: 'Test Generator' })).toHaveCount(0);
  await expect(activity.getByRole('button', { name: 'Playwright Recorder' })).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Feature view' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Builder' })).toHaveCount(0);

  await page.keyboard.press('Control+,');
  const settings = page.getByRole('dialog');
  await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await settings.locator('#setting-workbench-pages-dashboard').click();
  await settings.locator('#setting-workbench-pages-test-generator').click();
  await settings.locator('#setting-workbench-pages-recorder').click();
  await page.keyboard.press('Escape');

  await expect(activity.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Test Generator' })).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Playwright Recorder' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Editor' }).locator('svg')).toHaveCount(0);
  await activity.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/#\/dashboard$/);

  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('dialog').locator('#setting-workbench-pages-dashboard').click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/features\/editor$/);
  await expect(activity.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);
  await expect(activity.getByRole('button', { name: 'Test Generator' })).toBeVisible();
  await expect(activity.getByRole('button', { name: 'Playwright Recorder' })).toBeVisible();
});

test('classic and mobile navigation honor the same page switches', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('tas:prefs', JSON.stringify({ layout: 'classic' })); });
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
  const classic = page.getByRole('navigation', { name: 'Main' });
  await expect(classic.getByRole('button', { name: 'Features' })).toBeVisible();
  await expect(classic.getByRole('button', { name: 'Dashboard' })).toHaveCount(0);

  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('dialog').locator('#setting-workbench-pages-dashboard').click();
  await page.getByRole('dialog').locator('#setting-workbench-pages-recorder').click();
  await page.keyboard.press('Escape');
  await expect(classic.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  await expect(page.locator('.recorder-tab')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = page.getByRole('navigation', { name: 'Main (mobile)' });
  await expect(mobile.getByRole('button', { name: 'Dashboard' })).toBeVisible();
  await expect(mobile.getByRole('button', { name: 'Features' })).toBeVisible();
});

test('enabling a page restores its previously hidden activity button', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.controls.activity-dashboard': false })); });
  await page.goto('/');
  await page.keyboard.press('Control+,');
  const settings = page.getByRole('dialog');
  await settings.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await settings.locator('#setting-workbench-pages-dashboard').click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Dashboard' })).toBeVisible();
});
