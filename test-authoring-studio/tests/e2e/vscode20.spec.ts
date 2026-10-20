import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// VS Code features and their settings (VSCODE-20.md, V1–V20), on a temporary copy of the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-vsc-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** Opens a file in the editor with the given VS Code settings (settings.json values). */
async function open(page: Page, file = 'Steps/AuthSteps.cs', settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); localStorage.setItem('tas:settings', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, settings);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: path.basename(file), exact: true }).first().click();
  const editor = page.getByLabel(file.endsWith('.feature') ? 'Gherkin source' : `Source of ${file}`);
  await expect(editor).toBeVisible();
  return editor;
}
const view = (page: Page) => page.locator('.cm-editor').filter({ has: page.locator('.cm-content[contenteditable=true]') }).first();
/** Puts the caret at the start of line `n` (1-based). */
const caretLine = (page: Page, n: number) => page.evaluate((line) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { line(n: number): { from: number } } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: v.state.doc.line(line).from } }); v.focus(); }, n);
const openSettings = async (page: Page) => { await page.keyboard.press('Control+,'); const d = page.getByRole('dialog', { name: 'Preferences' }); await expect(d).toBeVisible(); return d; };

test('V1 Settings editor: Text Editor category, modified bar, reset, @modified, settings.json; editor.lineNumbers', async ({ page }) => {
  await open(page);
  const numbers = view(page).locator('.cm-gutter.cm-lineNumbers').first();
  await expect(numbers).toBeVisible();
  const d = await openSettings(page);
  await d.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Text Editor', exact: true }).click();
  const row = d.locator('[data-setting-id="editor.lineNumbers"]');
  await expect(row).toContainText('editor.lineNumbers');
  await expect(row).not.toHaveClass(/modified/);
  await row.getByRole('combobox', { name: 'Line Numbers' }).click();
  await page.getByRole('option', { name: 'relative' }).click();
  await expect(row).toHaveClass(/modified/);
  await expect(row).toContainText('distance in lines to cursor position');
  // @modified lists only changed settings.
  await d.getByRole('searchbox', { name: 'Search settings' }).fill('@modified');
  await expect(d.locator('[data-setting-id="editor.lineNumbers"]')).toBeVisible();
  await expect(d.locator('[data-setting-id^="editor."]')).toHaveCount(1);
  await d.getByRole('button', { name: 'Clear settings search' }).click();
  expect(await page.evaluate(() => localStorage.getItem('tas:settings'))).toBe('{"editor.lineNumbers":"relative"}');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  // Relative numbers: the caret line shows its number, the others the distance.
  await caretLine(page, 5);
  const rel = view(page).locator('.cm-vsc-numbers .cm-gutterElement');
  await expect(rel.filter({ hasText: /^5$/ })).toHaveCount(1);
  await expect(rel.filter({ hasText: /^1$/ })).toHaveCount(2);
  await caretLine(page, 2);
  await expect(rel.filter({ hasText: /^2$/ })).toHaveCount(2);
  // Reset brings the absolute numbers back.
  const d2 = await openSettings(page);
  await d2.locator('[data-setting-id="editor.lineNumbers"]').getByRole('button', { name: 'Reset Line Numbers' }).click();
  await expect(d2.locator('[data-setting-id="editor.lineNumbers"]')).not.toHaveClass(/modified/);
  expect(await page.evaluate(() => localStorage.getItem('tas:settings'))).toBe('{}');
  await page.keyboard.press('Escape');
  await expect(view(page).locator('.cm-vsc-numbers')).toHaveCount(0);
});

/** Replaces the editor text. */
const setDoc = (page: Page, text: string) => page.evaluate((t) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(x: unknown): void } } }).__activeEditor().view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } }); }, text);
const longText = (n: number) => Array.from({ length: n }, (_, i) => `    var value${i} = Compute(${i}); // line ${i + 1}`).join('\n');

