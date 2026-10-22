import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

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

test('W12 Quick Open: Remove from Recently Opened', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await open(page, 'Steps/SearchSteps.cs');
  await page.keyboard.press('Control+p');
  const auth = rows(page).filter({ hasText: 'AuthSteps.cs' });
  await expect(auth).toHaveCount(1);
  await auth.hover();
  await auth.getByRole('button', { name: 'Remove from Recently Opened' }).click();
  await expect(auth).toHaveCount(0);
  await expect(rows(page).first()).toContainText('SearchSteps.cs');
  await expect(quickBox(page)).toBeFocused();
  // Still a workspace file: typing finds it, without the remove button.
  await quickBox(page).fill('authsteps');
  await expect(rows(page).first()).toContainText('AuthSteps.cs');
  await expect(rows(page).first().getByRole('button', { name: 'Remove from Recently Opened' })).toHaveCount(0);
});

test('W13 workbench.quickOpen.closeOnFocusLost', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  // Default: a click elsewhere closes it.
  await page.keyboard.press('Control+p');
  await page.getByLabel('Source of Steps/AuthSteps.cs').click();
  await expect(quick(page)).toBeHidden();
  // Off: it stays until Escape.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.quickOpen.closeOnFocusLost': false })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.keyboard.press('Control+p');
  await expect(quick(page)).toBeVisible();
  await page.locator('.status-bar, footer').first().click({ position: { x: 5, y: 5 } }).catch(() => page.mouse.click(5, 5));
  await expect(quick(page)).toBeVisible();
  await quickBox(page).focus();
  await page.keyboard.press('Escape');
  await expect(quick(page)).toBeHidden();
});

test('W14 workbench.quickOpen.preserveInput and workbench.commandPalette.preserveInput', async ({ page }) => {
  await start(page, { 'workbench.quickOpen.preserveInput': true });
  await page.keyboard.press('Control+p');
  await page.keyboard.type('auth');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+p');
  await expect(quickBox(page)).toHaveValue('auth');
  // The text is selected: typing replaces it.
  await page.keyboard.type('se');
  await expect(quickBox(page)).toHaveValue('se');
  await page.keyboard.press('Escape');
  // Off (the default): Quick Open starts empty.
  await page.evaluate(() => localStorage.setItem('tas:settings', '{}'));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.keyboard.press('Control+p');
  await page.keyboard.type('auth');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+p');
  await expect(quickBox(page)).toHaveValue('');
});

test('W15 workbench.commandPalette.history: how many recently used commands come first', async ({ page }) => {
  await start(page, { 'workbench.commandPalette.history': 1 });
  await open(page, 'Steps/AuthSteps.cs');
  for (const c of ['sort lines', 'reverse lines']) {
    await page.keyboard.press('Control+Shift+P');
    await quickBox(page).fill('>' + c);
    await page.keyboard.press('Enter');
    await expect(quick(page)).toBeHidden();
  }
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>');
  await expect(rows(page).first()).toContainText('Reverse Lines');
  await expect(rows(page).nth(1).locator('.quick-input-separator')).toHaveText('other commands');
  await page.keyboard.press('Escape');
  // 0: no history at all.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.commandPalette.history': 0 })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>');
  await expect(quick(page).locator('.quick-input-separator')).toHaveCount(0);
});

test('W16 Quick Input history: Ctrl+Up / Ctrl+Down go through earlier queries', async ({ page }) => {
  await start(page);
  for (const q of ['authsteps', 'searchsteps']) {
    await page.keyboard.press('Control+p');
    await quickBox(page).fill(q);
    await expect(rows(page).first()).toContainText(/steps/i);
    await page.keyboard.press('Enter');
    await expect(quick(page)).toBeHidden();
  }
  await page.keyboard.press('Control+p');
  await page.keyboard.press('Control+ArrowUp');
  await expect(quickBox(page)).toHaveValue('searchsteps');
  await page.keyboard.press('Control+ArrowUp');
  await expect(quickBox(page)).toHaveValue('authsteps');
  await page.keyboard.press('Control+ArrowDown');
  await expect(quickBox(page)).toHaveValue('searchsteps');
  await page.keyboard.press('Control+ArrowDown');
  await expect(quickBox(page)).toHaveValue('');
});

