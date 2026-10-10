import { test, expect } from '@playwright/test';

test('step lint, suggestions, file state, palette commands, undo and accept-all', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(page.getByText(/Scanned/)).toBeVisible();
  await expect(page).toHaveTitle(/Playwright recorder · TestAuthoring Studio/);

  // Recorder: accept all, then remove + undo.
  await page.getByRole('button', { name: 'Accept all top matches' }).click();
  await expect(page.getByText(/Accepted the top match for/).first()).toBeVisible();
  const count = await page.locator('.action-card').count();
  await page.locator('.action-card').last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Remove action' }).click();
  await expect(page.locator('.action-card')).toHaveCount(count - 1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.action-card')).toHaveCount(count);

  // Palette commands.
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search commands and steps' }).fill('shortcuts');
  await page.getByRole('option', { name: /Show keyboard shortcuts/ }).click();
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Generator: live lint, keyword insert, suggestions, file state, filename normalization.
  await page.keyboard.press('Alt+2');
  await expect(page.getByText(/steps reuse existing bindings/)).toBeVisible();
  await expect(page.locator('.step-lint li.matched')).toHaveCount(1);
  await page.getByRole('button', { name: '+ When' }).click();
  const textarea = page.getByLabel('Scenario text');
  await textarea.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('the user searches');
  await expect(page.getByRole('list', { name: 'Step suggestions' })).toBeVisible();
  await page.locator('.suggestion').first().click();
  await expect(textarea).toContainText('When the user searches for "<searchText>"');
  await expect(page.getByText('New file. It will be created on save.')).toBeVisible();
  await page.getByLabel('Target feature file').fill('my login flow');
  await page.getByLabel('Scenario name').click();
  await expect(page.getByLabel('Target feature file')).toHaveValue('MyLoginFlow.feature');
  await page.getByLabel('Feature area').fill('Features/Auth');
  await page.getByLabel('Target feature file').fill('Login.feature');
  await expect(page.getByText('Existing file. The scenario will be appended.')).toBeVisible();

  // Quick fix on a failing dictionary check (step 4 → jumps to step 3's form).
  await page.getByRole('tab', { name: /Step 2: Page object/ }).click();
  await page.getByLabel('Field name').fill('DoesNotExist');
  await page.getByRole('tab', { name: /Step 4: Validation/ }).click();
  await page.getByRole('button', { name: 'Run dry-run validation' }).click();
  await expect(page.getByRole('button', { name: 'Add dictionary entry' })).toBeVisible();
  await page.getByRole('button', { name: 'Add dictionary entry' }).click();
  await expect(page.getByLabel('Selector 1 value')).toBeFocused();

  // Dashboard continue card.
  await page.keyboard.press('Alt+1');
  await page.locator('.continue-card').click();
  await expect(page.getByRole('heading', { name: 'Test Generator', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
