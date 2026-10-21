import { test, expect, type Page } from '@playwright/test';

// Workbench ease-of-use improvements in the style of Visual Studio 2026 and VS Code (GUI-QOL.md).
test.use({ storageState: { cookies: [], origins: [] } });

async function open(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
}
/** Opens the Structure tool window in the panel. */
async function structure(page: Page) {
  await page.getByLabel('Source of Steps/AuthSteps.cs').click();
  await page.keyboard.press('Alt+7');
  const dock = page.locator('.dock');
  await expect(dock).toBeVisible();
  return dock;
}

test('G1 Resize the panel with its sash; remembered; double-click resets', async ({ page }) => {
  await open(page);
  const dock = await structure(page);
  const before = (await dock.boundingBox())!.height;
  const sash = page.getByRole('separator', { name: 'Resize panel' });
  const s = (await sash.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2, s.y - 200, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await dock.boundingBox())!.height).toBeGreaterThan(before + 150);
  // The editors make room: they end where the panel starts.
  const editor = (await page.locator('.editor-split').boundingBox())!;
  expect(editor.y + editor.height).toBeLessThanOrEqual((await dock.boundingBox())!.y + 2);
  const grown = (await dock.boundingBox())!.height;
  // Remembered.
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  const dock2 = await structure(page);
  await expect.poll(async () => Math.round((await dock2.boundingBox())!.height)).toBe(Math.round(grown));
  // Keyboard: arrow up grows it by 20 px; double-click goes back to the default.
  await page.getByRole('separator', { name: 'Resize panel' }).focus();
  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => Math.round((await dock2.boundingBox())!.height)).toBe(Math.round(grown) + 20);
  await page.getByRole('separator', { name: 'Resize panel' }).dblclick();
  await expect.poll(async () => Math.round((await dock2.boundingBox())!.height)).toBe(Math.round(before));
});

test('G2 Maximize Panel Size and restore', async ({ page }) => {
  await open(page);
  const dock = await structure(page);
  const before = (await dock.boundingBox())!.height;
  await page.getByRole('button', { name: 'Maximize Panel Size' }).click();
  await expect(page.locator('.editor-split')).toBeHidden();
  expect((await dock.boundingBox())!.height).toBeGreaterThan(before + 300);
  await expect(page.getByRole('separator', { name: 'Resize panel' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Restore Panel Size' }).click();
  await expect(page.locator('.editor-split')).toBeVisible();
  await expect.poll(async () => Math.round((await dock.boundingBox())!.height)).toBe(Math.round(before));
});
