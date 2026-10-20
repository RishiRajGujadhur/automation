import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Advanced Rider features for C# (RIDER-CS-15.md, RC1–RC15) against the Roslyn language service.
const langServer = path.resolve(import.meta.dirname, '../../langserver/bin/Release/net10.0/LangServer.dll');
test.skip(!existsSync(langServer), 'The C# language service is not built (npm run langserver:build).');
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(180_000);

let temp: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-rcs-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), temp, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});
const FILE = 'Steps/AuthSteps.cs';
async function open(page: Page) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click();
  await expect(page.getByLabel(`Source of ${FILE}`)).toBeVisible();
}
const doc = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
/** Replaces the editor text; `select` is the text to select (or, with `caret`, where to put the caret). */
const setDoc = (page: Page, text: string, select: string, caret = false) => page.evaluate(([t, s, c]) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; const a = t.indexOf(s); v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t }, selection: { anchor: c ? a + 1 : a, head: c ? a + 1 : a + s.length } }); v.focus(); }, [text, select, caret] as const);
const menuItem = async (page: Page, menu: string, item: RegExp) => { await page.getByRole('button', { name: `${menu} menu` }).click(); await page.getByRole('menuitem', { name: item }).click(); };
const PROBE = 'namespace Demo;\npublic class Probe\n{\n    private int seed = 3;\n    public int Run(int a)\n    {\n        var total = a * 2 + seed;\n        return total + 1;\n    }\n}\n';
void menuItem;

