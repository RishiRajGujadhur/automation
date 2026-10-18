import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// JetBrains Rider features (RIDER.md, J1–J37).
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-rider-'));
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
/** Puts the caret on the first line containing `text`, at `text`'s first character. */
async function caretAt(page: Page, text: string) {
  const line = gherkin(page).locator('.cm-line', { hasText: text }).first();
  await line.click();
  const full = (await line.textContent()) ?? '';
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft', { delay: 0 });
  for (let i = 1; i < full.length - full.indexOf(text); i++) await page.keyboard.press('ArrowLeft');
}
type Sel = { ranges: { from: number; to: number; text: string }[]; main: number; doc: string };
/** The active editor's selection ranges (development build hook). */
const selection = (page: Page) => page.evaluate(() => {
  const a = (window as unknown as { __activeEditor: () => { view: { state: { selection: { ranges: { from: number; to: number }[]; mainIndex: number }; doc: { toString(): string }; sliceDoc(a: number, b: number): string } } } | undefined }).__activeEditor();
  const st = a!.view.state;
  return { ranges: st.selection.ranges.map((r) => ({ from: r.from, to: r.to, text: st.sliceDoc(r.from, r.to) })), main: st.selection.mainIndex, doc: st.doc.toString() } as Sel;
});
const selected = (page: Page) => page.evaluate(() => getSelection()?.toString() ?? '');

test('J1 Extend / Shrink Selection: word, line, scenario; back again; also from the Edit menu', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Shift+Alt+ArrowRight');
  expect(await selected(page)).toBe('signs');
  await page.keyboard.press('Shift+Alt+ArrowRight');
  expect(await selected(page)).toMatch(/^When the user signs in/);
  await page.keyboard.press('Shift+Alt+ArrowRight');
  expect((await selected(page)).split('\n').length).toBeGreaterThan(1);
  await page.keyboard.press('Shift+Alt+ArrowLeft');
  await page.keyboard.press('Shift+Alt+ArrowLeft');
  expect(await selected(page)).toBe('signs');
  await page.getByRole('button', { name: 'Edit menu' }).click();
  await page.getByRole('menuitem', { name: /Extend Selection/ }).click();
  expect(await selected(page)).toMatch(/^When the user signs in/);
});

test('J2 Toggle Case (Ctrl+Shift+U): word at the caret to upper case and back', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Shift+U');
  await expect(gherkin(page)).toContainText('the user SIGNS in');
  await page.keyboard.press('Control+Shift+U');
  await expect(gherkin(page)).toContainText('the user signs in');
});

test('J3 Join Lines (Ctrl+Shift+J): this line and the next become one, indentation dropped', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Shift+J');
  await expect(gherkin(page)).toContainText('When the user signs in as "test-user" Then the dashboard is displayed');
});

test('J4 Add Selection for Next Occurrence (Alt+J), Unselect (Alt+Shift+J), Select All (Ctrl+Alt+Shift+J)', async ({ page }) => {
  await openFeature(page);
  const carets = async () => (await selection(page)).ranges.length;
  await caretAt(page, 'the login page');
  await page.keyboard.press('Alt+J'); // the word
  await page.keyboard.press('Alt+J'); // the next "the"
  await page.keyboard.press('Alt+J');
  await expect.poll(carets).toBe(3);
  await page.keyboard.press('Alt+Shift+J');
  await expect.poll(carets).toBe(2);
  await page.keyboard.press('Control+Alt+Shift+J');
  const doc = (await selection(page)).doc;
  await expect.poll(carets).toBe(doc.match(/\bthe\b/g)!.length);
  await page.keyboard.type('a');
  await expect(gherkin(page)).toContainText('Given a login page is open');
  await expect(gherkin(page)).toContainText('Then a dashboard is displayed');
});

test('J5 Start New Line (Shift+Enter) and Start New Line Before Current (Ctrl+Alt+Enter)', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('And below');
  await page.keyboard.press('Control+Alt+Enter');
  await page.keyboard.type('And above');
  const doc = (await selection(page)).doc;
  expect(doc).toContain(['When the user signs in as "test-user"', '    And above', '    And below', '    Then'].join('\n'));
});

test('J6 Add Carets to Ends of Selected Lines (Alt+Shift+G): type once at the end of each line', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Given the login page');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Alt+Shift+G');
  expect((await selection(page)).ranges).toHaveLength(3);
  await page.keyboard.type(' now');
  const doc = (await selection(page)).doc;
  expect(doc).toContain('Given the login page is open now');
  expect(doc).toContain('When the user signs in as "test-user" now');
  expect(doc).toContain('Then the dashboard is displayed now');
});

test('J7 Paste from History (Ctrl+Shift+V): earlier copies, filter, Enter pastes at the caret', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'the login page');
  await page.keyboard.press('Shift+Alt+ArrowRight');
  await page.keyboard.press('Control+C'); // "the"
  await caretAt(page, 'the dashboard');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+C'); // the whole step
  await caretAt(page, 'signs in');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+Shift+V');
  const list = page.getByRole('listbox', { name: 'Clipboard history' });
  await expect(list.getByRole('option')).toHaveCount(2);
  await expect(list.getByRole('option').first()).toContainText('Then the dashboard is displayed');
  await page.getByLabel('Filter clipboard history').fill('the');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await selection(page)).doc).toContain('signs in as "test-user"the\n');
});

