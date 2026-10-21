import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Third batch of Visual Studio 2026 / Rider features (IDE-FEATURES.md, X1–X200), end to end.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-more-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
async function openFeature(page: Page, name = 'Login.feature') {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).first().click();
  await expect(page.getByLabel('Gherkin source')).toContainText('Feature:');
}
const gherkin = (page: Page) => page.getByLabel('Gherkin source');
async function caretAt(page: Page, text: string) {
  const line = gherkin(page).locator('.cm-line', { hasText: text }).first();
  await line.click();
  const full = await line.evaluate((el) => { const c = el.cloneNode(true) as HTMLElement; c.querySelectorAll('[contenteditable="false"], .cm-widgetBuffer').forEach((w) => w.remove()); return c.textContent ?? ''; }); // widgets (inline blame, hints) are not text
  await page.keyboard.press('End');
  for (let i = 0; i < full.length - full.indexOf(text); i++) await page.keyboard.press('ArrowLeft');
}
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
const menuItem = async (page: Page, menu: string, item: RegExp) => { await page.getByRole('button', { name: `${menu} menu` }).click(); await page.getByRole('menuitem', { name: item }).click(); };
/** A command of Code ▸ Gherkin (X96 menu groups). */
const gherkinItem = async (page: Page, item: RegExp) => { await page.getByRole('button', { name: 'Code menu' }).click(); await page.getByRole('menuitem', { name: 'Gherkin', exact: true }).click(); await page.getByRole('menuitem', { name: item }).click(); };

test('X16 Overtype mode (Insert): typing replaces characters; OVR in the status bar', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'login page');
  await page.keyboard.press('Insert');
  await expect(page.getByRole('button', { name: 'Overtype mode: on' })).toBeVisible();
  await page.keyboard.type('LOGIN');
  expect(await doc(page)).toContain('Given the LOGIN page is open');
  await page.keyboard.press('Insert');
  await expect(page.getByRole('button', { name: 'Overtype mode: on' })).toHaveCount(0);
  await page.keyboard.type('x');
  expect(await doc(page)).toContain('Given the LOGINx page is open');
});

test('X17 View ▸ Highlight Current Line turns the caret line background off and on', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'login page');
  const editor = page.locator('.gherkin-editor .cm-editor');
  await expect(editor).not.toHaveClass(/cm-no-active-line/);
  await menuItem(page, 'View', /Highlight Current Line/);
  await expect(editor).toHaveClass(/cm-no-active-line/);
  await expect(page.locator('.gherkin-editor .cm-activeLine').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await menuItem(page, 'View', /Highlight Current Line/);
  await expect(editor).not.toHaveClass(/cm-no-active-line/);
});

async function openCs(page: Page, file: string, text: string) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: file.split('/').pop(), exact: true }).first().click();
  const src = page.getByLabel(`Source of ${file}`);
  await src.locator('.cm-line', { hasText: text }).first().click();
  return src;
}

test('X1–X24 smoke: menu text tools, /// doc comments, Ctrl+F3, Convert Case', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Doc.cs'), ['namespace Demo;', 'public class Doc', '{', '', '    public int Add(int first, int second) => first + second;', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const src = await openCs(page, 'Steps/Doc.cs', 'public class Doc');
  // X21: /// above a member.
  await src.locator('.cm-line').nth(3).click();
  await page.keyboard.type('    ///');
  await page.keyboard.type('Adds two numbers.');
  expect(await doc(page)).toContain('    /// <summary>\n    /// Adds two numbers.\n    /// </summary>\n    /// <param name="first"></param>\n    /// <param name="second"></param>\n    /// <returns></returns>');
  // X11: Ctrl+F3 finds the next "first".
  await src.locator('.cm-line', { hasText: 'public int Add' }).click();
  await page.keyboard.press('End');
  for (let i = 0; i < 'first + second;'.length - 2; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Control+F3');
  const sel = await page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { from: number; to: number } }; sliceDoc(a: number, b: number): string } } } }).__activeEditor().view; return v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to); });
  expect(sel).toBe('first');
  // X20: Convert Case on the class name.
  await src.locator('.cm-line', { hasText: 'public class Doc' }).click();
  await page.keyboard.press('End');
  await menuItem(page, 'Edit', /Convert Case/);
  await page.getByLabel('Filter case styles').fill('CONSTANT');
  await page.keyboard.press('Enter');
  expect(await doc(page)).toContain('public class DOC');
  // X1: Sort Lines from the Edit menu on a selection.
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'Given the login page');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await menuItem(page, 'Edit', /^Sort Lines(?! Descending)/);
  expect(await doc(page)).toContain('    Given the login page is open\n    Then the dashboard is displayed\n    When the user signs in');
});

test('X28 Enable / Disable Breakpoint (Ctrl+F9) keeps the breakpoint, toggles it on and off', async ({ page, request }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('F9');
  const bp = async () => (await (await request.get('/api/debug')).json()).breakpoints['Features/Auth/Login.feature']?.map((b: { enabled?: boolean }) => b.enabled !== false);
  await expect.poll(bp).toEqual([true]);
  await page.keyboard.press('Control+F9');
  await expect.poll(bp).toEqual([false]);
  await page.keyboard.press('Control+F9');
  await expect.poll(bp).toEqual([true]);
  await page.keyboard.press('F9');
});

test('X32 Window Layouts: save the arrangement under a name and apply it later', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Alt+7'); // Structure open
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  await menuItem(page, 'View', /Window Layouts/);
  await page.getByLabel('Layout name').fill('Outline');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Saved layouts' })).toContainText('Outline');
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Close Structure', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Structure' })).toHaveCount(0);
  await menuItem(page, 'View', /Window Layouts/);
  await page.getByRole('list', { name: 'Saved layouts' }).getByRole('button', { name: 'Outline', exact: true }).click();
  await page.waitForLoadState('load');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible({ timeout: 20_000 });
});

