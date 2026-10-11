import { test, expect, type Page } from '@playwright/test';

// VS Code layout, auto save off (so Ctrl+S / the save icon are what write).
test.use({ storageState: { cookies: [], origins: [] } });
async function open(page: Page, prefs: Record<string, unknown> = {}) {
  await page.addInitScript((prefs) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off', ...prefs }));
    sessionStorage.setItem('seeded', '1');
  }, prefs);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
}
const read = (page: Page, file: string) => page.evaluate((f) => fetch(`/api/source?file=${encodeURIComponent(f)}`).then((r) => r.json()), file) as Promise<{ source: string; hash: string }>;
const restore = (page: Page, file: string, source: string) => page.evaluate(async ({ f, s }) => { const cur = await fetch(`/api/source?file=${encodeURIComponent(f)}`).then((r) => r.json()); await fetch('/api/file/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: f, source: s, baseHash: cur.hash }) }); }, { f: file, s: source });
const explorerFile = (page: Page, name: string) => page.getByRole('navigation').getByRole('button', { name, exact: true }).first();
const strip = (page: Page) => page.getByRole('group', { name: 'Open editors' });
const tab = (page: Page, name: string) => strip(page).locator('.editor-tab-label', { hasText: name });

test('editor tabs: open several files, switch, close (×, middle-click, Close Others), overflow arrows and list', async ({ page }) => {
  await open(page);
  for (const f of ['GoogleSearch.feature', 'Login.feature', 'SearchSteps.cs', 'AuthSteps.cs', 'Hooks.cs']) await explorerFile(page, f).click();
  await expect(strip(page).locator('.editor-tab')).toHaveCount(5);
  await expect(tab(page, 'Hooks.cs')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByLabel('Source of Support/Hooks.cs')).toBeVisible();

  // Switching keeps each editor: back to a feature tab shows the feature editor.
  await tab(page, 'Login.feature').click();
  await expect(page.locator('.gherkin-editor .cm-content')).toContainText('Feature:');
  await tab(page, 'SearchSteps.cs').click();
  await expect(page.getByLabel('Source of Steps/SearchSteps.cs')).toContainText('[Binding]');

  // Overflow: narrow window → arrows and the opened-editors list.
  await page.setViewportSize({ width: 900, height: 800 });
  await tab(page, 'GoogleSearch.feature').click();
  await expect(page.getByRole('button', { name: 'Show next tabs' })).toBeVisible();
  // Each click reveals the next hidden tab; the arrow goes away at the end.
  for (let i = 0; i < 5 && (await page.getByRole('button', { name: 'Show next tabs' }).isVisible()); i++) {
    await page.getByRole('button', { name: 'Show next tabs' }).click();
    await page.waitForTimeout(350);
  }
  await expect(tab(page, 'Hooks.cs')).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Show previous tabs' })).toBeVisible();
  await page.getByRole('button', { name: 'Show opened editors' }).click();
  await page.getByRole('menuitem', { name: 'Support/Hooks.cs' }).click();
  await expect(tab(page, 'Hooks.cs')).toHaveAttribute('aria-current', 'true');
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Close: ×, middle-click, context menu Close Others.
  await page.getByRole('button', { name: 'Close Hooks.cs' }).click();
  await expect(strip(page).locator('.editor-tab')).toHaveCount(4);
  await tab(page, 'AuthSteps.cs').click({ button: 'middle' });
  await expect(strip(page).locator('.editor-tab')).toHaveCount(3);
  await tab(page, 'Login.feature').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close Others' }).click();
  await expect(strip(page).locator('.editor-tab')).toHaveCount(1);
  // Tabs come back after a reload.
  await page.reload();
  await expect(strip(page).locator('.editor-tab')).toHaveCount(1);
  await expect(tab(page, 'Login.feature')).toHaveAttribute('aria-current', 'true');
});

test('Ctrl+S and the save icon write straight to disk (C# and feature files)', async ({ page }) => {
  await open(page);
  const cs = 'Steps/SearchSteps.cs', feature = 'Features/Auth/Login.feature';
  const [csOriginal, featureOriginal] = [(await read(page, cs)).source, (await read(page, feature)).source];
  try {
    await explorerFile(page, 'SearchSteps.cs').click();
    const editor = page.getByLabel(`Source of ${cs}`);
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n// saved with ctrl s');
    await expect(page.locator('.editor-tab.active')).toHaveClass(/unsaved/);
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await read(page, cs)).source).toContain('// saved with ctrl s');
    await expect(page.locator('.editor-tab.active')).not.toHaveClass(/unsaved/);

    await page.keyboard.type('\n// saved with the icon');
    await page.locator('.editor-tab-actions').getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(async () => (await read(page, cs)).source).toContain('// saved with the icon');

    await explorerFile(page, 'Login.feature').click();
    await page.locator('.gherkin-editor .cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n# saved directly');
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await read(page, feature)).source).toContain('# saved directly');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  } finally {
    await restore(page, cs, csOriginal);
    await restore(page, feature, featureOriginal);
  }
});

