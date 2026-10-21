import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// VS Code look and features (VSCODE-250.md, W1–W250), on a temporary copy of the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-w250-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** A clean studio on the editor page, with VS Code settings (settings.json values). */
async function start(page: Page, settings: Record<string, unknown> = {}, extra: Record<string, string> = {}) {
  await page.addInitScript(([s, x]) => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' }));
    localStorage.setItem('tas:settings', JSON.stringify(s));
    for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v);
    sessionStorage.setItem('seeded', '1');
  }, [settings, extra] as const);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
}
/** Opens a file in the editor and returns its source box. */
async function open(page: Page, file: string) {
  const editor = page.getByLabel(file.endsWith('.feature') ? 'Gherkin source' : `Source of ${file}`);
  // The shell may still be starting: ask again until the editor shows the file.
  await expect(async () => {
    await page.evaluate((f) => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: f, line: 1 } })), file);
    await expect(editor).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  return editor;
}
const quick = (page: Page) => page.getByRole('dialog', { name: 'Quick Input' });
const quickBox = (page: Page) => quick(page).getByRole('combobox', { name: 'Quick Input' });
const rows = (page: Page) => quick(page).getByRole('option');
const docText = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
void docText;

test('W1 Quick Open: files at the top, recently opened first, fuzzy highlights, Enter opens', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await page.keyboard.press('Control+p');
  await expect(quick(page)).toBeVisible();
  // The widget sits at the top centre, like VS Code's.
  const box = (await quick(page).boundingBox())!;
  expect(box.y).toBeLessThan(20);
  expect(Math.abs(box.x + box.width / 2 - (page.viewportSize()!.width / 2))).toBeLessThan(12);
  await expect(rows(page).first()).toContainText('AuthSteps.cs');
  await expect(quick(page).locator('.quick-input-separator').first()).toHaveText('recently opened');
  // Fuzzy: "hks" finds Hooks.cs with the matched letters highlighted.
  await quickBox(page).fill('hks');
  const hooks = rows(page).filter({ hasText: 'Hooks.cs' }).first();
  await expect(hooks).toBeVisible();
  await expect(hooks.locator('.highlight')).toHaveText(['H', 'ks']);
  await quickBox(page).fill('hooks');
  await expect(rows(page).first()).toContainText('Hooks.cs');
  await page.keyboard.press('Enter');
  await expect(quick(page)).toBeHidden();
  await expect(page.getByLabel(/^Source of .*Hooks\.cs$/)).toBeVisible();
  // Escape closes without opening anything.
  await page.keyboard.press('Control+p');
  await expect(rows(page).first()).toContainText('Hooks.cs');
  await page.keyboard.press('Escape');
  await expect(quick(page)).toBeHidden();
});

test('W2 Command Palette: > commands with keybinding chips, recently used first', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await page.keyboard.press('Control+Shift+P');
  await expect(quickBox(page)).toHaveValue('>');
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Type the name of a command to run.');
  await page.keyboard.type('sort lines');
  const sort = rows(page).filter({ hasText: /Sort Lines$/ }).first();
  await expect(sort).toBeVisible();
  await expect(sort.locator('.highlight')).toHaveText(['Sort', 'Lines']);
  await sort.click();
  await expect(quick(page)).toBeHidden();
  // Used once: it comes first, under "recently used"; the others follow under "other commands".
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>');
  await expect(rows(page).first()).toContainText('Sort Lines');
  await expect(rows(page).first().locator('.quick-input-separator')).toHaveText('recently used');
  await expect(quick(page).locator('.quick-input-separator').nth(1)).toHaveText('other commands');
  // Keybindings as chips.
  await quickBox(page).fill('>toggle case');
  await expect(rows(page).first().locator('kbd')).toHaveText(['Ctrl', 'Shift', 'U']);
  // Backspacing the prefix switches to Quick Open (files).
  await quickBox(page).fill('auth');
  await expect(rows(page).first()).toContainText('AuthSteps.cs');
  await page.keyboard.press('Escape');
});

