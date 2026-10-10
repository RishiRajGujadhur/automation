import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('Guide me visits each workflow, supports Back and restart, and restores the previous view', async ({
  page,
}) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.method() === 'POST' && /generation|recording\/start/.test(r.url())) writes.push(r.url());
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Guide me' })).toBeEnabled();
  await expect(page.getByText('JD', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Builder', exact: true }).click();
  await page.getByLabel('SCENARIO NAME').fill('Keep my draft');
  await page.getByRole('button', { name: 'Guide me' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to TestAuthoring Studio' }),
  ).toBeVisible();
  await page.getByRole('button', { name: /^Next [(]/ }).click();
  await expect(page.getByRole('heading', { name: '1. Connect your .NET project' })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to TestAuthoring Studio' }),
  ).toBeVisible();
  for (const title of [
    '1. Connect your .NET project',
    '2. Explore your feature folders',
    '3. Create a feature in the right place',
    '4. Reuse existing step definitions',
    '5. Reuse a background',
    '6. Check existing selectors',
    '7. Assemble your scenario',
    '8. Record a browser workflow',
    '9. Review matches and proposals',
    '10. Validate and review before saving',
  ]) {
    await page.getByRole('button', { name: /^Next [(]/ }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('floater')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: 'test-results/studio-guide.png' });
  await page.getByRole('button', { name: 'Finish tour', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Scenario builder', exact: true })).toBeVisible();
  await expect(page.getByLabel('SCENARIO NAME')).toHaveValue('Keep my draft');
  await page.getByRole('button', { name: 'Guide me' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to TestAuthoring Studio' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'End tour', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Welcome to TestAuthoring Studio' })).toHaveCount(
    0,
  );
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test('nested feature search preserves ancestry and new drafts use the selected folder', async ({
  page,
  request,
}) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-folders-'));
  try {
    for (const [file, name] of [
      ['Features/Payroll/Salary/Create.feature', 'Create salary'],
      ['Features/Payroll/Bonus/Create.feature', 'Create bonus'],
      ['Features/Auth/Login.feature', 'Sign in'],
    ]) {
      const target = path.join(temp, file);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, `Feature: ${name}\n  Scenario: Example\n    Given a user\n`);
    }
    expect((await request.post('/api/workspace', { data: { repositoryRoot: temp } })).ok()).toBe(
      true,
    );
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Create.feature', exact: true })).toHaveCount(2);
    await page
      .getByRole('button', { name: 'Collapse folder Features/Payroll', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Create.feature', exact: true })).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Search features' }).fill('payroll salary');
    await expect(
      page.getByRole('button', { name: 'Collapse folder Features/Payroll/Salary', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create.feature', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'Create.feature', exact: true }).click();
    await page.getByRole('button', { name: 'Editor', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Features/Payroll/Salary/Create.feature', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'New feature in Features/Payroll/Salary', exact: true })
      .click();
    await expect(page.getByLabel('FEATURE FILE')).toHaveValue(
      'Features/Payroll/Salary/NewFeature.feature',
    );
    await page
      .getByLabel('FEATURE FILE')
      .fill('Features/Payroll/Salary/Adjustments/NewSalary.feature');
    await page.getByRole('button', { name: 'Create draft', exact: true }).click();
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await expect(
      page
        .getByText('Features/Payroll/Salary/Adjustments/NewSalary.feature', { exact: true })
        .last(),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Approve and write file' }).click();
    await expect(
      page.getByRole('button', { name: 'NewSalary.feature', exact: true }),
    ).toBeVisible();
    expect(
      await fs.readFile(
        path.join(temp, 'Features/Payroll/Salary/Adjustments/NewSalary.feature'),
        'utf8',
      ),
    ).toContain('Feature:');
    await page.getByRole('textbox', { name: 'Search features' }).fill('no-such-feature');
    await expect(page.getByText('No features match your search.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear feature search' }).click();
    await expect(page.getByRole('button', { name: 'Login.feature', exact: true })).toBeVisible();
  } finally {
    await request.post('/api/workspace', { data: previous });
    if (
      path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) ||
      !path.basename(temp).startsWith('studio-folders-')
    )
      throw new Error('Unexpected cleanup path');
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test('mobile users can open the explorer and take or dismiss the tour', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Guide me' })).toBeEnabled();
  await page.getByRole('button', { name: 'Toggle feature explorer' }).click();
  await expect(page.getByRole('textbox', { name: 'Search features' })).toBeVisible();
  await page.getByRole('button', { name: 'Login.feature', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Search features' })).not.toBeVisible();
  await page.getByRole('button', { name: 'Guide me' }).click();
  for (const title of [
    '1. Connect your .NET project',
    '2. Explore your feature folders',
    '3. Create a feature in the right place',
  ]) {
    await page.getByRole('button', { name: /^Next [(]/ }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByTestId('floater')).toHaveCSS('opacity', '1');
  const tooltip = await page.locator('.react-joyride__tooltip').boundingBox();
  expect(tooltip!.x).toBeGreaterThanOrEqual(8);
  expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(382);
  await page.screenshot({ path: 'test-results/studio-guide-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('heading', { name: '3. Create a feature in the right place' }),
  ).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