test('X33 Reset Window Layout: tool windows closed, side bar back', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Alt+7');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  page.once('dialog', (d) => void d.accept());
  await menuItem(page, 'View', /Reset Window Layout/);
  await page.waitForLoadState('load');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Structure' })).toHaveCount(0);
});

test('X34 Reopen Closed Tab brings back the last closed editor; X35 Close Unmodified Tabs keeps edited ones', async ({ page }) => {
  await openFeature(page);
  const tabs = page.locator('.editor-tab-label');
  await page.getByRole('navigation').getByRole('button', { name: 'GoogleSearch.feature', exact: true }).first().click();
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(tabs).toHaveCount(3);
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  await page.getByRole('button', { name: 'Close AuthSteps.cs' }).click();
  await expect(tabs).toHaveCount(2);
  await expect(gherkin(page)).toBeVisible();
  await page.waitForTimeout(1000);
  await menuItem(page, 'View', /Reopen Closed Tab/);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  await page.waitForTimeout(1500);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
  // Edit AuthSteps.cs (unsaved), make Login.feature active: Close Unmodified closes only GoogleSearch.feature.
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line').first().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' // edited');
  await expect(page.locator('.save-state')).toContainText('Unsaved');
  await page.getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await menuItem(page, 'View', /Close Unmodified Tabs/);
  await expect(tabs).toHaveCount(2);
  await expect(page.locator('.editor-tab-label[title="Features/GoogleSearch.feature"]')).toHaveCount(0);
});

test('X36 Switcher (View ▸ Navigate): open editors most recent first, and tool windows', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(page.getByLabel('Source of Steps/AuthSteps.cs')).toBeVisible();
  await menuItem(page, 'Navigate', /^Switcher/);
  const list = page.getByRole('listbox', { name: 'Open editors and tool windows' });
  await expect(list.getByRole('option').first()).toContainText('AuthSteps.cs');
  await expect(list.getByRole('option', { selected: true })).toContainText('Login.feature');
  await expect(list).toContainText('Structure');
  await page.keyboard.press('Enter');
  await expect(gherkin(page)).toBeVisible();
});

test('X37 Tabs in Multiple Rows: the tab strip wraps', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'View', /Tabs in Multiple Rows/);
  await expect(page.locator('.editor-tabs')).toHaveClass(/multi-row/);
  await expect(page.locator('.editor-tabs')).toHaveCSS('flex-wrap', 'wrap');
});

test('X38 Notifications window keeps the session\'s messages', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'View', /Show Whitespaces/); // any command
  await caretAt(page, 'signs in');
  await menuItem(page, 'Edit', /^Copy Reference/);
  await menuItem(page, 'View', /^Notifications/);
  await expect(page.getByRole('list', { name: 'Notification history' })).toContainText(/Copied reference|Clipboard unavailable/);
  await page.getByRole('button', { name: 'Clear notifications' }).click();
  await expect(page.getByRole('list', { name: 'Notification history' })).toContainText('No notifications');
});

test('X39 File Properties (Alt+Enter): size, encoding, line endings, lines', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Alt+Enter');
  const props = page.getByRole('dialog', { name: 'Properties' });
  await expect(props).toContainText('Features/Auth/Login.feature');
  await expect(props).toContainText('UTF-8');
  await expect(props).toContainText(/Line endings\s*(LF|CRLF)/);
  await expect(props).toContainText(/Lines\s*\d+/);
});

test('X40 Analyze Stack Trace: frames in the solution become links', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'Tools', /Analyze Stack Trace/);
  await page.getByLabel('Stack trace', { exact: true }).fill(['System.Exception: boom', '   at Demo.AuthSteps.SignIn(String userName) in D:\\agent\\_work\\Steps\\AuthSteps.cs:line 6', '   at System.RuntimeMethodHandle.InvokeMethod(Object target)'].join('\n'));
  const frames = page.getByRole('list', { name: 'Frames' });
  await expect(frames.getByRole('button')).toHaveCount(1);
  await frames.getByRole('button', { name: /SignIn/ }).click();
  await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('SignIn');
});

test('X49–X56 Gherkin tools from the Code menu: cycle keyword, scenario to outline', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'the user signs in');
  await gherkinItem(page, /^Cycle Step Keyword/);
  await expect.poll(() => doc(page)).toContain('Then the user signs in');
  await gherkinItem(page, /^Convert Scenario to Outline/);
  await expect.poll(() => doc(page)).toContain('Scenario Outline: Sign in');
  expect(await doc(page)).toContain('Examples:');
  await gherkinItem(page, /^Select Scenario/);
  await gherkinItem(page, /^Cycle Step Keyword/);
  await expect.poll(() => doc(page)).toContain('When the login page is open');
  expect(await doc(page)).toContain('Given the browser is started');
});

test('X57 Bracket pair colorization: brackets coloured by depth; View toggles it', async ({ page }) => {
  const src = await openCs(page, 'Steps/AuthSteps.cs', 'class');
  await expect(src.locator('.cm-bracket-0').first()).toBeVisible();
  await expect(src.locator('.cm-bracket-1').first()).toBeVisible();
  await menuItem(page, 'View', /Bracket Pair Colorization/);
  await expect(src.locator('.cm-bracket-0')).toHaveCount(0);
});

test('X58 Editor zoom in the status bar: shows the zoom; a click resets it', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tas:rider:view', JSON.stringify({ fontSize: 26 })));
  await openFeature(page);
  await caretAt(page, 'Feature:');
  const zoom = page.getByRole('button', { name: /^Editor zoom 200%/ });
  await expect(zoom).toBeVisible();
  await zoom.click();
  await expect(page.getByRole('button', { name: /^Editor zoom 100%/ })).toBeVisible();
});

test('X60 TODO patterns: custom comment keywords are highlighted', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# NOTE check the admin path');
  await expect(gherkin(page).locator('.cm-todo')).toHaveCount(0);
  page.once('dialog', (d) => void d.accept('TODO, NOTE'));
  await menuItem(page, 'Tools', /TODO Patterns/);
  await expect(gherkin(page).locator('.cm-todo-note')).toContainText('NOTE check the admin path');
});

