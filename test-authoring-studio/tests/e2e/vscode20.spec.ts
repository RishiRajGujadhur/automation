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

test('V6 Cursor surrounding lines', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.cursorSurroundingLines': 5 });
  await setDoc(page, longText(200));
  await caretLine(page, 1);
  const scroller = view(page).locator('.cm-scroller');
  const lineH = await view(page).locator('.cm-line').first().evaluate((e) => e.getBoundingClientRect().height);
  const visible = Math.floor((await scroller.evaluate((e) => e.clientHeight)) / lineH);
  // Arrow down to the last visible line: the editor scrolls so that 5 lines stay below the caret.
  for (let i = 1; i < visible - 2; i++) await page.keyboard.press('ArrowDown');
  const top = await scroller.evaluate((e) => e.scrollTop);
  expect(top).toBeGreaterThan(lineH * 2);
  // Without the setting, the same moves do not scroll.
  await setSettings(page, {});
  await setDoc(page, longText(200));
  await caretLine(page, 1);
  for (let i = 1; i < visible - 2; i++) await page.keyboard.press('ArrowDown');
  expect(await view(page).locator('.cm-scroller').evaluate((e) => e.scrollTop)).toBeLessThan(lineH);
});

test('V7 Font family, weight and ligatures', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.fontFamily': 'Courier New, monospace', 'editor.fontWeight': '600', 'editor.fontLigatures': true });
  const content = view(page).locator('.cm-content');
  const s = await content.evaluate((e) => { const c = getComputedStyle(e); return { family: c.fontFamily, weight: c.fontWeight, liga: c.fontFeatureSettings }; });
  expect(s.family).toBe('"Courier New", monospace');
  expect(s.weight).toBe('600');
  expect(s.liga).toContain('liga');
  expect(await view(page).locator('.cm-gutters').evaluate((e) => getComputedStyle(e).fontFamily)).toBe('"Courier New", monospace');
  // Settings ▸ Text Editor ▸ Font lists them.
  const d = await openSettings(page);
  await d.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Font', exact: true }).click();
  await expect(d.locator('[data-setting-id="editor.fontFamily"]')).toHaveClass(/modified/);
  await expect(d.getByRole('textbox', { name: 'Font Family' })).toHaveValue('Courier New, monospace');
});

test('V8 Line height and letter spacing', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.lineHeight': 30, 'editor.letterSpacing': 1.5 });
  const line = view(page).locator('.cm-line').nth(1);
  expect(await line.evaluate((e) => getComputedStyle(e).lineHeight)).toBe('30px');
  expect(await line.evaluate((e) => getComputedStyle(e).letterSpacing)).toBe('1.5px');
  // The gutter follows (line numbers stay level with their lines).
  const n = view(page).locator('.cm-lineNumbers .cm-gutterElement').filter({ hasText: /^2$/ });
  await expect.poll(async () => Math.abs((await n.boundingBox())!.y - (await line.boundingBox())!.y)).toBeLessThan(2);
  await setSettings(page, { 'editor.lineHeight': 2 });
  const fs = await view(page).locator('.cm-line').nth(1).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(parseFloat(await view(page).locator('.cm-line').nth(1).evaluate((e) => getComputedStyle(e).lineHeight))).toBeCloseTo(fs * 2, 0);
});

test('V9 Render whitespace: selection (default), boundary, trailing, all', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs');
  await setDoc(page, 'int  a = 1;   \n');
  const dots = view(page).locator('.cm-line').first().locator('.cm-highlightSpace');
  await expect(dots).toHaveCount(0);
  await page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { dispatch(x: unknown): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: 0, head: 8 } }); });
  await expect(dots).toHaveCount(3);
  await setSettings(page, { 'editor.renderWhitespace': 'trailing' });
  await setDoc(page, 'int  a = 1;   \n');
  await expect(view(page).locator('.cm-line').first().locator('.cm-highlightSpace')).toHaveCount(3);
  await setSettings(page, { 'editor.renderWhitespace': 'boundary' });
  await setDoc(page, 'int  a = 1;   \n');
  await expect(view(page).locator('.cm-line').first().locator('.cm-highlightSpace')).toHaveCount(5);
  await setSettings(page, { 'editor.renderWhitespace': 'all' });
  await setDoc(page, 'int  a = 1;   \n');
  await expect(view(page).locator('.cm-line').first().locator('.cm-highlightSpace')).toHaveCount(7);
});

