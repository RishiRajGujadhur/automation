import { test, expect } from '@playwright/test';

test('studio settings: port validation, tracing, dashboard stats, card memory and cache clearing', async ({ page, request }) => {
  const original = await (await request.get('/api/settings')).json();
  try {
    await page.goto('/#/dashboard');
    await expect(page.getByText('Repository indexed')).toBeVisible();

    // Collapsible card remembers its state across reloads.
    const toggle = page.getByRole('button', { name: 'Layers' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Layers' })).toHaveAttribute('aria-expanded', 'false');

    // Preferences: hide dashboard stats.
    await page.getByRole('button', { name: 'Preferences' }).click();
    const dialog = page.getByRole('dialog', { name: 'Preferences' });
    await dialog.getByRole('switch', { name: 'Show dashboard statistics' }).click();
    await expect(page.locator('.stat-grid')).toHaveCount(0);

    // Port validation (Formik + Yup) blocks bad values.
    const web = dialog.getByLabel('WEB UI PORT');
    const apiPort = dialog.getByLabel('API PORT');
    await web.fill('80');
    await web.blur();
    await expect(dialog.getByText(/Use 1024–65535/)).toBeVisible();
    await web.fill(String(original.webPort));
    await apiPort.fill(String(original.webPort));
    await apiPort.blur();
    await expect(dialog.getByText('Must differ from the web port.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save studio settings' })).toBeDisabled();
    await apiPort.fill(String(original.apiPort));

    // Tracing toggle with nested options; saving the same ports needs no restart.
    await dialog.getByRole('switch', { name: 'Record Playwright traces' }).click();
    await expect(dialog.getByRole('switch', { name: 'Screenshots' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Save studio settings' }).click();
    await expect(page.getByText('Settings saved.').first()).toBeVisible();
    expect((await (await request.get('/api/settings')).json()).tracing.enabled).toBe(true);

    // Clear cache (AlertDialog) resets UI state, including the collapsed card and stats preference.
    await dialog.getByRole('button', { name: 'Clear cache' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Clear cache' }).click();
    await page.waitForLoadState('load');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.goto('/#/dashboard');
    await expect(page.locator('.stat-grid')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Layers' })).toHaveAttribute('aria-expanded', 'true');
  } finally {
    await request.post('/api/settings', { data: { webPort: original.webPort, apiPort: original.apiPort, tracing: original.tracing } });
  }
});

test('feature editor full-screen toggle and compact header', async ({ page }) => {
  await page.goto('/#/features/editor');
  const header = page.getByRole('banner');
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(52);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Editor' })).toBeVisible();
  await page.getByRole('button', { name: 'Full screen editor' }).click();
  const editor = page.locator('.gherkin-editor');
  await expect(editor).toHaveClass(/is-fullscreen/);
  const box = (await editor.boundingBox())!;
  expect(box.height).toBeGreaterThan(900);
  await page.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(editor).not.toHaveClass(/is-fullscreen/);
});

test('Test Generator scenario text has Gherkin highlighting and autocomplete', async ({ page }) => {
  await page.goto('/#/test-generator');
  const scenario = page.getByLabel('Scenario text');
  await expect(scenario.locator('.ͼ1, [class*="ͼ"]').first()).toBeVisible();
  await expect(page.locator('.scenario-editor .cm-line span').first()).toBeVisible();
  await scenario.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nWhen the user search');
  await expect(page.locator('.cm-tooltip-autocomplete li').first()).toContainText('the user searches for');
});
