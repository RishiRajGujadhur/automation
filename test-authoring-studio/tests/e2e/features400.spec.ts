import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Rider and VS Code features (RIDER-VSCODE-FEATURES.md), on a temporary copy of the fixtures.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-f400-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** Opens the studio (and a file, when given) with clean state and the given VS Code settings. */
async function open(page: Page, file?: string, settings: Record<string, unknown> = {}) {
  await page.addInitScript((s) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); localStorage.setItem('tas:settings', JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } }, settings);
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  if (!file) return;
  await page.getByRole('navigation').getByRole('button', { name: path.basename(file), exact: true }).first().click();
  await expect(page.getByLabel(file.endsWith('.feature') ? 'Gherkin source' : `Source of ${file}`)).toBeVisible();
}
const openSettings = async (page: Page) => { await page.keyboard.press('Control+,'); const d = page.getByRole('dialog', { name: 'Preferences' }); await expect(d).toBeVisible(); return d; };
void path;

test('S2 Settings categories as a collapsible tree', async ({ page }) => {
  await open(page);
  const d = await openSettings(page);
  const nav = d.getByRole('navigation', { name: 'Settings categories' });
  const minimap = nav.getByRole('button', { name: 'Minimap', exact: true });
  await expect(minimap).toBeVisible();
  await nav.getByRole('button', { name: 'Collapse Text Editor' }).click();
  await expect(minimap).toBeHidden();
  await expect(nav.getByRole('button', { name: 'Text Editor', exact: true })).toHaveAttribute('aria-expanded', 'false');
  // Remembered.
  await page.keyboard.press('Escape');
  const d2 = await openSettings(page);
  const nav2 = d2.getByRole('navigation', { name: 'Settings categories' });
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeHidden();
  // Arrow keys: → expands, ← collapses.
  await nav2.getByRole('button', { name: 'Text Editor', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(nav2.getByRole('button', { name: 'Minimap', exact: true })).toBeHidden();
  // A search shows every category again.
  await d2.getByRole('searchbox', { name: 'Search settings' }).fill('minimap scale');
  await expect(nav2.getByRole('button', { name: /Minimap/ })).toBeVisible();
});

const langServer = path.resolve(import.meta.dirname, '../../langserver/bin/Release/net10.0/LangServer.dll');
const needsLang = () => test.skip(!existsSync(langServer), 'The C# language service is not built (npm run langserver:build).');
const setDoc = (page: Page, text: string) => page.evaluate((t) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } }); v.focus(); }, text);
const caretAt = (page: Page, text: string, offset = 0) => page.evaluate(([t, o]) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: v.state.doc.toString().indexOf(t) + o } }); v.focus(); }, [text, offset] as const);
const docText = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
/** Ctrl+. at the caret, then the Quick Action whose title matches. */
async function quickAction(page: Page, title: RegExp) {
  await page.keyboard.press('Control+.');
  const option = page.getByRole('listbox', { name: 'Quick Actions' }).getByRole('option', { name: title });
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
}
const CS = 'Steps/AuthSteps.cs';

test('113 Roslyn analyzer integration: IDE suggestions in the editor, their fixes in Quick Actions', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public int Run(int a)\n    {\n        var x = 1;\n        x = a;\n        return x;\n    }\n    private void Never() { }\n}\n');
  // Unused private member and unnecessary assignment: faded; their messages are the IDE rule ids.
  await expect(page.locator('.cm-unnecessary').first()).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => page.locator('.cm-unnecessary').allTextContents(), { timeout: 60_000 }).toEqual(expect.arrayContaining(['Never', 'x']));
  await caretAt(page, 'Never', 1);
  await quickAction(page, /^Remove unused member$/);
  await expect.poll(() => docText(page), { timeout: 30_000 }).not.toContain('Never');
});

/** Opens AuthSteps.cs with `source`, waits for the analyzer marks, then (when `at` is given) applies `fix` there. */
async function analyzerFix(page: Page, source: string, marks: { cls: string; text: string }[], at = '', fix = /x/, after: (doc: string) => boolean = () => true) {
  needsLang();
  await open(page, CS);
  await setDoc(page, source);
  // The marks are split by syntax colouring: compare their joined text.
  for (const m of marks) await expect.poll(async () => (await page.locator(m.cls).allTextContents()).join(''), { timeout: 60_000 }).toContain(m.text);
  if (!at) return;
  await caretAt(page, at, 1);
  await quickAction(page, fix);
  await expect.poll(async () => after(await docText(page)), { timeout: 30_000 }).toBe(true);
}
test('107 Dead code detection: unreachable code faded and removed', async ({ page }) => {
  await analyzerFix(page, 'namespace Demo;\npublic class P\n{\n    public int Run(int a)\n    {\n        return a;\n        System.Console.WriteLine();\n    }\n}\n',
    [{ cls: '.cm-unnecessary', text: 'System.Console.WriteLine();' }], 'Console', /^Remove unreachable code$/, (d) => !d.includes('WriteLine'));
});
test('108 Unused symbol detection: unused private members and parameters faded', async ({ page }) => {
  await analyzerFix(page, 'namespace Demo;\npublic class P\n{\n    private int counter;\n    public int Run(int a, int unusedArg)\n    {\n        return a;\n    }\n    private void Helper() { }\n}\n',
    [{ cls: '.cm-unnecessary', text: 'unusedArg' }, { cls: '.cm-unnecessary', text: 'Helper' }, { cls: '.cm-unnecessary', text: 'counter' }]);
});
test('109 Redundant assignment detection', async ({ page }) => {
  await analyzerFix(page, 'namespace Demo;\npublic class P\n{\n    public int Run(int a)\n    {\n        var x = 1;\n        x = a;\n        return x;\n    }\n}\n',
    [{ cls: '.cm-unnecessary', text: 'x' }], 'x = 1', /^Remove redundant assignment$/, (d) => !d.includes('x = 1'));
});
test('110 Redundant type declaration detection', async ({ page }) => {
  await analyzerFix(page, 'namespace Demo;\npublic class P\n{\n    public System.Text.StringBuilder M()\n    {\n        System.Text.StringBuilder b = new System.Text.StringBuilder();\n        return b;\n    }\n}\n',
    [{ cls: '.cm-lintRange-info', text: 'new' }], '= new', /^Use 'new\(\.\.\.\)'$/, (d) => d.includes('b = new();'));
});

