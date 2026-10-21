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

test('F17 Convert CommonJS to ES modules', async ({ page }) => {
  await open(page, 'src/legacy.js', 'const path = require("path");\nfunction join(a, b) { return path.join(a, b); }\nmodule.exports = { join };\n');
  await convert(page, 'require', /^Convert to ES module$/, /import path from "path";?[\s\S]*export function join\(a, b\)|import \{ join as _join \} from "path"|import path from "path";[\s\S]*export \{ join \}/, false, 1);
});
test('F18 Convert ES modules to CommonJS', async ({ page }) => {
  await open(page, 'src/esm.js', 'import fs, { readFileSync as read } from "fs";\nimport * as os from "os";\nexport const name = "x";\nexport function size(p) { return read(p).length + os.EOL.length + fs.constants.F_OK; }\nexport default size;\n');
  await convert(page, 'name', /^Convert to CommonJS module$/, 'const fs = require("fs");\nconst { readFileSync: read } = require("fs");\nconst os = require("os");\nconst name = "x";\nfunction size(p) { return read(p).length + os.EOL.length + fs.constants.F_OK; }\n\nmodule.exports = size;\nmodule.exports.name = name;\nmodule.exports.size = size;\n', false, 1);
});
test('F19 Organize ES module imports; F20 Remove unused imports', async ({ page }) => {
  const src = 'import { b, a } from "./letters";\nimport { PI } from "./math";\nimport { add } from "./math";\nexport const x = add(PI, 1) + a + b;\n';
  await fs.writeFile(path.join(temp, 'src/letters.ts'), 'export const a = 1, b = 2, c = 3;\n');
  await open(page, 'src/app.ts', src);
  await convert(page, 'import { b', /^Organize imports$/, 'import { a, b } from "./letters";\nimport { add, PI } from "./math";\nexport const x', false, 2);
  // Shift+Alt+O does the same.
  await setDoc(page, src);
  await page.keyboard.press('Shift+Alt+O');
  await expect.poll(() => docText(page)).toContain('import { a, b } from "./letters";\nimport { add, PI } from "./math";');
  await setDoc(page, 'import { a, c } from "./letters";\nimport { add } from "./math";\nexport const y = a;\n');
  await convert(page, 'import { a', /^Remove unused imports$/, /^import \{ a \} from "\.\/letters";\nexport const y = a;\n$/, false, 2);
});
test('F21 Auto-import unresolved symbols', async ({ page }) => {
  await open(page, 'src/app.ts', 'export const twice = add(PI, PI);\n');
  await convert(page, 'add(', /^Add import from "\.\/math"$/, /^import \{ add(, PI)? \} from "\.\/math";\n/, false, 1);
});

const analyzeMenu = async (page: Page, item: RegExp) => { await page.getByRole('button', { name: 'Code menu' }).click(); await page.getByRole('menuitem', { name: 'Analyze', exact: true }).click(); await page.getByRole('menuitem', { name: item }).click(); };
test('F23 Detect circular module dependencies', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'src/a.ts'), 'import { b } from "./b";\nexport const a = () => b();\n');
  await fs.writeFile(path.join(temp, 'src/b.ts'), 'import type { Shape } from "./types";\nimport { a } from "./a";\nexport const b = () => a;\n');
  await fs.writeFile(path.join(temp, 'src/types.ts'), 'import type { b } from "./b";\nexport type Shape = typeof b;\n');
  await open(page, 'src/a.ts');
  await analyzeMenu(page, /^Find Circular Imports$/);
  const d = page.getByRole('dialog', { name: /Circular imports: 1/ });
  await expect(d).toBeVisible({ timeout: 30_000 });
  await expect(d).toContainText('Modules in a cycle: a.ts ⇄ b.ts');
  await expect(d).toContainText('src/a.ts → src/b.ts');
  await expect(d).toContainText('src/b.ts → src/a.ts');
  // Type-only imports do not make a cycle (b.ts ⇄ types.ts).
  await expect(d).not.toContainText('types.ts');
});

test('F24 Navigate TypeScript declaration files', async ({ page }) => {
  await fs.mkdir(path.join(temp, 'node_modules/tiny-lib'), { recursive: true });
  await fs.writeFile(path.join(temp, 'node_modules/tiny-lib/package.json'), '{ "name": "tiny-lib", "types": "index.d.ts" }');
  await fs.writeFile(path.join(temp, 'node_modules/tiny-lib/index.d.ts'), '/** Adds one. */\nexport declare function inc(n: number): number;\n');
  await open(page, 'src/dom.ts', 'import { inc } from "tiny-lib";\nexport const el = document.querySelector("a");\nexport const two = inc(1);\n');
  // A package's typings.
  await caretAt(page, 'inc(1)', 1);
  await page.keyboard.press('F12');
  const pkg = page.getByRole('dialog', { name: /inc \[tiny-lib\/index\.d\.ts\]/ });
  await expect(pkg).toBeVisible({ timeout: 30_000 });
  await expect(pkg).toContainText('export declare function inc(n: number): number;');
  await page.keyboard.press('Escape');
  // TypeScript's DOM library.
  await caretAt(page, 'querySelector', 3);
  await page.keyboard.press('F12');
  const dom = page.getByRole('dialog', { name: /querySelector \[lib\.dom\.d\.ts\]/ });
  await expect(dom).toBeVisible({ timeout: 30_000 });
  await expect(dom.locator('.cm-preview-target')).toContainText('querySelector');
});