test('J8 Insert Live Template (Ctrl+J): a Scenario Outline template with fields, in a feature file', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Then the dashboard');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Control+J');
  const list = page.getByRole('listbox', { name: 'Live templates' });
  await expect(list).toContainText('outline');
  await page.getByLabel('Filter live templates').fill('outl');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.type('Many sign-ins');
  const doc = (await selection(page)).doc;
  expect(doc).toContain('Scenario Outline: Many sign-ins');
  expect(doc).toContain('Examples:');
  // Indented like the line it was inserted on, fields one level deeper.
  expect(doc).toMatch(/\n {4}Scenario Outline: Many sign-ins\n {8}Given /);
});

test('J9 Surround With (Ctrl+Alt+J): steps become a new scenario; a word gets quotes', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'When the user signs in');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Control+Alt+J');
  await expect(page.getByRole('listbox', { name: 'Surround templates' })).toContainText('Scenario Outline');
  await page.getByLabel('Filter surround templates').fill('Scenario');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Signed in');
  let doc = (await selection(page)).doc;
  expect(doc).toContain(['    Scenario: Signed in', '      When the user signs in as "test-user"', '      Then the dashboard is displayed'].join('\n'));
  await caretAt(page, 'dashboard');
  await page.keyboard.press('Control+Alt+J');
  await page.getByLabel('Filter surround templates').fill('step parameter');
  await page.keyboard.press('Enter');
  doc = (await selection(page)).doc;
  expect(doc).toContain('Then the "dashboard" is displayed');
});

test('J10 Soft-Wrap (View menu): long lines wrap in every editor; remembered', async ({ page }) => {
  await openFeature(page);
  const content = gherkin(page);
  await expect(content).not.toHaveClass(/cm-lineWrapping/);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Soft-Wrap/ }).click();
  await expect(content).toHaveClass(/cm-lineWrapping/);
  await page.reload();
  await expect(gherkin(page)).toHaveClass(/cm-lineWrapping/);
  await page.getByRole('button', { name: 'View menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Soft-Wrap/ })).toContainText('✓');
  await page.getByRole('menuitem', { name: /Soft-Wrap/ }).click();
  await expect(gherkin(page)).not.toHaveClass(/cm-lineWrapping/);
});

test('J11 Show Whitespaces (View menu): spaces and trailing whitespace are drawn', async ({ page }) => {
  await openFeature(page);
  await expect(gherkin(page).locator('.cm-highlightSpace')).toHaveCount(0);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Show Whitespaces/ }).click();
  await expect(gherkin(page).locator('.cm-highlightSpace').first()).toBeVisible();
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Show Whitespaces/ }).click();
  await expect(gherkin(page).locator('.cm-highlightSpace')).toHaveCount(0);
});

test('J12 Ctrl+Mouse Wheel changes the editor font size; View ▸ Reset Font Size', async ({ page }) => {
  await openFeature(page);
  const size = () => gherkin(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  await gherkin(page).hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(size).toBe(before + 2);
  // Page zoom is untouched.
  expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Decrease Font Size/ }).click();
  await expect.poll(size).toBe(before + 1);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Reset Font Size/ }).click();
  await expect.poll(size).toBe(before);
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

test('J13 Copy Reference (Ctrl+Alt+Shift+C): fully qualified C# member, path:line in a feature', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowLeft'); // inside the method body
  await page.keyboard.press('Control+Alt+Shift+C');
  await expect(page.getByText('Copied reference: Demo.AuthSteps.SignIn')).toBeVisible({ timeout: 60_000 });
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Demo.AuthSteps.SignIn');
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Alt+Shift+C');
  await expect(page.getByText('Copied reference: Features/Auth/Login.feature:7')).toBeVisible();
});

test('J14 Highlight Usages in File (Ctrl+Shift+F7): Roslyn references in C#, words in features; F3 moves, Esc clears', async ({ page }) => {
  const src = await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.keyboard.press('End');
  // Caret on "userName" (the parameter).
  const doc = (await selection(page)).doc;
  await page.keyboard.press('Home');
  for (let i = 0; i < doc.split('\n').find((l) => l.includes('SignIn'))!.indexOf('userName') - doc.split('\n').find((l) => l.includes('SignIn'))!.search(/\S/); i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Control+Shift+F7');
  await expect(src.locator('.cm-usage-highlight')).toHaveCount(1, { timeout: 60_000 });
  await expect(src.locator('.cm-usage-highlight')).toHaveText('userName');
  await page.keyboard.press('Escape');
  await expect(src.locator('.cm-usage-highlight')).toHaveCount(0);
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'the login');
  await page.keyboard.press('Control+Shift+F7');
  const n = (await selection(page)).doc.match(/\bthe\b/g)!.length;
  await expect(gherkin(page).locator('.cm-usage-highlight')).toHaveCount(n);
  await page.keyboard.press('F3');
  expect((await selection(page)).ranges[0].text).toBe('the');
});

test('J15 File Structure (Ctrl+Alt+F12): C# types and members, Gherkin scenarios; filter and jump', async ({ page }) => {
  await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.keyboard.press('Control+Alt+F12');
  const list = page.getByRole('listbox', { name: 'File structure' });
  await expect(list.getByRole('option')).toHaveCount(4, { timeout: 60_000 }); // class + 3 methods
  await expect(list.getByRole('option', { selected: true })).toContainText('SignIn');
  await page.getByLabel('Filter file structure').fill('Dash');
  await page.keyboard.press('Enter');
  await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('Dashboard()');
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Alt+F12');
  await expect(list.getByRole('option')).toHaveText([/Feature: Authentication/, /Background: Signed out/, /Scenario: Sign in/]);
  await expect(list.getByRole('option', { selected: true })).toContainText('Scenario: Sign in');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  expect((await selection(page)).ranges[0].from).toBe((await selection(page)).doc.indexOf('Background'));
});

