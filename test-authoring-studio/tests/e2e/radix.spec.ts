import { test, expect } from '@playwright/test';

test('Radix select, checkbox, dropdown and buttons', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible();

  // ⋯ in the tab bar is a Radix DropdownMenu with the studio entries.
  await page.getByRole('button', { name: 'Open studio menu' }).click();
  await expect(page.getByRole('menu', { name: 'Studio menu' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Step Catalog' }).click();

  // Radix checkbox filter.
  const unused = page.getByRole('checkbox', { name: 'Unused only' });
  await expect(unused).toHaveAttribute('aria-checked', 'false');
  await unused.click();
  await expect(unused).toHaveAttribute('aria-checked', 'true');
  await unused.click();

  // Card ⋯ opens the same actions as right-click, as a dropdown.
  const card = page.locator('.catalog-card').first();
  await card.hover();
  await card.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Copy pattern' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Radix select in the Test Generator.
  await page.locator('.page-heading h1').click();
  await page.keyboard.press('Alt+2');
  await expect(page.getByRole('heading', { name: 'Test Generator', level: 1 })).toBeVisible();
  await page.getByRole('tab', { name: /Step 2: Page object/ }).click();
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Click' }).click();
  await expect(page.getByRole('combobox', { name: 'Action' })).toHaveText(/Click/);
  await expect(page.getByLabel('Test data')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Action' }).click();
  await page.getByRole('option', { name: 'Fill' }).click();

  // Radix select inside a Formik form.
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search commands and steps' }).fill('settings');
  await page.getByRole('option', { name: /Open workspace settings/ }).click();
  await page.getByRole('combobox', { name: 'Reference scope' }).click();
  await page.getByRole('option', { name: 'Target project only' }).click();
  await expect(page.getByRole('combobox', { name: 'Reference scope' })).toHaveText(/Target project only/);
  expect(errors).toEqual([]);
});
