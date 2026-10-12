import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The default experience: VS Code layout and the Essentials algorithm preset.
test.use({ storageState: { cookies: [], origins: [] } });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).exclude('.docs-preview').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`), `${name} has WCAG violations`).toEqual([]);
}
async function advanced(page: Page, hash = '/#/dashboard') {
  await page.addInitScript(() => { if (!localStorage.getItem('tas:prefs')) localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); });
  await page.goto(hash);
  await expect(page.getByText('Repository indexed')).toBeVisible();
}

test('VS Code layout is the default: activity bar, slim title bar, no page scroll', async ({ page }) => {
  await advanced(page, '/#/features/editor');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'vscode');
  const bar = page.getByRole('navigation', { name: 'Main' });
  await expect(bar.getByRole('button', { name: 'Test Design' })).toBeVisible();
  await expect(page.locator('.main-nav')).toHaveCount(0);
  const header = await page.locator('.app-header').boundingBox();
  expect(header!.height).toBeLessThanOrEqual(40);
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(overflow).toBeLessThanOrEqual(1);
  const editor = await page.locator('.gherkin-editor .cm-editor').boundingBox();
  expect(editor!.height).toBeGreaterThan(600); // viewport is 1000px tall
});

test('activity bar navigates; Features toggles the explorer like VS Code', async ({ page }) => {
  await advanced(page);
  const bar = page.getByRole('navigation', { name: 'Main' });
  await bar.getByRole('button', { name: 'Test Design' }).click();
  await expect(page).toHaveURL(/#\/test-design/);
  await expect(bar.getByRole('button', { name: 'Test Design' })).toHaveAttribute('aria-current', 'page');
  const features = bar.getByRole('button', { name: 'Features (Explorer)' });
  await features.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'true');
  await features.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'false');
  await page.getByRole('button', { name: /Search pages, commands and steps/ }).click();
  await expect(page.locator('[cmdk-input]')).toBeVisible();
});

test('short windows move extra pages into a ☰ overflow menu; nothing is cut off', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 560 });
  await advanced(page);
  const bar = page.getByRole('navigation', { name: 'Main' });
  const more = bar.getByRole('button', { name: /^More pages \(\d+\)$/ });
  await expect(more).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  for (const b of await bar.locator('.activity-item').all()) { const box = (await b.boundingBox())!; expect(box.y + box.height).toBeLessThanOrEqual(barBox.y + barBox.height + 1); }
  await more.click();
  await page.getByRole('menuitem', { name: 'Project Explorer' }).click();
  await expect(page).toHaveURL(/#\/project-explorer/);
  await expect(bar.getByRole('button', { name: 'Project Explorer' })).toHaveAttribute('aria-current', 'page'); // the active page stays visible
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(more).toHaveCount(0);
});

test('WCAG 2.2 AA in the VS Code layout', async ({ page }) => {
  await advanced(page);
  for (const hash of ['#/dashboard', '#/features/editor', '#/test-generator', '#/test-design', '#/step-catalog']) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(700);
    await audit(page, `VS Code layout ${hash}`);
  }
});

test('Essentials preset by default; switches are locked until Custom', async ({ page }) => {
  await advanced(page);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Algorithms' }).click();
  await expect(page.getByRole('combobox', { name: 'Algorithm preset' })).toContainText('Essentials');
  await expect(page.locator('#algo-genetic')).toBeDisabled();
  await expect(page.locator('#algo-genetic')).toHaveAttribute('data-state', 'unchecked');
  await page.getByRole('combobox', { name: 'Algorithm preset' }).click();
  await page.getByRole('option', { name: 'Everything' }).click();
  await expect(page.locator('#algo-genetic')).toHaveAttribute('data-state', 'checked');
  await expect(page.getByText(/140 of 140 on/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Algorithm preset' }).click();
  await page.getByRole('option', { name: 'Custom' }).click();
  await expect(page.locator('#algo-genetic')).toBeEnabled();
  await expect(page.locator('#algo-genetic')).toHaveAttribute('data-state', 'checked'); // started from Everything
  await page.locator('#algo-genetic').click();
  await expect(page.getByText(/139 of 140 on/)).toBeVisible();
});

test('Classic layout is still available from Appearance', async ({ page }) => {
  await advanced(page);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('radio', { name: 'Classic' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'classic');
  await expect(page.locator('.main-nav')).toBeVisible();
});

test('Test Generator: project model hidden by default, shown from Settings → General; no redundant step titles', async ({ page }) => {
  await advanced(page, '/#/test-generator');
  await expect(page.locator('.generator-sidebar')).toHaveCount(0);
  await expect(page.locator('.wizard-title').first()).toHaveClass(/sr-only/);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.locator('#pref-project-model').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.generator-sidebar')).toBeVisible();
});

test('Build and Debug windows share one bottom panel with tabs', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); localStorage.setItem('tas:buildOpen', 'true'); localStorage.setItem('tas:debugOpen', 'true'); localStorage.setItem('tas:dockTab', '"build"'); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  const tabs = page.getByRole('tablist', { name: 'Panel' });
  await expect(tabs.getByRole('tab', { name: 'Build' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Build' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Debugger' })).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Debug' }).click();
  await expect(page.getByRole('region', { name: 'Debugger' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Build' })).toHaveCount(0);
  // Closing one window leaves the other without the tab strip.
  await page.getByRole('region', { name: 'Debugger' }).getByRole('button', { name: /close/i }).first().click();
  await expect(tabs).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Build' })).toBeVisible();
});