test('J16 Structure tool window (Alt+7): follows the editor and the caret; click to go', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Alt+7');
  const panel = page.getByRole('region', { name: 'Structure' });
  const list = panel.getByRole('list', { name: 'Structure of the file' });
  await expect(list.getByRole('button')).toHaveCount(3);
  await expect(list.getByRole('button', { name: /Scenario: Sign in/ })).toHaveAttribute('aria-current', 'true');
  await list.getByRole('button', { name: /Background: Signed out/ }).click();
  await expect(page.locator('.cm-activeLine').first()).toContainText('Background: Signed out');
  // Another file: its members.
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line', { hasText: 'SignIn' }).click();
  await expect(list.getByRole('button', { name: /SignIn/ })).toBeVisible({ timeout: 60_000 });
  await expect(list.getByRole('button', { name: /SignIn/ })).toHaveAttribute('aria-current', 'true');
  await panel.getByRole('button', { name: 'Close Structure' }).click();
  await expect(panel).toHaveCount(0);
});

/** Page classes with inheritance and calls, for the hierarchy tools (the workspace is re-opened to index them). */
async function hierarchyFixture(request: import('@playwright/test').APIRequestContext) {
  await fs.mkdir(path.join(root, 'Pages'), { recursive: true });
  await fs.writeFile(path.join(root, 'Pages/Pages.cs'), [
    'namespace Demo.Pages;',
    'public interface IPage { void Open(); }',
    'public class BasePage : IPage',
    '{',
    '    public virtual void Open() { }',
    '}',
    'public class LoginPage : BasePage',
    '{',
    '    public void SignIn() { Open(); }',
    '}',
    'public class AdminLoginPage : LoginPage',
    '{',
    '    public void Elevate() { SignIn(); }',
    '}',
    'public class ReportsPage : BasePage',
    '{',
    '    public void Show() { Open(); new LoginPage().SignIn(); }',
    '}',
    '',
  ].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
}

test('J17 Type Hierarchy (Ctrl+H): bases, the type, derived types as a tree, interfaces; click to go', async ({ page, request }) => {
  await hierarchyFixture(request);
  const src = await openCs(page, 'Pages/Pages.cs', 'public class LoginPage');
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+ArrowRight'); // end of "LoginPage"
  await page.keyboard.press('Control+H');
  const tree = page.getByRole('list', { name: 'Type hierarchy' });
  await expect(tree).toContainText('Demo.Pages.LoginPage', { timeout: 60_000 });
  await expect(tree.getByRole('button').first()).toContainText('System.Object');
  await expect(tree.getByRole('button', { name: /Demo\.Pages\.BasePage/ })).toBeVisible();
  await expect(tree.getByRole('list', { name: 'Derived types' })).toContainText('AdminLoginPage');
  await expect(tree.getByRole('list', { name: 'Derived types' })).not.toContainText('ReportsPage');
  await expect(tree.getByRole('list', { name: 'Interfaces' })).toContainText('IPage');
  await tree.getByRole('button', { name: /AdminLoginPage/ }).click();
  await expect(src.locator('.cm-activeLine')).toContainText('public class AdminLoginPage');
});

test('J18 Call Hierarchy (Ctrl+Alt+H): callers of a method, expand a caller to its callers, click a caller to its call', async ({ page, request }) => {
  await hierarchyFixture(request);
  const src = await openCs(page, 'Pages/Pages.cs', 'public void SignIn()');
  await page.keyboard.press('Home');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+ArrowRight'); // end of "SignIn"
  await page.keyboard.press('Control+Alt+H');
  const tree = page.getByRole('list', { name: 'Callers' });
  await expect(tree).toContainText('LoginPage.SignIn', { timeout: 60_000 });
  await expect(tree).toContainText('AdminLoginPage.Elevate');
  await expect(tree).toContainText('ReportsPage.Show');
  // Nobody calls Elevate.
  await tree.getByRole('button', { name: 'Expand Demo.Pages.AdminLoginPage.Elevate' }).click();
  await expect(tree).toContainText('No callers.');
  await tree.getByRole('button', { name: /^method Demo\.Pages\.ReportsPage\.Show/ }).click();
  await expect(src.locator('.cm-activeLine')).toContainText('public void Show()');
});

test('J19 Problems (Alt+Shift+6): C# compiler errors and unbound feature steps across the solution; filter; click to go', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Broken.cs'), ['namespace Demo;', 'public class Broken', '{', '    public void Go() { int x = "text"; }', '}', ''].join('\n'));
  await fs.writeFile(path.join(root, 'Features/Orphan.feature'), ['Feature: Orphans', '  Scenario: Nobody binds this', '    Given a step nobody wrote', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page);
  await page.keyboard.press('Alt+Shift+6');
  const panel = page.getByRole('region', { name: 'Problems' });
  const list = panel.getByRole('list', { name: 'Problems in the solution' });
  await expect(list).toContainText('CS0029', { timeout: 90_000 });
  await expect(list).toContainText('No step definition for "Given a step nobody wrote"');
  await panel.getByLabel('Warnings').uncheck();
  await expect(list).not.toContainText('nobody wrote');
  await list.getByRole('button', { name: /CS0029/ }).click();
  await expect(page.locator('.code-editor:not([hidden]) .cm-activeLine')).toContainText('int x = "text"');
});

test('J20 Terminal (Alt+F12): a shell in the repository folder; commands, cd, history, Ctrl+C, tabs', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Alt+F12');
  const panel = page.getByRole('region', { name: 'Terminal' });
  const screen = panel.locator('.terminal-host:not([hidden]) .xterm-rows');
  await expect(screen).toContainText(`PS ${root}>`, { timeout: 30_000 });
  await panel.locator('.terminal-host:not([hidden])').click();
  await page.keyboard.type('Write-Output ("sum=" + (2 + 3))');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText('sum=5');
  await page.keyboard.type('cd Features');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText(`PS ${path.join(root, 'Features')}>`);
  await page.keyboard.type('Get-ChildItem -Name *.feature');
  await page.keyboard.press('Enter');
  await expect(screen).toContainText('GoogleSearch.feature');
  // History: ↑ brings back the last command.
  await page.keyboard.press('ArrowUp');
  await expect(screen).toContainText(/>\s*Get-ChildItem -Name \*\.feature\s*$/m);
  await page.keyboard.press('Control+U').catch(() => {});
  // Ctrl+C stops a long command; the shell keeps its folder.
  await page.keyboard.press('Escape');
  for (let i = 0; i < 40; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('Start-Sleep -Seconds 30');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.press('Control+C');
  await expect(screen).toContainText('^C');
  await expect(screen).toContainText(`PS ${path.join(root, 'Features')}>`, { timeout: 20_000 });
  await panel.getByRole('button', { name: 'New terminal' }).click();
  await expect(panel.getByRole('tab')).toHaveCount(2);
  await expect(screen).toContainText(`PS ${root}>`, { timeout: 30_000 });
});

test('J21 Run Anything (Ctrl twice): suggestions for the projects, a typed command runs in the Terminal, then it is recent', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Control');
  await page.keyboard.press('Control');
  const list = page.getByRole('listbox', { name: 'Run Anything' });
  await expect(list).toContainText('dotnet test "Fixtures.csproj"');
  await page.getByLabel('Command to run').fill('Write-Output ("run-" + "anything")');
  await page.keyboard.press('Enter');
  const screen = page.getByRole('region', { name: 'Terminal' }).locator('.terminal-host:not([hidden]) .xterm-rows');
  await expect(screen).toContainText('run-anything', { timeout: 30_000 });
  // Again: the command is listed as recent, and runs in the open terminal.
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await page.getByRole('menuitem', { name: /Run Anything/ }).click();
  await expect(list.getByRole('option').first()).toContainText('run-');
  await expect(list.getByRole('option').first()).toContainText('Recent');
});

