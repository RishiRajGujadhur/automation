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

test('F1 Extract TypeScript type alias', async ({ page }) => {
  await open(page, 'src/shapes.ts', 'export const origin: { x: number; y: number } = { x: 0, y: 0 };\n');
  await convert(page, '{ x: number; y: number }', /^Extract to type alias$/, /type NewType = \{\s*x: number;\s*y: number;?\s*\};?\s*\nexport const origin: NewType =/, true);
});

test('F2 Convert interface to type alias', async ({ page }) => {
  await open(page, 'src/shapes.ts', 'interface Named { name: string }\nexport interface Point<T> extends Named {\n  x: T;\n  y: T;\n}\n');
  await convert(page, 'interface Point', /^Convert to type alias$/, 'export type Point<T> = Named & {\n  x: T;\n  y: T;\n};', false, 12);
});
test('F3 Convert type alias to interface', async ({ page }) => {
  await open(page, 'src/shapes.ts', 'interface Named { name: string }\nexport type Point = Named & {\n  x: number;\n};\n');
  await convert(page, 'type Point', /^Convert to interface$/, 'export interface Point extends Named {\n  x: number;\n}', false, 6);
});

test('F4 Generate missing interface properties', async ({ page }) => {
  await open(page, 'src/shapes.ts', 'interface Point { x: number; y: number; label: string }\nexport const p: Point = { x: 1 };\n');
  await convert(page, 'const p', /^Add missing properties$/, /y: 0,\s*label: ""/, false, 6);
});
test('F5 Implement interface members', async ({ page }) => {
  await open(page, 'src/shapes.ts', 'interface Shape { area(): number; readonly name: string }\nexport class Circle implements Shape {\n}\n');
  await convert(page, 'class Circle', /^Implement interface 'Shape'$/, /area\(\): number \{\s*throw new Error\("Method not implemented\."\);\s*\}/, false, 7);
  expect(await docText(page)).toContain('name: string');
});

test('F6 Infer generic type arguments', async ({ page }) => {
  await open(page, 'src/util.ts', 'function pair<A, B>(a: A, b: B): [A, B] { return [a, b]; }\nexport const p = pair(1, "one");\n');
  await convert(page, 'pair(1', /^Add explicit type arguments <number, string>$/, 'export const p = pair<number, string>(1, "one");', false, 1);
});
test('F7 Add explicit type annotations', async ({ page }) => {
  await open(page, 'src/util.ts', 'export const names = ["a", "b"].map((s) => s.length);\n');
  await convert(page, 'names', /^Add explicit type annotation ': number\[\]'$/, 'export const names: number[] = ', false, 2);
});
test('F8 Remove redundant type annotations', async ({ page }) => {
  await open(page, 'src/util.ts', 'export let count: number = 0;\nexport const label: string | number = "x";\n');
  await convert(page, 'count', /^Remove redundant type annotation$/, 'export let count = 0;', false, 2);
  // Not redundant: the annotation is wider than the initializer.
  await caretAt(page, 'label', 2);
  await page.keyboard.press('Control+.');
  await expect(page.getByRole('listbox', { name: 'Quick Actions' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('option', { name: 'Remove redundant type annotation' })).toHaveCount(0);
});

/** Approves the diff previews in a dialog whose title matches. */
async function approve(page: Page, title: RegExp) {
  const d = page.getByRole('dialog', { name: title });
  await expect(d).toBeVisible({ timeout: 60_000 });
  for (const b of await d.getByRole('button', { name: /^(Apply|Approve)/ }).all()) await b.click();
  await expect(d.getByRole('button', { name: 'Written' }).first()).toBeVisible();
  await d.getByRole('button', { name: 'Close dialog' }).click();
}
/** The Explorer's button for a file (all files shown). */
async function explorerFile(page: Page, name: string) {
  const all = page.getByRole('button', { name: 'Show all files' });
  if (await all.count() && (await all.getAttribute('aria-pressed')) !== 'true') await all.click();
  return page.getByRole('navigation').getByRole('button', { name, exact: true }).first();
}

test('F9 Convert JavaScript to TypeScript', async ({ page }) => {
  await open(page, 'src/legacy.js', '/**\n * @param {number} w\n * @param {number} h\n * @returns {number}\n */\nexport function area(w, h) {\n  return w * h;\n}\n');
  await caretAt(page, 'area', 1);
  await quickAction(page, /^Convert to TypeScript \(rename to legacy\.ts\)$/);
  await approve(page, /Convert to TypeScript/);
  await expect.poll(() => fs.readFile(path.join(temp, 'src/legacy.ts'), 'utf8').catch(() => '')).toContain('export function area(w: number, h: number): number {');
  await expect.poll(() => fs.access(path.join(temp, 'src/legacy.js')).then(() => true, () => false)).toBe(false);
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'src/legacy.ts');
});

test('F22 Update imports when files move', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'src/app.ts'), 'import { add } from "./math";\nconsole.log(add(1, 2));\n');
  await open(page, 'src/app.ts');
  const math = await explorerFile(page, 'math.ts');
  await math.click();
  await math.press('F2');
  const box = page.getByLabel('New name for math.ts');
  await box.fill('calc.ts');
  await box.press('Enter');
  await approve(page, /Update imports for math\.ts: 1 file/);
  await expect.poll(() => fs.readFile(path.join(temp, 'src/app.ts'), 'utf8')).toContain('from "./calc"');
});

