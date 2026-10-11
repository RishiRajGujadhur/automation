import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const langServer = path.resolve(import.meta.dirname, '../../langserver/bin/Release/net10.0/LangServer.dll');
test.skip(!existsSync(langServer), 'The C# language service is not built (npm run langserver:build).');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(300_000);

test('Test Explorer: discovers C# tests and scenarios, Run All, failure details with stack link, Run Failed, run one scenario', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-tests-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  const file = path.join(root, 'Tests/CalculatorTests.cs');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/\}\s*$/, '\n    [Test]\n    public void FailsOnPurpose()\n    {\n        Assert.That(1 + 1, Is.EqualTo(3));\n    }\n}\n'));
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('button', { name: 'Test Explorer' }).click();
    const te = page.getByRole('region', { name: 'Test Explorer' });
    const tree = te.getByRole('navigation', { name: 'Tests' });
    await expect(tree.locator('.t-label', { hasText: /Calculator\.Tests\.CalculatorTests/ })).toBeVisible({ timeout: 60_000 });
    await expect(tree.locator('.t-label', { hasText: /AddsCases.*2 cases/ })).toBeVisible();
    await expect(tree.locator('.t-label', { hasText: 'Add numbers' })).toBeVisible();
    await expect(tree.locator('.t-label', { hasText: /Add two numbers/ })).toBeVisible();

    await te.getByRole('button', { name: 'Run All Tests' }).click();
    const summary = te.getByRole('status');
    await expect(summary).toContainText('last run', { timeout: 240_000 });
    await expect(summary.getByTitle('Passed')).toHaveText('3'); // AddsTwoNumbers, AddsCases (2 cases), the scenario
    await expect(summary.getByTitle('Failed')).toHaveText('1');
    await expect(tree.locator('.t-label', { hasText: /FailsOnPurpose/ }).getByLabel('Failed')).toBeVisible();

    // Details: message and a stack trace line that opens the file.
    await tree.locator('.t-label', { hasText: /FailsOnPurpose/ }).click();
    const details = te.getByRole('region', { name: 'Test details' });
    await expect(details).toContainText('Expected: 3');
    await details.locator('.t-link').first().click();
    await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Tests/CalculatorTests.cs');

    // Run Failed reruns only the failing test.
    await te.getByRole('button', { name: 'Run Failed Tests' }).click();
    // "last run" is still shown from the first run: wait for the rerun itself (server status) to finish.
    const status = async () => (await (await request.get('/api/tests/run')).json()).status;
    await expect.poll(status, { timeout: 30_000, intervals: [200] }).toBe('running');
    await expect.poll(status, { timeout: 240_000, intervals: [1000] }).toBe('done');
    await expect(tree.locator('.t-label', { hasText: /FailsOnPurpose/ }).getByLabel('Failed')).toBeVisible();

    // Run one scenario from its context menu.
    await tree.locator('.t-label', { hasText: /Add two numbers/ }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Run', exact: true }).click();
    await expect(tree.locator('.t-label', { hasText: /Add two numbers/ }).getByLabel('Passed')).toBeVisible({ timeout: 240_000 });

    // Back to the Explorer.
    await page.getByRole('button', { name: 'Features (Explorer)' }).click();
    await expect(page.getByRole('region', { name: 'Explorer' })).toBeVisible();
  } finally {
    await request.post('/api/tests/cancel').catch(() => {});
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

test('Run glyphs in the editor margin: run a scenario from the feature editor and a test from the C# editor', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-glyphs-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\/](bin|obj)$/.test(s) });
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    await page.getByRole('navigation').getByRole('button', { name: 'Add.feature', exact: true }).first().click();
    const scenarioGlyph = page.locator('.gherkin-editor .cm-run[aria-label="Run Add two numbers"]');
    await expect(scenarioGlyph).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.gherkin-editor .cm-run[aria-label="Run Feature: Add numbers"]')).toBeVisible();
    const runStatus = async () => (await (await request.get('/api/tests/run')).json()).status;
    await scenarioGlyph.click();
    await expect.poll(runStatus, { timeout: 30_000, intervals: [200] }).toBe('running');
    await expect.poll(runStatus, { timeout: 240_000, intervals: [1000] }).toBe('done');
    await expect(scenarioGlyph).toHaveClass(/cm-run-passed/, { timeout: 30_000 });

    await page.getByRole('navigation').getByRole('button', { name: 'CalculatorTests.cs', exact: true }).first().click();
    const testGlyph = page.locator('.code-editor:not([hidden]) .cm-run[aria-label="Run AddsTwoNumbers"]');
    await expect(testGlyph).toBeVisible({ timeout: 60_000 });
    await testGlyph.click();
    await expect.poll(runStatus, { timeout: 30_000, intervals: [200] }).toBe('running');
    await expect.poll(runStatus, { timeout: 240_000, intervals: [1000] }).toBe('done');
    await expect(testGlyph).toHaveClass(/cm-run-passed/, { timeout: 30_000 });
    // The parameterized test kept its "not run" glyph (only the clicked test ran).
    await expect(page.locator('.code-editor:not([hidden]) .cm-run[aria-label="Run AddsCases"]')).toHaveClass(/cm-run-none/);
  } finally {
    await request.post('/api/tests/cancel').catch(() => {});
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