test('V10 Word wrap: on, column, bounded; wrapping indent', async ({ page }) => {
  const long = `        var message = "${'word '.repeat(60)}";\nshort();\n`;
  await open(page, 'Steps/AuthSteps.cs', { 'editor.wordWrap': 'on' });
  await setDoc(page, long);
  const first = view(page).locator('.cm-line').first();
  const lineH = await view(page).locator('.cm-line').nth(1).evaluate((e) => e.getBoundingClientRect().height);
  expect((await first.boundingBox())!.height).toBeGreaterThan(lineH * 1.5);
  // Same indent: wrapped rows start 8 columns in.
  expect(await first.evaluate((e) => e.style.textIndent)).toBe('-8ch');
  // Column 40: the text is 40 columns wide.
  await setSettings(page, { 'editor.wordWrap': 'wordWrapColumn', 'editor.wordWrapColumn': 40, 'editor.wrappingIndent': 'indent' });
  await setDoc(page, long);
  const ch = await view(page).locator('.cm-content').evaluate((e) => { const s = document.createElement('span'); s.textContent = 'x'.repeat(10); e.appendChild(s); const w = s.getBoundingClientRect().width / 10; s.remove(); return w; });
  const w = (await view(page).locator('.cm-content').boundingBox())!.width;
  expect(Math.abs(w - (40 * ch + 8))).toBeLessThan(ch * 2);
  expect(await view(page).locator('.cm-line').first().evaluate((e) => e.style.textIndent)).toMatch(/^-1[02]ch$/); // + one indent unit (2 or 4)
  // Off: one row per line.
  await setSettings(page, {});
  await setDoc(page, long);
  const l2 = await view(page).locator('.cm-line').nth(1).evaluate((e) => e.getBoundingClientRect().height);
  expect((await view(page).locator('.cm-line').first().boundingBox())!.height).toBeLessThan(l2 * 1.5);
});

test('V11 Rulers', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs');
  const d = await openSettings(page);
  await d.getByRole('searchbox', { name: 'Search settings' }).fill('editor.rulers');
  const box = d.getByRole('textbox', { name: 'Rulers' });
  await box.fill('80, 120');
  await box.press('Enter');
  await expect(d.locator('[data-setting-id="editor.rulers"]')).toHaveClass(/modified/);
  expect(await page.evaluate(() => localStorage.getItem('tas:settings'))).toBe('{"editor.rulers":[80,120]}');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(view(page)).toHaveAttribute('data-rulers', '80,120');
  // 80, 120 (and the right margin guide at 120 when it is on).
  const img = await view(page).locator('.cm-content').evaluate((e) => getComputedStyle(e).backgroundImage);
  expect(img.match(/linear-gradient/g)!.length).toBeGreaterThanOrEqual(2);
});

test('V12 Render line highlight and only when focused', async ({ page }) => {
  const bg = (l: import('@playwright/test').Locator) => l.evaluate((e) => getComputedStyle(e).backgroundColor);
  await open(page, 'Steps/AuthSteps.cs', { 'editor.renderLineHighlight': 'all' });
  await caretLine(page, 2);
  expect(await bg(view(page).locator('.cm-activeLine').first())).not.toBe('rgba(0, 0, 0, 0)');
  expect(await bg(view(page).locator('.cm-activeLineGutter').first())).not.toBe('rgba(0, 0, 0, 0)');
  await setSettings(page, { 'editor.renderLineHighlight': 'gutter', 'editor.renderLineHighlightOnlyWhenFocus': true });
  await caretLine(page, 2);
  expect(await bg(view(page).locator('.cm-activeLine').first())).toBe('rgba(0, 0, 0, 0)');
  expect(await bg(view(page).locator('.cm-activeLineGutter').first())).not.toBe('rgba(0, 0, 0, 0)');
  // Leaving the editor removes it.
  await page.evaluate(() => (document.activeElement as HTMLElement).blur());
  await expect.poll(() => bg(view(page).locator('.cm-activeLineGutter').first())).toBe('rgba(0, 0, 0, 0)');
});