test('F25 Navigate source maps', async ({ page }) => {
  const { SourceMapGenerator } = await import('source-map-js');
  const map = new SourceMapGenerator({ file: 'app.js' });
  map.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: '../src/app.ts' });
  map.addMapping({ generated: { line: 2, column: 0 }, original: { line: 2, column: 0 }, source: '../src/app.ts' });
  await fs.mkdir(path.join(temp, 'dist'), { recursive: true });
  await fs.writeFile(path.join(temp, 'dist/app.js'), 'const total = 1;\nconsole.log(total);\n//# sourceMappingURL=app.js.map\n');
  await fs.writeFile(path.join(temp, 'dist/app.js.map'), map.toString());
  await open(page, 'dist/app.js');
  const active = page.locator('.editor-tab-label[aria-current="true"]');
  await caretAt(page, 'console', 0);
  await page.getByRole('button', { name: 'Navigate menu' }).click();
  await page.getByRole('menuitem', { name: /^Go to Source-Mapped Location/ }).click();
  await expect(active).toHaveAttribute('title', 'src/app.ts');
  await expect(page.getByText('Original source: src/app.ts:2', { exact: true })).toBeVisible();
  // And back to the generated code.
  await page.getByLabel('Source of src/app.ts').click();
  await caretAt(page, 'console', 0);
  await page.getByRole('button', { name: 'Navigate menu' }).click();
  await page.getByRole('menuitem', { name: /^Go to Source-Mapped Location/ }).click();
  await expect(active).toHaveAttribute('title', 'dist/app.js');
});

test('F26 Extract object destructuring', async ({ page }) => {
  await open(page, 'src/user.ts', 'declare function getUser(): { name: string; age: number; id: number };\nexport function describe() {\n  const user = getUser();\n  return `${user.name} (${user.age})`;\n}\n');
  await convert(page, 'user =', /^Introduce object destructuring \{ name, age \}$/, 'const { name, age } = getUser();\n  return `${name} (${age})`;', false, 2);
});
test('F27 Convert destructuring to property access', async ({ page }) => {
  await open(page, 'src/user.ts', 'type Props = { title: string; size: number };\nexport function label(props: Props) {\n  const { title, size: s } = props;\n  return { title, text: title + s };\n}\n');
  await convert(page, '{ title, size', /^Convert destructuring to property access$/, 'export function label(props: Props) {\n  return { title: props.title, text: props.title + props.size };\n}', false, 3);
});
test('F28 Convert optional checks to optional chaining', async ({ page }) => {
  await open(page, 'src/user.ts', 'type U = { address?: { city?: string } };\nexport const city = (u?: U) => u && u.address && u.address.city;\n');
  await convert(page, 'u && u.address && u.address.city', /^Convert to optional chain expression$/, 'export const city = (u?: U) => u?.address?.city;', true);
});
test('F29 Convert null checks to nullish coalescing', async ({ page }) => {
  await open(page, 'src/user.ts', 'export function pick(a: string | null | undefined, b: number | null) {\n  const x = a !== null && a !== undefined ? a : "none";\n  const y = b == null ? 0 : b;\n  return [x, y];\n}\n');
  await convert(page, 'a !== null', /^Convert to nullish coalescing \(\?\?\)$/, 'const x = a ?? "none";', false, 1);
  await convert(page, 'b == null', /^Convert to nullish coalescing \(\?\?\)$/, 'const y = b ?? 0;', false, 1);
});
test('F30 Convert string concatenation to template literals', async ({ page }) => {
  await open(page, 'src/user.ts', 'export const greet = (name: string, n: number) => "Hello " + name + ", you have " + n + " messages";\n');
  await convert(page, '"Hello "', /^Convert to template string$/, 'export const greet = (name: string, n: number) => `Hello ${name}, you have ${n} messages`;', false, 2);
});

// ---- React & JSX / TSX ----
/** React's typings in the temporary project (copied from the studio's own node_modules). */
async function withReact() {
  const nm = path.resolve(import.meta.dirname, '../../node_modules');
  for (const pkg of ['@types/react', 'csstype']) await fs.cp(path.join(nm, pkg), path.join(temp, 'node_modules', pkg), { recursive: true });
}
const BUTTON = 'export type ButtonProps = { label: string; onPress?: () => void };\nexport function Button({ label, onPress }: ButtonProps) {\n  return <button onClick={onPress}>{label}</button>;\n}\n';