test('W17 Quick navigate: Ctrl+P P… moves down, Ctrl+Shift+P up, releasing Ctrl opens', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await open(page, 'Steps/SearchSteps.cs');
  await open(page, 'Fixtures.csproj');
  // Hold Ctrl, P P P: the third recent file; release Ctrl: it opens.
  await page.keyboard.down('Control');
  await page.keyboard.press('p');
  await expect(rows(page).first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('p');
  await page.keyboard.press('p');
  await expect(rows(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.up('Control');
  await expect(quick(page)).toBeHidden();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  await page.keyboard.down('Control');
  await page.keyboard.press('p');
  await page.keyboard.press('p');
  await page.keyboard.press('p');
  await page.keyboard.press('Shift+P');
  await expect(rows(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.up('Control');
  await expect(quick(page)).toBeHidden();
});

test('W18 Command palette: Configure Keybinding (gear) records a key that then runs the command', async ({ page }) => {
  await start(page);
  const src = await open(page, 'Steps/AuthSteps.cs');
  const before = await docText(page);
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>reverse lines');
  const row = rows(page).filter({ hasText: 'Reverse Lines' }).first();
  await row.hover();
  await row.getByRole('button', { name: 'Configure Keybinding' }).click();
  const rec = page.getByLabel('Press the shortcut for Edit: Reverse Lines');
  await expect(rec).toBeFocused();
  await page.keyboard.press('Control+Alt+9');
  await expect(page.getByRole('button', { name: 'Remove Ctrl+Alt+9 from Edit: Reverse Lines' })).toBeVisible();
  await page.keyboard.press('Escape');
  await src.locator('.cm-line').first().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+Alt+9');
  await expect.poll(async () => (await docText(page)).trim().split('\n')[0]).toBe(before.trim().split('\n').at(-1));
  // The palette shows the new key.
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>reverse lines');
  await expect(rows(page).filter({ hasText: 'Reverse Lines' }).first().locator('kbd')).toHaveText(['Ctrl', 'Alt', '9']);
});

test('W19 Command palette: similar commands when no title contains the words', async ({ page }) => {
  await start(page);
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>srtlns');
  await expect(rows(page).first().locator('.quick-input-separator')).toHaveText('similar commands');
  await expect(rows(page).filter({ hasText: 'Sort Lines' }).first()).toBeVisible();
  await quickBox(page).fill('>zzzzqqq');
  await expect(quick(page).getByText('No matching commands')).toBeVisible();
});

test('W20 workbench.quickInput.position: top or center', async ({ page }) => {
  await start(page, { 'workbench.quickInput.position': 'center' });
  await page.keyboard.press('Control+p');
  const y = (await quick(page).boundingBox())!.y;
  expect(y).toBeGreaterThan(page.viewportSize()!.height * 0.15);
});

test('W21 Status bar colours: accent normally, orange while debugging', async ({ page }) => {
  // A debug session that is running (the debugger's event stream, faked).
  let debugging = false;
  await page.route('**/api/debug/events', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: debugging ? `data: ${JSON.stringify({ status: 'running', version: 1, frames: [], output: '', breakpoints: {} })}\n\n` : 'event: ping\ndata: {}\n\n' }));
  await start(page);
  const bar = page.locator('footer.status-bar');
  await expect(bar).not.toHaveClass(/debugging|no-folder/);
  const normal = await bar.evaluate((e) => getComputedStyle(e).backgroundColor);
  debugging = true;
  await page.reload();
  await expect(bar).toHaveClass(/debugging/);
  await expect.poll(() => bar.evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgb(204, 102, 51)');
  expect(normal).not.toBe('rgb(204, 102, 51)');
});

test('W22 Remote indicator: window and workspace actions in a quick pick', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await start(page);
  const bar = page.locator('footer.status-bar');
  const remote = bar.getByRole('button', { name: 'Open a Remote Window' });
  // It is the first item, at the left edge.
  expect((await remote.boundingBox())!.x).toBeLessThan(4);
  await remote.click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select an option to open a Remote Window');
  await expect(rows(page).locator('.quick-input-label')).toContainText(['Open Folder…', 'Open Project/Solution…', 'Rescan Repository', 'Copy Workspace Path']);
  await page.keyboard.type('copy');
  await expect(rows(page)).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(temp);
});

test('W23 Change Language Mode: status bar item and Ctrl+K M, per file, colouring follows', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'notes.txt'), '{ "name": "demo", "count": 3 }\n');
  await start(page);
  const src = await open(page, 'notes.txt');
  const item = page.locator('footer.status-bar').getByRole('button', { name: /^Select Language Mode/ });
  await expect(item).toHaveText('Plain Text');
  const demo = src.locator('.cm-line span', { hasText: /^"demo"$/ });
  await expect(demo).toHaveCount(0);
  await item.click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select Language Mode');
  await expect(rows(page).filter({ hasText: 'Plain Text' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.type('json');
  await expect(rows(page).first()).toContainText('JSON(json)');
  await page.keyboard.press('Enter');
  await expect(item).toHaveText('JSON');
  // JSON colouring: the strings and the number are tokens now.
  await expect(demo).toHaveCount(1);
  // Kept for the file after a reload; Ctrl+K M offers going back to the extension's mode.
  await page.reload();
  const again = await open(page, 'notes.txt');
  await expect(item).toHaveText('JSON');
  await again.locator('.cm-line').first().click();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('m');
  await rows(page).filter({ hasText: 'Reset to Plain Text' }).click();
  await expect(item).toHaveText('Plain Text');
});

test('W24 files.associations: Configure File Association for .ext, and the setting', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'app.log'), 'name: demo\ncount: 3\n');
  await fs.writeFile(path.join(temp, 'other.log'), 'a: 1\n');
  await start(page);
  await open(page, 'app.log');
  const item = page.locator('footer.status-bar').getByRole('button', { name: /^Select Language Mode/ });
  await expect(item).toHaveText('Plain Text');
  await item.click();
  await rows(page).filter({ hasText: "Configure File Association for '.log'..." }).click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', "Select Language Mode to Associate with '.log'");
  await page.keyboard.type('yaml');
  await page.keyboard.press('Enter');
  await expect(item).toHaveText('YAML');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('tas:settings')))!)).toEqual({ 'files.associations': { '*.log': 'yaml' } });
  // Every .log file.
  await open(page, 'other.log');
  await expect(item).toHaveText('YAML');
  // Edited in Settings (JSON value): a folder pattern.
  await page.keyboard.press('Control+,');
  const d = page.getByRole('dialog', { name: 'Preferences' });
  await d.getByRole('searchbox', { name: 'Search settings' }).fill('files.associations');
  const box = d.locator('[data-setting-id="files.associations"]').getByRole('textbox', { name: 'Associations' });
  await box.fill('{"*.log": "ini"}');
  await box.press('Enter');
  await d.getByRole('searchbox', { name: 'Search settings' }).focus();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(d).toBeHidden();
  await page.getByLabel('Source of other.log').click();
  await expect(item).toHaveText('Ini');
});