test('J22 HTTP Client: .http requests with variables, ▶ / Ctrl+Enter sends, status, JSON body and headers', async ({ page, request }) => {
  // A local endpoint: the studio's own health check.
  const base = new URL(test.info().project.use.baseURL!).origin;
  await fs.writeFile(path.join(root, 'api.http'), [
    `@host = ${base}`,
    '',
    '### Health',
    'GET {{host}}/api/health',
    'Accept: application/json',
    '',
    '### Missing',
    'GET {{host}}/api/does-not-exist',
    '',
  ].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page);
  await page.getByRole('button', { name: 'Show all files' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'api.http', exact: true }).first().click();
  const src = page.getByLabel('Source of api.http');
  await src.locator('.cm-line', { hasText: 'Health' }).first().click();
  await page.locator('.code-editor:not([hidden])').locator('.cm-http-send[aria-label="Send request on line 4"]').click();
  const resp = page.getByRole('region', { name: 'Response' });
  await expect(resp.getByRole('status')).toHaveText(/^200/, { timeout: 30_000 });
  await expect(resp.getByLabel('Response body')).toContainText('"ok"');
  await resp.getByRole('tab', { name: 'Headers' }).click();
  await expect(resp.getByLabel('Response headers')).toContainText('content-type: application/json');
  await src.locator('.cm-line', { hasText: 'does-not-exist' }).click();
  await page.keyboard.press('Control+Enter');
  await expect(resp.getByRole('status')).toHaveText(/^404/, { timeout: 30_000 });
  // .http files save like any other text file.
  await page.keyboard.press('End');
  await page.keyboard.type('?x=1');
  await page.keyboard.press('Control+S');
  await expect.poll(() => fs.readFile(path.join(root, 'api.http'), 'utf8')).toContain('does-not-exist?x=1');
});

