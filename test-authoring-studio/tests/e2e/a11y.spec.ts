import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// WCAG 2.0/2.1/2.2 A + AA rule sets (W3C WAI). CodeMirror's internal scroller is excluded only for
// "scrollable-region-focusable": its content element is the focus target.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = r.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join('\n    ')}`);
  expect(summary, `${name} has WCAG violations`).toEqual([]);
}

const pages: [string, string][] = [
  ['Dashboard', '/#/dashboard'],
  ['Test Generator', '/#/test-generator'],
  ['Feature editor', '/#/features/editor'],
  ['Scenario builder', '/#/features/builder'],
  ['Recorder', '/#/features/recorder'],
  ['Dictionary Inspector', '/#/dictionary-inspector'],
  ['Step Catalog', '/#/step-catalog'],
  ['Backgrounds', '/#/backgrounds'],
  ['Selectors', '/#/selectors'],
  ['Project Explorer', '/#/project-explorer'],
  ['Config', '/#/config'],
];
for (const [name, url] of pages) {
  test(`WCAG 2.2 AA: ${name}`, async ({ page }) => {
    await page.goto(url);
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.waitForTimeout(600);
    await audit(page, name);
  });
}

test('WCAG 2.2 AA: dialogs and menus', async ({ page }) => {
  await page.goto('/#/dashboard');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
  await page.waitForTimeout(300);
  await audit(page, 'Preferences dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Workspace settings' }).click();
  await page.waitForTimeout(300);
  await audit(page, 'Workspace settings dialog');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open studio menu' }).first().click();
  await expect(page.getByRole('menu', { name: 'Studio menu' })).toBeVisible();
  await page.waitForTimeout(250); // let the open animation finish so contrast is measured at rest
  await audit(page, 'Studio menu');
});

test('document structure: language, title, landmarks, one h1, skip link', async ({ page }) => {
  await page.goto('/#/test-generator');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page).toHaveTitle(/Test Generator · TestAuthoring Studio/);
  await expect(page.getByRole('banner')).toHaveCount(1);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await expect(page.locator('h1')).toHaveCount(1);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skip).toBeFocused();
  await skip.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});