test('F32 Extract JSX into reusable variable', async ({ page }) => {
  await withReact();
  await open(page, 'src/App.tsx', 'export function App({ name }: { name: string }) {\n  return <main><h1 className="title">Hello {name}</h1></main>;\n}\n');
  await convert(page, '<h1 className="title">Hello {name}</h1>', /^Extract to constant in enclosing scope$/, /const newLocal = <h1 className="title">Hello \{name\}<\/h1>;\s*return <main>\{newLocal\}<\/main>;/, true);
});
test('F36 Navigate React component definitions; F37 Find React component usages', async ({ page }) => {
  await withReact();
  await fs.writeFile(path.join(temp, 'src/Button.tsx'), BUTTON);
  await open(page, 'src/App.tsx', 'import { Button } from "./Button";\nexport const App = () => <div><Button label="A" /><Button label="B" /></div>;\n');
  await caretAt(page, '<Button label="A"', 2);
  await page.keyboard.press('F12');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'src/Button.tsx');
  await page.getByLabel('Source of src/Button.tsx').click();
  await caretAt(page, 'function Button', 10);
  await page.keyboard.press('Shift+F12');
  const refs = page.getByRole('region', { name: /References|Find All References/ }).or(page.getByLabel(/References: Button/)).first();
  await expect(refs).toContainText('src/App.tsx', { timeout: 30_000 });
});
test('F38 Rename JSX component tags; F39 Rename JSX attributes', async ({ page }) => {
  await withReact();
  await fs.writeFile(path.join(temp, 'src/Button.tsx'), BUTTON);
  await open(page, 'src/App.tsx', 'import { Button } from "./Button";\nexport const App = () => <section><Button label="A">x</Button></section>;\n');
  // The component: its tags here (opening and closing) and its declaration in Button.tsx.
  await caretAt(page, '<Button label', 2);
  await page.keyboard.press('F2');
  await page.getByLabel('Rename Button').fill('PrimaryButton');
  await page.getByLabel('Rename PrimaryButton').or(page.getByLabel('Rename Button')).press('Enter');
  await expect.poll(() => docText(page)).toContain('<PrimaryButton label="A">x</PrimaryButton>');
  await approve(page, /Rename Button to PrimaryButton/);
  expect(await fs.readFile(path.join(temp, 'src/Button.tsx'), 'utf8')).toContain('export function PrimaryButton(');
  // An attribute: the prop in the props type and every usage.
  await caretAt(page, 'label="A"', 2);
  await page.keyboard.press('F2');
  await page.getByLabel('Rename label').fill('text');
  await page.getByLabel('Rename label').press('Enter');
  await expect.poll(() => docText(page)).toContain('<PrimaryButton text="A">');
  await approve(page, /Rename label to text/);
  expect(await fs.readFile(path.join(temp, 'src/Button.tsx'), 'utf8')).toContain('text: string');
});
test('F40 Auto-close JSX tags', async ({ page }) => {
  await withReact();
  const editor = await open(page, 'src/App.tsx', 'export const App = () => (\n  \n);\n');
  await caretAt(page, '(\n  ', 4);
  await page.keyboard.type('<section className="box">');
  await expect.poll(() => docText(page)).toContain('<section className="box"></section>');
  void editor;
});
test('F41 Auto-import React components', async ({ page }) => {
  await withReact();
  await fs.writeFile(path.join(temp, 'src/Button.tsx'), BUTTON);
  await open(page, 'src/App.tsx', 'export const App = () => <div><Butt</div>;\n');
  await caretAt(page, '<Butt', 5);
  await page.keyboard.press('Control+Space');
  const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^Button$/ }) }).first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
  await expect.poll(() => docText(page), { timeout: 15_000 }).toMatch(/^import \{ Button \} from "\.\/Button";\n/);
});
test('F42 Generate missing JSX attributes', async ({ page }) => {
  await withReact();
  await fs.writeFile(path.join(temp, 'src/Button.tsx'), BUTTON);
  await open(page, 'src/App.tsx', 'import { Button } from "./Button";\nexport const App = () => <Button />;\n');
  await convert(page, '<Button', /^Add missing attributes$/, '<Button label={""} />', false, 2);
});