test('J23 Markdown preview: split by default, editor only / preview only, live while typing, scripts stripped', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'NOTES.md'), ['# Test notes', '', '- [x] login', '- [ ] checkout', '', '| Step | Status |', '| --- | --- |', '| Login | done |', '', '<script>window.pwned = 1</script>', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page);
  await page.getByRole('button', { name: 'Show all files' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'NOTES.md', exact: true }).first().click();
  const preview = page.getByRole('article', { name: 'Markdown preview' });
  await expect(preview.getByRole('heading', { name: 'Test notes' })).toBeVisible();
  await expect(preview.getByRole('table')).toContainText('Login');
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
  await expect(preview.locator('script')).toHaveCount(0);
  const src = page.getByLabel('Source of NOTES.md');
  await src.locator('.cm-line', { hasText: '# Test notes' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' (draft)');
  await expect(preview.getByRole('heading', { name: 'Test notes (draft)' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview only' }).click();
  await expect(src).toBeHidden();
  await page.getByRole('button', { name: 'Editor only' }).click();
  await expect(preview).toHaveCount(0);
  await expect(src).toBeVisible();
});

test('J24 Distraction-Free Mode (View menu, Alt+Shift+Z): only the editor, centred; exit from the top edge', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Distraction-Free Mode/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-rider-mode', 'zen');
  await expect(page.locator('.app-header')).toBeHidden();
  await expect(page.locator('#feature-sidebar')).toBeHidden();
  await expect(gherkin(page)).toBeVisible();
  await page.getByRole('button', { name: 'Exit Distraction-Free Mode' }).click();
  await expect(page.locator('.app-header')).toBeVisible();
  await gherkin(page).click();
  await page.keyboard.press('Alt+Shift+Z');
  await expect(page.locator('html')).toHaveAttribute('data-rider-mode', 'zen');
  await page.keyboard.press('Alt+Shift+Z');
  await expect(page.locator('html')).not.toHaveAttribute('data-rider-mode', /./);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('J25 Presentation Mode: only the editor, full screen, large font; Exit restores', async ({ page }) => {
  await openFeature(page);
  const size = () => gherkin(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await size();
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /Presentation Mode/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-rider-mode', 'presentation');
  await expect.poll(size).toBe(22);
  await expect(page.locator('.app-header')).toBeHidden();
  await page.getByRole('button', { name: 'Exit Presentation Mode' }).click();
  await expect.poll(size).toBe(before);
  await expect(page.locator('.app-header')).toBeVisible();
});

test('J26 Hide All Tool Windows (Ctrl+Shift+F12): explorer and panels hide, the editor keeps the window; again restores', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Alt+7');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  const width = () => gherkin(page).evaluate((el) => el.closest('.cm-editor')!.getBoundingClientRect().width);
  const before = await width();
  await page.keyboard.press('Control+Shift+F12');
  await expect(page.locator('#feature-sidebar')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Structure' })).toBeHidden();
  await expect(page.locator('.app-header')).toBeVisible();
  await expect.poll(width).toBeGreaterThan(before + 100);
  await page.keyboard.press('Control+Shift+F12');
  await expect(page.locator('#feature-sidebar')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
});

test('J27 Key Promoter: a command from a menu shows its shortcut and how often; the key itself does not; can be turned off', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /^Structure/ }).click();
  const toast = page.getByRole('status', { name: 'Key Promoter' });
  await expect(toast).toContainText('Structure');
  await expect(toast).toContainText('Alt 7');
  await expect(toast).toContainText('Used 1 time without the shortcut');
  await toast.getByRole('button', { name: 'Dismiss' }).click();
  await page.keyboard.press('Alt+7');
  await expect(toast).toHaveCount(0);
  await page.getByRole('button', { name: 'Help menu' }).click();
  await page.getByRole('menuitem', { name: /Key Promoter/ }).click();
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /^Structure/ }).click();
  await page.waitForTimeout(300);
  await expect(toast).toHaveCount(0);
});

test('J28 Productivity Guide: features used, how often with the shortcut, unused ones listed', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Shift+U'); // Toggle Case with the key
  await page.keyboard.press('Control+Shift+U');
  await page.getByRole('button', { name: 'Edit menu' }).click();
  await page.getByRole('menuitem', { name: /Toggle Case/ }).click(); // and from the menu
  await page.getByRole('button', { name: 'Help menu' }).click();
  await page.getByRole('menuitem', { name: /Productivity Guide/ }).click();
  const table = page.getByRole('table', { name: 'Feature usage' });
  const row = table.getByRole('row', { name: /Toggle Case/ });
  await expect(row.getByRole('cell').nth(1)).toHaveText('3');
  await expect(row.getByRole('cell').nth(2)).toHaveText('67%');
  await expect(table.getByRole('row', { name: /Call Hierarchy/ })).toContainText('never');
  await expect(page.getByRole('status').filter({ hasText: 'features used' })).toContainText('with the keyboard');
});

test('J29 Tip of the Day: next / previous, Try it runs the feature, optional on startup', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('button', { name: 'Help menu' }).click();
  await page.getByRole('menuitem', { name: /Tip of the Day/ }).click();
  const tip = page.getByRole('article', { name: 'Tip' });
  await expect(tip).toContainText('Search Everywhere');
  await page.getByRole('button', { name: 'Next tip' }).click();
  await expect(tip).toContainText('Recent Files');
  await page.getByRole('button', { name: 'Previous tip' }).click();
  await expect(tip).toContainText('Search Everywhere');
  await page.getByLabel('Show tips on startup').check();
  // A tip for a Rider command: Try it runs it.
  for (let i = 0; i < 60 && (await tip.getByRole('heading').textContent()) !== 'Structure'; i++) await page.getByRole('button', { name: 'Next tip' }).click();
  await tip.getByRole('button', { name: 'Try it' }).click();
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
  // Shown at startup in a new session.
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.getByRole('article', { name: 'Tip' })).toBeVisible({ timeout: 10_000 });
});

test('J31 Mute Breakpoints: breakpoints stay but are sent disabled; unmute restores them', async ({ page, request }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('F9');
  const sent = async () => (await (await request.get('/api/debug')).json()).breakpoints['Features/Auth/Login.feature']?.map((b: { line: number; enabled?: boolean }) => b.enabled !== false);
  await expect.poll(sent).toEqual([true]);
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await page.getByRole('menuitem', { name: /Mute Breakpoints/ }).click();
  await expect.poll(sent).toEqual([false]);
  await expect(page.locator('html')).toHaveAttribute('data-breakpoints-muted', 'true');
  await expect(page.locator('.gherkin-editor .cm-bp:visible')).toHaveCount(1);
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Mute Breakpoints/ })).toContainText('✓');
  await page.getByRole('menuitem', { name: /Mute Breakpoints/ }).click();
  await expect.poll(sent).toEqual([true]);
  await gherkin(page).click();
  await caretAt(page, 'signs in');
  await page.keyboard.press('F9');
});