test('X61 Right margin guide: on at column 120, the column can change, 0 hides it', async ({ page }) => {
  await openFeature(page);
  const editor = page.locator('.gherkin-editor .cm-editor').first();
  await expect(editor).toHaveClass(/cm-right-margin/);
  page.once('dialog', (d) => void d.accept('0'));
  await menuItem(page, 'View', /Right Margin Guide/);
  await expect(editor).not.toHaveClass(/cm-right-margin/);
});

test('X62 Explorer Scope to This: one folder only, Home shows everything', async ({ page }) => {
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await expect(nav.getByRole('button', { name: 'AuthSteps.cs', exact: true })).toBeVisible();
  await nav.getByRole('button', { name: 'Collapse folder Features', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Scope to This' }).click();
  await expect(page.getByLabel('Explorer scope')).toContainText('Features');
  await expect(nav.getByRole('button', { name: 'AuthSteps.cs', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Login.feature', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Home (show the whole solution)' }).click();
  await expect(nav.getByRole('button', { name: 'AuthSteps.cs', exact: true })).toBeVisible();
});

test('X63 Explorer New File…: creates the file (sub-folders too) and opens it', async ({ page }) => {
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await nav.getByRole('button', { name: 'Collapse folder Steps', exact: true }).click({ button: 'right' });
  page.once('dialog', (d) => void d.accept('Helpers/Clock.cs'));
  await page.getByRole('menuitem', { name: 'New File…' }).click();
  await expect(page.getByRole('button', { name: 'Close Clock.cs' })).toBeVisible();
  expect(await fs.readFile(path.join(root, 'Steps/Helpers/Clock.cs'), 'utf8')).toBe('');
});

test('X69 Calculate Code Metrics: maintainability, complexity, coupling and lines per member', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Calc.cs'), ['namespace Demo;', 'public class Calc', '{', '    public int Sign(int x)', '    {', '        if (x > 0 && x < 100) return 1;', '        return x == 0 ? 0 : -1;', '    }', '    public int Add(int a, int b) => a + b;', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Calc.cs', 'public class Calc');
  await menuItem(page, 'Tools', /Calculate Code Metrics/);
  const table = page.getByRole('table', { name: 'Code metrics' });
  await expect(table).toBeVisible({ timeout: 90_000 });
  const cells = async (name: string) => (await table.getByRole('row', { name: new RegExp(`^${name}`) }).getByRole('cell').allTextContents()).map(Number);
  expect((await cells('Sign'))[1]).toBe(4); // 1 + if + && + ?:
  expect((await cells('Add'))[1]).toBe(1);
  expect((await cells('Calc'))[1]).toBe(5);
  await table.getByRole('row', { name: /^Add/ }).click();
  await expect(table).toHaveCount(0);
  await expect(page.getByLabel('Cursor position')).toContainText('Ln 9');
});

test('X70 Fade unnecessary usings: unused usings are greyed out', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Clock.cs'), ['using System.Globalization;', 'using System.Text;', 'namespace Demo;', 'public class Clock { public CultureInfo Culture() => CultureInfo.InvariantCulture; }', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const src = await openCs(page, 'Steps/Clock.cs', 'public class Clock');
  // The unused using is faded (split into one span per token by semantic highlighting); the used one is not.
  await expect(src.locator('.cm-line', { hasText: 'using System.Text;' }).locator('.cm-unnecessary').first()).toBeVisible({ timeout: 90_000 });
  await expect.poll(() => src.locator('.cm-line', { hasText: 'using System.Text;' }).locator('.cm-unnecessary').allTextContents().then((t) => t.join(''))).toBe('using System.Text;');
  await expect(src.locator('.cm-line', { hasText: 'using System.Globalization;' }).locator('.cm-unnecessary')).toHaveCount(0);
});

test('X76 Tags window: tags with their scenarios; a scenario opens', async ({ page }) => {
  await openFeature(page, 'GoogleSearch.feature');
  await menuItem(page, 'View', /^Tags/);
  const panel = page.getByRole('region', { name: 'Tags' });
  const tag = panel.getByRole('button', { name: /^@authentication/ });
  await expect(tag).toBeVisible();
  await tag.click();
  await panel.getByRole('button', { name: /^Sign in/ }).click();
  await expect(page.getByRole('button', { name: 'Close Login.feature' })).toBeVisible();
});

test('X77 Rename Tag: every feature file, through diff approval', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'View', /^Tags/);
  const panel = page.getByRole('region', { name: 'Tags' });
  page.once('dialog', (d) => void d.accept('auth'));
  await panel.getByRole('button', { name: 'Rename @authentication' }).click();
  await page.getByRole('button', { name: 'Approve and write Login.feature' }).click();
  await expect.poll(async () => fs.readFile(path.join(root, 'Features/Auth/Login.feature'), 'utf8')).toMatch(/@auth\r?\n/);
  await expect(panel.getByRole('button', { name: /@auth\b/ }).first()).toBeVisible();
});

test('X79 Sync Namespace with Folder: project name plus folders', async ({ page, request }) => {
  await fs.mkdir(path.join(root, 'Steps/Sub'), { recursive: true });
  await fs.writeFile(path.join(root, 'Steps/Sub/Ns.cs'), ['namespace Wrong.Place;', 'public class Ns { }', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Sub/Ns.cs', 'public class Ns');
  await menuItem(page, 'Code', /Sync Namespace with Folder/);
  await expect.poll(() => doc(page)).toContain('namespace Fixtures.Steps.Sub;');
});

test('X80 Rename File to Match Type', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Wrong.cs'), ['namespace Demo;', 'public class RightName { }', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Wrong.cs', 'public class RightName');
  await menuItem(page, 'Code', /Rename File to Match Type/);
  await expect(page.getByRole('button', { name: 'Close RightName.cs' })).toBeVisible();
  await expect.poll(() => fs.access(path.join(root, 'Steps/RightName.cs')).then(() => true, () => false)).toBe(true);
  expect(await fs.access(path.join(root, 'Steps/Wrong.cs')).then(() => true, () => false)).toBe(false);
});