/** Quick Action `fix` at `at` on `source`; `after` checks the result. */
async function convert(page: Page, source: string, at: string, fix: RegExp, after: (doc: string) => boolean, offset = 1) {
  needsLang();
  await open(page, CS);
  await setDoc(page, source);
  await caretAt(page, at, offset);
  await quickAction(page, fix);
  await expect.poll(async () => after(await docText(page)), { timeout: 30_000 }).toBe(true);
}
test('92 Convert switch statements to expressions', async ({ page }) => {
  await convert(page, 'namespace Demo;\npublic class P\n{\n    public string M(int x)\n    {\n        switch (x)\n        {\n            case 1: return "a";\n            case 2: return "b";\n            default: return "c";\n        }\n    }\n}\n',
    'switch (x)', /^Convert switch statement to expression$/, (d) => /return x switch\s*\{/.test(d) && d.includes('_ => "c"'));
});
test('360 Generate switch cases for enum members', async ({ page }) => {
  await convert(page, 'namespace Demo;\npublic enum Colour { Red, Green, Blue }\npublic class P\n{\n    public int M(Colour c)\n    {\n        switch (c)\n        {\n        }\n        return 0;\n    }\n}\n',
    'switch (c)', /^Add missing cases$/, (d) => ['Colour.Red', 'Colour.Green', 'Colour.Blue'].every((x) => d.includes(`case ${x}:`)));
});
test('87 Convert anonymous functions to methods (local function, then method)', async ({ page }) => {
  await convert(page, 'using System;\nnamespace Demo;\npublic class P\n{\n    public int M()\n    {\n        Func<int, int> twice = x => x * 2;\n        return twice(3);\n    }\n}\n',
    'twice =', /^Use local function$/, (d) => /int twice\(int x\)/.test(d));
  await caretAt(page, 'twice(int', 1);
  await quickAction(page, /^Convert to method$/);
  await expect.poll(() => docText(page), { timeout: 30_000 }).toMatch(/private (static )?int twice\(int x\)/);
});
test('357 Convert tuples to named types', async ({ page }) => {
  await convert(page, 'namespace Demo;\npublic class P\n{\n    public int M()\n    {\n        var t = (a: 1, b: 2);\n        return t.a + t.b;\n    }\n}\n',
    '(a: 1', /^Convert to struct updating usages in containing member$/, (d) => /struct NewStruct/.test(d) && d.includes('new NewStruct(a: 1, b: 2)'), 0);
});
test('350 Convert fields to auto-properties', async ({ page }) => {
  await convert(page, 'namespace Demo;\npublic class P\n{\n    private int count;\n    public int Count { get { return count; } set { count = value; } }\n}\n',
    'Count {', /^Use auto property$/, (d) => /public int Count \{ get; set; \}/.test(d) && !d.includes('private int count'));
});

/** Writes .editorconfig into the temporary repository and reloads the workspace (the language server reads it). */
async function editorconfig(page: Page, text: string) {
  await fs.writeFile(path.join(temp, '.editorconfig'), text);
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
}
const lintText = async (page: Page, cls: string) => (await page.locator(cls).allTextContents()).join('');
test('111 Code style enforcement from .editorconfig (var / explicit type as a warning)', async ({ page }) => {
  needsLang();
  await editorconfig(page, 'root = true\n[*.cs]\ncsharp_style_var_for_built_in_types = false:warning\ncsharp_style_var_when_type_is_apparent = false:warning\ncsharp_style_var_elsewhere = false:warning\ndotnet_diagnostic.IDE0008.severity = warning\n');
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public int M()\n    {\n        var n = 3;\n        return n;\n    }\n}\n');
  await expect.poll(() => lintText(page, '.cm-lintRange-warning'), { timeout: 60_000 }).toContain('var');
  await caretAt(page, 'var n', 1);
  await quickAction(page, /^Use explicit type instead of 'var'$/);
  await expect.poll(() => docText(page)).toContain('int n = 3;');
});
test('114 Custom analyzer configuration: dotnet_diagnostic severities', async ({ page }) => {
  needsLang();
  await editorconfig(page, 'root = true\n[*.cs]\ndotnet_diagnostic.IDE0059.severity = warning\ndotnet_diagnostic.IDE0044.severity = none\n');
  await open(page, CS);
  await setDoc(page, 'namespace Fixtures.Steps;\npublic class P\n{\n    private int f = 1;\n    public int Run(int a)\n    {\n        var x = 1;\n        x = a;\n        return x + f;\n    }\n}\n');
  // IDE0059 raised to a warning; IDE0044 (make field readonly) turned off.
  await expect.poll(() => lintText(page, '.cm-lintRange-warning'), { timeout: 60_000 }).toContain('x');
  await expect(page.locator('.cm-lintRange-info')).toHaveCount(0);
});
test('116 Inspection exclusion scopes: a folder of generated code', async ({ page }) => {
  needsLang();
  await editorconfig(page, 'root = true\n[*.cs]\ndotnet_diagnostic.IDE0059.severity = warning\n[Steps/Auth*.cs]\ngenerated_code = true\ndotnet_analyzer_diagnostic.severity = none\n');
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public int Run(int a)\n    {\n        var x = 1;\n        x = a;\n        return x;\n    }\n}\n');
  // Other files still get the warning (checked through the API), this one none.
  const other = await (await page.request.post('/api/csharp/analyze', { data: { file: 'Steps/SearchSteps.cs', source: 'namespace Demo;\npublic class Q\n{\n    public int Run(int a)\n    {\n        var x = 1;\n        x = a;\n        return x;\n    }\n}\n' } })).json() as { id: string; severity: string }[];
  expect(other.some((d) => d.id === 'IDE0059' && d.severity === 'warning')).toBe(true);
  const mine = await (await page.request.post('/api/csharp/analyze', { data: { file: CS, source: await docText(page) } })).json() as { id: string }[];
  expect(mine).toEqual([]);
  await page.waitForTimeout(1500);
  await expect(page.locator('.cm-lintRange-warning, .cm-lintRange-info, .cm-unnecessary')).toHaveCount(0);
});

