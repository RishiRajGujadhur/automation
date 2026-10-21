import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The default experience: VS Code layout and the Essentials algorithm preset.
test.use({ storageState: { cookies: [], origins: [] } });
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
async function audit(page: Page, name: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).exclude('.docs-preview').analyze();
  expect(r.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`), `${name} has WCAG violations`).toEqual([]);
}
async function advanced(page: Page, hash = '/#/dashboard') {
  await page.addInitScript(() => { if (!localStorage.getItem('tas:prefs')) localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); });
  await page.goto(hash);
  await expect(page.getByText('Repository indexed')).toBeVisible();
}

test('VS Code layout is the default: activity bar, slim title bar, no page scroll', async ({ page }) => {
  await advanced(page, '/#/features/editor');
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'vscode');
  const bar = page.getByRole('navigation', { name: 'Main' });
  await expect(bar.getByRole('button', { name: 'Test Design' })).toBeVisible();
  await expect(page.locator('.main-nav')).toHaveCount(0);
  const header = await page.locator('.app-header').boundingBox();
  expect(header!.height).toBeLessThanOrEqual(40);
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(overflow).toBeLessThanOrEqual(1);
  const editor = await page.locator('.gherkin-editor .cm-editor').boundingBox();
  expect(editor!.height).toBeGreaterThan(600); // viewport is 1000px tall
});

test('activity bar navigates; Features toggles the explorer like VS Code', async ({ page }) => {
  await advanced(page);
  const bar = page.getByRole('navigation', { name: 'Main' });
  await bar.getByRole('button', { name: 'Test Design' }).click();
  await expect(page).toHaveURL(/#\/test-design/);
  await expect(bar.getByRole('button', { name: 'Test Design' })).toHaveAttribute('aria-current', 'page');
  const features = bar.getByRole('button', { name: 'Features (Explorer)' });
  await features.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'true');
  await features.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'false');
  // VS Code's command center (VSCODE-250.md W45): Quick Open.
  await page.getByRole('group', { name: 'Command Center' }).getByRole('button', { name: /^Search .*Ctrl\+P/ }).click();
  await expect(page.getByRole('combobox', { name: 'Quick Input' })).toBeVisible();
});

test('short windows move extra pages into a ☰ overflow menu; nothing is cut off', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 560 });
  await advanced(page);
  const bar = page.getByRole('navigation', { name: 'Main' });
  const more = bar.getByRole('button', { name: /^More pages \(\d+\)$/ });
  await expect(more).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  for (const b of await bar.locator('.activity-item').all()) { const box = (await b.boundingBox())!; expect(box.y + box.height).toBeLessThanOrEqual(barBox.y + barBox.height + 1); }
  await more.click();
  await page.getByRole('menuitem', { name: 'Project Explorer' }).click();
  await expect(page).toHaveURL(/#\/project-explorer/);
  await expect(bar.getByRole('button', { name: 'Project Explorer' })).toHaveAttribute('aria-current', 'page'); // the active page stays visible
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(more).toHaveCount(0);
});

test('WCAG 2.2 AA in the VS Code layout', async ({ page }) => {
  await advanced(page);
  for (const hash of ['#/dashboard', '#/features/editor', '#/test-generator', '#/test-design', '#/step-catalog']) {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForTimeout(700);
    await audit(page, `VS Code layout ${hash}`);
  }
});

test('Essentials preset by default; switches are locked until Custom', async ({ page }) => {
  await advanced(page);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Algorithms' }).click();
  await expect(page.getByRole('combobox', { name: 'Algorithm preset' })).toContainText('Essentials');
  await expect(page.locator('#algo-genetic')).toBeDisabled();
  await expect(page.locator('#algo-genetic')).toHaveAttribute('data-state', 'unchecked');
  await page.getByRole('combobox', { name: 'Algorithm preset' }).click();
  await page.getByRole('option', { name: 'Everything' }).click();
  await expect(page.locator('#algo-genetic')).toHaveAttribute('data-state', 'checked');
  await expect(page.getByText(/140 of 140 on/)).toBeVisible();
  await page.getByRole('combobox', { name: 'Algorithm preset' }).click();
  await page.getByRole('option', { name: 'Custom' }).click();
  await expect(page.locator('#algo-genetic')).toBeEnabled();
  await expect(page.locator('#algo-genetic')).toHaveAttribute('data-state', 'checked'); // started from Everything
  await page.locator('#algo-genetic').click();
  await expect(page.getByText(/139 of 140 on/)).toBeVisible();
});

test('Classic layout is still available from Appearance', async ({ page }) => {
  await advanced(page);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Appearance' }).click();
  await page.getByRole('radio', { name: 'Classic' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-layout', 'classic');
  await expect(page.locator('.main-nav')).toBeVisible();
});

test('Test Generator: project model hidden by default, shown from Settings → General; no redundant step titles', async ({ page }) => {
  await advanced(page, '/#/test-generator');
  await expect(page.locator('.generator-sidebar')).toHaveCount(0);
  await expect(page.locator('.wizard-title').first()).toHaveClass(/sr-only/);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await page.locator('#pref-project-model').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.generator-sidebar')).toBeVisible();
});

test('Build and Debug windows share one bottom panel with tabs', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); localStorage.setItem('tas:buildOpen', 'true'); localStorage.setItem('tas:debugOpen', 'true'); localStorage.setItem('tas:dockTab', '"build"'); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  const tabs = page.getByRole('tablist', { name: 'Panel' });
  await expect(tabs.getByRole('tab', { name: 'Build' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('region', { name: 'Build' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Debugger' })).toHaveCount(0);
  await tabs.getByRole('tab', { name: 'Debug' }).click();
  await expect(page.getByRole('region', { name: 'Debugger' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Build' })).toHaveCount(0);
  // Closing one window leaves the other without the tab strip.
  await page.getByRole('region', { name: 'Debugger' }).getByRole('button', { name: /close/i }).first().click();
  await expect(tabs).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Build' })).toBeVisible();
});

test('Split Right: a second editor beside the tab group; close it', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await page.getByRole('navigation').getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  await page.getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().waitFor();
  await page.locator('.editor-tab', { hasText: 'SearchSteps.cs' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Split Right' }).click();
  const split = page.getByRole('region', { name: 'Split editor Steps/SearchSteps.cs' });
  await expect(split.getByLabel('Source of Steps/SearchSteps.cs')).toBeVisible();
  // Both editors are visible side by side.
  const main = await page.locator('.editor-split > .editor-area').first().boundingBox();
  const right = await split.boundingBox();
  expect(right!.x).toBeGreaterThan(main!.x + main!.width - 2);
  await split.getByRole('button', { name: 'Close split editor' }).click();
  await expect(split).toHaveCount(0);
});

test('Gherkin tables align as | is typed; Tab moves between cells', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  const editor = page.getByLabel('Gherkin source');
  await expect(editor).toContainText('Feature:');
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n\n| name | age |\n| Bartholomew | 3 |');
  const rows = editor.locator('.cm-line', { hasText: /^\s*\|/ });
  await expect(rows.nth(-2)).toHaveText(/\| name\s{8}\| age \|$/);
  await expect(rows.nth(-1)).toHaveText(/\| Bartholomew \| 3\s{3}\|$/);
  // Tab from the first cell of the last row selects the next cell's text.
  await rows.nth(-1).click({ position: { x: 30, y: 5 } });
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('42');
  await expect(rows.nth(-1)).toHaveText(/\| Bartholomew \| 42\s+\|$/);
});

test('Keyboard Shortcuts: assign a custom shortcut to a command and use it; remove it', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByLabel('Gherkin source')).toBeVisible();
  await page.keyboard.press('Shift+?');
  const custom = page.getByRole('region', { name: 'Custom shortcuts' });
  await custom.getByRole('button', { name: 'Assign shortcut to View ▸ Git Changes' }).click();
  await custom.getByLabel('Press the shortcut for View ▸ Git Changes').press('Control+Alt+G');
  await expect(custom.locator('kbd', { hasText: 'Ctrl+Alt+G' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+G');
  await expect(page.getByRole('region', { name: 'Git Changes' })).toBeVisible();
  await page.keyboard.press('Shift+?');
  await page.getByRole('button', { name: 'Remove Ctrl+Alt+G from View ▸ Git Changes' }).click();
  await expect(custom.locator('kbd', { hasText: 'Ctrl+Alt+G' })).toHaveCount(0);
});

test('Preview tab (when enabled): single click replaces the italic preview tab; double click keeps it', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', previewTabs: true })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  const nav = page.getByRole('navigation');
  const tab = (name: string) => page.locator('.editor-tab', { hasText: name });
  await nav.getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  await expect(tab('SearchSteps.cs')).toHaveClass(/preview/);
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(tab('AuthSteps.cs')).toHaveClass(/preview/);
  await expect(tab('SearchSteps.cs')).toHaveCount(0);
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  await expect(tab('AuthSteps.cs')).not.toHaveClass(/preview/);
  await nav.getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  await expect(tab('AuthSteps.cs')).toHaveCount(1);
  await expect(tab('SearchSteps.cs')).toHaveClass(/preview/);
});

test('Move panel: the Build / Debug panel docks on the right of the editors and back', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); localStorage.setItem('tas:buildOpen', 'true'); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  const build = page.getByRole('region', { name: 'Build' });
  await expect(build).toBeVisible();
  const editor = page.locator('.editor-split > .editor-area').first();
  let b = (await build.boundingBox())!, e = (await editor.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(e.y + e.height - 2); // below
  await page.getByRole('button', { name: 'Move panel right' }).click();
  b = (await build.boundingBox())!; e = (await editor.boundingBox())!;
  expect(b.x).toBeGreaterThanOrEqual(e.x + e.width - 2); // beside
  expect(b.height).toBeGreaterThan(300);
  await page.getByRole('button', { name: 'Move panel to the bottom' }).click();
  b = (await build.boundingBox())!; e = (await editor.boundingBox())!;
  expect(b.y).toBeGreaterThanOrEqual(e.y + e.height - 2);
});

test('Output window: Show output from Build / Tests / Debug / C# language service / Studio, clear, tabs with Build', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByLabel('Gherkin source')).toBeVisible();
  await page.getByRole('button', { name: 'Build menu' }).click();
  await page.getByRole('menuitem', { name: /^Output/ }).click();
  const out = page.getByRole('region', { name: 'Output' });
  await expect(out).toBeVisible();
  const source = out.getByLabel('Show output from');
  // Studio: the studio's own messages (a notice is logged).
  await source.selectOption('studio');
  await out.getByRole('button', { name: 'Copy output' }).click();
  await expect(out.getByLabel('Output from Studio')).toContainText(/Output copied\.|Clipboard unavailable\./);
  await out.getByRole('button', { name: 'Clear all' }).click();
  await expect(out.getByLabel('Output from Studio')).toHaveText('No output yet.');
  // C# language service: started for the workspace.
  await source.selectOption('language');
  await expect(out.getByLabel('Output from C# language service')).toContainText('Starting the C# language service', { timeout: 30_000 });
  await expect(out.getByLabel('Output from C# language service')).toContainText(/Ready in [\d.]+ s/, { timeout: 60_000 });
  // With the build windows open too, the bottom panel has Build / Output tabs.
  await page.keyboard.press('Control+Shift+B');
  const tabs = page.getByRole('tablist', { name: 'Panel' });
  await expect(tabs.getByRole('tab', { name: 'Build' })).toHaveAttribute('aria-selected', 'true');
  await tabs.getByRole('tab', { name: 'Output' }).click();
  await source.selectOption('build');
  await expect(out.getByLabel('Output from Build')).toContainText('Build started');
  await page.request.post('/api/build/cancel').catch(() => {});
});

test('Rider navigation: Back / Forward, Recent Files and Locations (Ctrl+E), Search Everywhere (Shift Shift)', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByLabel('Gherkin source')).toBeVisible();
  const nav = page.getByRole('navigation');
  const active = page.locator('.editor-tab-label[aria-current="true"]');
  await nav.getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  await page.getByLabel('Source of Steps/SearchSteps.cs').locator('.cm-line', { hasText: 'public async Task Results' }).first().click();
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line').first().click();
  await expect(active).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  // Back returns to the line in SearchSteps.cs; Forward goes to AuthSteps.cs again.
  await page.keyboard.press('Control+Alt+ArrowLeft');
  await expect(active).toHaveAttribute('title', 'Steps/SearchSteps.cs');
  await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('public async Task Results');
  await page.keyboard.press('Control+Alt+ArrowRight');
  await expect(active).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  // Recent Files (Ctrl+E) and Recent Locations (Ctrl+Shift+E, with the code line).
  await page.keyboard.press('Control+E');
  const files = page.getByRole('listbox', { name: 'Recent files' });
  await expect(files.getByRole('option').first()).toContainText('AuthSteps.cs');
  await expect(files).toContainText('SearchSteps.cs');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+E');
  await expect(page.getByRole('listbox', { name: 'Recent locations' })).toContainText('public async Task Results');
  await page.keyboard.press('Escape');
  // Search Everywhere: Shift twice; recent files with an empty query; actions by name.
  await page.keyboard.press('Shift');
  await page.keyboard.press('Shift');
  const results = page.getByRole('listbox', { name: 'Results' });
  await expect(results.getByRole('option').first()).toContainText('AuthSteps.cs');
  await page.getByRole('textbox', { name: 'Go to All' }).fill('view output');
  await expect(results.getByRole('option').first()).toContainText('View: Output');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Output' })).toBeVisible();
});

test('Bookmarks: Ctrl+K Ctrl+K toggles a margin bookmark; Ctrl+K Ctrl+B lists them and jumps', async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByLabel('Gherkin source')).toBeVisible();
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  const src = page.getByLabel('Source of Steps/SearchSteps.cs');
  await src.locator('.cm-line', { hasText: 'public async Task Results' }).first().click();
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+K');
  await expect(page.locator('.code-editor:not([hidden]) .cm-bookmark')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: /Command palette|Search/ })).toHaveCount(0);
  // From another file: the list jumps back to the bookmarked line.
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line').first().click();
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+B'); // Ctrl+K Ctrl+W on desktop (a browser closes the tab on Ctrl+W)
  const list = page.getByRole('list', { name: 'Bookmarks' });
  await expect(list).toContainText('SearchSteps.cs');
  await list.getByRole('button', { name: /SearchSteps\.cs/ }).first().click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/SearchSteps.cs');
  await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('public async Task Results');
  // Toggle off again.
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+K');
  await expect(page.locator('.code-editor:not([hidden]) .cm-bookmark')).toHaveCount(0);
});