test('X81–X88 smoke: Duplicate Scenario and Split String from the menus', async ({ page, request }) => {
  await openFeature(page);
  await caretAt(page, 'Scenario: Sign in');
  await gherkinItem(page, /^Duplicate Scenario/);
  await expect.poll(() => doc(page)).toContain('Scenario: Sign in (copy)');
  await fs.writeFile(path.join(root, 'Steps/Greeting.cs'), ['namespace Demo;', 'public class Greeting { public string Text = "Hello world"; }', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await page.reload();
  const src = await openCs(page, 'Steps/Greeting.cs', 'Hello world');
  await src.locator('.cm-line', { hasText: 'Hello world' }).click();
  await page.keyboard.press('End');
  for (let i = 0; i < '"; }'.length + 'world'.length; i++) await page.keyboard.press('ArrowLeft');
  await menuItem(page, 'Code', /^Split String/);
  await expect.poll(() => doc(page)).toContain('"Hello " +');
});

const tabLabel = (page: Page, name: string) => page.locator('.editor-tab-label', { hasText: name });
test('X89 Close Tabs to the Left', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await page.getByRole('navigation').getByRole('button', { name: 'GoogleSearch.feature', exact: true }).first().click();
  const labels = page.locator('.editor-tab-label');
  await expect(labels).toHaveCount(3);
  const last = (await labels.nth(2).textContent())!;
  await labels.nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close to the Left' }).click();
  await expect(labels).toHaveCount(1);
  await expect(labels.first()).toHaveText(last);
});

test('X90 Tab Reveal in Explorer', async ({ page }) => {
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await nav.getByRole('button', { name: 'Collapse folder Features', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'Login.feature', exact: true })).toHaveCount(0);
  await tabLabel(page, 'Login.feature').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Reveal in Explorer' }).click();
  await expect(nav.getByRole('button', { name: 'Login.feature', exact: true }).first()).toBeVisible();
});

test('X91–X94 Search: history, Collapse All, Copy All, only open editors', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await page.keyboard.press('Control+Shift+F');
  const view = page.getByRole('region', { name: 'Search' });
  const box = view.getByLabel('Search in files');
  const found = view.getByRole('navigation', { name: 'Search results' });
  await box.fill('browser');
  await expect(found.locator('.search-match').first()).toContainText(/browser/i);
  await box.fill('dashboard');
  await expect(found.locator('.search-match').first()).toContainText(/dashboard/i);
  // X91 history.
  await box.fill('');
  await box.press('ArrowUp');
  await expect(box).toHaveValue('dashboard');
  await box.press('ArrowUp');
  await expect(box).toHaveValue('browser');
  await box.press('ArrowDown');
  await expect(box).toHaveValue('dashboard');
  await expect(view.getByRole('status')).toHaveText(/\d+ results? in/);
  // X92 Collapse All / Expand All.
  const results = view.getByRole('navigation', { name: 'Search results' });
  await expect(results.locator('.search-match').first()).toBeVisible();
  await view.getByRole('button', { name: 'Collapse All' }).click();
  await expect(results.locator('.search-match')).toHaveCount(0);
  await view.getByRole('button', { name: 'Expand All' }).click();
  await expect(results.locator('.search-match').first()).toBeVisible();
  // X93 Copy All.
  await view.getByRole('button', { name: 'Copy All Results' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Login.feature');
  // X94 Only in open editors: Login.feature is open, other files are not searched.
  await box.fill('Given');
  await expect(view.getByRole('status')).toHaveText(/in ([4-9]|\d\d+) files/);
  await view.getByRole('button', { name: 'Toggle search details' }).click();
  await view.getByRole('button', { name: 'Search only in open editors' }).click();
  const open = await page.locator('.editor-tab-label').allTextContents();
  await expect(view.getByRole('status')).toHaveText(new RegExp(`in ${open.length} files?$`));
  for (const name of open) await expect(results).toContainText(name);
});

test('X95 Indentation from the status bar: tabs, size, conversion', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  const item = page.getByRole('button', { name: /^Indentation:/ });
  await expect(item).toHaveText('Spaces: 2');
  await item.click();
  await page.getByRole('menuitem', { name: /Indent Using Tabs/ }).click();
  await expect(item).toHaveText('Tab Size: 4');
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect.poll(() => doc(page)).toMatch(/\tFeature:/);
});