test('117 Quick-fix previews: the highlighted action shows its changes', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public int Run(int a)\n    {\n        return a;\n        System.Console.WriteLine();\n    }\n}\n');
  await caretAt(page, 'Console', 1);
  await page.keyboard.press('Control+.');
  const list = page.getByRole('listbox', { name: 'Quick Actions' });
  await expect(list.getByRole('option', { name: /^Remove unreachable code$/ })).toBeVisible({ timeout: 60_000 });
  await list.getByRole('option', { name: /^Remove unreachable code$/ }).hover();
  const preview = page.getByLabel(/^Preview of Remove unreachable code/);
  await expect(preview).toContainText('- ');
  await expect(preview.locator('.diff-del')).toContainText('System.Console.WriteLine();');
  // Nothing was applied.
  expect(await docText(page)).toContain('WriteLine');
});
test('118 Bulk quick-fix application: fix all in document and in solution', async ({ page }) => {
  needsLang();
  // Another file with the same issue, for the solution scope.
  await fs.writeFile(path.join(temp, 'Steps/Other.cs'), 'namespace Demo;\npublic class O\n{\n    public System.Text.StringBuilder M()\n    {\n        System.Text.StringBuilder b = new System.Text.StringBuilder();\n        return b;\n    }\n}\n');
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
  await open(page, CS);
  const src = 'namespace Demo;\npublic class P\n{\n    public void M()\n    {\n        System.Text.StringBuilder a = new System.Text.StringBuilder();\n        System.Text.StringBuilder b = new System.Text.StringBuilder();\n        a.Append(b);\n    }\n}\n';
  await setDoc(page, src);
  await caretAt(page, 'a = new', 5);
  await quickAction(page, /^Use 'new\(\.\.\.\)' \(fix all in document\)$/);
  await expect.poll(() => docText(page), { timeout: 30_000 }).toMatch(/a = new\(\);[\s\S]*b = new\(\);/);
  await setDoc(page, src);
  await caretAt(page, 'a = new', 5);
  await quickAction(page, /^Use 'new\(\.\.\.\)' \(fix all in solution\)$/);
  await expect.poll(() => docText(page), { timeout: 30_000 }).toMatch(/a = new\(\);[\s\S]*b = new\(\);/);
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/Other.cs'), 'utf8'), { timeout: 30_000 }).toContain('b = new();');
});

const caretOffset = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { head: number } } } } } }).__activeEditor().view.state.selection.main.head);
const menuItem = async (page: Page, menu: string, item: RegExp) => { await page.getByRole('button', { name: `${menu} menu` }).click(); await page.getByRole('menuitem', { name: item }).click(); };
test('324 Navigate between TODO comments; 330 previous merge conflict', async ({ page }) => {
  await open(page, CS);
  const text = 'namespace Demo;\n// TODO: first\npublic class P\n{\n    // FIXME: second\n    string s = "TODO no";\n}\n<<<<<<< HEAD\na\n=======\nb\n>>>>>>> other\n';
  await setDoc(page, text);
  await caretAt(page, 'namespace', 0);
  await menuItem(page, 'Navigate', /^Next TODO$/);
  expect(await caretOffset(page)).toBe(text.indexOf('TODO: first'));
  await menuItem(page, 'Navigate', /^Next TODO$/);
  expect(await caretOffset(page)).toBe(text.indexOf('FIXME'));
  await menuItem(page, 'Navigate', /^Next TODO$/);
  expect(await caretOffset(page)).toBe(text.indexOf('TODO: first'));
  await menuItem(page, 'Navigate', /^Previous TODO$/);
  expect(await caretOffset(page)).toBe(text.indexOf('FIXME'));
  await menuItem(page, 'Navigate', /^Previous Merge Conflict$/);
  expect(await caretOffset(page)).toBe(text.indexOf('<<<<<<<'));
});
test('334 Navigate to next compiler warning', async ({ page }) => {
  needsLang();
  await open(page, CS);
  const text = 'namespace Demo;\npublic class P\n{\n    public void M()\n    {\n        int a;\n        int b;\n    }\n}\n';
  await setDoc(page, text);
  await expect(page.locator('.cm-lintRange-warning')).toHaveCount(2, { timeout: 60_000 });
  await caretAt(page, 'namespace', 0);
  await menuItem(page, 'Navigate', /^Next Warning$/);
  expect(await caretOffset(page)).toBe(text.indexOf('a;'));
  await menuItem(page, 'Navigate', /^Next Warning$/);
  expect(await caretOffset(page)).toBe(text.indexOf('b;'));
  await menuItem(page, 'Navigate', /^Previous Warning$/);
  expect(await caretOffset(page)).toBe(text.indexOf('a;'));
});