test('F10 Generate JSDoc annotations', async ({ page }) => {
  await open(page, 'src/util.ts', 'export function scale(value: number, factor = 2) {\n  return value * factor;\n}\n');
  // Quick Action on the declaration.
  await convert(page, 'scale', /^Generate JSDoc comment$/, /\/\*\*\n \*\s*\n \* @param value\n \* @param factor\n \* @returns\s*\n \*\/\nexport function scale/, false, 1);
  // Typing /** and Enter above a declaration.
  await setDoc(page, 'export class Box {\n  /**\n  resize(width: number, height: number) {}\n}\n');
  await caretAt(page, '/**', 3);
  await page.keyboard.press('Enter');
  await expect.poll(() => docText(page), { timeout: 15_000 }).toMatch(/  \/\*\*\n   \*\s*\n   \* @param width\n   \* @param height\n   \*\/\n  resize/);
});
test('F11 Infer types from JSDoc', async ({ page }) => {
  await open(page, 'src/util.ts', '/**\n * @param {string} name\n * @param {number} [times]\n */\nexport function repeat(name, times) {\n  return name.repeat(times ?? 1);\n}\n');
  await convert(page, 'repeat(', /^Annotate with type from JSDoc$/, 'export function repeat(name: string, times: number)', false, 2);
});
test('F13 Convert promise chains to async/await', async ({ page }) => {
  await open(page, 'src/api.ts', 'export function load(url: string) {\n  return fetch(url).then((r) => r.json()).then((data) => data.items);\n}\n');
  await convert(page, 'load', /^Convert to async function$/, /export async function load\(url: string\) \{\s*const r = await fetch\(url\);\s*const data = await r\.json\(\);\s*return data\.items;\s*\}/, false, 1);
});

test('F12 Convert callbacks to promises', async ({ page }) => {
  await open(page, 'src/files.js', 'import fs from "node:fs";\nfs.readFile("a.txt", "utf8", (err, data) => {\n  if (err) {\n    console.error(err);\n    return;\n  }\n  console.log(data.length);\n});\n');
  await convert(page, 'readFile', /^Convert callback to promise$/, /new Promise\(\(resolve, reject\) => fs\.readFile\("a\.txt", "utf8", \(err, data\) => \(err \? reject\(err\) : resolve\(data\)\)\)\)\n  \.then\(\(data\) => \{\n    console\.log\(data\.length\);\n  \}\)\n  \.catch\(\(err\) => \{\n    console\.error\(err\);\n    return;\n  \}\)/, false, 2);
});
test('F14 Convert async/await to promise chains', async ({ page }) => {
  await open(page, 'src/api.ts', 'export async function load(url: string) {\n  const r = await fetch(url);\n  const data = await r.json();\n  return data.items;\n}\n');
  await convert(page, 'load', /^Convert to promise chain \(\.then\)$/, 'export function load(url: string) {\n  return fetch(url).then((r) => {\n    return r.json().then((data) => {\n      return data.items;\n    });\n  });\n}', false, 1);
});
test('F15 Convert function declarations to arrow functions', async ({ page }) => {
  await open(page, 'src/util.ts', 'export async function twice<T>(x: T): Promise<T[]> {\n  return [x, x];\n}\nfunction usesThis(this: Date) { return this.getTime(); }\n');
  await convert(page, 'twice', /^Convert to arrow function$/, 'export const twice = async <T>(x: T): Promise<T[]> => {\n  return [x, x];\n};', false, 1);
  // A function that uses `this` is not offered.
  await caretAt(page, 'usesThis', 1);
  await page.keyboard.press('Control+.');
  await expect(page.getByRole('listbox', { name: 'Quick Actions' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('option', { name: 'Convert to arrow function' })).toHaveCount(0);
});
test('F16 Convert arrow functions to function declarations', async ({ page }) => {
  await open(page, 'src/util.ts', 'export const square = (n: number) => n * n;\n');
  await convert(page, 'square', /^Convert to named function$/, /export function square\(n: number\) \{\s*return n \* n;\s*\}/, false, 1);
});
