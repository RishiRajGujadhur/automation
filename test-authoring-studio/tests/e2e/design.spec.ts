import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).exclude('.docs-preview').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`), `${name} has WCAG violations`).toEqual([]);
}
const tools = ['Examples generator', 'Logic & techniques', 'Step library', 'Suite optimizer', 'Flow generator', 'Impact & risk', 'Duplicates & smells', 'Results & flakiness', 'Plans & filters', 'Living docs', 'Similarity lab'];

test('every Test Design tool renders and passes WCAG 2.2 AA', async ({ page }) => {
  // Eleven axe audits: more than the default 30 s.
  test.setTimeout(120_000);
  await page.goto('/#/test-design');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  for (const name of tools) {
    await page.getByRole('tab', { name }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await page.waitForTimeout(500);
    await audit(page, `Test Design: ${name}`);
  }
});

test('Examples generator builds a pairwise Scenario Outline', async ({ page }) => {
  await page.goto('/#/test-design');
  await page.getByRole('tab', { name: 'Examples generator' }).click();
  await page.getByRole('button', { name: 'Generate Examples' }).click();
  const outline = page.getByLabel('Generated Scenario Outline');
  await expect(outline).toContainText('Scenario Outline: Checkout works across environments');
  await expect(outline).toContainText('| browser');
  await expect(page.getByText(/2-way coverage: 100%/)).toBeVisible();
});

test('turning an algorithm off removes it from the tools, Turn on restores it', async ({ page }) => {
  await page.goto('/#/test-design');
  await page.getByRole('tab', { name: 'Flow generator' }).click();
  await expect(page.getByText(/Transitions \d+\/\d+/)).toBeVisible();
  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('button', { name: 'Algorithms' }).click();
  await page.getByRole('button', { name: 'Customize' }).click();
  await page.locator('#algo-fsm-parse').click();
  await expect(page.getByText(/139 of 140 on/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText(/State-machine model is turned off/)).toBeVisible();
  await page.getByRole('button', { name: 'Turn on' }).first().click();
  await expect(page.getByText(/Transitions \d+\/\d+/)).toBeVisible();
});

test('settings search finds algorithms by what they do, with a tooltip', async ({ page }) => {
  await page.goto('/#/dashboard');
  await page.keyboard.press('Control+,');
  await page.getByRole('dialog').getByRole('searchbox').fill('phonetic');
  await expect(page.getByRole('heading', { name: 'Soundex About Soundex' })).toBeVisible();
  await page.getByRole('button', { name: 'About Soundex' }).focus();
  await expect(page.getByRole('tooltip')).toContainText('sound alike');
});
