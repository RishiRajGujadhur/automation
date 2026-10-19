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
  const full = (await line.textContent()) ?? '';
  await page.keyboard.press('End');
  for (let i = 0; i < full.length - full.indexOf(text); i++) await page.keyboard.press('ArrowLeft');
}
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
const menuItem = async (page: Page, menu: string, item: RegExp) => { await page.getByRole('button', { name: `${menu} menu` }).click(); await page.getByRole('menuitem', { name: item }).click(); };
/** A command of Code ▸ Gherkin (X96 menu groups). */
const gherkinItem = async (page: Page, item: RegExp) => { await page.getByRole('button', { name: 'Code menu' }).click(); await page.getByRole('menuitem', { name: 'Gherkin' }).click(); await page.getByRole('menuitem', { name: item }).click(); };

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
  await menuItem(page, 'Edit', /^Sort Lines/);
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
  await expect(src.locator('.cm-unnecessary')).toHaveText('using System.Text;', { timeout: 90_000 });
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
  await expect(page.getByRole('menuitem', { name: 'Gherkin' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /^Duplicate Scenario/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const k = 'tas:features'; const v = JSON.parse(localStorage.getItem(k) ?? '{}'); localStorage.setItem(k, JSON.stringify({ ...v, overrides: { ...(v.overrides ?? {}), 'menu-submenus': false } })); });
  await page.reload();
  await expect(gherkin(page)).toBeVisible();
  await page.getByRole('button', { name: 'Code menu' }).click();
  await expect(page.getByRole('menuitem', { name: /^Duplicate Scenario/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Gherkin' })).toHaveCount(0);
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
  await expect(page.locator('.cm-tooltip .cm-quickinfo')).toBeVisible({ timeout: 90_000 });
  await page.keyboard.press('Escape');
  await expect(page.locator('.cm-tooltip .cm-quickinfo')).toHaveCount(0);
});
