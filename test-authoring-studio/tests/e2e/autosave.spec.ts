import { test, expect, type Page } from '@playwright/test';

// VS Code layout with auto save after 300 ms. Each test restores the files it edits.
test.use({ storageState: { cookies: [], origins: [] } });
async function open(page: Page, prefs: Record<string, unknown>, codeFile?: string) {
  await page.addInitScript(({ prefs, codeFile }) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', ...prefs }));
    if (codeFile) { localStorage.setItem('tas:codeFile', JSON.stringify({ file: codeFile })); localStorage.setItem('tas:tab', '"Features"'); localStorage.setItem('tas:view', '"code"'); }
    sessionStorage.setItem('seeded', '1');
  }, { prefs, codeFile });
  await page.goto(codeFile ? '/#/features/code' : '/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
}
const read = (page: Page, file: string) => page.evaluate((f) => fetch(`/api/source?file=${encodeURIComponent(f)}`).then((r) => r.json()), file) as Promise<{ source: string; hash: string }>;
const restore = (page: Page, file: string, source: string) => page.evaluate(async ({ f, s }) => { const cur = await fetch(`/api/source?file=${encodeURIComponent(f)}`).then((r) => r.json()); await fetch('/api/file/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: f, source: s, baseHash: cur.hash }) }); }, { f: file, s: source });

test('C# editor: highlighting, Roslyn errors, auto save to disk', async ({ page }) => {
  const file = 'Steps/SearchSteps.cs';
  await open(page, { autoSave: 'afterDelay', autoSaveDelay: 300 }, file);
  const original = (await read(page, file)).source;
  try {
    const editor = page.getByLabel(`Source of ${file}`);
    await expect(editor).toContainText('[Binding]');
    await expect(page.locator('.code-editor .cm-content span').first()).toHaveClass(/ͼ/); // syntax colouring
    await editor.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n// added by test');
    await expect(page.locator('.save-state')).toHaveText(/Saved/, { timeout: 5000 });
    await expect.poll(async () => (await read(page, file)).source).toContain('// added by test');
    await page.keyboard.type('\npublic oops');
    await expect(page.locator('.code-editor .cm-lintRange-error').first()).toBeVisible({ timeout: 8000 });
  } finally {
    await restore(page, file, original);
  }
});

test('auto save never overwrites a file changed outside the studio', async ({ page }) => {
  const r = await page.request.post('/api/file/save', { data: { file: 'Steps/SearchSteps.cs', source: 'x', baseHash: 'stale' } });
  expect(r.status()).toBe(409);
});

test('unsaved edits are kept and offered back (hot exit) when auto save is off', async ({ page }) => {
  await open(page, { autoSave: 'off' });
  await page.getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  const editor = page.locator('.gherkin-editor .cm-content');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('# kept across sessions');
  await page.waitForTimeout(400);
  page.on('dialog', (d) => d.accept());
  // Same browser session (reload): the buffer comes straight back, like VS Code's hot exit.
  await page.reload();
  await expect(editor).toContainText('# kept across sessions');
  // A later session: the kept edits are offered back.
  await page.evaluate(() => sessionStorage.removeItem('tas:session-edits'));
  await page.reload();
  await expect(page.getByText(/Unsaved changes to Features\/Auth\/Login.feature/)).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(editor).toContainText('# kept across sessions');
  const disk = await read(page, 'Features/Auth/Login.feature');
  expect(disk.source).not.toContain('# kept across sessions');
});
