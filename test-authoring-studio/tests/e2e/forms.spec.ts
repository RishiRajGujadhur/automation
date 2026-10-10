import { test, expect } from '@playwright/test';

test('studio context menu and Formik validation guard every form', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible();

  // Right-click empty page space → studio menu with secondary pages.
  await page.locator('.page-heading').click({ button: 'right' });
  await expect(page.getByRole('menu', { name: 'Studio menu' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Selectors' }).click();
  await expect(page.getByRole('heading', { name: 'Selectors', level: 1 })).toBeVisible();

  // Record dialog: invalid URL blocks launch with a clear message.
  await page.locator('.page-heading').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Start a recording' }).click();
  const url = page.getByLabel('START URL');
  await url.fill('example.com');
  await url.blur();
  await expect(page.getByText('Start with http:// or https://')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Launch browser' })).toBeDisabled();
  await page.keyboard.press('Escape');

  // New feature: duplicate, lowercase and traversal paths are rejected.
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search commands and steps' }).fill('new feature');
  await page.getByRole('option', { name: /Create a new feature/ }).click();
  const file = page.getByLabel('FEATURE FILE');
  await file.fill('Features/Auth/Login.feature');
  await file.blur();
  await expect(page.getByText(/already exists/)).toBeVisible();
  await file.fill('../Outside.feature');
  await expect(page.getByText(/cannot contain/)).toBeVisible();
  await file.fill('Features/Auth/lower.feature');
  await expect(page.getByText(/PascalCase/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create draft' })).toBeDisabled();
  await file.fill('Features/Auth/ResetPassword.feature');
  await expect(page.getByRole('button', { name: /Use .Reset Password./ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create draft' })).toBeEnabled();
  await page.keyboard.press('Escape');

  // Generator wizard: an invalid step blocks Next with a summary; Ctrl+S is guarded too.
  await page.keyboard.press('Alt+2');
  await page.getByLabel('Scenario text').fill('click the button');
  await page.getByRole('button', { name: /Next: Mapping/ }).click();
  await expect(page.getByText('Before continuing:')).toBeVisible();
  await expect(page.getByText('Every line must start with Given, When, Then, And, But or *.').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: /Step 1: Scenario/ })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+s');
  await expect(page.getByRole('heading', { name: 'Review feature change' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