test('J32 Check RegExp: the step pattern at the caret, a sample with its groups, the feature steps it matches', async ({ page }) => {
  await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.getByRole('button', { name: 'Code menu' }).click();
  await page.getByRole('menuitem', { name: /Check RegExp/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Check RegExp' });
  await expect(dlg.getByLabel('Pattern')).toHaveValue('the user signs in as "(.*)"');
  await expect(dlg.getByRole('region', { name: 'Matching steps' })).toContainText('1 step in features match');
  await expect(dlg.getByLabel('Sample')).toHaveValue('the user signs in as "test-user"');
  await expect(dlg.getByRole('status')).toContainText('Matches');
  await expect(dlg.getByRole('list', { name: 'Groups' })).toContainText('test-user');
  await dlg.getByLabel('Sample').fill('the user signs out');
  await expect(dlg.getByRole('status')).toContainText('No match');
  // A Cucumber expression is shown as its regular expression.
  await dlg.getByLabel('Pattern').fill('the user signs in as {string}');
  await expect(dlg).toContainText('Cucumber expression');
  await dlg.getByLabel('Sample').fill('the user signs in as "x"');
  await expect(dlg.getByRole('status')).toContainText('Matches');
  await dlg.getByRole('region', { name: 'Matching steps' }).getByRole('button').first().click();
  await expect(gherkin(page)).toContainText('signs in as');
});

test('J33 Compare with Clipboard: the selection against copied text, as a diff', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await page.evaluate(() => navigator.clipboard.writeText('Given the login page is open\n    When the admin signs in'));
  await caretAt(page, 'Given the login page');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+End');
  await page.getByRole('button', { name: 'Edit menu' }).click();
  await page.getByRole('menuitem', { name: /Compare with Clipboard/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Compare with Clipboard' });
  await expect(dlg.getByRole('status')).toContainText('Selection vs. clipboard: 1 line only in selection, 1 only in the clipboard.');
  await expect(dlg).toContainText('-    When the user signs in as "test-user"');
  await expect(dlg).toContainText('+    When the admin signs in');
});

test('J34 Recent Changes (Alt+Shift+C): the latest saves across files; pick one to see and revert its history', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await page.keyboard.press('Control+S');
  await expect.poll(() => fs.readFile(path.join(root, 'Features/Auth/Login.feature'), 'utf8')).toContain('"test-user" now');
  await page.keyboard.press('Alt+Shift+C');
  const list = page.getByRole('listbox', { name: 'Recent changes' });
  await expect(list.getByRole('option').first()).toContainText('Features/Auth/Login.feature');
  await expect(list.getByRole('option').first()).toContainText('saved');
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: 'Local History' });
  await expect(dlg).toContainText('"test-user" now');
  await dlg.getByRole('button', { name: /Revert/ }).first().click();
  await expect.poll(async () => (await selection(page)).doc).not.toContain('"test-user" now');
});

test('J35 Shelf: shelve uncommitted changes under a name, unshelve them back', async ({ page }) => {
  const { execFileSync } = await import('node:child_process');
  const g = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  g('init', '-q'); g('-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'); g('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'base');
  const login = path.join(root, 'Features/Auth/Login.feature');
  await fs.writeFile(login, (await fs.readFile(login, 'utf8')).replace('the dashboard is displayed', 'the dashboard is displayed quickly'));
  await openFeature(page);
  await page.getByRole('button', { name: 'View menu' }).click();
  await page.getByRole('menuitem', { name: /^Shelf/ }).click();
  const panel = page.getByRole('region', { name: 'Shelf' });
  await expect(panel).toContainText('Nothing on the shelf');
  await panel.getByLabel('Shelf name').fill('Faster dashboard');
  await panel.getByRole('button', { name: 'Shelve Changes' }).click();
  const list = panel.getByRole('list', { name: 'Shelved changes' });
  await expect(list).toContainText('Faster dashboard');
  await expect(list).toContainText('Features/Auth/Login.feature');
  await expect.poll(() => fs.readFile(login, 'utf8')).not.toContain('quickly');
  await panel.getByRole('button', { name: 'Unshelve Faster dashboard', exact: true }).click();
  await expect.poll(() => fs.readFile(login, 'utf8')).toContain('quickly');
  await expect(panel).toContainText('Nothing on the shelf');
});

test('J36 Power Save Mode: no background C# analysis requests while on; a badge turns it off', async ({ page }) => {
  await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await page.getByRole('menuitem', { name: /Power Save Mode/ }).click();
  await expect(page.getByRole('button', { name: 'Power Save' })).toBeVisible();
  const calls: string[] = [];
  page.on('request', (r) => { if (/csharp\/(diagnostics|inlayHints|referenceCounts)/.test(r.url())) calls.push(r.url()); });
  await page.keyboard.press('End');
  await page.keyboard.type(' // edit');
  await page.waitForTimeout(2000);
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Power Save' }).click();
  await expect(page.getByRole('button', { name: 'Power Save' })).toHaveCount(0);
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line', { hasText: 'SignIn' }).first().click();
  await page.keyboard.type(' more');
  await expect.poll(() => calls.length, { timeout: 10_000 }).toBeGreaterThan(0);
});

test('J37 Go to Related Files (Ctrl+Alt+Home): a feature to its step files, a step file back to its features', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Alt+Home');
  const list = page.getByRole('listbox', { name: 'Related files' });
  await expect(list.getByRole('option', { name: /Steps\/AuthSteps\.cs/ })).toContainText('3 steps bind');
  await list.getByRole('option', { name: /Steps\/AuthSteps\.cs/ }).click();
  const src = page.getByLabel('Source of Steps/AuthSteps.cs');
  await expect(src).toBeVisible();
  await src.locator('.cm-line', { hasText: 'SignIn' }).click();
  await page.keyboard.press('Control+Alt+Home');
  await expect(list.getByRole('option')).toHaveText([/Features\/Auth\/Login\.feature.*3 steps use these bindings/]);
  await page.keyboard.press('Enter');
  await expect(gherkin(page)).toContainText('Feature: Authentication');
});