test('V13 Files: trim trailing whitespace, insert final newline, trim final newlines on save', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'files.trimTrailingWhitespace': true, 'files.insertFinalNewline': true, 'files.trimFinalNewlines': true });
  await setDoc(page, 'class A {   \n  int x;\t\n}\n\n\n');
  await caretLine(page, 2);
  await page.keyboard.press('Control+s');
  const disk = () => fs.readFile(path.join(temp, 'Steps/AuthSteps.cs'), 'utf8').then((t) => t.replace(/\r\n/g, '\n'));
  await expect.poll(disk, { timeout: 20_000 }).toBe('class A {\n  int x;\n}\n');
  // The editor shows the saved text and is not dirty.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString())).toBe('class A {\n  int x;\n}\n');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  // Off (the default): the text is written as it is.
  await setSettings(page, {});
  await setDoc(page, 'class B {  \n}');
  await expect(page.getByRole('button', { name: 'Close AuthSteps.cs (unsaved)' })).toBeVisible();
  await page.keyboard.press('Control+s');
  await expect.poll(disk, { timeout: 20_000 }).toBe('class B {  \n}');
});

test('V14 Suggestions: quick suggestions, accept on Enter, Tab completion', async ({ page }) => {
  const list = page.locator('.cm-tooltip-autocomplete li');
  const text = () => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
  await open(page, 'Features/Auth/Login.feature', { 'editor.quickSuggestions': false, 'editor.acceptSuggestionOnEnter': 'off' });
  await view(page).locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\n    Given the login');
  await page.waitForTimeout(600);
  await expect(list).toHaveCount(0);
  // Ctrl+Space still asks.
  await page.keyboard.press('Control+Space');
  await expect(list.first()).toContainText('the login page is open');
  // Enter does not accept: a new line.
  await page.keyboard.press('Enter');
  await expect(list).toHaveCount(0);
  expect(await text()).toMatch(/Given the login\n\s*$/);
  // Tab accepts (editor.tabCompletion on).
  await page.keyboard.press('Control+z');
  await expect.poll(text).toMatch(/Given the login$/);
  await page.keyboard.press('Control+Space');
  await expect(list.first()).toContainText('the login page is open');
  await page.keyboard.press('Tab');
  await expect.poll(text).toContain('Given the login page is open');
});

test('V15 Mouse wheel sensitivity, fast scroll with Alt, smooth scrolling', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.mouseWheelScrollSensitivity': 2 });
  await setDoc(page, longText(600));
  const scroller = view(page).locator('.cm-scroller');
  const box = (await scroller.boundingBox())!;
  await page.mouse.move(box.x + 200, box.y + 100);
  const top = () => scroller.evaluate((e) => e.scrollTop);
  await page.mouse.wheel(0, 100);
  await expect.poll(top).toBe(200);
  // Alt: 5 times faster.
  await page.keyboard.down('Alt');
  await page.mouse.wheel(0, 100);
  await page.keyboard.up('Alt');
  await expect.poll(top).toBe(700);
  // Smooth: reaches the same place, animated.
  await setSettings(page, { 'editor.smoothScrolling': true });
  await setDoc(page, longText(600));
  await page.mouse.move(box.x + 200, box.y + 100);
  await page.mouse.wheel(0, 300);
  const first = await top();
  await expect.poll(top).toBe(300);
  expect(first).toBeLessThan(300);
});