test('335 Navigate to next test failure', async ({ page, request }) => {
  needsLang();
  test.setTimeout(400_000);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-f400-calc-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../samples/Calculator'), root, { recursive: true, filter: (s) => !/[\/](bin|obj)$/.test(s) });
  const file = path.join(root, 'Tests/CalculatorTests.cs');
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(/\}\s*$/, '\n    [Test]\n    public void FailsOnPurpose()\n    {\n        Assert.That(1 + 1, Is.EqualTo(3));\n    }\n}\n'));
  try {
    expect((await request.post('/api/solution/open', { data: { path: path.join(root, 'Calculator.csproj') } })).ok()).toBe(true);
    await open(page);
    await page.getByRole('button', { name: 'Test Explorer' }).click();
    const te = page.getByRole('region', { name: 'Test Explorer' });
    await expect(te.getByRole('navigation', { name: 'Tests' }).locator('.t-label', { hasText: /FailsOnPurpose/ })).toBeVisible({ timeout: 60_000 });
    await te.getByRole('button', { name: 'Run All Tests' }).click();
    await expect(te.getByRole('status').getByTitle('Failed')).toHaveText('1', { timeout: 300_000 });
    await menuItem(page, 'Navigate', /^Next Test Failure$/);
    await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Tests/CalculatorTests.cs');
    await expect(page.getByText(/Failure 1 of 1: .*FailsOnPurpose/).first()).toBeVisible();
    expect(await page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { lineAt(p: number): { text: string } }; selection: { main: { head: number } } } } } }).__activeEditor().view; return v.state.doc.lineAt(v.state.selection.main.head).text; })).toMatch(/FailsOnPurpose|\[Test\]/);
  } finally {
    await request.post('/api/tests/cancel').catch(() => {});
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});

/** Opens Find in Files (Ctrl+Shift+F) and runs `query`. */
async function findInFiles(page: Page, query: string, opts: { regex?: boolean } = {}) {
  await page.keyboard.press('Control+Shift+F');
  const view = page.getByRole('region', { name: 'Search' });
  await view.getByLabel('Search in files').fill(query);
  if (opts.regex && (await view.getByRole('button', { name: 'Use Regular Expression' }).getAttribute('aria-pressed')) !== 'true') await view.getByRole('button', { name: 'Use Regular Expression' }).click();
  await view.getByLabel('Search in files').press('Enter');
  return view;
}
test('206 Case-preserving replacement', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'Steps/Names.cs'), '// widget Widget WIDGET\n');
  await open(page);
  const view = await findInFiles(page, 'widget');
  await expect(view.getByRole('status')).toContainText('3 results');
  await view.getByRole('button', { name: 'Toggle replace' }).click();
  await view.getByLabel('Replace with').fill('gadget');
  await view.getByRole('button', { name: 'Preserve Case' }).click();
  await view.getByRole('button', { name: 'Replace All', exact: true }).click();
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/Names.cs'), 'utf8')).toBe('// gadget Gadget GADGET\n');
});
test('340 Search with multiline regular expressions', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'Steps/Multi.cs'), 'public void A()\n{\n    // marker\n}\n');
  await open(page);
  const view = await findInFiles(page, String.raw`\{\n\s+// marker`, { regex: true });
  await expect(view.getByRole('status')).toContainText('1 result in 1 file');
  await expect(view.getByRole('navigation', { name: 'Search results' })).toContainText('Multi.cs');
});
test('338 Search within ignored files', async ({ page }) => {
  await fs.mkdir(path.join(temp, 'bin'), { recursive: true });
  await fs.writeFile(path.join(temp, 'bin/Generated.cs'), '// zebra-token\n');
  await open(page);
  const view = await findInFiles(page, 'zebra-token');
  await expect(view.getByRole('status')).toContainText('No results found.');
  await view.getByRole('button', { name: 'Toggle search details' }).click();
  await view.getByRole('button', { name: 'Use Exclude Settings and Ignore Files' }).click();
  await view.getByLabel('Search in files').press('Enter');
  await expect(view.getByRole('status')).toContainText('1 result in 1 file');
});

test('203 Search result editor; 204 saved search editors run again', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'Steps/Notes.cs'), '// alpha\n// beta\n// alpha again\n');
  await open(page);
  const view = await findInFiles(page, 'alpha');
  await expect(view.getByRole('status')).toContainText('2 results');
  await view.getByRole('button', { name: 'Open in Editor' }).click();
  const editor = page.getByLabel('Source of .tas/searches/alpha.code-search');
  await expect(editor).toContainText('# Query: alpha');
  await expect(editor).toContainText('2 results - 1 file');
  await expect(editor).toContainText('3: // alpha again');
  // Double-click a result: the file opens there.
  await editor.locator('.cm-line', { hasText: '3: // alpha again' }).dblclick();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/Notes.cs');
  await expect.poll(() => page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { lineAt(p: number): { number: number } }; selection: { main: { head: number } } } } } }).__activeEditor().view; return v.state.doc.lineAt(v.state.selection.main.head).number; })).toBe(3);
  // Saved: reopened from the Search view, it runs again.
  await fs.appendFile(path.join(temp, 'Steps/Notes.cs'), '// alpha three\n');
  await page.keyboard.press('Control+Shift+F');
  await view.getByRole('button', { name: 'Saved search editors' }).click();
  await page.getByRole('menuitem', { name: 'alpha' }).click();
  await expect.poll(() => fs.readFile(path.join(temp, '.tas/searches/alpha.code-search'), 'utf8')).toContain('3 results - 1 file');
});