test('Tool window keys work while the Terminal has focus', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Alt+F12');
  const term = page.getByRole('region', { name: 'Terminal' });
  await expect(term.locator('.terminal-host:not([hidden]) .xterm-rows')).toContainText('PS ', { timeout: 30_000 });
  await term.locator('.terminal-host:not([hidden])').click();
  await page.keyboard.press('Alt+7');
  await expect(page.getByRole('region', { name: 'Structure' })).toBeVisible();
});

test('Alt+F12 stays Peek Definition in a C# editor; Ctrl+` opens the Terminal from there', async ({ page }) => {
  await openCs(page, 'Steps/AuthSteps.cs', 'SignIn');
  await page.keyboard.press('Control+`');
  await expect(page.getByRole('region', { name: 'Terminal' })).toBeVisible();
  await expect(page.getByRole('region', { name: /^Peek Definition/ })).toHaveCount(0);
});

test('J38 Move Statement Up / Down (Ctrl+Shift+Alt+↑/↓): steps, and a whole scenario with its steps', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Given the login page');
  await page.keyboard.press('Control+Shift+Alt+ArrowDown');
  expect((await selection(page)).doc).toContain('    When the user signs in as "test-user"\n    Given the login page is open\n');
  await caretAt(page, 'Scenario: Sign in');
  await page.keyboard.press('Control+Shift+Alt+ArrowUp');
  expect((await selection(page)).doc).toMatch(/Feature: Authentication\n  Scenario: Sign in\n(    .*\n){3}  Background: Signed out\n    Given the browser is started/);
});

test('J39 Comment with Block Comment (Ctrl+Shift+/): /* */ around the C# selection and back; # lines in Gherkin', async ({ page }) => {
  const src = await openCs(page, 'Steps/AuthSteps.cs', 'Dashboard');
  await src.locator('.cm-line', { hasText: 'Dashboard' }).click();
  await page.keyboard.press('Control+Shift+/');
  expect((await selection(page)).doc).toContain('/* [Then("the dashboard is displayed")] public void Dashboard() { } */');
  await page.keyboard.press('Control+Shift+/');
  expect((await selection(page)).doc).toContain('\n [Then("the dashboard is displayed")] public void Dashboard() { }\n');
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Shift+/');
  expect((await selection(page)).doc).toContain('    # When the user signs in');
});

test('J40 Code Cleanup (Ctrl+K, Ctrl+E): C# usings and formatting; Gherkin formatting', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Messy.cs'), ['using System.Text;', 'using TechTalk.SpecFlow;', 'namespace Demo;', '[Binding]', 'public class Messy {', '[Given("messy")]   public void M( ) {  }   ', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const src = await openCs(page, 'Steps/Messy.cs', 'class Messy');
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+E');
  await expect(page.getByText(/Code Cleanup: formatted, 1 unnecessary using removed/)).toBeVisible({ timeout: 60_000 });
  const doc = (await selection(page)).doc;
  expect(doc).not.toContain('using System.Text;');
  expect(doc).toContain('public void M()');
  expect(doc).not.toMatch(/[ \t]\n/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  void src;
  await page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first().click();
  await caretAt(page, 'signs in');
  await page.keyboard.press('Home');
  await page.keyboard.type('      ');
  await page.getByRole('button', { name: 'Code menu' }).click();
  await page.getByRole('menuitem', { name: /Code Cleanup/ }).click();
  expect((await selection(page)).doc).toContain('\n    When the user signs in');
});

/** Makes the temporary repository a Git repository with everything committed. */
async function commitAll() {
  const { execFileSync } = await import('node:child_process');
  const g = (...args: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, encoding: 'utf8' });
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'base');
}

test('J41 Next / Previous Change (Alt+F5 / Shift+Alt+F5): jumps between uncommitted changes', async ({ page }) => {
  await commitAll();
  await openFeature(page);
  await caretAt(page, 'the browser is started');
  await page.keyboard.press('End');
  await page.keyboard.type(' again');
  await caretAt(page, 'the dashboard');
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await expect(page.locator('.gherkin-editor .cm-change-modified')).toHaveCount(2);
  await caretAt(page, 'Feature:');
  const line = async () => { const s = await selection(page); return s.doc.slice(0, s.ranges[0].from).split('\n').length; };
  await page.keyboard.press('Alt+F5');
  expect(await line()).toBe(4);
  await page.keyboard.press('Alt+F5');
  expect(await line()).toBe(8);
  await page.keyboard.press('Alt+F5');
  expect(await line()).toBe(4); // wraps
  await page.keyboard.press('Shift+Alt+F5');
  expect(await line()).toBe(8);
});

test('J42 Rollback Lines (Ctrl+Alt+Z): the change at the caret goes back to the committed text, others stay', async ({ page }) => {
  await commitAll();
  await openFeature(page);
  await caretAt(page, 'the browser is started');
  await page.keyboard.press('End');
  await page.keyboard.type(' again');
  await caretAt(page, 'the dashboard');
  await page.keyboard.press('End');
  await page.keyboard.type(' now');
  await expect(page.locator('.gherkin-editor .cm-change-modified')).toHaveCount(2);
  await page.keyboard.press('Control+Alt+Z');
  const doc = (await selection(page)).doc;
  expect(doc).toContain('Then the dashboard is displayed\n');
  expect(doc).toContain('the browser is started again');
});