test('W25 Encoding: detected (UTF-16, BOM), Reopen with Encoding, Save with Encoding', async ({ page }) => {
  // café in Windows-1252 bytes; a UTF-16 LE file with its BOM.
  await fs.writeFile(path.join(temp, 'latin.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
  await fs.writeFile(path.join(temp, 'wide.txt'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('wide text\n', 'utf16le')]));
  await start(page);
  const wide = await open(page, 'wide.txt');
  const item = page.locator('footer.status-bar').getByRole('button', { name: /^Select Encoding/ });
  await expect(item).toHaveText('UTF-16 LE');
  await expect(wide.locator('.cm-line').first()).toHaveText('wide text');
  const latin = await open(page, 'latin.txt');
  await expect(item).toHaveText('UTF-8');
  await expect(latin.locator('.cm-line').first()).toHaveText('caf�');
  // Reopen with Encoding: Windows 1252.
  await item.click();
  await rows(page).filter({ hasText: 'Reopen with Encoding' }).click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select File Encoding to Reopen File');
  await page.keyboard.type('1252');
  await page.keyboard.press('Enter');
  await expect(latin.locator('.cm-line').first()).toHaveText('café');
  await expect(item).toHaveText('Western (Windows 1252)');
  // Save with Encoding: UTF-8 with BOM is written straight away.
  await item.click();
  await rows(page).filter({ hasText: 'Save with Encoding' }).click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select File Encoding to Save with');
  await page.keyboard.type('bom');
  await page.keyboard.press('Enter');
  await expect.poll(async () => [...await fs.readFile(path.join(temp, 'latin.txt'))].join(',')).toBe([0xef, 0xbb, 0xbf, 0x63, 0x61, 0x66, 0xc3, 0xa9, 0x0a].join(','));
  await expect(item).toHaveText('UTF-8 with BOM');
  await expect(latin.locator('.cm-line').first()).toHaveText('café');
});

test('W26 files.encoding: the default for files without a byte order mark', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'latin.txt'), Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
  await fs.writeFile(path.join(temp, 'bom.txt'), Buffer.from([0xef, 0xbb, 0xbf, 0x6f, 0x6b, 0x0a]));
  await start(page, { 'files.encoding': 'windows1252' });
  const latin = await open(page, 'latin.txt');
  await expect(latin.locator('.cm-line').first()).toHaveText('café');
  const item = page.locator('footer.status-bar').getByRole('button', { name: /^Select Encoding/ });
  await expect(item).toHaveText('Western (Windows 1252)');
  // A BOM still wins, and is kept when saving.
  const bom = await open(page, 'bom.txt');
  await expect(item).toHaveText('UTF-8 with BOM');
  await bom.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => [...await fs.readFile(path.join(temp, 'bom.txt'))].join(',')).toBe([0xef, 0xbb, 0xbf, 0x6f, 0x6b, 0x21, 0x0a].join(','));
  // Saving the Windows 1252 file keeps its encoding.
  await open(page, 'latin.txt');
  await latin.locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type('s');
  await page.keyboard.press('Control+s');
  await expect.poll(async () => [...await fs.readFile(path.join(temp, 'latin.txt'))].join(',')).toBe([0x63, 0x61, 0x66, 0xe9, 0x73, 0x0a].join(','));
});

test('W27 Select End of Line Sequence: quick pick from the status bar', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'crlf.txt'), 'one\r\ntwo\r\n');
  await start(page);
  const src = await open(page, 'crlf.txt');
  const item = page.locator('footer.status-bar').getByRole('button', { name: /^Line separators/ });
  await expect(item).toHaveText('CRLF');
  await item.click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select End of Line Sequence');
  await expect(rows(page).filter({ hasText: 'CRLF' })).toHaveAttribute('aria-selected', 'true');
  await rows(page).filter({ hasText: /^LF/ }).click();
  await expect(item).toHaveText('LF');
  await src.click();
  await page.keyboard.press('Control+s');
  await expect.poll(() => fs.readFile(path.join(temp, 'crlf.txt'), 'utf8')).toBe('one\ntwo\n');
});

test('W28 Indentation: VS Code order in the status bar, Select Action, tab size, Detect Indentation from Content', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'four.ts'), 'class A {\n    m() {\n        return 1;\n    }\n}\n');
  await start(page);
  await open(page, 'four.ts');
  const bar = page.locator('footer.status-bar');
  // Ln / Col, indentation, encoding, line endings, language: VS Code's order.
  const labels = await bar.locator('.status-item').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
  const at = (re: RegExp) => labels.findIndex((l) => re.test(l));
  expect([at(/^Cursor position/), at(/^Indentation/), at(/^Select Encoding/), at(/^Line separators/), at(/^Select Language Mode/)]).toEqual([...[at(/^Cursor position/), at(/^Indentation/), at(/^Select Encoding/), at(/^Line separators/), at(/^Select Language Mode/)]].sort((a, b) => a - b));
  const item = bar.getByRole('button', { name: /^Indentation/ });
  await expect(item).toHaveText('Spaces: 2');
  await item.click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select Action');
  await rows(page).filter({ hasText: 'Detect Indentation from Content' }).click();
  await expect(item).toHaveText('Spaces: 4');
  await item.click();
  await rows(page).filter({ hasText: 'Change Tab Display Size' }).click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select Tab Size for the Current File');
  await rows(page).filter({ hasText: /^8/ }).click();
  await expect(item).toHaveText('Spaces: 8');
});

test('W29 Problems status item: counts of the open files, click or Ctrl+Shift+M toggles Problems', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'bad.ts'), 'const n: number = "x";\nconst m: string = 1;\n// @ts-expect-error\nconst ok = 1;\n');
  await start(page);
  await open(page, 'bad.ts');
  const item = page.locator('footer.status-bar').getByRole('button', { name: /^Problems:/ });
  await expect(item).toHaveAttribute('aria-label', /^Problems: [2-9]\d* errors/, { timeout: 30_000 });
  await item.click();
  const problems = page.getByRole('region', { name: 'Problems' });
  await expect(problems.first()).toBeVisible();
  await item.click();
  await expect(problems).toHaveCount(0);
  await page.keyboard.press('Control+Shift+M');
  await expect(problems.first()).toBeVisible();
});

