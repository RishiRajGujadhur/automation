import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Front-end language features (FRONTEND-100.md), on a small React + TypeScript project in a temporary folder.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let temp: string;
let previous: unknown;
const FILES: Record<string, string> = {
  'package.json': '{ "name": "web", "private": true, "type": "module" }\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, skipLibCheck: true, noEmit: true, allowJs: true }, include: ['src'] }, null, 2),
  'src/math.ts': 'export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport const PI = 3.14;\n',
  'src/app.ts': 'const total: number = 1;\nconsole.log(total);\n',
};
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-f100-'));
  for (const [f, text] of Object.entries(FILES)) { await fs.mkdir(path.dirname(path.join(temp, f)), { recursive: true }); await fs.writeFile(path.join(temp, f), text); }
  expect((await request.post('/api/workspace', { data: { repositoryRoot: temp, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  await request.post('/api/workspace', { data: previous });
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
});

/** Opens a file of the temporary project (written first when `text` is given) in a clean studio. */
async function open(page: Page, file: string, text?: string) {
  if (text !== undefined) { await fs.mkdir(path.dirname(path.join(temp, file)), { recursive: true }); await fs.writeFile(path.join(temp, file), text); }
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.evaluate((f) => window.dispatchEvent(new CustomEvent('tas:open-location', { detail: { file: f, line: 1 } })), file);
  const editor = page.getByLabel(`Source of ${file}`);
  await expect(editor).toBeVisible();
  return editor;
}
const docText = (page: Page) => page.evaluate(() => (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } } } } }).__activeEditor().view.state.doc.toString());
const setDoc = (page: Page, text: string) => page.evaluate((t) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { length: number } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: t } }); v.focus(); }, text);
/** Puts the caret at `text` + offset (or selects `text` when select is set). */
const caretAt = (page: Page, text: string, offset = 0, select = false) => page.evaluate(([t, o, s]) => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { toString(): string } }; dispatch(x: unknown): void; focus(): void } } }).__activeEditor().view; const i = v.state.doc.toString().indexOf(t as string); v.dispatch({ selection: s ? { anchor: i, head: i + (t as string).length } : { anchor: i + (o as number) } }); v.focus(); }, [text, offset, select] as const);
/** Ctrl+. and the Quick Action whose title matches. */
async function quickAction(page: Page, title: RegExp) {
  await page.keyboard.press('Control+.');
  const option = page.getByRole('listbox', { name: 'Quick Actions' }).getByRole('option', { name: title });
  await expect(option).toBeVisible({ timeout: 60_000 });
  await option.click();
}
/** Runs the Quick Action at `text` and waits for the document to contain `expected`. */
async function convert(page: Page, at: string, title: RegExp, expected: string | RegExp, select = false, offset = 0) {
  await caretAt(page, at, offset, select);
  await quickAction(page, title);
  await expect.poll(() => docText(page), { timeout: 30_000 }).toMatch(typeof expected === 'string' ? new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) : expected);
}
void convert;

test('Foundation: TypeScript colouring, diagnostics, completion with auto-import, Quick Actions', async ({ page }) => {
  const editor = await open(page, 'src/app.ts');
  // Syntax colouring from the TypeScript mode.
  await expect(editor.locator('.cm-line').first().locator('span').first()).toBeVisible();
  // A type error from the TypeScript service.
  await setDoc(page, 'const total: number = "one";\n');
  await expect(editor.locator('.cm-lintRange-error').first()).toBeVisible({ timeout: 30_000 });
  // Completion of an export of another file, with its import added.
  await setDoc(page, '\nconst s = ad');
  await page.keyboard.press('End');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+Space');
  const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^add$/ }) }).first();
  await expect(option).toContainText('import from "./math"', { timeout: 30_000 });
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
  await expect.poll(() => docText(page), { timeout: 15_000 }).toMatch(/import \{ add \} from "\.\/math";?\n[\s\S]*const s = add/);
  // Quick Actions list TypeScript refactorings.
  await setDoc(page, 'function greet(name: string) {\n  return "Hello " + name;\n}\n');
  await caretAt(page, '"Hello "', 1);
  await page.keyboard.press('Control+.');
  await expect(page.getByRole('listbox', { name: 'Quick Actions' }).getByRole('option', { name: /Convert to template string/ })).toBeVisible({ timeout: 30_000 });
});