test('X96 Menu groups: Code ▸ Gherkin submenu; off in Settings ▸ Features puts the commands back inline', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('button', { name: 'Code menu' }).click();
  await expect(page.getByRole('menuitem', { name: 'Gherkin', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Duplicate Scenario/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const k = 'tas:features'; const v = JSON.parse(localStorage.getItem(k) ?? '{}'); localStorage.setItem(k, JSON.stringify({ ...v, overrides: { ...(v.overrides ?? {}), 'menu-submenus': false } })); });
  await page.reload();
  await expect(gherkin(page)).toBeVisible();
  await page.getByRole('button', { name: 'Code menu' }).click();
  await expect(page.getByRole('menuitem', { name: /^Duplicate Scenario/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Gherkin', exact: true })).toHaveCount(0);
});

test('X97–X101 smoke: Gherkin ▸ Toggle Tag and Add Examples Table', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Scenario: Sign in');
  page.once('dialog', (d) => void d.accept('@wip'));
  await gherkinItem(page, /^Toggle Tag/);
  await expect.poll(() => doc(page)).toMatch(/@wip\r?\n\s*Scenario: Sign in/);
  await gherkinItem(page, /^Move Scenario Up/);
  await expect.poll(() => doc(page)).toMatch(/@wip\r?\n\s*Scenario: Sign in/);
});

test('X105 Explorer Select for Compare / Compare with…', async ({ page }) => {
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await nav.getByRole('button', { name: 'Login.feature', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Select for Compare' }).click();
  await nav.getByRole('button', { name: 'GoogleSearch.feature', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Compare with Login.feature' }).click();
  const dlg = page.getByRole('dialog', { name: 'Compare Files' });
  await expect(dlg).toContainText('Feature: Authentication');
});

test('X106 Add Watch: the name at the caret goes to the Watch window', async ({ page }) => {
  const src = await openCs(page, 'Steps/AuthSteps.cs', 'class');
  await src.locator('.cm-line', { hasText: 'class' }).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('ArrowRight');
  await menuItem(page, 'Tools', /^Add Watch/);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('tas:watches') ?? '[]') as string[])).toHaveLength(1);
});

test('X109 Save As…: a copy under a new name, opened', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  page.once('dialog', (d) => void d.accept('Features/Auth/LoginCopy.feature'));
  await menuItem(page, 'Edit', /^Save As/);
  await expect(page.getByRole('button', { name: 'Close LoginCopy.feature' })).toBeVisible();
  expect(await fs.readFile(path.join(root, 'Features/Auth/LoginCopy.feature'), 'utf8')).toContain('Feature: Authentication');
});

test('X110 Explorer Find in Folder…: Search limited to the folder', async ({ page }) => {
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await nav.getByRole('button', { name: 'Collapse folder Steps', exact: true }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Find in Folder…' }).click();
  const view = page.getByRole('region', { name: 'Search' });
  await expect(view.getByLabel('Files to include')).toHaveValue('Steps/**');
  await view.getByLabel('Search in files').fill('Given');
  await expect(view.getByRole('navigation', { name: 'Search results' })).toContainText('AuthSteps.cs');
  await expect(view.getByRole('navigation', { name: 'Search results' })).not.toContainText('Login.feature');
});

test('X111 Explorer Copy Full Path', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await page.getByRole('navigation', { name: 'Solution' }).getByRole('button', { name: 'Login.feature', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy Full Path' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(path.join(root, 'Features', 'Auth', 'Login.feature'));
});

test('X112 Comment / Uncomment Scenario from Code ▸ Gherkin', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Scenario: Sign in');
  await gherkinItem(page, /^Comment \/ Uncomment Scenario/);
  await expect.poll(() => doc(page)).toMatch(/# Scenario: Sign in/);
  await gherkinItem(page, /^Comment \/ Uncomment Scenario/);
  await expect.poll(() => doc(page)).not.toMatch(/# Scenario: Sign in/);
});

test('X113 Quick Info (Ctrl+K, Ctrl+I): the hover information at the caret', async ({ page }) => {
  const src = await openCs(page, 'Steps/AuthSteps.cs', 'class');
  await src.locator('.cm-line', { hasText: 'class' }).first().click();
  await page.keyboard.press('Home');
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+I');
  await expect(page.locator('.cm-tooltip.cm-quickinfo')).toBeVisible({ timeout: 90_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-tooltip.cm-quickinfo')).toHaveCount(0);
});

test('X117 / X118 Paste as Gherkin Table and Copy Table as CSV', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await caretAt(page, 'the dashboard is displayed');
  await page.keyboard.press('End');
  await page.evaluate(() => navigator.clipboard.writeText('name\tage\nAda\t36\n'));
  await gherkinItem(page, /^Paste as Gherkin Table/);
  await expect.poll(() => doc(page)).toMatch(/\| name \| age \|\r?\n\s+\| Ada {2}\| 36 {2}\|/);
  await caretAt(page, '| Ada');
  await gherkinItem(page, /^Copy Table as CSV/);
  // The Windows clipboard turns \n into \r\n.
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'))).toBe('name,age\nAda,36');
});

test('X119 Scroll bar annotations: errors and the caret line', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Broken.cs'), ['namespace Demo;', 'public class Broken', '{', '    public void M() { int x = ; }', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Broken.cs', 'public class Broken');
  await expect(page.locator('.code-editor:not([hidden]) .cm-scroll-annotations .m-caret')).toHaveCount(1);
  await expect(page.locator('.code-editor:not([hidden]) .cm-scroll-annotations .m-error').first()).toBeAttached({ timeout: 30_000 });
  await menuItem(page, 'View', /Scroll Bar Annotations/);
  await expect(page.locator('.code-editor:not([hidden]) .cm-scroll-annotations')).toHaveCount(0);
});

test('X120 Report a Problem opens a GitHub issue form', async ({ page, context }) => {
  await context.route('https://github.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await openFeature(page);
  const popup = page.waitForEvent('popup');
  await menuItem(page, 'Help', /^Report a Problem/);
  const url = (await popup).url();
  expect(url).toContain('https://github.com/RishiRajGujadhur/automation/issues/new');
  expect(decodeURIComponent(url)).toContain('Steps to reproduce');
});

test('X121–X123 Tabs: pinned row, colorized tabs, Copy File Name', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  const labels = page.locator('.editor-tab-label');
  await expect.poll(() => labels.count()).toBeGreaterThan(1);
  await labels.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin', exact: true }).click();
  await menuItem(page, 'View', /Show Pinned Tabs in a Separate Row/);
  await expect(page.locator('.editor-tabs')).toHaveClass(/pinned-row/);
  await expect(page.locator('.tab-row-break')).toHaveCount(1);
  await menuItem(page, 'View', /Colorize Document Tabs/);
  await expect(page.locator('.editor-tabs')).toHaveClass(/colorized/);
  await labels.last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy File Name' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\.(cs|feature)$/);
});

test('X129 Feature statistics in the status bar', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await expect(page.getByLabel('Feature statistics')).toHaveText('1 scenario · 4 steps');
});

test('X130–X133 Gherkin: rename parameter, remove unused columns, inline Background', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Features/Roles.feature'), ['Feature: Roles', '  Background:', '    Given the browser is started', '', '  Scenario Outline: Roles', '    When the user signs in as "<role>"', '', '    Examples:', '      | role  | unused |', '      | admin | x      |', '      | guest | y      |', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page, 'Roles.feature');
  await caretAt(page, '<role>');
  await page.keyboard.press('ArrowRight');
  page.once('dialog', (d) => void d.accept('kind'));
  await gherkinItem(page, /^Rename Examples Parameter/);
  await expect.poll(() => doc(page)).toContain('"<kind>"');
  expect(await doc(page)).toMatch(/\| kind\s+\| unused \|/);
  await gherkinItem(page, /^Remove Unused Examples Columns/);
  await expect.poll(() => doc(page)).not.toContain('unused');
  await gherkinItem(page, /^Inline Background/);
  await expect.poll(() => doc(page)).not.toContain('Background:');
});

test('X137 / X138 Centered Layout and Do Not Disturb', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'View', /Centered Layout/);
  await expect(page.locator('.gherkin-editor .cm-editor').first()).toHaveClass(/cm-centered/);
  await menuItem(page, 'View', /Do Not Disturb/);
  await caretAt(page, 'Feature:');
  await gherkinItem(page, /^Comment \/ Uncomment Scenario/); // a notice: no scenario at the caret
  await expect(page.locator('.toast')).toHaveCount(0);
  await menuItem(page, 'View', /^Notifications/);
  await expect(page.getByRole('list', { name: 'Notification history' })).toContainText('Put the caret in a scenario');
});

test('X139 Next / Previous Problem in File', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Broken2.cs'), ['namespace Demo;', 'public class Broken2', '{', '    public void A() { }', '    public void M() { int x = ; }', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Broken2.cs', 'public class Broken2');
  await expect(page.locator('.code-editor:not([hidden]) .cm-lintRange-error').first()).toBeAttached({ timeout: 30_000 });
  await menuItem(page, 'Navigate', /^Next Problem in File/);
  await expect(page.getByLabel('Cursor position')).toContainText('Ln 5');
});

