import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];
const prefs = (theme: string, extra: Record<string, unknown> = {}) => (p: Page) =>
  p.addInitScript(([t, x]) => localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', theme: t, ...x })), [theme, extra] as const);

for (const [theme, editorBackground] of Object.entries({
  monokai: 'rgb(39, 40, 34)',
  'monokai-machine': 'rgb(31, 37, 44)',
  'monokai-octagon': 'rgb(40, 36, 51)',
  'monokai-ristretto': 'rgb(48, 43, 42)',
  'monokai-spectrum': 'rgb(24, 25, 27)',
  'monokai-light': 'rgb(255, 253, 248)',
})) {
  test(`Monokai inspired theme ${theme} styles the workspace and editor`, async ({ page }) => {
    await prefs(theme)(page);
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect.poll(() => page.locator('.gherkin-editor .cm-editor').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(editorBackground);
    const logoMask = await page.locator('.brand').evaluate((el) => getComputedStyle(el, '::before').maskImage);
    expect(logoMask).toContain('logo-mark.svg');
    await page.keyboard.press('Control+,');
    await page.getByRole('dialog', { name: 'Preferences' }).getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance' }).click();
    await expect(page.getByRole('dialog').getByRole('radiogroup', { name: 'App theme' }).getByRole('radio', { checked: true })).toContainText('Monokai Inspired');
    const accessibility = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(accessibility.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => `${node.target.join(' ')} ${node.failureSummary}`).join(', ')}`)).toEqual([]);
  });
}

for (const theme of ['light', 'matrix', 'midnight', 'nord']) {
  test(`theme "${theme}" meets WCAG 2.2 AA on key pages`, async ({ page }) => {
    await prefs(theme)(page);
    for (const url of ['/#/dashboard', '/#/test-generator', '/#/features/editor', '/#/dictionary-inspector']) {
      await page.goto(url);
      await expect(page.getByText('Repository indexed')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.waitForTimeout(500);
      const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
      const v = r.violations.map((x) => `${x.id}: ${x.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' → ' + (n.failureSummary ?? '').replace(/\s+/g, ' ').slice(40, 150)).join(' || ')}`);
      expect(v, `${theme} ${url}`).toEqual([]);
    }
    await page.keyboard.press('Control+,');
    await page.waitForTimeout(300);
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(r.violations.map((x) => x.id + ' ' + x.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')), `${theme} settings`).toEqual([]);
  });
}

test('theme picker, editor theme, accent logo and native scrollbars', async ({ page }) => {
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  // Accent drives the logo and the scrollbar colour.
  await page.keyboard.press('Control+,');
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  const nav = dialog.getByRole('navigation', { name: 'Settings categories' });
  await nav.getByRole('button', { name: 'Appearance' }).click();
  await dialog.getByRole('radio', { name: 'teal' }).click();
  const logo = await page.locator('.brand-accent').evaluate((el) => getComputedStyle(el).color);
  expect(logo).toBe('rgb(95, 212, 196)'); // wordmark and vector mark use the teal accent #5fd4c4
  const scroll = await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor);
  // Chromium reports scrollbar-color as color(srgb r g b / a); #5fd4c4 = 0.3725 0.8314 0.7686.
  expect(scroll).toMatch(/95, 212, 196|5fd4c4|0\.37\d* 0\.83\d* 0\.76/i);
  // App theme: Matrix.
  await dialog.getByRole('radio', { name: /Matrix/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'matrix');
  await expect(dialog.getByRole('radio', { name: /Matrix/ })).toHaveAttribute('aria-checked', 'true');
  // Editor theme follows the app theme ("Automatic") and can be overridden.
  await nav.getByRole('button', { name: 'Code editor' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Editor theme' })).toContainText('Automatic (Matrix)');
  await dialog.getByRole('combobox', { name: 'Editor theme' }).click();
  await page.getByRole('option', { name: 'Dracula' }).click();
  await expect(dialog.getByText('Dracula · ThemeMirror')).toBeVisible();
  await page.keyboard.press('Escape');
  const bg = await page.locator('.gherkin-editor .cm-editor').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(45, 47, 63)'); // Dracula background #2d2f3f
});