test('F31 Extract JSX into React component', async ({ page }) => {
  await withReact();
  await open(page, 'src/List.tsx', 'export function List({ items, title }: { items: string[]; title: string }) {\n  const count = items.length;\n  return (\n    <section>\n      <header><h2>{title}</h2><small>{count}</small></header>\n      <ul>{items.map((i) => <li key={i}>{i}</li>)}</ul>\n    </section>\n  );\n}\n');
  await convert(page, '<header><h2>{title}</h2><small>{count}</small></header>', /^Extract JSX into component$/, /function NewComponent\(\{ title, count \}: \{ title: string; count: number \}\) \{\s*return \(\s*<header><h2>\{title\}<\/h2><small>\{count\}<\/small><\/header>\s*\);\s*\}\s*export function List[\s\S]*<NewComponent title=\{title\} count=\{count\} \/>/, true);
});
test('F33 Convert class components to functional components', async ({ page }) => {
  await withReact();
  await open(page, 'src/Counter.tsx', 'import React from "react";\ntype P = { step: number };\ntype S = { count: number };\nexport class Counter extends React.Component<P, S> {\n  state = { count: 0 };\n  timer = 0;\n  componentDidMount() {\n    document.title = String(this.state.count);\n  }\n  componentWillUnmount() {\n    clearInterval(this.timer);\n  }\n  increment() {\n    this.setState({ count: this.state.count + this.props.step });\n  }\n  render() {\n    return <button onClick={() => this.increment()}>{this.state.count}</button>;\n  }\n}\n');
  await convert(page, 'class Counter', /^Convert to function component$/, /import React, \{ useState, useEffect \} from "react";[\s\S]*export function Counter\(props: P\) \{\s*const \[count, setCount\] = useState<S\['count'\]>\(0\);\s*useEffect\(\(\) => \{\s*document\.title = String\(count\);\s*return \(\) => \{\s*clearInterval\(timer\);\s*\};\s*\}, \[\]\);\s*const timer = 0;\s*const increment = \(\) => \{\s*setCount\(count \+ props\.step\);\s*\};\s*return <button onClick=\{\(\) => increment\(\)\}>\{count\}<\/button>;\s*\}/, false, 7);
});
test('F34 Generate React component props; F35 Generate TypeScript props interfaces', async ({ page }) => {
  await withReact();
  await fs.writeFile(path.join(temp, 'src/App.tsx'), 'import { Badge } from "./Badge";\nexport const App = () => <div><Badge text="new" count={3} highlighted /></div>;\n');
  await open(page, 'src/Badge.tsx', 'export function Badge() {\n  return <span />;\n}\n');
  await convert(page, 'function Badge', /^Generate props from usages$/, 'export function Badge({ text, count, highlighted }: { text: string; count: number; highlighted: boolean }) {', false, 10);
  // The inline props type becomes an interface.
  await convert(page, 'function Badge', /^Generate interface BadgeProps$/, /export interface BadgeProps \{\n  text: string;\n  count: number;\n  highlighted: boolean;\n\}\n\nexport function Badge\(\{ text, count, highlighted \}: BadgeProps\) \{/, false, 10);
  // Untyped destructured props: types from usages and defaults.
  await setDoc(page, 'export function Badge({ text, count, tone = "info" }) {\n  return <span className={tone}>{text}{count}</span>;\n}\n');
  await convert(page, 'function Badge', /^Generate interface BadgeProps$/, /export interface BadgeProps \{\n  text: string;\n  count: number;\n  tone\?: string;\n\}\n\nexport function Badge\(\{ text, count, tone = "info" \}: BadgeProps\)/, false, 10);
});
test('F43 Convert inline JSX styles to CSS classes', async ({ page }) => {
  await withReact();
  await open(page, 'src/Card.tsx', 'export function Card() {\n  return <div className="card" style={{ marginTop: 8, color: "red", opacity: 0.5 }}>Hi</div>;\n}\n');
  await convert(page, 'style=', /^Move inline styles to a CSS class$/, /^import "\.\/Card\.css";\nexport function Card\(\) \{\n  return <div className="card card-div">Hi<\/div>;/, false, 2);
  await approve(page, /Move inline styles to a CSS class: 1 other file/);
  expect(await fs.readFile(path.join(temp, 'src/Card.css'), 'utf8')).toBe('.card-div {\n  margin-top: 8px;\n  color: red;\n  opacity: 0.5;\n}\n');
});
test('F44 Extract inline event handlers; F45 Convert inline callbacks to named functions', async ({ page }) => {
  await withReact();
  await open(page, 'src/Todo.tsx', 'import { useState } from "react";\nexport function Todo({ items }: { items: string[] }) {\n  const [done, setDone] = useState(0);\n  return (\n    <ul onClick={() => setDone(done + 1)}>\n      {items.map((item) => <li key={item}>{item}</li>)}\n    </ul>\n  );\n}\n');
  await convert(page, 'onClick', /^Extract handler handleClick$/, /  const handleClick = \(\) => setDone\(done \+ 1\);\n  return \(\n    <ul onClick=\{handleClick\}>/, false, 2);
  await convert(page, '(item) =>', /^Convert callback to named function renderItem$/, /  function renderItem\(item\) \{\s*return <li key=\{item\}>\{item\}<\/li>;\s*\}\n  return \([\s\S]*\{items\.map\(renderItem\)\}/, false, 1);
});

test('F46 Detect missing React Hook dependencies; F47 Apply React Hook dependency fixes', async ({ page }) => {
  await withReact();
  const editor = await open(page, 'src/Clock.tsx', 'import { useEffect, useState } from "react";\nexport function Clock({ step }: { step: number }) {\n  const [n, setN] = useState<number>(0);\n  useEffect(() => {\n    document.title = String(n + step);\n  }, []);\n  return <b>{n}</b>;\n}\n');
  const warning = editor.locator('.cm-lintRange-warning').first();
  await expect(warning).toBeVisible({ timeout: 30_000 });
  await warning.hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText("React Hook useEffect has missing dependencies: 'n' and 'step'");
  await convert(page, '[]);', /^Update the dependencies array to be: \[n, step\]$/, '  }, [n, step]);', false, 1);
});
test('F48 Detect invalid Hook usage', async ({ page }) => {
  await withReact();
  const editor = await open(page, 'src/Panel.tsx', 'import { useState } from "react";\nexport function Panel({ open }: { open: boolean }) {\n  if (open) {\n    const [x] = useState(1);\n    return <p>{x}</p>;\n  }\n  return null;\n}\nexport function helper() {\n  return useState(0);\n}\n');
  const errors = editor.locator('.cm-lintRange-error');
  await expect(errors).toHaveCount(2, { timeout: 30_000 });
  await errors.first().hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText('React Hook "useState" is called conditionally');
  await page.mouse.move(0, 0);
  await errors.nth(1).hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText('React Hook "useState" is called in function "helper"');
});

test('F49 Navigate React context providers', async ({ page }) => {
  await withReact();
  await fs.writeFile(path.join(temp, 'src/theme.ts'), 'import { createContext } from "react";\nexport const ThemeContext = createContext("light");\n');
  await fs.writeFile(path.join(temp, 'src/Root.tsx'), 'import { ThemeContext } from "./theme";\nexport const Root = ({ children }: { children: React.ReactNode }) => (\n  <ThemeContext.Provider value="dark">{children}</ThemeContext.Provider>\n);\n');
  await fs.writeFile(path.join(temp, 'src/Island.tsx'), 'import { ThemeContext } from "./theme";\nexport const Island = () => <ThemeContext value="light"><p /></ThemeContext>;\n');
  await open(page, 'src/Label.tsx', 'import { useContext } from "react";\nimport { ThemeContext } from "./theme";\nexport const Label = () => <b>{useContext(ThemeContext)}</b>;\n');
  await caretAt(page, 'useContext(Theme', 3);
  await page.getByRole('button', { name: 'Navigate menu' }).click();
  await page.getByRole('menuitem', { name: /^Go to Context Provider/ }).click();
  const d = page.getByRole('dialog', { name: /Providers of ThemeContext: 2/ });
  await expect(d).toBeVisible({ timeout: 30_000 });
  await expect(d).toContainText('<ThemeContext.Provider value="dark">');
  await expect(d).toContainText('<ThemeContext value="light">');
});
test('F50 React component prop type validation', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'src/Avatar.jsx'), 'import PropTypes from "prop-types";\nexport function Avatar({ name, size }) {\n  return <img alt={name} width={size} />;\n}\nAvatar.propTypes = {\n  name: PropTypes.string.isRequired,\n  size: PropTypes.number,\n};\n');
  const editor = await open(page, 'src/Profile.jsx', 'import { Avatar } from "./Avatar";\nexport const Profile = () => <div><Avatar size="large" round /></div>;\n');
  const warnings = editor.locator('.cm-lintRange-warning');
  await expect(warnings).toHaveCount(3, { timeout: 30_000 });
  const messages: string[] = [];
  for (let i = 0; i < 3; i++) { await page.mouse.move(0, 0); await warnings.nth(i).hover(); messages.push((await page.locator('.cm-tooltip-lint').innerText()).trim()); }
  expect(messages.join('\n')).toContain("Avatar requires the prop 'name' (PropTypes.string.isRequired).");
  expect(messages.join('\n')).toContain("Avatar: 'size' should be a number (PropTypes.number), not a string.");
  expect(messages.join('\n')).toContain("Avatar does not declare the prop 'round' in its propTypes.");
});

// ---- HTML ----
const PAGE = '<!doctype html>\n<html lang="en">\n<head>\n  <title>Shop</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <main>\n    <p>Hi</p>\n  </main>\n</body>\n</html>\n';
/** Types at `at` (+offset), opens completion and picks the option whose label matches. */
async function completeAt(page: Page, at: string, offset: number, typed: string, label: RegExp) {
  await caretAt(page, at, offset);
  await page.keyboard.type(typed);
  await page.keyboard.press('Control+Space');
  const option = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: label }) }).first();
  await expect(option).toBeVisible({ timeout: 30_000 });
  await option.click();
}
const caretLine = (page: Page) => page.evaluate(() => { const v = (window as unknown as { __activeEditor: () => { view: { state: { doc: { lineAt(p: number): { number: number } }; selection: { main: { head: number } } } } } }).__activeEditor().view; return v.state.doc.lineAt(v.state.selection.main.head).number; });
const diagnostics = async (page: Page, file: string, source: string) => (await (await page.request.post('/api/web/diagnostics', { data: { file, source } })).json()) as { message: string; rule?: string; severity: string }[];