test('File ▸ Open Folder… opens a folder from disk in the browser (File System Access): explorer, edit, Ctrl+S', async ({ page }) => {
  // The browser's private file system stands in for the folder picker (same handle API, no dialog).
  await page.addInitScript(() => {
    (window as unknown as { showDirectoryPicker: () => Promise<FileSystemDirectoryHandle> }).showDirectoryPicker = async () => {
      const root = await navigator.storage.getDirectory();
      const dir = await root.getDirectoryHandle('LocalRepo', { create: true });
      const write = async (path: string, text: string) => {
        const parts = path.split('/');
        let d = dir;
        for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
        const f = await d.getFileHandle(parts.at(-1)!, { create: true });
        const w = await (f as unknown as { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
        await w.write(text);
        await w.close();
      };
      await write('Demo.csproj', '<Project Sdk="Microsoft.NET.Sdk"><ItemGroup><PackageReference Include="Reqnroll" Version="2.0.0" /></ItemGroup></Project>');
      await write('Features/Cart.feature', 'Feature: Cart\n  Scenario: Add\n    Given an empty cart\n');
      await write('Steps/CartSteps.cs', 'public class CartSteps\n{\n}\n');
      return dir;
    };
  });
  await open(page);
  await page.getByRole('button', { name: 'File menu' }).click();
  await page.getByRole('menuitem', { name: 'Open Folder…' }).click();
  await expect(page.getByRole('button', { name: /LocalRepo/ }).first()).toBeVisible();
  await expect(page.getByText(/Opened LocalRepo from your disk/).first()).toBeVisible();
  await expect(explorerFile(page, 'Cart.feature')).toBeVisible();

  await explorerFile(page, 'CartSteps.cs').click();
  const editor = page.getByLabel('Source of Steps/CartSteps.cs');
  await expect(editor).toContainText('public class CartSteps');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('// written in place');
  await page.keyboard.press('Control+s');
  await expect(page.locator('.editor-tab.active')).not.toHaveClass(/unsaved/);
  const onDisk = await page.evaluate(async () => {
    const dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('LocalRepo');
    return (await (await (await dir.getDirectoryHandle('Steps')).getFileHandle('CartSteps.cs')).getFile()).text();
  });
  expect(onDisk).toContain('// written in place');

  // Feature files of a browser folder open in a tab with Gherkin colouring.
  await explorerFile(page, 'Cart.feature').click();
  await expect(page.getByLabel('Source of Features/Cart.feature')).toContainText('Scenario: Add');

  await page.getByRole('button', { name: 'File menu' }).click();
  await page.getByRole('menuitem', { name: 'Close Folder' }).click();
  await expect(explorerFile(page, 'GoogleSearch.feature')).toBeVisible();
});
