import { test, expect } from '@playwright/test';

test('Radix dialog, alert dialog, tabs, accordion, tooltip, toast, preferences and deep links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible();

  // Deep link reflects the page and survives reload/back.
  await expect(page).toHaveURL(/#\/features\/recorder$/);
  await page.keyboard.press('Alt+4');
  await expect(page).toHaveURL(/#\/dictionary-inspector$/);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dictionary Inspector', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/#\/features\/recorder$/);

  // Tooltip on an icon button.
  await page.getByRole('button', { name: 'Rescan repository' }).hover();
  await expect(page.getByRole('tooltip')).toContainText('Rescan repository');

  // AlertDialog guards destructive actions; Cancel keeps data.
  const count = await page.locator('.action-card').count();
  await page.getByRole('button', { name: 'Clear recording' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Clear this recording?' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.locator('.action-card')).toHaveCount(count);

  // Radix Toast can be dismissed.
  await page.getByRole('button', { name: 'Accept all top matches' }).click();
  await page.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(page.getByRole('button', { name: 'Dismiss notification' })).toHaveCount(0);

  // Preferences dialog: switch + toggle group drive <html> data attributes.
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
  await page.getByRole('radio', { name: 'Compact' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.getByRole('switch', { name: 'High contrast' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-contrast', 'high');
  await page.getByRole('radio', { name: 'teal' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'teal');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Focus mode hides chrome; sidebar toggle.
  await page.locator('.page-heading h1').click();
  await page.keyboard.press('Control+.');
  await expect(page.locator('.main-nav')).toBeHidden();
  await page.keyboard.press('Control+.');
  await expect(page.locator('.main-nav')).toBeVisible();
  await page.keyboard.press('Control+b');
  await expect(page.locator('#feature-sidebar')).toBeHidden();
  await page.keyboard.press('Control+b');

  // Wizard: Next/Back move one step at a time; step 4 auto-runs validation.
  await page.keyboard.press('Alt+2');
  await page.getByRole('button', { name: /Next: Mapping/ }).click();
  await expect(page.getByLabel('Section name')).toBeVisible();
  await expect(page.getByLabel('Scenario name')).toHaveCount(0);
  await page.getByRole('button', { name: /Next: Selector/ }).click();
  await page.getByRole('button', { name: /Next: Validate/ }).click();
  await expect(page.getByRole('progressbar', { name: 'Quality gate' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('tab', { name: /Step 3: Selector/ })).toHaveAttribute('aria-selected', 'true');

  // Dashboard checklist shows progress.
  await page.keyboard.press('Alt+1');
  await expect(page.getByRole('region', { name: 'Getting started' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Getting started' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile bottom navigation and bottom-sheet dialogs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main (mobile)' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Generator' }).click();
  await expect(page.getByRole('heading', { name: 'Test Generator', level: 1 })).toBeVisible();
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  const box = await sheet.boundingBox();
  expect(Math.round((box?.y ?? 0) + (box?.height ?? 0))).toBeGreaterThanOrEqual(840);
});