const SHAPES = ['export interface Shape {', '  area(): number;', '}', '', 'export class Circle implements Shape {', '  radius = 1;', '  area() {', '    return Math.PI * this.radius ** 2;', '  }', '}', '', 'export class Square implements Shape {', '  side = 2;', '  area() {', '    return this.side ** 2;', '  }', '  perimeter() {', '    return 4 * this.side;', '  }', '}', '', 'export function total(shapes: Shape[]) {', '  return shapes.reduce((s, x) => s + x.area(), 0);', '}', ''].join('\n');
const caretLine = (page: Page) => page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { lineAt(p: number): { number: number } }; selection: { main: { head: number } } } } } }).__activeEditor().view; return v.state.doc.lineAt(v.state.selection.main.head).number; });

test('W3 Go to Symbol in Editor: Ctrl+Shift+O, preview while moving, Escape restores, Enter goes', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'shapes.ts'), SHAPES);
  await start(page);
  const src = await open(page, 'shapes.ts');
  await src.locator('.cm-line').first().click();
  await page.keyboard.press('Control+Shift+O');
  await expect(quickBox(page)).toHaveValue('@');
  await expect(rows(page).first()).toContainText('Shape');
  await expect(rows(page).first().locator('.quick-input-separator')).toHaveText(/symbols \(\d+\)/);
  await expect(rows(page).first().locator('.codicon-symbol-interface')).toBeVisible();
  await page.keyboard.type('perim');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('.codicon-symbol-method')).toBeVisible();
  // Preview: the editor already shows the symbol; Escape goes back to line 1.
  await expect.poll(() => caretLine(page)).toBe(17);
  await page.keyboard.press('Escape');
  await expect.poll(() => caretLine(page)).toBe(1);
  await page.keyboard.press('Control+Shift+O');
  await page.keyboard.type('total');
  await page.keyboard.press('Enter');
  await expect(quick(page)).toBeHidden();
  await expect.poll(() => caretLine(page)).toBe(22);
  // Typed after a file name in Quick Open: "@" goes to symbols too.
  await page.keyboard.press('Control+p');
  await quickBox(page).fill('@circle');
  await expect(rows(page).first()).toContainText('Circle');
  await page.keyboard.press('Escape');
});

test('W4 Go to Symbol by category (@:): groups with counts', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'shapes.ts'), SHAPES);
  await start(page);
  const src = await open(page, 'shapes.ts');
  await src.locator('.cm-line').first().click();
  await page.keyboard.press('Control+Shift+O');
  await page.keyboard.type(':');
  await expect(quickBox(page)).toHaveValue('@:');
  const seps = quick(page).locator('.quick-input-separator');
  await expect(seps).toHaveText(['interfaces (1)', 'methods (4)', 'classes (2)', 'properties (2)', 'functions (1)'].sort((a, b) => 0 * a.length + 0 * b.length));
});

test('W5 Go to Line/Column: Ctrl+G, current line message, line:column, preview, Escape restores', async ({ page }) => {
  await start(page);
  const src = await open(page, 'Steps/AuthSteps.cs');
  await src.locator('.cm-line').nth(2).click();
  await page.keyboard.press('Control+g');
  await expect(quickBox(page)).toHaveValue(':');
  await expect(quick(page).getByRole('status')).toHaveText(/^Current Line: 3, Character: \d+\. Type a line number between 1 and \d+ to navigate to\.$/);
  await page.keyboard.type('6:5');
  await expect(rows(page)).toHaveText(['Go to line 6 and character 5.']);
  await expect.poll(() => caretLine(page)).toBe(6);
  await page.keyboard.press('Escape');
  await expect.poll(() => caretLine(page)).toBe(3);
  await page.keyboard.press('Control+g');
  await page.keyboard.type('-1');
  await expect(rows(page).first()).toHaveText(/^Go to line \d+\.$/);
  await page.keyboard.press('Enter');
  const last = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { lines: number } } } } }).__activeEditor().view.state.doc.lines);
  await expect.poll(() => caretLine(page)).toBe(last);
  // The status bar's Ln / Col opens it too.
  await page.getByRole('button', { name: 'Cursor position' }).click();
  await expect(quickBox(page)).toHaveValue(':');
  await page.keyboard.press('Escape');
});