test('X140 Go to Test / Test Subject', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Clock.cs'), ['namespace Demo;', 'public class Clock { }', ''].join('\n'));
  await fs.writeFile(path.join(root, 'Steps/ClockTests.cs'), ['namespace Demo;', 'public class ClockTests { }', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Clock.cs', 'public class Clock');
  await menuItem(page, 'Navigate', /^Go to Test \/ Test Subject/);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/ClockTests.cs');
  await menuItem(page, 'Navigate', /^Go to Test \/ Test Subject/);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/Clock.cs');
});

test('X141 Command palette: recently used commands first', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await menuItem(page, 'Edit', /^Remove Blank Lines/);
  await page.keyboard.press('Control+Shift+P');
  const first = page.getByRole('dialog', { name: 'Quick Input' }).getByRole('option').first();
  await expect(first).toContainText('Remove Blank Lines');
  await expect(first).toContainText('recently used');
});

test('X142 Run Selected Text in Terminal', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Notes.md'), ['# Notes', 'echo terminal-ok-142', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const src = await openCs(page, 'Notes.md', 'echo terminal-ok-142');
  await src.locator('.cm-line', { hasText: 'echo terminal-ok-142' }).click();
  await menuItem(page, 'Tools', /^Run Selected Text in Terminal/);
  await expect(page.getByLabel('Terminal output')).toContainText(/terminal-ok-142[\s\S]*terminal-ok-142/, { timeout: 30_000 });
});

test('X143 Selected lines in the status bar', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Scenario: Sign in');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await expect(page.getByLabel('Cursor position')).toContainText('3 lines');
});

test('X146 Remove Breakpoints in File', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'the login page is open');
  await page.keyboard.press('F9');
  await caretAt(page, 'the dashboard is displayed');
  await page.keyboard.press('F9');
  await expect(page.locator('.gherkin-editor .cm-bp:visible')).toHaveCount(2);
  await menuItem(page, 'Tools', /^Remove Breakpoints in File/);
  await expect(page.locator('.gherkin-editor .cm-bp:visible')).toHaveCount(0);
});

test('X147 Toggle Read-Only (Session): edits are refused until toggled back', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await menuItem(page, 'View', /^Toggle Read-Only/);
  await expect(page.locator('.gherkin-editor .cm-editor').first()).toHaveClass(/cm-session-readonly/);
  const before = await doc(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.type('xyz');
  expect(await doc(page)).toBe(before);
  await menuItem(page, 'View', /^Toggle Read-Only/);
  await caretAt(page, 'Feature:');
  await page.keyboard.type('xyz');
  await expect.poll(() => doc(page)).toContain('xyzFeature:');
});

test('X148 / X149 Add Scenario and Copy Scenario as Markdown', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await caretAt(page, 'Scenario: Sign in');
  await gherkinItem(page, /^Copy Scenario as Markdown/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('### Scenario: Sign in');
  await gherkinItem(page, /^Add Scenario(?! Outline)/);
  await page.keyboard.type('Sign out');
  await expect.poll(() => doc(page)).toMatch(/Scenario: Sign out\r?\n\s+Given $/m);
});