test('F51 HTML tag name completion; F52 attribute completion; F53 attribute value completion; F61 entity completion', async ({ page }) => {
  await open(page, 'index.html', PAGE);
  await completeAt(page, '<p>Hi</p>', 9, '\n<sec', /^section$/);
  await expect.poll(() => docText(page)).toContain('<p>Hi</p>\n    <section');
  await setDoc(page, PAGE.replace('<p>Hi</p>', '<img >'));
  await completeAt(page, '<img ', 5, 'al', /^alt$/);
  await expect.poll(() => docText(page)).toContain('<img alt=""');
  await setDoc(page, PAGE.replace('<p>Hi</p>', '<input type="">'));
  await completeAt(page, 'type="', 6, 'che', /^checkbox$/);
  await expect.poll(() => docText(page)).toContain('<input type="checkbox">');
  await setDoc(page, PAGE.replace('<p>Hi</p>', '<p>Hi </p>'));
  await completeAt(page, '<p>Hi ', 6, '&cop', /^&copy;$/);
  await expect.poll(() => docText(page)).toContain('<p>Hi &copy;</p>');
});
test('F54 Automatic closing tag insertion; F55 Linked HTML tag renaming', async ({ page }) => {
  await open(page, 'index.html', PAGE);
  await caretAt(page, '<p>Hi</p>', 9);
  await page.keyboard.type('\n    <article>');
  await expect.poll(() => docText(page)).toContain('<article></article>');
  // Linked editing (editor.linkedEditing): the closing tag follows the opening one.
  await page.evaluate(() => localStorage.setItem('tas:settings', JSON.stringify({ 'editor.linkedEditing': true })));
  await page.reload();
  await expect(page.getByLabel('Source of index.html')).toBeVisible();
  await setDoc(page, PAGE);
  await caretAt(page, '<main>', 5);
  await page.keyboard.type('x');
  await expect.poll(() => docText(page)).toContain('<mainx>\n    <p>Hi</p>\n  </mainx>');
});
test('F56 HTML element wrapping; F57 HTML tag unwrapping', async ({ page }) => {
  await open(page, 'index.html', PAGE);
  await convert(page, '<p>Hi</p>', /^Wrap with <div>$/, '  <main>\n    <div>\n      <p>Hi</p>\n    </div>\n  </main>', true);
  await convert(page, '<div>', /^Remove tag <div> \(keep its content\)$/, '  <main>\n    <p>Hi</p>\n  </main>', false, 2);
});
test('F62 HTML character entity conversion', async ({ page }) => {
  await open(page, 'index.html', PAGE.replace('<p>Hi</p>', '<p>Fish & Chips © 2026 <now></p>'));
  await convert(page, 'Fish & Chips © 2026 <now>', /^Convert characters to HTML entities$/, '<p>Fish &amp; Chips &copy; 2026 &lt;now&gt;</p>', true);
  await convert(page, 'Fish &amp; Chips &copy; 2026 &lt;now&gt;', /^Convert HTML entities to characters$/, '<p>Fish & Chips © 2026 <now></p>', true);
});
test('F58 tag structure, F59 attribute, F60 nesting validation; F63 accessibility, F64 ARIA inspections', async ({ page }) => {
  const editor = await open(page, 'index.html', PAGE.replace('<p>Hi</p>', '<p><div>x</div></p>\n    <span>open\n    <ul><div>bad</div></ul>\n    <img src="a.png" hieght="4">\n    <input type="txt" id="q">\n    <button></button>\n    <a href="/"><button>Go</button></a>\n    <div role="buton" aria-hidden="yes" aria-labelledby="nope" aria-colour="red">x</div>\n    </section>'));
  await expect(editor.locator('.cm-lintRange-error').first()).toBeVisible({ timeout: 30_000 });
  const all = (await diagnostics(page, 'index.html', await docText(page))).map((d) => d.message).join('\n');
  // F58
  expect(all).toContain('Closing tag </section> has no matching <section>.');
  expect(all).toContain('<span> is not closed');
  // F59
  expect(all).toContain('<img> has no attribute hieght.');
  expect(all).toMatch(/"txt" is not a valid value of type on <input>/);
  // F60
  expect(all).toContain('<div> cannot be inside <p> (the paragraph ends before it).');
  expect(all).toContain('Interactive <button> inside interactive <a>.');
  // F63
  expect(all).toContain('<img> needs an alt attribute');
  expect(all).toContain('<input> has no label');
  expect(all).toContain('<button> has no text for screen readers');
  // F64
  expect(all).toContain('"buton" is not an ARIA role.');
  expect(all).toContain('aria-hidden must be "true" or "false".');
  expect(all).toContain('aria-labelledby refers to "nope", but no element has that id.');
  expect(all).toContain('aria-colour is not an ARIA attribute.');
});
test('F65 HTML ID reference navigation; F66 HTML class reference navigation', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'styles.css'), 'body { margin: 0; }\n\n.card { padding: 8px; }\n');
  await open(page, 'index.html', PAGE.replace('<p>Hi</p>', '<label for="email">Email</label>\n    <p class="card">Hi</p>\n    <input id="email">'));
  await caretAt(page, 'for="email"', 7);
  await page.keyboard.press('F12');
  await expect.poll(() => caretLine(page)).toBe(11);
  await caretAt(page, 'class="card"', 8);
  await page.keyboard.press('F12');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'styles.css');
});
test('F67 HTML element folding; F68 HTML document formatting', async ({ page }) => {
  const editor = await open(page, 'index.html', '<html lang="en"><body>\n<main>\n<p>Hi</p>\n<ul><li>a</li><li>b</li></ul>\n</main>\n</body></html>\n');
  await page.keyboard.press('Shift+Alt+F');
  await expect.poll(() => docText(page)).toContain('<main>\n    <p>Hi</p>\n    <ul>\n      <li>a</li>\n      <li>b</li>\n    </ul>\n  </main>');
  await caretAt(page, '<main>', 3);
  await page.keyboard.press('Control+Shift+BracketLeft');
  await expect(editor.locator('.cm-foldPlaceholder')).toBeVisible();
  await expect(editor.locator('.cm-line', { hasText: '<li>a</li>' })).toHaveCount(0);
});
test('F69 HTML custom element support', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'src/user-card.js'), 'class UserCard extends HTMLElement {\n  static get observedAttributes() { return ["name", "avatar"]; }\n}\ncustomElements.define("user-card", UserCard);\n');
  await open(page, 'index.html', PAGE.replace('<p>Hi</p>', '<user-card></user-card>\n    <other-card></other-card>'));
  const problems = await diagnostics(page, 'index.html', await docText(page));
  expect(problems.map((p) => p.message)).toContain('<other-card> is not defined in this project (customElements.define or html.customData).');
  expect(problems.map((p) => p.message).join()).not.toContain('<user-card>');
  await completeAt(page, '<user-card', 10, ' na', /^name$/);
  await expect.poll(() => docText(page)).toContain('<user-card name=""></user-card>');
  await setDoc(page, PAGE.replace('<p>Hi</p>', ''));
  await completeAt(page, '<main>', 6, '\n<user', /^user-card$/);
  await expect.poll(() => docText(page)).toContain('<user-card');
});
test('F70 HTML language injection (CSS in <style> and style="", JavaScript in <script>)', async ({ page }) => {
  await open(page, 'index.html', PAGE.replace('</head>', '  <style>\n    main {  }\n  </style>\n</head>').replace('<p>Hi</p>', '<p style="">Hi</p>'));
  await completeAt(page, 'main {', 7, 'backgr', /^background-color$/);
  await expect.poll(() => docText(page)).toContain('main { background-color: ');
  await completeAt(page, 'style="', 7, 'marg', /^margin$/);
  await expect.poll(() => docText(page)).toContain('<p style="margin: ');
});