test('207 Unicode character highlighting', async ({ page }) => {
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    string аdmin = "x";\n    int b​ = 1;\n}\n');
  const hits = page.locator('.cm-unicode-ambiguous');
  await expect(hits).toHaveCount(1);
  await expect(hits).toHaveAttribute('title', /U\+0430 "а" could be confused with the ASCII character "a"/);
  // Zero-width characters: drawn by the editor's special-character marker (or the box when it does not take them).
  await expect(page.locator('.cm-line', { hasText: 'int b' }).locator('.cm-specialChar, .cm-unicode-invisible')).toHaveCount(1);
  // Settings ▸ Text Editor: ambiguous characters off.
  const d = await openSettings(page);
  await d.getByRole('searchbox', { name: 'Search settings' }).fill('unicodeHighlight');
  await d.locator('[data-setting-id="editor.unicodeHighlight.ambiguousCharacters"]').getByRole('checkbox').click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(hits).toHaveCount(0);
});

test('211 Bracket pair guides (all, active)', async ({ page }) => {
  await open(page, CS, { 'editor.guides.bracketPairs': 'true' });
  await setDoc(page, 'class A\n{\n    void M()\n    {\n        int x = 1;\n    }\n}\n');
  const guided = page.locator('.cm-line.cm-bracket-guide');
  await expect(guided).toHaveCount(4);
  await expect(page.locator('.cm-line', { hasText: 'int x = 1;' })).toHaveAttribute('data-guides', '4,0');
  // Active: only the pair around the caret.
  const d = await openSettings(page);
  await d.getByRole('searchbox', { name: 'Search settings' }).fill('editor.guides.bracketPairs');
  await d.getByRole('combobox', { name: 'Guides: Bracket Pairs' }).click();
  await page.getByRole('option', { name: 'active' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await caretAt(page, 'int x', 0);
  await expect(page.locator('.cm-line', { hasText: 'int x = 1;' })).toHaveAttribute('data-guides', '4');
  await expect(guided).toHaveCount(1);
});

test('177 Custom folding patterns', async ({ page }) => {
  await open(page, CS, { 'editor.showFoldingControls': 'always' });
  await setDoc(page, 'namespace Demo;\n// region Helpers\npublic class A { }\npublic class B { }\n// endregion\n// <editor-fold desc="More">\npublic class C { }\n// </editor-fold>\n');
  // Fold the // region line (Ctrl+Shift+[).
  await caretAt(page, '// region', 0);
  await page.keyboard.press('Control+Shift+BracketLeft');
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(1);
  await expect(page.locator('.cm-line', { hasText: 'public class A' })).toHaveCount(0);
  await expect(page.locator('.cm-line', { hasText: 'public class C' })).toHaveCount(1);
  // Rider's editor-fold comments too.
  await caretAt(page, '// <editor-fold', 0);
  await page.keyboard.press('Control+Shift+BracketLeft');
  await expect(page.locator('.cm-foldPlaceholder')).toHaveCount(2);
  await expect(page.locator('.cm-line', { hasText: 'public class C' })).toHaveCount(0);
});

test('175 Linked editing (XML tags)', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'Selectors/linked.xml'), '<root>\n  <item>x</item>\n</root>\n');
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
  await open(page, 'Selectors/linked.xml', { 'editor.linkedEditing': true });
  await caretAt(page, 'item>x', 4);
  await page.keyboard.type('s');
  await expect.poll(() => docText(page)).toContain('<items>x</items>');
  // Renaming the closing tag renames the opening one.
  await caretAt(page, '/items>', 6);
  await page.keyboard.press('Backspace');
  await expect.poll(() => docText(page)).toContain('<item>x</item>');
});

test('336 Search within selected text', async ({ page }) => {
  await open(page, CS);
  const text = 'namespace Demo;\nclass A { int x = 1; }\nclass B { int x = 2; int x2 = x; }\nclass C { int x = 3; }\n';
  await setDoc(page, text);
  // Select class B's line, then Find in Selection.
  await page.evaluate(([a, b]) => { const v = (window as unknown as { __activeEditor: () => { view: { dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: a, head: b } }); v.focus(); }, [text.indexOf('class B'), text.indexOf('class C')] as const);
  await menuItem(page, 'Edit', /^Find in Selection$/);
  const panel = page.locator('.cm-search');
  await expect(panel.getByRole('button', { name: 'Find in Selection' })).toHaveAttribute('aria-pressed', 'true');
  await panel.locator('input[name="search"]').fill('x');
  // Enter goes to the next match inside the selection only (class B's first x, then the next one).
  const head = () => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { from: number } } } } } }).__activeEditor().view.state.selection.main.from);
  await panel.locator('input[name="search"]').press('Enter');
  expect(await head()).toBe(text.indexOf('x = 2'));
  // "all" selects every match in the selection.
  await panel.getByRole('button', { name: 'all', exact: true }).click();
  // Three x in class B only (x, x2's x, and the x read): every caret is inside class B's line.
  const sel = await page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { selection: { ranges: { from: number }[] } } } } }).__activeEditor().view.state.selection.ranges.map((r) => r.from));
  expect(sel.length).toBe(3);
  expect(sel.every((f) => f > text.indexOf('class B') && f < text.indexOf('class C'))).toBe(true);
  // Replace All inside the selection only.
  await setDoc(page, text);
  await page.evaluate(([a, b]) => { const v = (window as unknown as { __activeEditor: () => { view: { dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ selection: { anchor: a, head: b } }); v.focus(); }, [text.indexOf('class B'), text.indexOf('class C')] as const);
  await menuItem(page, 'Edit', /^Find in Selection$/);
  await panel.locator('input[name="search"]').fill('x');
  await panel.locator('input[name="replace"]').fill('y');
  await panel.getByRole('button', { name: 'replace all', exact: true }).click();
  await expect.poll(() => docText(page)).toBe(text.replace('int x = 2; int x2 = x;', 'int y = 2; int y2 = y;'));
});

