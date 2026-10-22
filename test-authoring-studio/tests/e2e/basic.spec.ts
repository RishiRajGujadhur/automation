import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// A brand-new visitor: no stored preferences, so Basic mode is the default.
test.use({ storageState: { cookies: [], origins: [] } });

test('Basic mode is the default and shows essential navigation controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'basic');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('heading', { level: 1 })).toHaveText('Dashboard');
  const nav = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(nav.getByRole('button', { name: /Dashboard/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /Test Generator/ })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /Features/ })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /Dictionary Inspector/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open studio menu' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Playwright Recorder/ })).toBeVisible();
  // Wordmark is text only.
  await expect(page.locator('.brand svg')).toHaveCount(0);
  await expect(page.locator('.brand-word')).toHaveText('TestAuthoring Studio');

  // Alt+3 opens the recorder in Basic mode.
  await page.keyboard.press('Alt+3');
  await expect(page.getByRole('heading', { name: 'Playwright recorder', level: 1 })).toBeVisible();

  // An Advanced page reached by link explains itself and offers a way back or forward.
  await page.goto('/#/dictionary-inspector');
  await expect(page.getByText('is an Advanced page')).toBeVisible();
  await page.getByRole('button', { name: 'Switch to Advanced' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'advanced');
  await expect(nav.getByRole('button', { name: /Dictionary Inspector/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open studio menu' })).toBeVisible();

  // Ctrl/Cmd+Shift+A and Settings → General → Interface mode switch back.
  await page.locator('.page-heading h1').click();
  await page.keyboard.press('Control+Shift+A');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'basic');
  await expect(page.getByRole('radio', { name: 'Advanced mode' })).toHaveCount(0); // not on the toolbar any more
  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('radio', { name: 'Advanced' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'advanced');
  await page.keyboard.press('Escape');

  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
});

test('every accent is selectable and shows its contrast ratio', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  await expect(dialog.getByRole('radio', { name: 'Basic' })).toHaveAttribute('data-state', 'on');
  await dialog.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance' }).first().click();
  const group = dialog.getByRole('radiogroup', { name: 'Accent colour' });
  await expect(group.getByRole('radio')).toHaveCount(11);
  for (const id of ['indigo', 'cyan', 'green', 'orange', 'rose', 'pink', 'slate']) {
    await group.getByRole('radio', { name: id }).click();
    await expect(page.locator('html')).toHaveAttribute('data-accent', id);
  }
  await expect(group.getByRole('radio', { name: 'slate' })).toContainText(/\d+\.\d:1/);
  await dialog.getByRole('button', { name: 'Reset' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
});