test('RC1–RC7 Refactor This, Extract Method, Introduce Variable / Parameter, Inline, Generate, Move Type to File', async ({ page }) => {
  await open(page);
  const quick = page.getByRole('listbox', { name: 'Quick Actions' });
  // RC1: only refactorings.
  await setDoc(page, PROBE, 'a * 2');
  await page.keyboard.press('Control+Alt+Shift+T');
  await expect(quick.getByRole('option', { name: 'Extract method' })).toBeVisible({ timeout: 60_000 });
  await expect(quick.getByRole('option', { name: /using / })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // RC3
  await setDoc(page, PROBE, 'a * 2');
  await page.keyboard.press('Control+Alt+V');
  await expect.poll(() => doc(page), { timeout: 60_000 }).toMatch(/(var|int) \w+ = a \* 2;\n\s+var total = \w+ \+ seed;/);
  // RC2
  await setDoc(page, PROBE, 'var total = a * 2 + seed;');
  await page.keyboard.press('Control+Alt+M');
  await expect.poll(() => doc(page), { timeout: 60_000 }).toMatch(/NewMethod\(/);
  // RC4
  await setDoc(page, PROBE, 'total =', true);
  await page.keyboard.press('Control+Alt+N');
  await expect.poll(() => doc(page), { timeout: 60_000 }).toContain('return a * 2 + seed + 1;');
  // RC5: nested "and update call sites directly" now has its parent's title.
  await setDoc(page, PROBE, 'a * 2');
  await page.keyboard.press('Control+Alt+P');
  await expect.poll(() => doc(page), { timeout: 60_000 }).toMatch(/public int Run\(int a, int \w+\)/);
  // RC6: generators, without the ones that need a dialog.
  await setDoc(page, PROBE, 'robe', true);
  await page.keyboard.press('Control+Alt+G');
  await expect(quick.getByRole('option', { name: "Generate constructor 'Probe()'" })).toBeVisible({ timeout: 60_000 });
  await expect(quick.getByRole('option', { name: /\.\.\.$/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // RC7
  await setDoc(page, `${PROBE}\npublic class Other\n{\n}\n`, 'Other', true);
  await page.keyboard.press('Control+Alt+Shift+M');
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/Other.cs'), 'utf8').catch(() => ''), { timeout: 60_000 }).toContain('class Other');
  await expect.poll(() => doc(page)).not.toContain('class Other');
});

const refactorItem = async (page: Page, item: RegExp) => { await page.getByRole('button', { name: 'Code menu' }).click(); await page.getByRole('menuitem', { name: 'Refactor', exact: true }).click(); await page.getByRole('menuitem', { name: item }).click(); };

test('RC8–RC15 Extract Interface, Create Unit Tests, exit points, severity, NuGet for type, Search with Pattern, Cleanup, inheritance gutter', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'Steps/Shapes.cs'), 'namespace Demo;\npublic abstract class Shape\n{\n    public abstract double Area();\n}\npublic class Circle : Shape\n{\n    public override double Area() => 3;\n}\npublic class Guard\n{\n    public bool Check(string user) { if (user == null) return false; return true; }\n}\n');
  expect((await page.request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
  await open(page);
  // RC8 / RC9
  await setDoc(page, 'namespace Demo;\npublic class Shop\n{\n    public string Name { get; set; } = "";\n    public int Buy(string item) { return 1; }\n}\n', 'Shop', true);
  await refactorItem(page, /^Extract Interface/);
  let dlg = page.getByRole('dialog', { name: 'Extract Interface: IShop.cs' });
  await dlg.getByRole('button', { name: 'Approve and write IShop.cs' }).click();
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/IShop.cs'), 'utf8').catch(() => '')).toContain('int Buy(string item);');
  await dlg.getByRole('button', { name: 'Close dialog' }).click();
  expect(await doc(page)).toContain('public class Shop : IShop');
  await refactorItem(page, /^Create Unit Tests/);
  dlg = page.getByRole('dialog', { name: 'Create Unit Tests (nunit): ShopTests.cs' });
  await dlg.getByRole('button', { name: 'Approve and write ShopTests.cs' }).click();
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/ShopTests.cs'), 'utf8').catch(() => '')).toContain('public void Buy_Works()');
  await dlg.getByRole('button', { name: 'Close dialog' }).click();
  // RC10
  await setDoc(page, 'class A\n{\n    int M(int x)\n    {\n        if (x < 0) throw new System.Exception();\n        return x;\n    }\n}\n', 'return', true);
  await expect(page.locator('.cm-exit-point')).toHaveCount(2);
  // RC11 on a syntax error (CS1002 ; expected)
  await setDoc(page, 'class A\n{\n    void M() { int x = 1 }\n}\n', '1 }', true);
  await expect(page.locator('.cm-lintRange-error').first()).toBeVisible({ timeout: 30_000 });
  page.once('dialog', (d) => void d.accept('warning'));
  await refactorItem(page, /^Configure Severity/);
  dlg = page.getByRole('dialog', { name: /^Configure CS\d+ severity: warning$/ });
  await dlg.getByRole('button', { name: 'Approve and write .editorconfig' }).click();
  await expect.poll(() => fs.readFile(path.join(temp, '.editorconfig'), 'utf8').catch(() => '')).toMatch(/\[\*\.cs\]\ndotnet_diagnostic\.CS\d+\.severity = warning/);
  await dlg.getByRole('button', { name: 'Close dialog' }).click();
  // RC12 (nuget.org mocked)
  const installed: string[] = [];
  await page.route('**/api/nuget/search*', (r) => r.fulfill({ json: [{ id: 'Newtonsoft.Json', version: '13.0.3', description: 'Json.NET', totalDownloads: 5, authors: [], verified: true }] }));
  await page.route('**/api/nuget/install', (r) => { installed.push(r.request().postData() ?? ''); return r.fulfill({ json: { output: '', installed: [] } }); });
  await setDoc(page, 'class A { JsonConvert c; }', 'JsonConvert', true);
  await refactorItem(page, /^Find NuGet Package for Missing Type/);
  await page.getByRole('option', { name: /^Newtonsoft\.Json 13\.0\.3/ }).click();
  await expect.poll(() => installed.length).toBe(1);
  expect(JSON.parse(installed[0])).toEqual({ project: 'Fixtures.csproj', id: 'Newtonsoft.Json' });
  // RC13
  await menuItem(page, 'Navigate', /^Search with Pattern/);
  dlg = page.getByRole('dialog', { name: 'Search with Pattern' });
  await dlg.getByLabel('Search pattern').fill('$x$ == null');
  await dlg.getByRole('button', { name: 'Find' }).click();
  await expect(dlg.getByRole('list', { name: 'Pattern matches' })).toContainText('Steps/Shapes.cs:12');
  await dlg.getByLabel('Replace pattern').fill('$x$ is null');
  await dlg.getByRole('button', { name: 'Preview replace' }).click();
  dlg = page.getByRole('dialog', { name: 'Replace with Pattern: 1 file' });
  await dlg.getByRole('button', { name: 'Approve and write Shapes.cs' }).click();
  await expect.poll(() => fs.readFile(path.join(temp, 'Steps/Shapes.cs'), 'utf8')).toContain('if (user is null) return false;');
  await dlg.getByRole('button', { name: 'Close dialog' }).click();
  // RC14
  await refactorItem(page, /^Code Cleanup in Solution/);
  await expect(page.getByRole('dialog', { name: /^Code Cleanup in Solution: \d+ files?$/ }).getByRole('button', { name: /^Approve and write / }).first()).toBeVisible({ timeout: 120_000 });
  await page.getByRole('dialog').getByRole('button', { name: 'Close dialog' }).click();
  // RC15
  await page.getByRole('navigation').getByRole('button', { name: 'Shapes.cs', exact: true }).first().click();
  const shapes = page.getByLabel('Source of Steps/Shapes.cs');
  await expect(page.locator('.cm-inherit button[aria-label^="Overrides "][aria-label$="Area()"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.cm-inherit button[aria-label^="Overridden in "][aria-label$="Area()"]')).toBeVisible();
  await expect(page.locator('.cm-inherit button[aria-label="Overrides Shape"]')).toBeVisible();
  // A click on ↑ goes to the base member.
  await page.locator('.cm-inherit button[aria-label="Overrides Shape.Area()"]').click();
  await expect.poll(() => page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { lineAt(p: number): { number: number } }; selection: { main: { head: number } } } } } }).__activeEditor().view; return v.state.doc.lineAt(v.state.selection.main.head).number; })).toBe(4);
  void shapes;
});