/** Ctrl+S once the editor shows the edit as unsaved. */
const saveNow = async (page: Page) => { await expect(page.getByRole('button', { name: /^Close AuthSteps\.cs \(unsaved\)$/ })).toBeVisible(); await page.keyboard.press('Control+s'); };
const disk = (f: string) => fs.readFile(path.join(temp, f), 'utf8').then((t) => t.replace(/\r\n/g, '\n'));
test('216 Code formatting on save; 218 format modified lines only', async ({ page }) => {
  needsLang();
  await open(page, CS, { 'editor.formatOnSave': true });
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public int M(){return 1+2;}\n}\n');
  await saveNow(page);
  await expect.poll(() => disk(CS), { timeout: 30_000 }).toContain('public int M() { return 1 + 2; }');
  await expect.poll(() => docText(page)).toContain('public int M() { return 1 + 2; }');
  // Modifications only: an untouched badly formatted line stays as it is.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'editor.formatOnSave': true, 'editor.formatOnSaveMode': 'modifications' })));
  await fs.writeFile(path.join(temp, CS), 'namespace Demo;\npublic class P\n{\n    public int A(){return 1+2;}\n    public int B() { return 3; }\n}\n');
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(page.getByLabel(`Source of ${CS}`)).toContainText('public int A()');
  await caretAt(page, 'return 3;', 8);
  await page.keyboard.type('0+4');
  await saveNow(page);
  await expect.poll(() => disk(CS), { timeout: 30_000 }).toContain('return 30 + 4;');
  expect(await disk(CS)).toContain('public int A(){return 1+2;}');
});
test('217 Code actions on save: organize imports', async ({ page }) => {
  needsLang();
  await open(page, CS, { 'editor.codeActionsOnSave.organizeImports': true });
  // System.Globalization is unused; System.Text is used (System itself is an implicit global using).
  await setDoc(page, 'using System.Text;\nusing System.Globalization;\nnamespace Demo;\npublic class P\n{\n    public string M() => new StringBuilder().ToString();\n}\n');
  await saveNow(page);
  await expect.poll(() => disk(CS), { timeout: 30_000 }).toMatch(/^using System\.Text;\nnamespace Demo;/);
});

test('388 Zen Mode (Ctrl+K Z) with its settings; Escape twice leaves it', async ({ page }) => {
  await open(page, CS, { 'zenMode.fullScreen': false, 'zenMode.showTabs': 'single', 'zenMode.hideStatusBar': false });
  await page.getByLabel(`Source of ${CS}`).click();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('z');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-rider-mode', 'vszen');
  await expect(page.locator('.activity-bar')).toBeHidden();
  await expect(page.locator('.sidebar').first()).toBeHidden();
  // Tabs: a single one; the status bar stays (hideStatusBar off); line numbers hidden.
  await expect(page.getByRole('group', { name: 'Open editors' }).locator('.editor-tab').filter({ visible: true })).toHaveCount(1);
  await expect(page.locator('.status-bar').first()).toBeVisible();
  await expect(page.locator('.cm-lineNumbers').first()).toBeHidden();
  // The z was not typed into the editor.
  expect(await docText(page)).not.toMatch(/^z/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(html).not.toHaveAttribute('data-rider-mode', /.+/);
  await expect(page.locator('.activity-bar')).toBeVisible();
});

test('384 Split editor horizontally (down); 397 Maximize editor group', async ({ page }) => {
  await open(page, CS);
  await menuItem(page, 'View', /^Split Editor Down$/);
  const split = page.locator('.editor-split');
  await expect(split).toHaveClass(/\bdown\b/);
  const pane = page.getByRole('region', { name: `Split editor ${CS}` });
  await expect(pane).toBeVisible();
  const main = page.locator('.editor-split > .editor-area').first();
  // Below, not beside.
  expect((await pane.boundingBox())!.y).toBeGreaterThan((await main.boundingBox())!.y + 50);
  // Maximize the split group (it has focus), then back.
  await pane.locator('.cm-content').click();
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Control+m');
  await expect(split).toHaveAttribute('data-maximized', 'split');
  await expect(main).toBeHidden();
  await menuItem(page, 'View', /^Maximize Editor Group/);
  await expect(main).toBeVisible();
  // Right again.
  await menuItem(page, 'View', /^Split Editor Right$/);
  await expect(split).not.toHaveClass(/\bdown\b/);
  expect((await pane.boundingBox())!.x).toBeGreaterThan((await main.boundingBox())!.x + 50);
});

test('391 Custom activity bar positioning; 392 Custom panel positioning', async ({ page }) => {
  await open(page, CS, { 'workbench.activityBar.location': 'right', 'workbench.panel.defaultLocation': 'left' });
  const bar = page.locator('.activity-bar');
  const editor = page.getByLabel(`Source of ${CS}`);
  expect((await bar.boundingBox())!.x).toBeGreaterThan((await editor.boundingBox())!.x);
  // The panel (Output) opens on the left of the editors; its button moves it to the bottom.
  await page.keyboard.press('Control+Alt+o');
  const dock = page.locator('.dock');
  await expect(dock).toHaveClass(/dock-left/);
  expect((await dock.boundingBox())!.x).toBeLessThan((await editor.boundingBox())!.x);
  await dock.getByRole('button', { name: 'Move panel to the bottom' }).click();
  await expect(dock).toHaveClass(/dock-bottom/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tas:settings') ?? '{}')['workbench.panel.defaultLocation'])).toBeUndefined();
  // Hidden activity bar.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'workbench.activityBar.location': 'hidden' })));
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(bar).toHaveCount(0);
});

test('393 Secondary sidebar', async ({ page }) => {
  await open(page, CS);
  await page.getByLabel(`Source of ${CS}`).click();
  await page.keyboard.press('Control+Alt+b');
  const side = page.getByRole('complementary', { name: 'Secondary Side Bar' });
  await expect(side).toBeVisible();
  await expect(side.getByRole('region', { name: 'Structure' })).toBeVisible();
  expect((await side.boundingBox())!.x).toBeGreaterThan((await page.getByLabel(`Source of ${CS}`).boundingBox())!.x);
  await side.getByLabel('Secondary Side Bar view').selectOption('problems');
  await expect(side.getByRole('region', { name: 'Problems' })).toBeVisible();
  await menuItem(page, 'View', /^Secondary Side Bar/);
  await expect(side).toHaveCount(0);
});

test('400 Synchronized scrolling between diff panes', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, CS);
  const lines = Array.from({ length: 300 }, (_, i) => `line ${i}`);
  await setDoc(page, lines.join('\n'));
  await page.evaluate((t) => navigator.clipboard.writeText(t), lines.map((l, i) => (i % 40 === 0 ? `${l} changed` : l)).join('\n'));
  await menuItem(page, 'Edit', /^Compare with Clipboard$/);
  await page.getByRole('radio', { name: 'Side by Side' }).click();
  const left = page.locator('.sbs-pane').first().locator('.sbs-scroll');
  const right = page.locator('.sbs-pane').nth(1).locator('.sbs-scroll');
  await expect(left).toBeVisible();
  await left.evaluate((e) => { e.scrollTop = 400; });
  await expect.poll(() => right.evaluate((e) => e.scrollTop)).toBe(400);
  // Off: the panes scroll on their own.
  await page.getByLabel('Synchronized scrolling').uncheck();
  await left.evaluate((e) => { e.scrollTop = 0; });
  await page.waitForTimeout(200);
  expect(await right.evaluate((e) => e.scrollTop)).toBe(400);
});