// ---- CSS, SCSS & LESS ----
test('F71 selector, F72 property, F73 value, F84 media query, F85 container query, F86 pseudo-class, F87 pseudo-element completion', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'index.html'), '<main class="card hero"><p id="intro">Hi</p></main>\n');
  await fs.writeFile(path.join(temp, 'src/Btn.tsx'), 'export const Btn = () => <button className="btn primary">Go</button>;\n');
  await open(page, 'styles.css', '\n');
  // F71 Classes the markup uses.
  await completeAt(page, '\n', 0, '.he', /^\.hero$/);
  await expect.poll(() => docText(page)).toBe('.hero\n');
  await page.keyboard.type(' {\n');
  // F72, F73
  await completeAt(page, '.hero {\n', 8, 'backgr', /^background-color$/);
  await expect.poll(() => docText(page)).toContain('background-color: ');
  await setDoc(page, '.hero {\n  display: \n}\n');
  await completeAt(page, 'display: ', 9, 'fl', /^flex$/);
  await expect.poll(() => docText(page)).toContain('display: flex');
  // F84, F85
  await setDoc(page, '.side { container: sidebar / inline-size; }\n@media (\n');
  await completeAt(page, '@media (', 8, 'prefers-co', /^prefers-color-scheme$/);
  await expect.poll(() => docText(page)).toContain('@media (prefers-color-scheme: ');
  await setDoc(page, '.side { container: sidebar / inline-size; }\n@container \n');
  await completeAt(page, '@container ', 11, 'side', /^sidebar$/);
  await expect.poll(() => docText(page)).toContain('@container sidebar');
  await page.keyboard.type(' (');
  await page.keyboard.press('Control+Space');
  const inline = page.locator('.cm-tooltip-autocomplete li').filter({ has: page.locator('.cm-completionLabel', { hasText: /^inline-size$/ }) });
  await expect(inline).toBeVisible({ timeout: 30_000 });
  await inline.click();
  await expect.poll(() => docText(page)).toContain('@container sidebar (inline-size: ');
  // F86, F87
  await setDoc(page, '.btn\n');
  await completeAt(page, '.btn', 4, ':hov', /^:hover$/);
  await expect.poll(() => docText(page)).toContain('.btn:hover');
  await setDoc(page, '.btn\n');
  await completeAt(page, '.btn', 4, '::bef', /^::before$/);
  await expect.poll(() => docText(page)).toContain('.btn::before');
});
test('F74 CSS custom property navigation; F75 CSS variable usage search', async ({ page }) => {
  await fs.writeFile(path.join(temp, 'tokens.css'), ':root {\n  --brand: #3366ff;\n}\n');
  await fs.writeFile(path.join(temp, 'src/Tag.tsx'), 'export const Tag = () => <b style={{ color: "var(--brand)" }}>x</b>;\n');
  await open(page, 'styles.css', '.a {\n  color: var(--brand);\n}\n.b { border-color: var(--brand); }\n');
  await caretAt(page, 'var(--brand)', 7);
  await page.keyboard.press('F12');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'tokens.css');
  await page.getByLabel('Source of tokens.css').click();
  await caretAt(page, '--brand', 3);
  await page.keyboard.press('Shift+F12');
  const refs = page.getByLabel(/References: --brand|Find All References/).or(page.getByRole('region', { name: /References/ })).first();
  await expect(refs).toContainText('styles.css', { timeout: 30_000 });
  await expect(refs).toContainText('src/Tag.tsx');
  await expect(refs).toContainText('tokens.css');
});
test('F76 CSS selector specificity inspection', async ({ page }) => {
  const editor = await open(page, 'styles.css', '#nav .item a:hover { color: red; }\n');
  await editor.locator('.cm-line').first().locator('text=#nav').hover();
  await expect(page.locator('.cm-quickinfo')).toContainText('Selector Specificity: (1, 2, 1)', { timeout: 15_000 });
});
test('F77 CSS shorthand expansion; F78 CSS shorthand compression', async ({ page }) => {
  await open(page, 'styles.css', '.a {\n  margin: 4px 8px;\n  color: red;\n}\n');
  await convert(page, 'margin', /^Expand margin into longhand properties$/, '.a {\n  margin-top: 4px;\n  margin-right: 8px;\n  margin-bottom: 4px;\n  margin-left: 8px;\n  color: red;\n}', false, 2);
  await convert(page, 'margin-top', /^Combine into margin shorthand$/, '.a {\n  margin: 4px 8px;\n  color: red;\n}', false, 2);
});
test('F79 CSS vendor prefix handling', async ({ page }) => {
  await open(page, 'styles.css', '.a {\n  user-select: none;\n  -webkit-border-radius: 4px;\n}\n');
  await convert(page, 'user-select', /^Add vendor prefixes for user-select \(-webkit-user-select\)$/, '  -webkit-user-select: none;\n  user-select: none;', false, 2);
  await convert(page, '-webkit-border-radius', /^Remove the obsolete prefix -webkit-border-radius \(use border-radius\)$/, '  border-radius: 4px;', false, 3);
  // The service's lint: a prefixed property without its standard one.
  const problems = (await (await page.request.post('/api/web/diagnostics', { data: { file: 'styles.css', source: '.b { -webkit-appearance: none; }' } })).json()) as { message: string }[];
  expect(problems.map((p) => p.message).join()).toMatch(/Also define the standard property 'appearance'/);
});
test('F80 CSS color previews; F81 CSS color picker; F82 CSS gradient previews', async ({ page }) => {
  const editor = await open(page, 'styles.css', '.a {\n  color: red;\n  border-color: rgb(0, 0, 255);\n  background: linear-gradient(90deg, #ff0000, #0000ff);\n}\n');
  const swatches = editor.locator('.cm-color-swatch');
  await expect(swatches).toHaveCount(4);
  await expect(editor.locator('.cm-gradient-swatch')).toHaveAttribute('aria-label', 'Gradient preview: linear-gradient(90deg, #ff0000, #0000ff)');
  // The picker writes the value in its own format.
  await editor.getByRole('button', { name: 'Colour red: pick a colour' }).dispatchEvent('mousedown');
  await page.getByLabel('Colour picker').fill('#00ff00');
  await expect.poll(() => docText(page)).toContain('color: #00ff00;');
  await editor.getByRole('button', { name: /^Colour rgb\(0, 0, 255\)/ }).dispatchEvent('mousedown');
  await page.getByLabel('Colour picker').fill('#336699');
  await expect.poll(() => docText(page)).toContain('border-color: rgb(51, 102, 153);');
});
test('F83 CSS unit conversion', async ({ page }) => {
  await open(page, 'styles.css', '.a {\n  font-size: 24px;\n  transition: opacity 250ms;\n}\n');
  await convert(page, '24px', /^Convert 24px to 1\.5rem$/, 'font-size: 1.5rem;', false, 1);
  await convert(page, '250ms', /^Convert 250ms to 0\.25s$/, 'transition: opacity 0.25s;', false, 1);
});
test('F88 CSS nesting support', async ({ page }) => {
  const editor = await open(page, 'styles.css', '.card {\n  color: red;\n  &:hover {\n    color: blue;\n  }\n  .title {\n    font-weight: bold;\n    \n  }\n}\n');
  await page.waitForTimeout(1500);
  await expect(editor.locator('.cm-lintRange-error')).toHaveCount(0);
  await completeAt(page, 'font-weight: bold;\n    ', 23, 'text-al', /^text-align$/);
  await expect.poll(() => docText(page)).toContain('    text-align: ');
});
test('F89 SCSS mixin navigation; F90 SCSS variable navigation; F92 SCSS partial import resolution', async ({ page }) => {
  await fs.mkdir(path.join(temp, 'scss'), { recursive: true });
  await fs.writeFile(path.join(temp, 'scss/_mixins.scss'), '@mixin flex-center {\n  display: flex;\n  align-items: center;\n}\n');
  await fs.writeFile(path.join(temp, 'scss/_vars.scss'), '$brand: #3366ff;\n');
  const editor = await open(page, 'scss/main.scss', '@use "mixins";\n@use "vars" as *;\n.a {\n  @include mixins.flex-center;\n  color: $brand;\n}\n');
  await caretAt(page, 'flex-center;', 3);
  await page.keyboard.press('F12');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'scss/_mixins.scss');
  await page.getByRole('button', { name: 'main.scss', exact: true }).first().click();
  await page.getByLabel('Source of scss/main.scss').click();
  await caretAt(page, '$brand', 2);
  await page.keyboard.press('F12');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'scss/_vars.scss');
  await page.getByRole('button', { name: 'main.scss', exact: true }).first().click();
  await page.getByLabel('Source of scss/main.scss').click();
  // F92 The partial behind @use "vars" (_vars.scss), and an import that does not resolve.
  await caretAt(page, '"vars"', 2);
  await page.keyboard.press('F12');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'scss/_vars.scss');
  const problems = (await (await page.request.post('/api/web/diagnostics', { data: { file: 'scss/main.scss', source: '@use "missing";\n' } })).json()) as { message: string }[];
  expect(problems.map((p) => p.message)).toContain('Cannot find the stylesheet "missing" (tried missing.scss, missing.sass, missing.css, missing.less, _missing.scss, _missing.sass, _missing.css, _missing.less, _index.scss, _index.sass, _index.css, _index.less, index.scss, index.sass, index.css, index.less).');
  void editor;
});
test('F91 SCSS function completion; F93 LESS variable completion', async ({ page }) => {
  await fs.writeFile(path.join(temp, '_functions.scss'), '@function rem($px) { @return math.div($px, 16) * 1rem; }\n');
  await fs.writeFile(path.join(temp, 'vars.less'), '@primary: #333;\n@spacing: 8px;\n');
  await open(page, 'main.scss', '.a {\n  color: \n  margin: \n}\n');
  await completeAt(page, 'color: ', 7, 'darke', /^darken$/);
  await expect.poll(() => docText(page)).toContain('color: darken(');
  await completeAt(page, 'margin: ', 8, 're', /^rem$/);
  await expect.poll(() => docText(page)).toContain('margin: rem(');
  await open(page, 'main.less', '.a {\n  color: \n}\n');
  await completeAt(page, 'color: ', 7, '@pri', /^@primary$/);
  await expect.poll(() => docText(page)).toContain('color: @primary');
});
test('F94 CSS Modules class completion; F95 CSS Modules class navigation', async ({ page }) => {
  await withReact();
  await fs.writeFile(path.join(temp, 'src/Card.module.css'), '.card {\n  padding: 8px;\n}\n.title-text { font-weight: bold; }\n');
  const editor = await open(page, 'src/Card.tsx', 'import styles from "./Card.module.css";\nexport const Card = () => <div className={styles.}>x</div>;\n');
  await completeAt(page, 'styles.', 7, 'ca', /^card$/);
  await expect.poll(() => docText(page)).toContain('className={styles.card}');
  // An unknown class is an error, like any missing property.
  await setDoc(page, 'import styles from "./Card.module.css";\nexport const Card = () => <div className={styles.cart}>x</div>;\n');
  await expect(editor.locator('.cm-lintRange-error')).toHaveCount(1, { timeout: 30_000 });
  await setDoc(page, 'import styles from "./Card.module.css";\nexport const Card = () => <div className={styles.card}>x</div>;\n');
  await caretAt(page, 'styles.card', 8);
  await page.keyboard.press('F12');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'src/Card.module.css');
});