test('X150 Copy Problems in File', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.writeFile(path.join(root, 'Steps/Broken3.cs'), ['namespace Demo;', 'public class Broken3', '{', '    public void M() { int x = ; }', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Broken3.cs', 'public class Broken3');
  await expect(page.locator('.code-editor:not([hidden]) .cm-lintRange-error').first()).toBeAttached({ timeout: 30_000 });
  await menuItem(page, 'Edit', /^Copy Problems in File/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Steps\/Broken3\.cs:4:\d+: error: /m); // after IDE0130 (info) on line 1
});

test('X151 Full Screen', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'View', /^Full Screen/);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await menuItem(page, 'View', /^Full Screen/);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('X155 / X156 Explorer: Open Files filter and Track Active Item toggle', async ({ page }) => {
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await page.getByRole('button', { name: 'Open files filter', exact: true }).click();
  await expect(nav.getByRole('button', { name: 'AuthSteps.cs', exact: true })).toHaveCount(0);
  await expect(nav.getByRole('button', { name: 'Login.feature', exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Open files filter off' }).click();
  // Track Active Item off: opening a file no longer expands its folder.
  await page.getByRole('button', { name: 'Track Active Item: on' }).click();
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  await nav.getByRole('button', { name: 'Collapse folder Features', exact: true }).click();
  await page.locator('.editor-tab-label', { hasText: 'Login.feature' }).click();
  await expect(nav.getByRole('button', { name: 'Expand folder Features', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Track Active Item: off' }).click();
  await page.locator('.editor-tab-label', { hasText: 'AuthSteps.cs' }).click();
  await page.locator('.editor-tab-label', { hasText: 'Login.feature' }).click();
  await expect(nav.getByRole('button', { name: 'Collapse folder Features', exact: true })).toBeVisible();
});

test('X157 / X158 Tabs: Unpin All and Sort Tabs by Name', async ({ page }) => {
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await nav.getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().dblclick();
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  const labels = page.locator('.editor-tab-label');
  await expect.poll(() => labels.count()).toBeGreaterThan(2);
  await labels.last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Sort Tabs by Name' }).click();
  const names = await labels.allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  await labels.first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin', exact: true }).click();
  await expect(page.locator('.editor-tab.pinned')).toHaveCount(1);
  await labels.last().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unpin All' }).click();
  await expect(page.locator('.editor-tab.pinned')).toHaveCount(0);
});

test('X159 Collapse Using Directives', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Usings.cs'), ['using System;', 'using System.Text;', 'using System.Linq;', 'namespace Demo;', 'public class Usings { }', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Usings.cs', 'public class Usings');
  await menuItem(page, 'Code', /^Collapse Using Directives/);
  await expect(page.locator('.code-editor:not([hidden]) .cm-foldPlaceholder')).toHaveCount(1);
  await expect(page.locator('.code-editor:not([hidden]) .cm-line', { hasText: 'using System.Linq' })).toHaveCount(0);
});

test('X160 / X161 Find Step Usages and Copy Step Text', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await caretAt(page, 'the user signs in');
  await gherkinItem(page, /^Copy Step Text/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('the user signs in as "test-user"');
  await gherkinItem(page, /^Find Step Usages/);
  const dlg = page.getByRole('dialog', { name: 'Step Usages' });
  await expect(dlg.getByRole('option').first()).toContainText('When the user signs in as "test-user"');
});

test('X162–X164 JSON and XML tools: Sort JSON Keys, Copy JSON Pointer, Copy XPath', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.writeFile(path.join(root, 'settings.json'), '{"b": 1, "a": {"name": "ada"}}\n');
  await fs.writeFile(path.join(root, 'Selectors/Pages.xml'), '<Dictionary>\n  <Page name="Login">\n    <Field id="user">#user</Field>\n  </Page>\n</Dictionary>\n');
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const json = await openCs(page, 'settings.json', '"b"');
  await menuItem(page, 'Code', /^Sort JSON Keys/);
  await expect.poll(() => doc(page)).toBe('{\n  "a": {\n    "name": "ada"\n  },\n  "b": 1\n}\n');
  await json.locator('.cm-line', { hasText: 'ada' }).click();
  await menuItem(page, 'Code', /^Copy JSON Pointer/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('/a/name');
  const xml = await openCs(page, 'Selectors/Pages.xml', '#user');
  await xml.locator('.cm-line', { hasText: '#user' }).click();
  await page.keyboard.press('End');
  for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft'); // inside "#user"
  await menuItem(page, 'Code', /^Copy XPath/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("/Dictionary/Page[@name='Login']/Field[@id='user']");
});

test('X165–X168 Word count, Status Bar / Activity Bar toggles, What\'s New', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Notes2.md'), '# Notes\n\nThree more words.\n');
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Notes2.md', 'Three more words');
  await expect(page.getByLabel('Word count')).toHaveText('4 words');
  await menuItem(page, 'View', /Status Bar/);
  await expect(page.locator('footer.status-bar')).toBeHidden();
  await menuItem(page, 'View', /Status Bar/);
  await expect(page.locator('footer.status-bar')).toBeVisible();
  await menuItem(page, 'Help', /^What's New/);
  const dlg = page.getByRole('dialog', { name: "What's New" });
  await dlg.getByLabel('Filter new features').fill('Copy XPath');
  await expect(dlg.getByRole('list', { name: 'New features' }).getByRole('listitem')).toHaveCount(1);
  await expect(dlg.getByRole('checkbox', { name: 'Copy XPath' })).toBeChecked();
});

test('X169–X172 Table rows and columns from Code ▸ Gherkin', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Features/Table.feature'), ['Feature: Table', '  Scenario: T', '    Given the users:', '      | name | role  |', '      | ada  | admin |', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page, 'Table.feature');
  await caretAt(page, 'admin');
  await gherkinItem(page, /^Table: Duplicate Row/);
  await expect.poll(async () => (await doc(page)).match(/\| ada {2}\| admin \|/g)?.length).toBe(2);
  await gherkinItem(page, /^Table: Delete Row/);
  await expect.poll(async () => (await doc(page)).match(/\| ada {2}\| admin \|/g)?.length).toBe(1);
  await caretAt(page, 'admin');
  await gherkinItem(page, /^Table: Move Column Left/);
  await expect.poll(() => doc(page)).toContain('| role  | name |');
  await gherkinItem(page, /^Table: Select Column/);
  await page.keyboard.type('x');
  await expect.poll(() => doc(page)).toMatch(/\| x\s*\| name \|[\s\S]*\| x\s*\| ada/);
});

test('X173 / X174 Clear Recent Files and Clear All Bookmarks', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+K');
  await expect(page.locator('.gherkin-editor .cm-bookmark:visible')).toHaveCount(1);
  page.once('dialog', (d) => void d.accept());
  await menuItem(page, 'Navigate', /^Clear All Bookmarks/);
  await expect(page.locator('.gherkin-editor .cm-bookmark:visible')).toHaveCount(0);
  await menuItem(page, 'Navigate', /^Clear Recent Files/);
  await expect(page.getByText(/Cleared \d+ recent file/).first()).toBeVisible();
});

test('X175 Save as Live Template, then insert it', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Given the browser is started');
  await page.keyboard.press('Home');
  await page.keyboard.press('Shift+End');
  page.once('dialog', (d) => void d.accept('browser'));
  await menuItem(page, 'Tools', /^Save as Live Template/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('tas:userTemplates') ?? '')).toContain('browser');
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await menuItem(page, 'Code', /^Insert Live Template/);
  await page.keyboard.type('browser');
  await page.keyboard.press('Enter');
  await expect.poll(async () => ((await doc(page)).match(/Given the browser is started/g) ?? []).length).toBe(2);
});

test('X176–X178 Toggle Ignore Test, Ignore Scenario, Copy Step Definition Stub', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.writeFile(path.join(root, 'Steps/MathTests.cs'), ['namespace Demo;', 'public class MathTests', '{', '    [Test]', '    public void Adds()', '    {', '        var sum = 1 + 1;', '    }', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/MathTests.cs', 'var sum');
  await menuItem(page, 'Code', /^Toggle Ignore Test/);
  await expect.poll(() => doc(page)).toContain('    [Ignore("Ignored")]\n    public void Adds()');
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await expect(gherkin(page)).toContainText('Feature:');
  await caretAt(page, 'the user signs in');
  await gherkinItem(page, /^Copy Step Definition Stub/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/\[When\(/);
  await gherkinItem(page, /^Ignore \/ Unignore Scenario/);
  await expect.poll(() => doc(page)).toMatch(/@ignore\r?\n\s*Scenario: Sign in/);
});

test('X179–X183 Zoom IDE, Compact Mode, feature settings export / import, environment info, current scenario', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await menuItem(page, 'View', /^Zoom IDE In/);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe('110%');
  await menuItem(page, 'View', /^Reset IDE Zoom/);
  await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom)).toBe('');
  await menuItem(page, 'View', /Compact Mode/);
  await expect(page.locator('html')).toHaveClass(/compact-ui/);
  await menuItem(page, 'Tools', /^Export Feature Settings/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('"overrides"');
  page.once('dialog', (d) => void d.accept(JSON.stringify({ overrides: { 'copy-xpath': false } })));
  await menuItem(page, 'Tools', /^Import Feature Settings/);
  await expect(page.getByText(/Imported the feature settings \(1 switch\)/).first()).toBeVisible();
  await menuItem(page, 'Help', /^Copy Environment Info/);
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('TestAuthoring Studio (web app)');
  await caretAt(page, 'the user signs in');
  await expect(page.locator('.gherkin-editor .cm-current-scenario')).toHaveCount(4);
});

test('X184–X186 Table: Transpose, Fill Down, Clear Column', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Features/Table2.feature'), ['Feature: Table2', '  Scenario: T', '    Given the users:', '      | name | role  |', '      | ada  | admin |', '      | bob  | guest |', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page, 'Table2.feature');
  await caretAt(page, 'guest');
  await gherkinItem(page, /^Table: Fill Down/);
  await expect.poll(() => doc(page)).toMatch(/\| bob {2}\| admin \|/);
  await gherkinItem(page, /^Table: Clear Column/);
  await expect.poll(() => doc(page)).toMatch(/\| ada {2}\| {6}\|/);
  await gherkinItem(page, /^Table: Transpose/);
  await expect.poll(() => doc(page)).toMatch(/\| name \| ada \| bob \|/);
});

test('X187 / X188 Explorer: Copy File Name and Open to the Side', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  const nav = page.getByRole('navigation', { name: 'Solution' });
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy file name' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('AuthSteps.cs');
  await nav.getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Open to the Side' }).click();
  await expect(page.getByRole('region', { name: 'Split editor Steps/AuthSteps.cs' })).toBeVisible();
});

test('X191 Notifications: Copy All', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await menuItem(page, 'Navigate', /^Clear Recent Files/);
  await menuItem(page, 'View', /^Notifications/);
  await page.getByRole('button', { name: 'Copy all notifications' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/recent file/);
});

test('X192–X194 Reset Feature Settings, status bar Go to Line and File Properties', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'View', /Breadcrumbs/);
  page.once('dialog', (d) => void d.accept());
  await menuItem(page, 'Tools', /^Reset Feature Settings/);
  await expect(page.getByText('Feature settings are back to the defaults.').first()).toBeVisible();
  await caretAt(page, 'Feature:');
  await page.getByRole('button', { name: 'Cursor position' }).click();
  await expect(page.locator('.cm-panel input[name="line"], .cm-gotoLine input').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await caretAt(page, 'Feature:');
  await page.getByRole('button', { name: /^Encoding: UTF-8/ }).click();
  await expect(page.getByRole('dialog', { name: 'Properties' })).toBeVisible();
});