test('W6 Go to Symbol in Workspace (#): TypeScript symbols across files, open at the symbol', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'shapes.ts'), SHAPES);
  await fs.writeFile(path.join(temp, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', strict: true, noEmit: true }, include: ['*.ts'] }));
  await start(page);
  await page.keyboard.press('Control+p');
  await quickBox(page).fill('#perim');
  const row = rows(page).filter({ hasText: 'perimeter' }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText('Square · shapes.ts');
  await expect(row.locator('.codicon-symbol-method')).toBeVisible();
  await row.click();
  await expect(page.getByLabel('Source of shapes.ts')).toBeVisible();
  await expect.poll(() => caretLine(page)).toBe(17);
});

test('W7 Quick access help (?): the prefixes, Enter switches to one', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+p');
  await quickBox(page).fill('?');
  for (const [p, help] of [['…', 'Go to File'], ['>', 'Show and Run Commands'], ['@', 'Go to Symbol in Editor'], [':', 'Go to Line/Column'], ['#', 'Go to Symbol in Workspace'], ['view', 'Open View']])
    await expect(rows(page).filter({ hasText: help }).first()).toContainText(p);
  await rows(page).filter({ hasText: 'Show and Run Commands' }).click();
  await expect(quickBox(page)).toHaveValue('>');
  await page.keyboard.press('Escape');
});

test('W8 Open View (Ctrl+Q): side bar, panel and pages', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+q');
  await expect(quickBox(page)).toHaveValue('view ');
  await expect(quick(page).locator('.quick-input-separator')).toHaveText(['Side Bar', 'Panel', 'Page']);
  await page.keyboard.type('outp');
  await expect(rows(page)).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Output' })).toBeVisible();
  await page.keyboard.press('Control+q');
  await page.keyboard.type('source control');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: /Source Control|Git/ }).first()).toBeVisible();
});

test('W9 Show All Editors by MRU (edt ): last used first, close button', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await open(page, 'Steps/SearchSteps.cs');
  await open(page, 'Fixtures.csproj');
  await page.keyboard.press('Control+p');
  await quickBox(page).fill('edt ');
  // The feature editor's start file was opened first, so it is last.
  await expect(rows(page).locator('.quick-input-label')).toHaveText(['Fixtures.csproj', 'SearchSteps.cs', 'AuthSteps.cs', 'GoogleSearch.feature']);
  await rows(page).nth(2).hover();
  await rows(page).nth(2).getByRole('button', { name: 'Close Editor' }).click();
  await expect(rows(page).locator('.quick-input-label')).toHaveText(['Fixtures.csproj', 'SearchSteps.cs', 'GoogleSearch.feature']);
  await expect(page.locator('.editor-tab-label', { hasText: 'AuthSteps.cs' })).toHaveCount(0);
  await quickBox(page).fill('edt search');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/SearchSteps.cs');
});

test('W10 Quick text search (%): matching lines grouped by file, Enter opens at the match', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+p');
  await quickBox(page).fill('%OpenLogin');
  const first = rows(page).first();
  await expect(first).toBeVisible({ timeout: 20_000 });
  await expect(first.locator('.highlight')).toHaveText('OpenLogin');
  await expect(first.locator('.quick-input-separator')).toHaveText(/\.(cs|feature|xml)$/);
  const desc = await first.locator('.quick-input-description').innerText();
  const [name, line] = desc.split(':');
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', new RegExp(`${name.replace('.', '\.')}$`));
  await expect.poll(() => caretLine(page)).toBe(Number(line));
});

test('W11 Quick Open: Ctrl+Enter and the split button open to the side', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await page.keyboard.press('Control+p');
  await quickBox(page).fill('searchsteps');
  await page.keyboard.press('Control+Enter');
  await expect(quick(page)).toBeHidden();
  await expect(page.getByLabel('Source of Steps/SearchSteps.cs')).toBeVisible();
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  await page.keyboard.press('Control+p');
  await quickBox(page).fill('fixtures.csproj');
  await rows(page).first().hover();
  await rows(page).first().getByRole('button', { name: 'Open to the Side' }).click();
  await expect(quick(page)).toBeHidden();
  await expect(page.getByLabel('Source of Fixtures.csproj')).toBeVisible();
});