test('W30 Status bar context menu: hide and show items, Hide Status Bar', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  const bar = page.locator('footer.status-bar');
  const encoding = bar.getByRole('button', { name: /^Select Encoding/ });
  await expect(encoding).toBeVisible();
  await bar.click({ button: 'right', position: { x: 300, y: 10 } });
  const menu = page.getByRole('menu', { name: 'Status bar' });
  await expect(menu.getByRole('menuitemcheckbox', { name: /Editor Encoding/ })).toHaveAttribute('aria-checked', 'true');
  await menu.getByRole('menuitemcheckbox', { name: /Editor Encoding/ }).click();
  await expect(encoding).toBeHidden();
  await expect(menu.getByRole('menuitemcheckbox', { name: /Editor Encoding/ })).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Escape');
  // Kept after a reload.
  await page.reload();
  await open(page, 'Steps/AuthSteps.cs');
  await expect(bar.getByRole('button', { name: /^Line separators/ })).toBeVisible();
  await expect(encoding).toBeHidden();
  await bar.click({ button: 'right', position: { x: 300, y: 10 } });
  await menu.getByRole('menuitemcheckbox', { name: /Editor Encoding/ }).click();
  await expect(encoding).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Hide Status Bar' }).click();
  await expect(bar).toBeHidden();
});

test('W31 Notifications bell: always there, a dot for new ones, slashed in Do Not Disturb, toggles the Notification Center', async ({ page }) => {
  await start(page);
  const bell = page.locator('footer.status-bar .notifications-bell');
  await expect(bell).toBeVisible();
  // It is the last item on the right.
  const last = await page.locator('footer.status-bar .status-item:visible').last().getAttribute('class');
  expect(last).toContain('notifications-bell');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:notice', { detail: 'Something happened.' })));
  await expect(bell.locator('.codicon-bell-dot')).toBeVisible();
  await bell.click();
  await expect(page.getByRole('region', { name: 'Notification Center' })).toBeVisible();
  await bell.click();
  await expect(page.getByRole('region', { name: 'Notification Center' })).toHaveCount(0);
  await page.evaluate(() => { const k = 'tas:rider:view'; localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) ?? '{}'), doNotDisturb: true })); });
  await page.reload();
  await expect(bell.locator('.codicon-bell-slash')).toBeVisible();
});

/** Makes the temporary folder a Git repository with one commit by "Ada Lovelace". */
function gitInit(dir: string) {
  const run = (args: string) => execSync(`git ${args}`, { cwd: dir, stdio: 'pipe' });
  run('init -q -b main');
  run('config user.name "Ada Lovelace"');
  run('config user.email ada@example.com');
  run('add -A');
  run('commit -q -m "First commit"');
}

test('W32 Git blame in the status bar (git.blame.statusBarItem.enabled)', async ({ page }) => {
  gitInit(temp);
  await start(page);
  const src = await open(page, 'Steps/AuthSteps.cs');
  await src.locator('.cm-line').nth(3).click();
  const item = page.locator('footer.status-bar').getByRole('button', { name: /^Blame:/ });
  await expect(item).toHaveText(/Ada Lovelace, today/);
  await expect(item).toHaveAttribute('title', /First commit/);
  await item.click();
  await expect(page.getByRole('region', { name: /Git Log/ }).first()).toBeVisible();
  // Off: no item.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'git.blame.statusBarItem.enabled': false })));
  await page.reload();
  await open(page, 'Steps/AuthSteps.cs');
  await expect(page.locator('footer.status-bar').getByRole('button', { name: 'Cursor position' })).toBeVisible();
  await expect(item).toHaveCount(0);
});

test('W33 Branch item: Checkout to… (branches, tags, Create new branch with validation)', async ({ page }) => {
  gitInit(temp);
  execSync('git branch feature/other', { cwd: temp });
  execSync('git tag v1.0', { cwd: temp });
  await start(page);
  const branch = page.locator('footer.status-bar').getByRole('button', { name: /^Branch main/ });
  await branch.click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Select a branch or tag to checkout');
  await expect(quick(page).locator('.quick-input-separator')).toHaveText(['branches', 'tags']);
  await rows(page).filter({ hasText: 'feature/other' }).click();
  await expect.poll(() => execSync('git branch --show-current', { cwd: temp }).toString().trim()).toBe('feature/other');
  await expect(page.locator('footer.status-bar').getByRole('button', { name: /^Branch feature\/other/ })).toBeVisible({ timeout: 15_000 });
  // Create new branch…: the name is checked while typing.
  await page.locator('footer.status-bar').getByRole('button', { name: /^Branch feature\/other/ }).click();
  await rows(page).filter({ hasText: 'Create new branch...' }).click();
  await expect(quick(page).getByRole('status')).toContainText('Please provide a new branch name');
  await page.keyboard.type('bad name');
  await expect(quick(page).getByRole('status')).toHaveText('Branch name "bad name" is not valid');
  await quickBox(page).fill('topic/new');
  await page.keyboard.press('Enter');
  await expect.poll(() => execSync('git branch --show-current', { cwd: temp }).toString().trim()).toBe('topic/new');
});

test('W34 Sync item: incoming / outgoing counts, a click pushes; Publish Branch without an upstream', async ({ page }) => {
  gitInit(temp);
  const remote = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-w250-remote-'));
  try {
    execSync(`git init -q --bare "${remote}"`);
    execSync(`git remote add origin "${remote}"`, { cwd: temp });
    await start(page);
    const bar = page.locator('footer.status-bar');
    await bar.getByRole('button', { name: 'Publish Branch' }).click();
    await expect(bar.getByRole('button', { name: /^Synchronize Changes: 0 incoming, 0 outgoing/ })).toBeVisible({ timeout: 20_000 });
    await fs.writeFile(path.join(temp, 'new.txt'), 'x\n');
    execSync('git add -A && git commit -q -m "Second"', { cwd: temp });
    await page.evaluate(() => window.dispatchEvent(new Event('tas:git-changed')));
    const sync = bar.getByRole('button', { name: /^Synchronize Changes: 0 incoming, 1 outgoing/ });
    await expect(sync).toHaveText('0↓ 1↑');
    await sync.click();
    await expect(bar.getByRole('button', { name: /^Synchronize Changes: 0 incoming, 0 outgoing/ })).toBeVisible({ timeout: 20_000 });
    expect(execSync('git log --oneline -1 main', { cwd: remote }).toString()).toContain('Second');
  } finally { await fs.rm(remote, { recursive: true, force: true }).catch(() => {}); }
});