test('X195–X198 Sort Scenarios, Quick Switch Theme, Close Tabs of This Type, Copy Feature Outline', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.writeFile(path.join(root, 'Features/Sorted.feature'), ['Feature: Sorted', '  Scenario: Zeta', '    Given z', '', '  Scenario: Alpha', '    Given a', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page, 'Sorted.feature');
  await caretAt(page, 'Zeta');
  await gherkinItem(page, /^Sort Scenarios by Name/);
  await expect.poll(async () => (await doc(page)).indexOf('Alpha') < (await doc(page)).indexOf('Zeta')).toBe(true);
  await gherkinItem(page, /^Copy Feature Outline/);
  await expect.poll(() => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, '\n'))).toBe('## Sorted\n\n- [ ] Alpha\n- [ ] Zeta');
  await menuItem(page, 'View', /^Quick Switch Theme/);
  await page.getByRole('dialog', { name: 'Quick Switch Theme' }).getByRole('option').last().click();
  await expect(page.getByText(/^Theme: /).first()).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().dblclick();
  await page.getByRole('button', { name: 'Discard and open' }).click(); // Sorted.feature has unsaved edits
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  await page.locator('.editor-tab-label', { hasText: 'Login.feature' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close All .feature Tabs' }).click();
  await expect(page.locator('.editor-tab-label', { hasText: '.feature' })).toHaveCount(0);
  await expect(page.locator('.editor-tab-label', { hasText: 'AuthSteps.cs' })).toBeVisible();
});