test('383 Editor tab grouping; 386 Move editors between groups; 398 Editor group locking', async ({ page }) => {
  await open(page, CS);
  await page.getByRole('navigation').getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().click();
  // SearchSteps.cs (active) into the side group; then AuthSteps.cs too: the side group has two tabs.
  await menuItem(page, 'View', /^Move Editor into Next Group$/);
  const side = page.getByRole('tablist', { name: 'Side group tabs' });
  await expect(side.getByRole('tab')).toHaveText(['SearchSteps.cs']);
  await expect(page.getByRole('group', { name: 'Open editors' }).locator('.editor-tab-label', { hasText: 'SearchSteps.cs' })).toHaveCount(0);
  await page.getByRole('group', { name: 'Open editors' }).locator('.editor-tab-label', { hasText: 'AuthSteps.cs' }).click();
  await menuItem(page, 'View', /^Move Editor into Next Group$/);
  await expect(side.getByRole('tab')).toHaveText(['SearchSteps.cs', 'AuthSteps.cs']);
  await side.getByRole('tab', { name: 'SearchSteps.cs' }).click();
  await expect(page.getByRole('region', { name: 'Split editor Steps/SearchSteps.cs' })).toBeVisible();
  // Back into the main group.
  await menuItem(page, 'View', /^Move Editor into Previous Group$/);
  await expect(side.getByRole('tab')).toHaveText(['AuthSteps.cs']);
  await expect(page.getByRole('group', { name: 'Open editors' }).locator('.editor-tab-label', { hasText: 'SearchSteps.cs' })).toHaveCount(1);
  // Locked: Open to the Side opens in the main group instead.
  await page.getByRole('button', { name: 'Lock Group' }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:open-split', { detail: 'Steps/SearchSteps.cs' })));
  await expect(side.getByRole('tab')).toHaveText(['AuthSteps.cs']);
  await expect(page.getByText('The side editor group is locked').first()).toBeVisible();
});

test('387 Open files in a floating editor window', async ({ page, context }) => {
  await open(page, CS);
  const [win] = await Promise.all([context.waitForEvent('page'), menuItem(page, 'View', /^Open in New Window$/)]);
  await win.waitForLoadState();
  await expect(win.getByLabel(`Floating editor ${CS}`)).toBeVisible();
  await expect(win.getByLabel(`Source of ${CS}`)).toContainText('class AuthSteps');
  // Editing there and saving writes the file.
  await win.getByLabel(`Source of ${CS}`).click();
  await win.keyboard.press('Control+End');
  await win.keyboard.type('// from the floating window');
  await win.keyboard.press('Control+s');
  await expect.poll(() => fs.readFile(path.join(temp, CS), 'utf8'), { timeout: 20_000 }).toContain('// from the floating window');
});

test('259 Conditional compilation branch highlighting', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n#if DEBUG\n    public int OnlyInDebug;\n#else\n    public int OnlyInRelease;\n#endif\n#if CUSTOM_SYMBOL\n    public int Custom;\n#endif\n}\n');
  const inactive = page.locator('.cm-inactive-code');
  await expect.poll(async () => (await inactive.allTextContents()).join(''), { timeout: 60_000 }).toContain('OnlyInRelease');
  expect((await inactive.allTextContents()).join('')).toContain('Custom');
  expect((await inactive.allTextContents()).join('')).not.toContain('OnlyInDebug');
  await expect(inactive.first()).toHaveAttribute('title', /DEBUG;TRACE/);
});
test('179 Semantic syntax highlighting', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic interface IShape { double Area(); }\npublic class Circle : IShape\n{\n    private double radius;\n    public double Area() { var r = radius; return r * r; }\n}\n');
  await expect.poll(async () => (await page.locator('.cm-sem-interface').allTextContents()).join(','), { timeout: 60_000 }).toContain('IShape');
  expect(await page.locator('.cm-sem-field').allTextContents()).toContain('radius');
  expect(await page.locator('.cm-sem-local').allTextContents()).toContain('r');
  expect(await page.locator('.cm-sem-method').allTextContents()).toContain('Area');
  // Off from Settings: the next edit draws none.
  const d = await openSettings(page);
  await d.getByRole('searchbox', { name: 'Search settings' }).fill('semanticHighlighting');
  await d.getByRole('combobox', { name: 'Semantic Highlighting: Enabled' }).click();
  await page.getByRole('option', { name: 'false' }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await setDoc(page, 'namespace Demo;\npublic interface IShape { }\n');
  await expect(page.locator('.cm-sem-interface')).toHaveCount(0);
});

