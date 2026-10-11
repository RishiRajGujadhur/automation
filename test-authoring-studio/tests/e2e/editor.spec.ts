import { test, expect } from '@playwright/test';

test('sidebar drags to resize with a col-resize cursor, collapses and resets', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('#feature-sidebar');
  const handle = page.getByRole('separator', { name: 'Resize feature explorer' });
  await expect(handle).toHaveCSS('cursor', 'col-resize');
  const before = (await sidebar.boundingBox())!.width;
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 200, { steps: 6 });
  await page.mouse.up();
  const after = (await sidebar.boundingBox())!.width;
  expect(after).toBeGreaterThan(before + 80);
  await page.reload();
  expect((await page.locator('#feature-sidebar').boundingBox())!.width).toBeCloseTo(after, -1);
  await handle.dblclick();
  expect((await sidebar.boundingBox())!.width).toBeCloseTo(260, -1);
  await handle.focus();
  await page.keyboard.press('ArrowRight');
  await expect(handle).toHaveAttribute('aria-valuenow', '276');
  // Drag nearly shut → collapses; Ctrl+B restores.
  const b2 = (await handle.boundingBox())!;
  await page.mouse.move(b2.x + 4, b2.y + 200);
  await page.mouse.down();
  await page.mouse.move(40, b2.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect(sidebar).toBeHidden();
  await page.locator('.page-heading h1').click();
  await page.keyboard.press('Control+b');
  await expect(sidebar).toBeVisible();
});

test('feature editor: context menu, live syntax errors, unbound-step warnings and step autocomplete', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/features/editor');
  const editor = page.locator('.gherkin-editor .cm-content');
  await expect(editor).toBeVisible();

  // Right-click shows Run tests, Save and Review changes.
  await editor.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Run tests/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Save/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Review changes/ })).toBeVisible();
  await page.getByRole('menuitem', { name: /Run tests/ }).click();
  await expect(page.getByRole('dialog', { name: 'Run repository tests' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Replace content with a broken document → Gherkin parser error is reported live.
  await editor.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Feature: Demo\n\n  Scenario: Search\n    Given the browser is started\n    Whenever this is wrong\n');
  await expect(page.locator('.problem-chip')).toContainText(/[1-9]\d* errors?/, { timeout: 5000 });

  // Fix it, then add an unbound step → warning (not error).
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Feature: Demo\n\n  Scenario: Search\n    Given the browser is started\n    When nothing binds to this\n');
  await expect(page.locator('.problem-chip')).toContainText('0 errors · 1 warning', { timeout: 5000 });

  // Autocomplete: "When the user search" offers the real binding with parameter tab-stops.
  await page.keyboard.press('Control+End');
  await page.keyboard.type('    When the user search');
  const option = page.locator('.cm-tooltip-autocomplete li').first();
  await expect(option).toContainText('the user searches for');
  await option.click();
  // The parameter is a selected tab-stop: typing replaces it.
  await page.keyboard.type('Playwright');
  await expect(editor).toContainText('When the user searches for "Playwright"');
  expect(errors).toEqual([]);
});

test('XML dictionary source shows syntax and dictionary diagnostics', async ({ page }) => {
  await page.goto('/#/dictionary-inspector');
  await page.locator('.dictionary-field').first().click();
  await page.getByRole('tab', { name: 'Source' }).click();
  const xml = page.locator('.tabs-content .cm-editor');
  await expect(xml).toBeVisible();
  // The fixture's "placeorder" field puts a brittle nth-child CSS selector second → warning marker in the gutter.
  await expect(xml.locator('.cm-lint-marker-warning').first()).toBeVisible({ timeout: 5000 });
});
