import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// A brand-new web visitor starts with the editor; Basic mode remains available.
test.use({ storageState: { cookies: [], origins: [] } });

test('the editor is the default and Basic mode keeps it available', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'advanced');
  await expect(page).toHaveURL(/#\/features\/editor$/);
  const nav = page.getByRole('navigation', { name: 'Main', exact: true });
  await expect(nav.getByRole('button', { name: /Features/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /Dashboard/ })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /Test Generator/ })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: /Dictionary Inspector/ })).toHaveCount(0);

  await page.keyboard.press('Control+Shift+A');
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'basic');
  await expect(nav.getByRole('button', { name: /Features/ })).toBeVisible();
  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Pages' }).click();
  await page.getByRole('dialog').locator('#setting-workbench-pages-test-design').click();
  await page.keyboard.press('Escape');
  await expect(nav.getByRole('button', { name: 'Test Design' })).toBeVisible();
  await nav.getByRole('button', { name: 'Test Design' }).click();
  await expect(page).toHaveURL(/#\/test-design$/);
  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'General' }).click();
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
  await expect(dialog.getByRole('radio', { name: 'Advanced' })).toHaveAttribute('data-state', 'on');
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