const selectText = (page: Page, from: string, to: string) => page.evaluate(([a, b]) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; const t = v.state.doc.toString(); v.dispatch({ selection: { anchor: t.indexOf(a), head: t.indexOf(b) + b.length } }); v.focus(); }, [from, to] as const);
const FLOW = 'namespace Demo;\npublic class P\n{\n    public int M(int a)\n    {\n        var x = a;\n        int y;\n        y = x + 1;\n        return y;\n    }\n}\n';
test('104 Control-flow analysis', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, FLOW);
  await selectText(page, 'y = x + 1;', 'return y;');
  await menuItem(page, 'Code', /^Analyze Control Flow$/);
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText('2 statements selected', { timeout: 60_000 });
  await expect(dlg).toContainText(/End point reachable:\s+no/);
  await expect(dlg).toContainText(/Return statements:\s+1/);
});
test('105 Data-flow analysis', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, FLOW);
  await selectText(page, 'y = x + 1;', 'return y;');
  await menuItem(page, 'Code', /^Analyze Data Flow$/);
  const dlg = page.getByRole('dialog');
  await expect(dlg).toContainText(/Flows in \(read, set before\):\s+x/, { timeout: 60_000 });
  await expect(dlg).toContainText(/Written inside:\s+y/);
  await expect(dlg).toContainText(/Always assigned:\s+y/);
});

test('33 Method hierarchy', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic interface IRun { void Run(); }\npublic class Base : IRun { public virtual void Run() { } }\npublic class Mid : Base { public override void Run() { } }\npublic class Leaf : Mid { public override void Run() { } }\npublic class Other : Base { public override void Run() { } }\n');
  await caretAt(page, 'override void Run() { } }\npublic class Leaf', 15);
  await menuItem(page, 'Navigate', /^Method Hierarchy$/);
  const list = page.getByRole('dialog', { name: /Method Hierarchy/ });
  await expect(list).toContainText('Mid.Run', { timeout: 60_000 });
  const labels = await list.getByRole('option').allTextContents();
  const order = (n: string) => labels.findIndex((l) => l.includes(n));
  expect(order('IRun.Run')).toBeGreaterThanOrEqual(0);
  expect(order('Base.Run')).toBeLessThan(order('Mid.Run'));
  expect(order('Mid.Run')).toBeLessThan(order('Leaf.Run'));
  expect(order('Other.Run')).toBe(-1);
});

test('123 Namespace consistency inspections', async ({ page }) => {
  await analyzerFix(page, 'namespace Wrong.Place;\npublic class P { }\n', [{ cls: '.cm-lintRange-info', text: 'Wrong.Place' }], 'Wrong.Place', /^Change namespace to match folder structure$/, (d) => d.includes('namespace Fixtures.Steps'));
});

test('60 External source navigation (metadata as source)', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public string M() => new System.Text.StringBuilder().Append(1).ToString();\n}\n');
  await caretAt(page, 'Append', 2);
  await page.keyboard.press('F12');
  const dlg = page.getByRole('dialog', { name: /StringBuilder \[from metadata/ });
  await expect(dlg).toBeVisible({ timeout: 60_000 });
  const src = dlg.getByLabel(/StringBuilder \[from metadata/);
  await expect(src).toContainText('public sealed class StringBuilder');
  await expect(src).toContainText('namespace System.Text;');
  // The member asked for is the marked line.
  await expect(dlg.locator('.cm-preview-target')).toContainText('Append(');
});

test('59 Decompiled source navigation', async ({ page }) => {
  needsLang();
  await open(page, CS);
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    public string M() => new System.Text.StringBuilder().Clear().ToString();\n}\n');
  await caretAt(page, 'Clear', 2);
  await menuItem(page, 'Navigate', /^Go to Decompiled Source$/);
  const dlg = page.getByRole('dialog', { name: /StringBuilder \[decompiled/ });
  await expect(dlg).toBeVisible({ timeout: 90_000 });
  // Real code, with bodies.
  await expect(dlg.locator('.cm-preview-target')).toContainText('Clear(');
  await expect(dlg.getByLabel(/StringBuilder \[decompiled/)).toContainText('Decompiled from System.Private.CoreLib.dll');
});
