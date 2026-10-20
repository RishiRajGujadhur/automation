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