test('W35 Focus Status Bar from the keyboard; several cursors read "n selections"', async ({ page }) => {
  await start(page);
  const src = await open(page, 'Steps/AuthSteps.cs');
  await src.locator('.cm-line').nth(2).click();
  // "public" selected, then the next occurrence added (Alt+J).
  await page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; const i = v.state.doc.toString().indexOf('public'); v.dispatch({ selection: { anchor: i, head: i + 6 } }); v.focus(); });
  await page.keyboard.press('Alt+j');
  const pos = page.locator('footer.status-bar').getByRole('button', { name: 'Cursor position' });
  await expect(pos).toHaveText('2 selections (12 characters selected)');
  // View ▸ Focus Status Bar: arrows move between items, Escape goes back to the editor.
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill('>focus status bar');
  await page.keyboard.press('Enter');
  const first = page.locator('footer.status-bar button:visible').first();
  await expect(first).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('footer.status-bar button:visible').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('footer.status-bar button:visible').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(src).toBeFocused();
});

test('W36 Notification toasts: severity icon, source, buttons, stacked bottom right', async ({ page }) => {
  await start(page);
  const notify = (t: string) => page.evaluate((x) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: x })), t);
  await notify('Repository index refreshed.');
  await notify('Build failed: 2 errors.');
  await notify('Auto save is turned off.');
  const toasts = page.locator('.notification-toast');
  await expect(toasts).toHaveCount(3);
  await expect(toasts.nth(0).getByRole('img', { name: 'info' })).toBeVisible();
  await expect(toasts.nth(1).getByRole('img', { name: 'error' })).toBeVisible();
  await expect(toasts.nth(2).getByRole('img', { name: 'warning' })).toBeVisible();
  await expect(toasts.nth(1)).toContainText('Source: TestAuthoring Studio');
  // Bottom right.
  const box = (await toasts.nth(2).boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.x + box.width).toBeGreaterThan(vp.width - 40);
  expect(box.y + box.height).toBeGreaterThan(vp.height - 120);
  // A fourth pushes out the oldest; × closes one.
  await notify('Saved.');
  await expect(toasts).toHaveCount(3);
  await expect(toasts.first()).toContainText('Build failed');
  await toasts.first().getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(toasts).toHaveCount(2);
});

test('W37 Notification Center: every notification, clear one / all, Do Not Disturb, hide', async ({ page }) => {
  await start(page);
  const notify = (t: string) => page.evaluate((x) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: x })), t);
  await notify('First message.');
  await notify('Build failed: 1 error.');
  await page.locator('footer.status-bar .notifications-bell').click();
  const center = page.getByRole('region', { name: 'Notification Center' });
  await expect(center.locator('li')).toHaveCount(2);
  await expect(center.locator('li').first()).toContainText('Build failed');
  await expect(center.locator('li').first().getByRole('img', { name: 'error' })).toBeVisible();
  // Seen: the bell loses its dot.
  await expect(page.locator('footer.status-bar .codicon-bell-dot')).toHaveCount(0);
  await center.getByRole('button', { name: 'Clear Notification: First message.' }).click();
  await expect(center.locator('li')).toHaveCount(1);
  await center.getByRole('button', { name: 'Toggle Do Not Disturb Mode' }).click();
  await expect(page.locator('footer.status-bar .codicon-bell-slash')).toBeVisible();
  await notify('Quiet.');
  await expect(page.locator('.notification-toast')).toHaveCount(0);
  await center.getByRole('button', { name: 'Toggle Do Not Disturb Mode' }).click();
  await center.getByRole('button', { name: 'Clear All Notifications' }).click();
  await expect(center).toContainText('NO NEW NOTIFICATIONS');
  await center.getByRole('button', { name: 'Hide Notifications' }).click();
  await expect(center).toHaveCount(0);
});

