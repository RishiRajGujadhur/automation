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
  await setDoc(page, 'namespace Demo;\npublic class P\n{\n    private int f = 1;\n    public int Run(int a)\n    {\n        var x = 1;\n        x = a;\n        return x + f;\n    }\n}\n');
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
