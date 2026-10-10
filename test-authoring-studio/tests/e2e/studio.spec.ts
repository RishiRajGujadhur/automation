import { test, expect } from '@playwright/test';
test('catalog to builder to validated diff; recording matches require acceptance', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Playwright recorder', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('button', { name: 'Accept match', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Apply to editor' })).toBeEnabled();
  await page.getByRole('button', { name: 'Apply to editor' }).click();
  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  await expect(page.getByText('Syntax is valid.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve and write file' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: /Step Catalog/ }).click();
  await page.getByRole('textbox', { name: 'Search Step Catalog' }).fill('the user searches');
  await page.getByRole('button', { name: 'Add to scenario' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill('Playwright');
  await page.getByRole('button', { name: 'Add existing step', exact: true }).click();
  await page.getByRole('button', { name: 'Features', exact: true }).click();
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Step 1 text' })).toHaveValue(
    'the user searches for "Playwright"',
  );
  expect(errors).toEqual([]);
});
test('responsive recorder and local service', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.getByText('Example recording', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: 'Playwright recorder', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/studio-mobile.png', fullPage: true });
  const response = await request.get('/api/workspace');
  expect(response.ok()).toBe(true);
  expect((await response.json()).index.features.length).toBe(2);
});
test('unmatched action produces a reviewable scaffold and outline examples remain editable', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Click element/ }).click();
  await expect(page.getByText('A new capability may be needed')).toBeVisible();
  await page.getByRole('button', { name: 'Propose a step' }).click();
  await page.getByRole('button', { name: 'Preview C# scaffold' }).click();
  await expect(page.getByText('Generated/RecordedWorkflowSteps.cs', { exact: true })).toBeVisible();
  await expect(page.getByText(/No verified accessible target/)).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Scenario Outline with examples' }).check();
  await expect(page.getByRole('textbox', { name: 'EXAMPLES TABLE' })).toBeVisible();
});