test('V2 Minimap: enabled, side, slider, scale, max column, click to scroll', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.minimap.enabled': true, 'editor.minimap.showSlider': 'always' });
  await setDoc(page, longText(400));
  const map = view(page).locator('.cm-minimap');
  await expect(map).toBeVisible();
  expect((await map.boundingBox())!.width).toBe(120);
  const scroller = view(page).locator('.cm-scroller');
  expect(await scroller.evaluate((e) => getComputedStyle(e).marginRight)).toBe('120px');
  const slider = map.locator('.cm-minimap-slider');
  expect(await slider.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
  // Click near the bottom of the minimap: the editor scrolls down.
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + box.height - 5);
  await expect.poll(() => scroller.evaluate((e) => e.scrollTop)).toBeGreaterThan(200);
  // Pixels were drawn.
  expect(await map.locator('canvas').evaluate((c: HTMLCanvasElement) => { const d = c.getContext('2d')!.getImageData(0, 0, c.width, Math.min(c.height, 60)).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })).toBeGreaterThan(50);
  // Left side, scale 2, 40 columns: 80 px on the left.
  await page.evaluate(() => { localStorage.setItem('tas:settings', JSON.stringify({ 'editor.minimap.enabled': true, 'editor.minimap.side': 'left', 'editor.minimap.scale': 2, 'editor.minimap.maxColumn': 40 })); });
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  const map2 = view(page).locator('.cm-minimap');
  await expect(map2).toHaveClass(/cm-minimap-left/);
  expect((await map2.boundingBox())!.width).toBe(80);
  expect(await view(page).locator('.cm-scroller').evaluate((e) => getComputedStyle(e).marginLeft)).toBe('80px');
  // Slider on mouse over only (the default).
  expect(await map2.locator('.cm-minimap-slider').evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
});

test('V3 Minimap section headers: MARK comments and regions, custom regex, settings in Text Editor ▸ Minimap', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.minimap.enabled': true });
  await setDoc(page, `// MARK: - Setup\nclass A {\n#region Steps\n  int x; // TODO: tidy\n#endregion\n}\n`);
  const map = view(page).locator('.cm-minimap');
  await expect(map).toHaveAttribute('data-sections', '— Setup | Steps');
  const d = await openSettings(page);
  await d.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Minimap', exact: true }).click();
  await expect(d.getByRole('heading', { name: 'Minimap', level: 2 })).toBeVisible();
  await d.locator('[data-setting-id="editor.minimap.showRegionSectionHeaders"]').getByRole('checkbox').click();
  const regex = d.getByRole('textbox', { name: 'Mark Section Header Regex' });
  await regex.fill(String.raw`\bTODO:\s*(?<label>.*)$`);
  await regex.press('Enter');
  await expect(d.locator('[data-setting-id="editor.minimap.markSectionHeaderRegex"]')).toHaveClass(/modified/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(view(page).locator('.cm-minimap')).toHaveAttribute('data-sections', 'tidy');
});

const caretStyle = (page: Page) => view(page).locator('.cm-cursor-primary').first().evaluate((e) => { const s = getComputedStyle(e); return { left: s.borderLeftWidth, bottom: s.borderBottomWidth, width: parseFloat(s.width), background: s.backgroundColor }; });
/** New settings, then the page reloads and the file opens again. */
const setSettings = async (page: Page, s: Record<string, unknown>, file = 'Steps/AuthSteps.cs') => {
  await page.evaluate((x) => localStorage.setItem('tas:settings', JSON.stringify(x)), s);
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: path.basename(file), exact: true }).first().click();
  await expect(view(page)).toBeVisible();
};
test('V4 Cursor style and width', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.cursorStyle': 'block' });
  await caretLine(page, 2);
  let c = await caretStyle(page);
  expect(c.left).toBe('0px');
  expect(c.width).toBeGreaterThan(5);
  expect(c.background).not.toBe('rgba(0, 0, 0, 0)');
  await setSettings(page, { 'editor.cursorStyle': 'underline' });
  await caretLine(page, 2);
  c = await caretStyle(page);
  expect(c.bottom).toBe('2px');
  await setSettings(page, { 'editor.cursorWidth': 4 });
  await caretLine(page, 2);
  expect((await caretStyle(page)).left).toBe('4px');
  await setSettings(page, { 'editor.cursorStyle': 'line-thin' });
  await caretLine(page, 2);
  expect((await caretStyle(page)).left).toBe('1px');
});

test('V5 Cursor blinking and smooth caret animation', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.cursorBlinking': 'solid', 'editor.cursorSmoothCaretAnimation': 'on' });
  await caretLine(page, 2);
  const layer = view(page).locator('.cm-cursorLayer');
  expect(await layer.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  expect(await view(page).locator('.cm-cursor-primary').evaluate((e) => getComputedStyle(e).transitionDuration)).toMatch(/0\.08s/);
  await setSettings(page, { 'editor.cursorBlinking': 'smooth' });
  await caretLine(page, 2);
  expect(await layer.evaluate((e) => getComputedStyle(e).animationTimingFunction)).toBe('ease-in-out');
  await setSettings(page, { 'editor.cursorBlinking': 'expand', 'editor.cursorSmoothCaretAnimation': 'explicit' });
  await caretLine(page, 2);
  expect(await view(page).locator('.cm-cursor-primary').evaluate((e) => getComputedStyle(e).animationName)).toBe('vsc-expand');
  await page.keyboard.type('x');
  await expect(view(page)).toHaveClass(/cm-vsc-typing/);
  await expect(view(page)).not.toHaveClass(/cm-vsc-typing/);
});
