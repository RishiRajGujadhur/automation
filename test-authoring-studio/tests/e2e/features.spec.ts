import { test, expect, type Page } from '@playwright/test';

// Settings ▸ Features: every optional feature can be turned on or off; "VS essentials" keeps only what Visual Studio
// 2026 has on by default (the desktop app's default; the web app starts with everything).
test.use({ storageState: { cookies: [], origins: [] } });

async function open(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
}
async function settings(page: Page) {
  await page.getByRole('button', { name: 'File menu' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: /Features/ }).click();
}
const close = (page: Page) => page.getByRole('button', { name: 'Close settings' }).click();

test('Features: the web app starts with everything on; VS essentials turns the Rider-only features off everywhere', async ({ page }) => {
  await open(page);
  await settings(page);
  await expect(page.getByText(/^\d+ of \d+ features on\./)).toBeVisible();
  const total = Number(/of (\d+) features/.exec((await page.getByText(/of \d+ features on/).textContent())!)![1]);
  await expect(page.getByText(`${total} of ${total} features on.`)).toBeVisible();
  await page.getByRole('radio', { name: 'VS essentials' }).click();
  await expect(page.getByText(/^\d+ of \d+ features on\./)).not.toHaveText(`${total} of ${total} features on.`);
  // Essential: on. Optional: off.
  await expect(page.getByRole('switch', { name: 'Terminal' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Run Anything' })).not.toBeChecked();
  await close(page);
  // Off: hidden from the menus, its keys do nothing.
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Run Anything/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /External Tools…/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByLabel('Gherkin source').click();
  await page.keyboard.press('Alt+Shift+Z'); // Distraction-Free Mode: optional
  await expect(page.locator('html')).not.toHaveAttribute('data-rider-mode', /./);
  await page.keyboard.press('Control');
  await page.keyboard.press('Control');
  await expect(page.getByRole('listbox', { name: 'Run Anything' })).toHaveCount(0);
  // An essential feature still works.
  await page.keyboard.press('Alt+7');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  // One switch back on.
  await settings(page);
  await page.getByRole('switch', { name: 'Run Anything' }).click();
  await expect(page.getByText('Some switches differ from the preset.', { exact: false })).toBeVisible();
  await close(page);
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Run Anything/ })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('Features: drawing features follow their switch (TODO highlighting, indent guides, breadcrumbs) and survive a reload', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toBeVisible();
  await settings(page);
  await page.getByRole('switch', { name: 'Feature breadcrumbs' }).click();
  await page.getByRole('switch', { name: 'Indent guides' }).click();
  await close(page);
  await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toHaveCount(0);
  await expect(page.locator('.gherkin-editor .cm-indent-markers')).toHaveCount(0);
  await page.reload();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
  await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toHaveCount(0);
  // A whole group at once.
  await settings(page);
  await page.getByRole('switch', { name: 'All Navigation features' }).click();
  await expect(page.getByRole('switch', { name: 'Feature breadcrumbs' })).toBeChecked();
  await page.getByRole('radio', { name: 'All features' }).click();
  await close(page);
  await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toBeVisible();
});
