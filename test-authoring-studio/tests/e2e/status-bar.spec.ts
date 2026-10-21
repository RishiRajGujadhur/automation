import { test, expect } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

test('status bar: cursor position, line endings, encoding and the Git branch (opens Checkout to…)', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  const editor = page.getByLabel('Source of Steps/SearchSteps.cs');
  await editor.locator('.cm-line', { hasText: 'namespace Demo;' }).click();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const bar = page.locator('.status-bar');
  await expect(bar.getByLabel('Cursor position')).toHaveText('Ln 3, Col 2');
  await page.keyboard.press('Shift+End');
  await expect(bar.getByLabel('Cursor position')).toHaveText(/Ln 3, Col 16 \(14 selected\)/);
  await expect(bar).toContainText('UTF-8');
  await expect(bar).toContainText(/CRLF|LF/);
  // fixtures/ lives inside this repository, so a branch is shown; it opens VS Code's Checkout to… (VSCODE-250.md W33).
  const branch = bar.getByRole('button', { name: /^Branch .+: Checkout to…$/ });
  await expect(branch).toBeVisible({ timeout: 15_000 });
  await branch.click();
  await expect(page.getByRole('combobox', { name: 'Quick Input' })).toHaveAttribute('placeholder', 'Select a branch or tag to checkout');
});
