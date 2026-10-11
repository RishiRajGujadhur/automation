import { test, expect, type Page } from '@playwright/test';

const read = (page: Page, file: string) => page.evaluate((f) => fetch(`/api/source?file=${encodeURIComponent(f)}`).then((r) => r.json()), file) as Promise<{ source: string; hash: string }>;
const restore = (page: Page, file: string, source: string) => page.evaluate(async ({ f, s }) => { const cur = await fetch(`/api/source?file=${encodeURIComponent(f)}`).then((r) => r.json()); await fetch('/api/file/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: f, source: s, baseHash: cur.hash }) }); await fetch('/api/scan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }, { f: file, s: source });

test('create a step definition for an unbound step, then land on it in the C# editor', async ({ page }) => {
  await page.goto('/#/test-generator');
  await page.getByRole('tab', { name: /Step 1: Scenario steps/ }).click();
  const original = (await read(page, 'Steps/AuthSteps.cs')).source;
  try {
    await page.locator('.step-lint .create-step').first().click();
    const dialog = page.getByRole('dialog', { name: 'Create step definition' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Existing step file' }).click();
    await page.getByRole('option', { name: 'Steps/AuthSteps.cs' }).click();
    await dialog.getByRole('button', { name: 'Preview' }).click();
    await expect(dialog.getByText('PendingStepException').first()).toBeVisible();
    await dialog.getByRole('button', { name: /Approve and write/ }).click();
    await expect(page.locator('.code-editor')).toBeVisible();
    await expect(page.locator('.code-editor .editor-file')).toHaveText('Steps/AuthSteps.cs');
    await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toContainText('throw new PendingStepException();');
    expect((await read(page, 'Steps/AuthSteps.cs')).source).toContain('PendingStepException');
  } finally {
    await restore(page, 'Steps/AuthSteps.cs', original);
  }
});

test('F12 on a step opens its C# definition; the Step definitions menu lists linked files', async ({ page }) => {
  await page.goto('/#/features/editor');
  await page.getByRole('button', { name: 'GoogleSearch.feature', exact: true }).first().click();
  await page.getByRole('button', { name: 'Step definitions' }).click();
  await expect(page.getByRole('menuitem', { name: /Steps\/SearchSteps.cs \(\d+\)/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('.gherkin-editor .cm-line', { hasText: 'the user searches for' }).first().click();
  await page.keyboard.press('F12');
  await expect(page.locator('.code-editor .editor-file')).toHaveText('Steps/SearchSteps.cs');
});