test('J43 Scratch Files (Ctrl+Alt+Shift+Insert): a new C# scratch opens with a starter, saves, and is listed; kept out of Git', async ({ page }) => {
  await commitAll();
  await openFeature(page);
  await page.keyboard.press('Control+Alt+Shift+Insert');
  await page.getByLabel('Filter scratch file types').fill('C#');
  await page.keyboard.press('Enter');
  const src = page.getByLabel('Source of .tas/scratches/scratch_1.cs');
  await expect(src).toContainText('Console.WriteLine("Hello");');
  await src.locator('.cm-line', { hasText: 'Hello' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' // tried');
  await page.keyboard.press('Control+S');
  await expect.poll(() => fs.readFile(path.join(root, '.tas/scratches/scratch_1.cs'), 'utf8')).toContain('// tried');
  expect(await fs.readFile(path.join(root, '.git/info/exclude'), 'utf8')).toContain('.tas/');
  await page.getByRole('button', { name: 'Tools menu' }).click();
  await page.getByRole('menuitem', { name: /^Scratch Files/ }).click();
  await expect(page.getByRole('listbox', { name: 'Scratch files' })).toContainText('scratch_1.cs');
});

test('J44 Numbered bookmarks: Ctrl+Shift+1 sets bookmark 1 (shown as 1), Ctrl+1 jumps to it from another file', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.keyboard.press('Control+Shift+Digit1');
  await expect(page.locator('.gherkin-editor .cm-bookmark-digit')).toHaveText('1');
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line').first().click();
  await page.keyboard.press('Control+1');
  await expect(page.locator('.gherkin-editor .cm-activeLine')).toContainText('When the user signs in');
  // Again on the same line removes it.
  await page.keyboard.press('Control+Shift+Digit1');
  await expect(page.locator('.gherkin-editor .cm-bookmark-digit')).toHaveCount(0);
});

test('J45 Collapse to Definitions (Ctrl+K, Ctrl+2), Expand All, Collapse All', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Folds.cs'), ['namespace Demo', '{', '    public class Folds', '    {', '        public void A()', '        {', '            var x = 1;', '        }', '        public void B()', '        {', '            var y = 2;', '        }', '    }', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  const src = await openCs(page, 'Steps/Folds.cs', 'public void A()');
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+2');
  // The two method bodies fold; the class and namespace stay open.
  await expect(src.locator('.cm-foldPlaceholder')).toHaveCount(2);
  await expect(src).toContainText('public class Folds');
  await expect(src).not.toContainText('var x = 1;');
  await page.getByRole('button', { name: 'Code menu' }).click();
  await page.getByRole('menuitem', { name: /^Expand All/ }).click();
  await expect(src.locator('.cm-foldPlaceholder')).toHaveCount(0);
  await src.locator('.cm-line', { hasText: 'var x' }).click();
  await page.keyboard.press('Control+K');
  await page.keyboard.press('Control+0');
  await expect(src).not.toContainText('public class Folds');
});

test('J46 Select In… (Alt+F1): Explorer reveals the file, Terminal opens in its folder', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('button', { name: 'Collapse all folders' }).click();
  await caretAt(page, 'signs in');
  await page.keyboard.press('Alt+F1');
  await page.getByRole('listbox', { name: 'Select in targets' }).getByRole('option', { name: /^Explorer/ }).click();
  await expect(page.getByRole('navigation').getByRole('button', { name: 'Login.feature', exact: true }).first()).toBeVisible();
  await caretAt(page, 'signs in');
  await page.keyboard.press('Alt+F1');
  await page.getByLabel('Filter select in targets').fill('Terminal');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Terminal' }).locator('.terminal-host:not([hidden]) .xterm-rows')).toContainText(`PS ${path.join(root, 'Features', 'Auth')}>`, { timeout: 30_000 });
});

test('J47 Compare With…: the editor text against another file of the solution', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Features/Auth/Login2.feature'), (await fs.readFile(path.join(root, 'Features/Auth/Login.feature'), 'utf8')).replace('test-user', 'admin'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openFeature(page);
  await caretAt(page, 'signs in');
  await page.getByRole('button', { name: 'Edit menu' }).click();
  await page.getByRole('menuitem', { name: /Compare With…/ }).click();
  await page.getByLabel('Filter files to compare with').fill('Login2');
  await page.keyboard.press('Enter');
  const dlg = page.getByRole('dialog', { name: 'Compare Files' });
  await expect(dlg.getByRole('status')).toContainText('This file vs. Features/Auth/Login2.feature: 1 line only in this file, 1 only in Features/Auth/Login2.feature.');
  await expect(dlg).toContainText('+    When the user signs in as "admin"');
});

test('J48 Complete Current Statement (Ctrl+Shift+Enter): closes the call and adds the semicolon in C#', async ({ page }) => {
  const src = await openCs(page, 'Steps/AuthSteps.cs', 'Dashboard');
  await src.locator('.cm-line', { hasText: 'Dashboard' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('System.Console.WriteLine("done"');
  await page.keyboard.press('Control+Shift+Enter');
  await page.keyboard.type('// next');
  expect((await selection(page)).doc).toMatch(/System\.Console\.WriteLine\("done"\);\n\s*\/\/ next/);
});

test('J49 Unwrap / Remove (Ctrl+Shift+Delete): unwrap the if around the caret', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Steps/Wrapped.cs'), ['namespace Demo;', 'public class Wrapped', '{', '    public void M(bool ok)', '    {', '        if (ok)', '        {', '            Step();', '        }', '    }', '    void Step() { }', '}', ''].join('\n'));
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
  await openCs(page, 'Steps/Wrapped.cs', 'Step();');
  await page.keyboard.press('Control+Shift+Delete');
  await expect(page.getByRole('listbox', { name: 'Unwrap targets' })).toContainText("Unwrap 'if'");
  await page.keyboard.press('Enter');
  expect((await selection(page)).doc).toContain('    public void M(bool ok)\n    {\n        Step();\n    }');
});
