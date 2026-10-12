import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Installs a small real package from nuget.org into a copy of the Calculator sample (needs network access).
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(240_000);

test('Manage NuGet Packages: installed list, browse nuget.org, install a version, uninstall', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-nuget-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\\/](bin|obj)$/.test(s) });
  const csproj = () => fs.readFile(path.join(root, 'Calculator.csproj'), 'utf8');
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await expect(page.getByText('Repository indexed')).toBeVisible();
    // From the project's context menu in the Explorer.
    await page.getByRole('button', { name: 'Collapse project Calculator' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Manage NuGet Packages…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Manage NuGet Packages' });
    await expect(dialog.getByRole('list', { name: 'Installed packages' })).toContainText('SpecFlow.NUnit');

    await dialog.getByRole('tab', { name: 'Browse' }).click();
    await dialog.getByLabel('Search nuget.org').fill('Humanizer.Core');
    await dialog.getByRole('list', { name: 'Search results' }).getByRole('button', { name: /^Humanizer\.Core/ }).first().click();
    const details = dialog.getByRole('region', { name: 'Package details' });
    await expect(details.getByLabel('Version')).toHaveValue(/^\d+\.\d+/);
    await details.getByLabel('Version').selectOption('2.14.1');
    await details.getByRole('button', { name: 'Install' }).click();
    await expect(page.getByText('Humanizer.Core 2.14.1 installed.').first()).toBeVisible({ timeout: 180_000 });
    expect(await csproj()).toMatch(/<PackageReference Include="Humanizer.Core" Version="2.14.1" \/>/);

    await dialog.getByRole('tab', { name: /^Installed/ }).click();
    await dialog.getByRole('list', { name: 'Installed packages' }).getByRole('button', { name: /^Humanizer\.Core/ }).click();
    await details.getByRole('button', { name: 'Uninstall' }).click();
    await page.getByRole('button', { name: 'Uninstall', exact: true }).last().click();
    await expect(page.getByText('Humanizer.Core uninstalled.').first()).toBeVisible({ timeout: 120_000 });
    expect(await csproj()).not.toContain('Humanizer.Core');
  } finally {
    await request.post('/api/workspace', { data: { ...previous, solution: '' } });
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