test('V16 Folding: controls on mouse over, folded highlight, folding off', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'editor.showFoldingControls': 'mouseover' });
  const marker = view(page).locator('.cm-foldGutter .cm-gutterElement').filter({ hasText: /\S/, visible: true }).first();
  await expect(marker).toHaveCSS('opacity', '0');
  await view(page).locator('.cm-gutters').hover();
  await expect(marker).toHaveCSS('opacity', '1');
  await marker.click();
  await expect(view(page).locator('.cm-foldPlaceholder')).toHaveCount(1);
  await expect(view(page).locator('.cm-line.cm-vsc-folded')).toHaveCount(1);
  // Folding off: no fold arrows, and Ctrl+Shift+[ does nothing.
  await setSettings(page, { 'editor.folding': false });
  await expect(view(page).locator('.cm-foldGutter')).toBeHidden();
  await caretLine(page, 4);
  await page.keyboard.press('Control+Shift+BracketLeft');
  await page.waitForTimeout(300);
  await expect(view(page).locator('.cm-foldPlaceholder')).toHaveCount(0);
});

test('V17 Brackets: match always, auto closing never / before whitespace', async ({ page }) => {
  const text = () => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
  await open(page, 'Steps/AuthSteps.cs', { 'editor.autoClosingBrackets': 'never', 'editor.autoClosingQuotes': 'beforeWhitespace' });
  await setDoc(page, 'Call(first, second);\n');
  await page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: 8 } }); v.focus(); });
  await expect(view(page).locator('.cm-vsc-enclosing')).toHaveCount(2);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('x(');
  expect(await text()).toMatch(/x\($/m);
  await page.keyboard.type('"');
  expect(await text()).toMatch(/x\(""$/m);
  // Before a character: no closing quote.
  await page.keyboard.press('Home');
  await page.keyboard.type('"');
  expect(await text()).toMatch(/^"x\(""$/m);
  // Never: no highlight away from the brackets.
  await setSettings(page, { 'editor.matchBrackets': 'never' });
  await caretLine(page, 1);
  await expect(view(page).locator('.cm-vsc-enclosing')).toHaveCount(0);
});

test('V18 Editor tabs: show tabs single / none, action location, modified highlight, sizing', async ({ page }) => {
  await open(page, 'Steps/AuthSteps.cs', { 'workbench.editor.showTabs': 'single', 'workbench.editor.highlightModifiedTabs': true, 'workbench.editor.tabActionLocation': 'left' });
  await page.getByRole('navigation').getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  const strip = page.getByRole('group', { name: 'Open editors' });
  const tabs = strip.locator('.editor-tab');
  expect(await tabs.count()).toBeGreaterThanOrEqual(2);
  await expect(tabs.filter({ visible: true })).toHaveCount(1);
  await expect(tabs.filter({ visible: true })).toContainText('SearchSteps.cs');
  // The close button is on the left of the label.
  const active = tabs.filter({ visible: true });
  expect((await active.locator('.editor-tab-close').boundingBox())!.x).toBeLessThan((await active.locator('.editor-tab-label').boundingBox())!.x);
  // Unsaved: an amber top border.
  await page.locator('.cm-content[contenteditable=true]').filter({ visible: true }).first().click();
  await page.keyboard.type('changed');
  await expect(active).toHaveClass(/unsaved/);
  expect(await active.evaluate((e) => getComputedStyle(e).boxShadow)).toContain('rgb(212, 167, 44)');
  // None: no tabs, the editor stays.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.editor.showTabs': 'none' })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(page.getByRole('group', { name: 'Open editors' })).toBeHidden();
  // Fixed: tabs 100 px wide.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.editor.tabSizing': 'fixed', 'workbench.editor.tabSizingFixedMaxWidth': 100 })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  expect(Math.round((await page.getByRole('group', { name: 'Open editors' }).locator('.editor-tab').first().boundingBox())!.width)).toBe(100);
});
