import { test, expect } from '@playwright/test';

test('right-click menus, More navigation, shortcuts, persisted drafts and collapsible steps', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible();

  // Secondary pages are in the right-click studio menu, not the tab bar.
  await expect(page.getByRole('button', { name: 'Step Catalog', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open studio menu' }).click();
  await page.getByRole('menuitem', { name: 'Step Catalog' }).click();
  await expect(page.getByRole('button', { name: /Step Catalog/ })).toBeVisible();

  // Right-click a step card for secondary actions.
  const card = page.locator('.catalog-card').first();
  await card.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Inspect evidence' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Inspect evidence' }).click();
  await expect(page.getByRole('heading', { name: 'Binding evidence' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Escape clears the search box.
  const search = page.getByRole('combobox', { name: 'Search Step Catalog' });
  await search.fill('searches');
  await search.press('Escape');
  await search.focus();
  await search.press('Escape');
  await expect(search).toHaveValue('');

  // Keyboard shortcuts.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('?');
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+2');
  await expect(page.getByRole('heading', { name: 'Test Generator', level: 1 })).toBeVisible();

  // Generator wizard: stepper summaries, persisted draft and step, validation row menu.
  await page.getByLabel('Scenario name').fill('Persisted draft name');
  await expect(page.getByRole('tab', { name: /Step 1: Scenario/ })).toContainText('ShoppingCart.feature · 3 steps');
  await page.getByRole('button', { name: /Next: Scenario/ }).click();
  await page.getByRole('button', { name: /Next: Mapping/ }).click();
  await page.reload();
  await expect(page.getByRole('tab', { name: /Step 2: Page object/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: /Step 0: Feature/ }).click();
  await expect(page.getByLabel('Scenario name')).toHaveValue('Persisted draft name');
  await page.getByRole('tab', { name: /Step 4: Validation/ }).click();
  await page.getByRole('button', { name: 'Run dry-run validation' }).click();
  const row = page.locator('.checks-table tr.pass').first();
  await expect(row).toBeVisible();
  await row.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Copy details' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Dictionary inspector: arrow-key navigation and collapsed source.
  await page.keyboard.press('Alt+4');
  const first = page.locator('.dictionary-field').first();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.dictionary-field').nth(1)).toBeFocused();
  await expect(page.getByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'false');
  expect(errors).toEqual([]);
});