test('W38 Progress notification while a build runs: indeterminate bar and Cancel', async ({ page }) => {
  let cancelled = false;
  await page.route('**/api/build/events', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ status: cancelled ? 'cancelled' : 'running', version: 1, action: 'build', target: 'Fixtures.csproj', configuration: 'Debug', output: '', diagnostics: [] })}\n\n` }));
  await page.route('**/api/build/cancel', (route) => { cancelled = true; return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'cancelled', version: 2, output: '', diagnostics: [] }) }); });
  await start(page);
  const toast = page.locator('.progress-toast');
  await expect(toast).toContainText('Building Fixtures.csproj (Debug)…');
  await expect(toast.getByRole('progressbar')).toBeVisible();
  await toast.getByRole('button', { name: 'Cancel' }).click();
  expect(cancelled).toBe(true);
});

test('W39 Notifications commands: Show, Clear All, Do Not Disturb, Accept Primary Action (Ctrl+Shift+A)', async ({ page }) => {
  await start(page);
  const palette = async (cmd: string) => { await page.keyboard.press('Control+Shift+P'); await quickBox(page).fill('>' + cmd); await rows(page).filter({ hasText: cmd }).first().click(); };
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:notice', { detail: 'Hello there.' })));
  await palette('Notifications: Show Notifications');
  const center = page.getByRole('region', { name: 'Notification Center' });
  await expect(center.locator('li')).toHaveCount(1);
  await palette('Notifications: Clear All Notifications');
  await expect(center.locator('li')).toHaveCount(0);
  await expect(page.locator('.notification-toast')).toHaveCount(0);
  await palette('Notifications: Hide Notifications');
  await expect(center).toHaveCount(0);
  await palette('Notifications: Toggle Do Not Disturb Mode');
  await expect(page.locator('footer.status-bar .codicon-bell-slash')).toBeVisible();
  await palette('Notifications: Toggle Do Not Disturb Mode');
  // A toast with a primary action (the progress notification's Cancel): Ctrl+Shift+A presses it.
  let cancelled = false;
  await page.route('**/api/build/events', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: `data: ${JSON.stringify({ status: cancelled ? 'cancelled' : 'running', version: 1, action: 'build', output: '', diagnostics: [] })}\n\n` }));
  await page.route('**/api/build/cancel', (route) => { cancelled = true; return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"cancelled","version":2,"output":"","diagnostics":[]}' }); });
  await page.reload();
  await expect(page.locator('.progress-toast')).toBeVisible();
  await page.locator('footer.status-bar').click();
  await page.keyboard.press('Control+Shift+A');
  await expect.poll(() => cancelled).toBe(true);
});

test("W40 Toast gear: Don't Show Again for that kind of message; the palette resets it", async ({ page }) => {
  await start(page);
  const notify = (t: string) => page.evaluate((x) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: x })), t);
  await notify('Saved 3 files.');
  const toast = page.locator('.notification-toast').filter({ hasText: 'Saved 3 files.' });
  await toast.getByRole('button', { name: 'Configure Notification' }).click();
  await toast.getByRole('menuitem', { name: "Don't Show Again" }).click();
  await expect(toast).toHaveCount(0);
  // The same kind (another number) stays quiet, but is still in the Notification Center.
  await notify('Saved 5 files.');
  await expect(page.locator('.notification-toast').filter({ hasText: 'Saved 5 files.' })).toHaveCount(0);
  await page.locator('footer.status-bar .notifications-bell').click();
  await expect(page.getByRole('region', { name: 'Notification Center' })).toContainText('Saved 5 files.');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  await quickBox(page).fill(">Reset 'Don't Show Again'");
  await expect(rows(page).first()).toContainText("Notifications: Reset 'Don't Show Again' Messages");
  await page.keyboard.press('Enter');
  await expect(page.locator('.notification-toast').filter({ hasText: 'show again.' })).toBeVisible();
  await notify('Saved 7 files.');
  await expect(page.locator('.notification-toast').filter({ hasText: 'Saved 7 files.' })).toBeVisible();
});

test('W41 Customize Layout: visibility toggles that keep the picker open, quick input position, reset', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await page.getByRole('button', { name: 'Customize Layout…' }).click();
  await expect(quickBox(page)).toHaveAttribute('placeholder', 'Customize Layout');
  await expect(quick(page).locator('.quick-input-separator')).toContainText(['Visibility', 'Quick Input Position', 'Modes']);
  const row = (name: string) => rows(page).filter({ hasText: new RegExp(`^${name}`) }).first();
  await expect(row('Status Bar').locator('.codicon-check')).toBeVisible();
  await row('Status Bar').click();
  // Still open, with the new state.
  await expect(row('Status Bar').locator('.codicon-blank')).toBeVisible();
  await expect(page.locator('footer.status-bar')).toBeHidden();
  await row('Primary Side Bar').click();
  await expect(row('Primary Side Bar').locator('.codicon-blank')).toBeVisible();
  // Quick Input Position ▸ Center (Panel Alignment has a Center too, above it).
  await rows(page).filter({ hasText: /^Center$/ }).last().click();
  await expect.poll(async () => (await quick(page).boundingBox())!.y).toBeGreaterThan(100);
  await rows(page).filter({ hasText: 'Reset to Defaults' }).click();
  await expect(page.locator('footer.status-bar')).toBeVisible();
  await expect(row('Primary Side Bar').locator('.codicon-check')).toBeVisible();
  await expect.poll(async () => (await quick(page).boundingBox())!.y).toBeLessThan(20);
});

test('W42 workbench.panel.alignment: center (under the editors) or justify (under the side bars too)', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  // The panel's state is kept across reloads: open it only when it is not shown.
  const showProblems = async () => { await page.waitForTimeout(500); if (!(await page.locator('.dock').first().isVisible())) await page.locator('footer.status-bar').getByRole('button', { name: /^Problems:/ }).click(); };
  await showProblems();
  const panel = page.locator('.dock').first();
  await expect(panel).toBeVisible();
  const explorer = page.getByRole('region', { name: 'Explorer' }).first();
  const side = (await explorer.boundingBox())!;
  // Center: the panel starts right of the side bar.
  expect((await panel.boundingBox())!.x).toBeGreaterThanOrEqual(side.x + side.width - 2);
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.panel.alignment': 'justify' })));
  await page.reload();
  await open(page, 'Steps/AuthSteps.cs');
  await showProblems();
  await expect(panel).toBeVisible();
  // Justify: it spans the window, under the activity bar and the side bar.
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeLessThan(4);
  const w = (await panel.boundingBox())!.width;
  expect(w).toBeGreaterThan(page.viewportSize()!.width - 24);
  // Right: from the editors to the right edge.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.panel.alignment': 'right' })));
  await page.reload();
  await open(page, 'Steps/AuthSteps.cs');
  await showProblems();
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThan(side.x + side.width - 2);
});

test('W43 workbench.sideBar.location: the primary side bar and activity bar on the right; Customize Layout switches it', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  const side = page.locator('#feature-sidebar');
  const editor = page.locator('main.main-content');
  expect((await side.boundingBox())!.x).toBeLessThan((await editor.boundingBox())!.x);
  await page.getByRole('button', { name: 'Customize Layout…' }).click();
  await expect(quick(page).locator('.quick-input-separator')).toContainText(['Primary Side Bar Position', 'Panel Alignment']);
  await rows(page).filter({ hasText: /^Right/ }).first().click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await side.boundingBox())!.x).toBeGreaterThan((await editor.boundingBox())!.x);
  await expect.poll(async () => { const bar = (await page.locator('.activity-bar').boundingBox())!; return bar.x + bar.width; }).toBeGreaterThan(page.viewportSize()!.width - 30);
  // Dragging the resizer to the left widens a right-hand side bar.
  const w = (await side.boundingBox())!.width;
  const r = (await page.locator('.sidebar-resizer').boundingBox())!;
  await page.mouse.move(r.x + r.width / 2, r.y + 100);
  await page.mouse.down();
  await page.mouse.move(r.x - 60, r.y + 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await side.boundingBox())!.width).toBeGreaterThan(w + 30);
});

test('W44 window.menuBarVisibility: toggle (Alt shows it), compact (☰), hidden', async ({ page }) => {
  await start(page, { 'window.menuBarVisibility': 'toggle' });
  const file = page.getByRole('button', { name: 'File menu' });
  await expect(file).toBeHidden();
  await page.keyboard.press('Alt');
  await expect(file).toBeVisible();
  await expect(file).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(file).toBeHidden();
  // Compact: a ☰ shows the menus; using one hides them again.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'window.menuBarVisibility': 'compact' })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(file).toBeHidden();
  await page.getByRole('button', { name: 'Application Menu' }).click();
  await expect(file).toBeVisible();
  await page.getByRole('button', { name: 'Help menu' }).click();
  await page.getByRole('menuitem').first().click();
  await expect(file).toBeHidden();
  // Hidden: no menus, no ☰, Alt does nothing.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'window.menuBarVisibility': 'hidden' })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.keyboard.press('Alt');
  await expect(file).toBeHidden();
  await expect(page.getByRole('button', { name: 'Application Menu' })).toHaveCount(0);
});

test('W45 Command center: the workspace name opens Quick Open, the arrow lists the pickers; window.commandCenter', async ({ page }) => {
  await start(page);
  const cc = page.getByRole('group', { name: 'Command Center' });
  const main = cc.getByRole('button', { name: /^Search .*Ctrl\+P/ });
  await expect(main).toContainText(path.basename(temp));
  await main.click();
  await expect(quickBox(page)).toHaveValue('');
  await expect(quickBox(page)).toHaveAttribute('placeholder', /Search files by name/);
  await page.keyboard.press('Escape');
  await cc.getByRole('button', { name: 'Search Options' }).click();
  await expect(quickBox(page)).toHaveValue('?');
  await page.keyboard.press('Escape');
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'window.commandCenter': false })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(cc).toHaveCount(0);
});

test('W46 window.title and window.titleSeparator', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await expect(page).toHaveTitle(`AuthSteps.cs — ${path.basename(temp)} — TestAuthoring Studio`);
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'window.title': '${activeEditorMedium}${separator}${appName}', 'window.titleSeparator': ' | ' })));
  await page.reload();
  await open(page, 'Steps/AuthSteps.cs');
  await expect(page).toHaveTitle('Steps/AuthSteps.cs | TestAuthoring Studio');
});

test('W47 Activity bar: Accounts and Manage (gear) menus at the bottom', async ({ page }) => {
  await start(page);
  const bar = page.getByRole('navigation', { name: 'Main' });
  await bar.getByRole('button', { name: 'Accounts' }).click();
  await expect(page.getByRole('menu', { name: 'Accounts' })).toContainText('No accounts');
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Manage' }).click();
  const menu = page.getByRole('menu', { name: 'Manage' });
  for (const item of ['Command Palette...', 'Settings', 'Workspace Settings', 'Keyboard Shortcuts', 'Customize Layout...']) await expect(menu.getByRole('menuitem', { name: new RegExp(`^${item.replace(/\./g, '\.')}`) })).toBeVisible();
  await menu.getByRole('menuitem', { name: /^Command Palette/ }).click();
  await expect(quickBox(page)).toHaveValue('>');
  await page.keyboard.press('Escape');
  await bar.getByRole('button', { name: 'Manage' }).click();
  await menu.getByRole('menuitem', { name: /^Settings/ }).click();
  await expect(page.getByRole('dialog', { name: 'Preferences' })).toBeVisible();
});

test('W48 Activity bar: right-click hides / shows items, drag reorders, reset', async ({ page }) => {
  await start(page);
  const bar = page.getByRole('navigation', { name: 'Main' });
  const design = bar.getByRole('button', { name: 'Test Design' });
  await design.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Activity Bar' });
  await menu.getByRole('menuitem', { name: "Hide 'Test Design'" }).click();
  await expect(design).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(design).toHaveCount(0);
  await bar.getByRole('button', { name: 'Dashboard' }).click({ button: 'right' });
  await expect(menu.getByRole('menuitemcheckbox', { name: /Test Design/ })).toHaveAttribute('aria-checked', 'false');
  await menu.getByRole('menuitemcheckbox', { name: /Test Design/ }).click();
  await page.keyboard.press('Escape');
  await expect(design).toBeVisible();
  // Drag Git Changes above Dashboard.
  const labels = () => bar.locator('.activity-top .activity-item').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  await bar.getByRole('button', { name: 'Git Changes' }).dragTo(bar.getByRole('button', { name: 'Dashboard' }));
  await expect.poll(async () => (await labels())[0]).toBe('Git Changes');
  await bar.getByRole('button', { name: 'Dashboard' }).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Reset Location and Visibility' }).click();
  await expect.poll(async () => (await labels())[0]).toBe('Dashboard');
});

test('W49 workbench.activityBar.location: top of the side bar', async ({ page }) => {
  await start(page, { 'workbench.activityBar.location': 'top' });
  const bar = page.getByRole('navigation', { name: 'Main' });
  const side = (await page.locator('#feature-sidebar').boundingBox())!;
  const b = (await bar.boundingBox())!;
  expect(b.height).toBeLessThan(40);
  expect(Math.abs(b.y - side.y)).toBeLessThan(3);
  expect(Math.abs(b.width - side.width)).toBeLessThan(3);
  // The items run across: Dashboard left of Test Generator.
  const d = (await bar.getByRole('button', { name: 'Dashboard' }).boundingBox())!;
  const g = (await bar.getByRole('button', { name: 'Search (Find in Files)' }).boundingBox())!;
  expect(g.x).toBeGreaterThan(d.x);
  expect(Math.abs(g.y - d.y)).toBeLessThan(3);
  // The rest is in the overflow menu, as in VS Code.
  await expect(bar.getByRole('button', { name: /^More pages/ })).toBeVisible();
});

test('W50 workbench.activityBar.iconClickBehavior: toggle hides the side bar, focus focuses it', async ({ page }) => {
  await start(page);
  const bar = page.getByRole('navigation', { name: 'Main' });
  const search = bar.getByRole('button', { name: 'Search (Find in Files)' });
  await search.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'true');
  await search.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'false');
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.activityBar.iconClickBehavior': 'focus' })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await search.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'true');
  await page.locator('footer.status-bar').click();
  await search.click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'true');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#feature-sidebar'))).toBe(true);
});

test('W51 / W54 Explorer view panes: Open Editors (collapsible, kept), close, Save All', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  await open(page, 'Steps/SearchSteps.cs');
  const pane = page.getByRole('region', { name: 'Open Editors' });
  const title = pane.getByRole('button', { name: /OPEN EDITORS/ });
  await expect(title).toHaveAttribute('aria-expanded', 'false');
  // Collapsed: the count of open editors.
  await expect(pane.locator('.view-pane-count')).toHaveText('3');
  await title.click();
  const list = pane.getByRole('list', { name: 'Open Editors' });
  await expect(list.locator('li')).toHaveCount(3);
  await expect(list.locator('li.active')).toContainText('SearchSteps.cs');
  await list.getByRole('button', { name: /AuthSteps\.cs/ }).click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  await list.locator('li', { hasText: 'SearchSteps.cs' }).hover();
  await list.getByRole('button', { name: 'Close SearchSteps.cs' }).click();
  await expect(list.locator('li')).toHaveCount(2);
  // An unsaved editor shows a dot; Save All writes it.
  await page.getByLabel('Source of Steps/AuthSteps.cs').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('// edited');
  await expect(list.locator('.open-editor-close.dirty')).toHaveCount(1);
  await pane.hover();
  await pane.getByRole('button', { name: 'Save All' }).click();
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/AuthSteps.cs'), 'utf8')).toContain('// edited');
  // The pane stays open after a reload.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Open Editors' }).getByRole('button', { name: /OPEN EDITORS/ })).toHaveAttribute('aria-expanded', 'true');
});

test('W52 Outline view: symbols of the active editor, follows the cursor, sort, filter, click goes there', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'shapes.ts'), SHAPES);
  await start(page);
  const src = await open(page, 'shapes.ts');
  const pane = page.getByRole('region', { name: 'Outline' });
  await pane.getByRole('button', { name: /^OUTLINE/ }).click();
  const tree = pane.getByRole('list', { name: 'Outline' });
  await expect(tree.locator('li').first()).toContainText('Shape');
  await expect(tree.locator('li')).toHaveCount(10);
  // Follow Cursor: the symbol at the caret is marked.
  await src.locator('.cm-line').nth(17).click();
  await expect(tree.locator('li[aria-current="true"]')).toContainText('perimeter');
  // A click goes to the symbol.
  await tree.getByRole('button', { name: /^total/ }).click();
  await expect.poll(() => caretLine(page)).toBe(22);
  // Sort by name, then filter.
  await pane.hover();
  await pane.getByRole('button', { name: 'Sort By: Position' }).click();
  await expect(tree.locator('li').first()).toContainText('area');
  await pane.getByLabel('Filter outline').fill('sq');
  await expect(tree.locator('li')).toHaveCount(1);
  await expect(tree.locator('li')).toContainText('Square');
});

test('W53 Timeline view: Local History and Git commits of the active file, a click compares', async ({ page }) => {
  gitInit(temp);
  await start(page);
  const src = await open(page, 'Steps/AuthSteps.cs');
  // A save makes a Local History version.
  await src.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('// timeline');
  await page.keyboard.press('Control+s');
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/AuthSteps.cs'), 'utf8')).toContain('// timeline');
  const pane = page.getByRole('region', { name: 'Timeline' });
  await pane.getByRole('button', { name: /^TIMELINE/ }).click();
  const list = pane.getByRole('list', { name: 'Timeline' });
  await expect(list.getByRole('button', { name: /First commit/ })).toBeVisible();
  await pane.hover();
  await pane.getByRole('button', { name: 'Refresh' }).click();
  await expect(list.getByRole('button', { name: /File Saved/ })).toBeVisible();
  // The Git version against the editor: the added line shows in the diff.
  await list.getByRole('button', { name: /First commit/ }).click();
  await expect(page.getByText('+// timeline').first()).toBeVisible();
  await page.keyboard.press('Escape');
  // Filter: Local History only.
  await pane.hover();
  await pane.getByRole('button', { name: /^Show: / }).click();
  await expect(list.getByRole('button', { name: /First commit/ })).toHaveCount(0);
  await expect(list.getByRole('button', { name: /File Saved/ })).toBeVisible();
});

test('W55 Panel commands: Toggle Maximized Panel, Move Panel Left / Right / To Bottom, Hide Panel', async ({ page }) => {
  await start(page);
  await open(page, 'Steps/AuthSteps.cs');
  const palette = async (cmd: string) => { await page.keyboard.press('Control+Shift+P'); await quickBox(page).fill('>' + cmd); await rows(page).filter({ hasText: cmd }).first().click(); };
  await palette('View: Toggle Maximized Panel');
  const dock = page.locator('.dock').first();
  await expect(dock).toHaveClass(/dock-max/);
  await palette('View: Toggle Maximized Panel');
  await expect(dock).not.toHaveClass(/dock-max/);
  await palette('View: Move Panel Right');
  await expect(dock).toHaveClass(/dock-right/);
  await palette('View: Move Panel To Bottom');
  await expect(dock).toHaveClass(/dock-bottom/);
  await palette('View: Hide Panel');
  await expect(dock).toBeHidden();
});
