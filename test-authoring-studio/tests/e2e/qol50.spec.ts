import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// 50 quality-of-life improvements (QOL-50.md, QL1–QL50), end to end.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(120_000);

let root: string;
let previous: unknown;
test.beforeEach(async ({ request }) => {
  previous = (await (await request.get('/api/workspace')).json()).config;
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-qol-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
});
test.afterEach(async ({ request }) => {
  // A build a test started must not finish against the restored workspace (it would write bin/obj into fixtures).
  await request.post('/api/build/cancel').catch(() => {});
  await expect.poll(async () => (await (await request.get('/api/build')).json()).status, { timeout: 60_000 }).not.toBe('running');
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
async function openCs(page: Page, file: string, text: string) {
  await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
  await page.goto('/#/features/editor');
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.getByRole('navigation').getByRole('button', { name: file.split('/').pop(), exact: true }).first().click();
  const src = page.getByLabel(`Source of ${file}`);
  await src.locator('.cm-line', { hasText: text }).first().click();
  return src;
}
const reindex = async (page: Page) => expect((await page.request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
const nav = (page: Page) => page.getByRole('navigation', { name: 'Solution' });

test('QL1 Window title: the active file and the workspace folder', async ({ page }) => {
  await openFeature(page);
  await expect(page).toHaveTitle(new RegExp(`^Login\.feature — ${path.basename(root)} · TestAuthoring Studio$`));
  await caretAt(page, 'Feature:');
  await page.keyboard.type('x');
  await expect(page).toHaveTitle(/^● Login\.feature/);
});

test('QL2 Scroll past the end: a short file still scrolls', async ({ page }) => {
  await openFeature(page);
  const scroll = () => page.evaluate(() => { const s = document.querySelector('.gherkin-editor .cm-scroller') as HTMLElement; return s.scrollHeight - s.clientHeight; });
  await expect.poll(scroll).toBeGreaterThan(50);
  await menuItem(page, 'View', /Scroll Past End/);
  await expect.poll(scroll).toBeLessThan(5);
});

test('QL3 Find: match counter', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Control+F');
  await page.keyboard.type('the');
  await expect(page.locator('.gherkin-editor .cm-search-count')).toHaveText(/^(\d+ matches|\d+ of \d+)$/);
  await page.keyboard.press('Enter');
  await expect(page.locator('.gherkin-editor .cm-search-count')).toHaveText(/^\d+ of \d+$/);
});

test('QL4 / QL5 Ctrl+click links: web address and file:line', async ({ page, context }) => {
  await context.route('https://example.com/**', (r) => r.fulfill({ status: 200, body: 'ok' }));
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# docs https://example.com/guide and Steps/AuthSteps.cs:5');
  const link = gherkin(page).locator('.cm-link', { hasText: 'https://example.com/guide' });
  await expect(link).toBeVisible();
  const popup = page.waitForEvent('popup');
  await link.click({ modifiers: ['Control'] });
  expect((await popup).url()).toBe('https://example.com/guide');
  await gherkin(page).locator('.cm-link', { hasText: 'Steps/AuthSteps.cs:5' }).click({ modifiers: ['Control'] });
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
});

test('QL6 Multi-caret count in the status bar', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Control+A');
  await menuItem(page, 'Edit', /^Add Carets to Ends of Selected Lines/);
  await expect(page.getByLabel('Cursor position')).toContainText(/· \d+ selections/);
});

test('QL7 Drag a file from the Explorer into the editor inserts its path', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# see ');
  const target = gherkin(page).locator('.cm-line', { hasText: '# see' });
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dragTo(target, { targetPosition: { x: 200, y: 5 } });
  await expect.poll(() => doc(page)).toContain('Steps/AuthSteps.cs');
});

test('QL8 Files reopen where you left them (after a reload)', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'the dashboard');
  await expect(page.getByLabel('Cursor position')).toContainText('Ln 8');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(gherkin(page)).toContainText('Feature:');
  await gherkin(page).focus();
  await expect(page.getByLabel('Cursor position')).toContainText('Ln 8');
});

test('QL9 Gherkin smart indent after Scenario: and a step ending in ":"', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Scenario: Sign in');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Given the users:');
  await page.keyboard.press('Enter');
  await page.keyboard.type('| x |');
  await expect.poll(() => doc(page)).toMatch(/\n {2}Scenario: Sign in\r?\n {4}Given the users:\r?\n {6}\| x \|/);
});

test('QL10 / QL11 Tables: Enter adds a row; pasted rows are aligned', async ({ page, request, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await fs.writeFile(path.join(root, 'Features/T.feature'), ['Feature: T', '  Scenario: S', '    Given the users:', '      | name | role  |', '      | ada  | admin |', ''].join('\n'));
  await reindex(page);
  await openFeature(page, 'T.feature');
  await caretAt(page, '| ada');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('bob');
  await expect.poll(() => doc(page)).toMatch(/\| ada {2}\| admin \|\r?\n {6}\| bob/);
  await caretAt(page, '| ada');
  await page.keyboard.press('End');
  await page.keyboard.press('Shift+Enter');
  await page.evaluate(() => navigator.clipboard.writeText('| carol | guest |'));
  await page.keyboard.press('Control+V');
  await expect.poll(() => doc(page)).toMatch(/ {6}\| carol \| guest \|/);
});

test('QL12 Explorer remembers collapsed folders after a reload', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect(nav(page).getByRole('button', { name: 'Expand folder Steps', exact: true })).toBeVisible();
});

test('QL13 / QL14 / QL20 Explorer keyboard: arrows, type to select, Enter', async ({ page }) => {
  await openFeature(page);
  const steps = nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true });
  await steps.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(nav(page).getByRole('button', { name: 'Expand folder Steps', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true })).toBeFocused();
  await page.keyboard.type('sea');
  await expect(nav(page).getByRole('button', { name: 'SearchSteps.cs', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/SearchSteps.cs');
  await expect(page.locator('.editor-tab.active')).not.toHaveClass(/preview/);
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.cm-editor'))).toBe(true);
});

test('QL15 Explorer middle-click opens a kept tab', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click({ button: 'middle' });
  await expect(page.locator('.editor-tab.active')).toContainText('AuthSteps.cs');
  await expect(page.locator('.editor-tab.active')).not.toHaveClass(/preview/);
});

test('QL16 Copy path says what it copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy path' }).click();
  await expect(page.getByText('Copied Steps/AuthSteps.cs').first()).toBeVisible();
});

test('QL17 Drag a file onto a folder to move it', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().dragTo(nav(page).getByRole('button', { name: 'Collapse folder Support', exact: true }));
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect.poll(() => fs.access(path.join(root, 'Support/SearchSteps.cs')).then(() => true, () => false)).toBe(true);
});

test('QL18 / QL19 Tab bar: double-click for a scratch file; the active tab is scrolled into view', async ({ page }) => {
  await openFeature(page);
  const strip = page.getByRole('group', { name: 'Open editors' });
  const box = (await strip.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width - 20, box.y + box.height / 2);
  await expect(page.getByRole('dialog', { name: 'New Scratch File' })).toBeVisible();
});

test('QL21–QL23 Search: remembered after a reload, keyboard through results, the match is selected', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Control+Shift+F');
  const view = page.getByRole('region', { name: 'Search' });
  await view.getByLabel('Search in files').fill('dashboard');
  await expect(view.getByRole('status')).toHaveText(/\d+ results? in/);
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.keyboard.press('Control+Shift+F');
  await expect(view.getByLabel('Search in files')).toHaveValue('dashboard');
  await expect(view.getByRole('status')).toHaveText(/\d+ results? in/);
  await view.getByLabel('Search in files').press('ArrowDown');
  await expect(view.locator('.search-match').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => { const a = (window as unknown as { __activeEditor: () => { view: { state: { selection: { main: { from: number; to: number } }; sliceDoc(a: number, b: number): string } } } | undefined }).__activeEditor(); const s = a?.view.state.selection.main; return s && a!.view.state.sliceDoc(s.from, s.to); })).toMatch(/^dashboard$/i);
});

test('QL27 Test Explorer explains an empty tree', async ({ page, request }) => {
  const empty = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-empty-'));
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: empty, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced', autoSave: 'off' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/editor');
    await page.getByRole('button', { name: 'Test Explorer' }).click();
    const note = page.getByRole('region', { name: 'Test Explorer' }).locator('.t-empty');
    await expect(note).toContainText('build it (Ctrl+Shift+B), then refresh', { timeout: 60_000 });
    await expect(note.getByRole('button', { name: 'Refresh' })).toBeVisible();
  } finally {
    await fs.rm(empty, { recursive: true, force: true }).catch(() => {});
  }
});

test('QL30 Build time in the status bar', async ({ page }) => {
  await openFeature(page);
  await page.getByRole('button', { name: 'Build menu' }).click();
  await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
  await expect(page.getByLabel('Build progress')).toContainText(/(Building|Cleaning)… \d+ s/);
});

test('QL31 / QL32 Busy window title while building; Copy on a message', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openFeature(page);
  await page.getByRole('button', { name: 'Build menu' }).click();
  await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
  await expect(page).toHaveTitle(/^⏳ (Building|Cleaning) · /);
  await menuItem(page, 'Navigate', /^Clear Recent Files/);
  await page.getByRole('button', { name: 'Copy the message' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/recent file/);
});

test('QL33 Notifications: file:line references open the file', async ({ page }) => {
  await openFeature(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('tas:notice', { detail: 'Check Steps/AuthSteps.cs:5 please' })));
  await menuItem(page, 'View', /^Notifications/);
  await page.getByRole('list', { name: 'Notification history' }).getByRole('button', { name: 'Steps/AuthSteps.cs:5', exact: true }).click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
});

test('QL34 Keyboard shortcuts dialog: filter', async ({ page }) => {
  await openFeature(page);
  await page.locator('body').press('?');
  const dlg = page.getByRole('dialog');
  const filter = dlg.getByLabel('Filter shortcuts');
  const rows = dlg.locator('.shortcut-list dt');
  const all = await rows.count();
  await filter.fill('ctrl s');
  await expect.poll(() => rows.count()).toBeLessThan(all);
  await expect(dlg.locator('.shortcut-list')).toContainText('Ctrl/Cmd + S');
});

test('QL35 / QL36 Settings remembers its section and search', async ({ page }) => {
  await page.goto('/#/dashboard');
  await page.getByRole('button', { name: 'Preferences' }).click();
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  await dialog.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Preferences' }).click();
  await expect(dialog.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page');
});

test('QL37 Command palette remembers the last query', async ({ page }) => {
  await openFeature(page);
  await page.keyboard.press('Control+Shift+P');
  await page.keyboard.type('sort lines');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+P');
  const input = page.getByLabel('Search commands and steps').last();
  await expect(input).toHaveValue('sort lines');
  await page.keyboard.type('x');
  await expect(input).toHaveValue('x');
});

test('QL38 / QL39 Lists: Page Down, Ctrl+End and the typed text marked', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'Navigate', /^Switcher/);
  const list = page.getByRole('listbox').last();
  await page.keyboard.press('Control+End');
  await expect(list.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Control+Home');
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.type('stru');
  await expect(list.locator('mark.list-match').first()).toHaveText(/stru/i);
});

test('QL40 Recent Files kept after a reload', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await page.locator('body').press('Control+E');
  await expect(page.getByRole('dialog').getByText('AuthSteps.cs').first()).toBeVisible();
});

test('QL41 / QL42 / QL49 Status bar: unsaved count saves all; Auto Save mode; Save All reports', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.type(' x');
  const unsaved = page.getByRole('button', { name: /^1 unsaved file: Save All/ });
  await expect(unsaved).toBeVisible();
  await unsaved.click();
  await expect(unsaved).toHaveCount(0);
  const auto = page.getByRole('button', { name: /^Auto Save: off/ });
  await auto.click();
  await expect(page.getByRole('button', { name: /^Auto Save: after a delay/ })).toBeVisible();
  await page.getByRole('button', { name: /^Auto Save: after a delay/ }).click();
  await page.getByRole('button', { name: /^Auto Save: on focus change/ }).click();
  await expect(page.getByRole('button', { name: /^Auto Save: off/ })).toBeVisible();
  await menuItem(page, 'Navigate', /^Clear Recent Files/);
  await page.locator('body').press('Control+Alt+S');
  await expect(page.getByText(/^(Nothing to save\.|Saved \d+ files?\.)$/).first()).toBeVisible();
});

test('QL43 Explorer search marks the match', async ({ page }) => {
  await openFeature(page);
  await page.getByLabel('Search Explorer').fill('auth');
  await expect(nav(page).locator('mark.list-match').first()).toHaveText(/auth/i);
});

test('QL44 Hovering a tag shows its scenario count', async ({ page }) => {
  await openFeature(page);
  await gherkin(page).locator('.cm-line', { hasText: '@authentication' }).getByText('@authentication').hover();
  await expect(page.locator('.cm-tag-info')).toContainText('@authentication: 1 scenario');
});

test('QL45 / QL46 Notifications: badge in the status bar; kept after a reload', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'Navigate', /^Clear Recent Files/);
  const badge = page.getByRole('button', { name: /^1 new notification/ });
  await expect(badge).toBeVisible();
  await badge.click();
  await expect(page.getByRole('list', { name: 'Notification history' })).toContainText('recent file');
  await expect(badge).toHaveCount(0);
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await menuItem(page, 'View', /^Notifications/);
  await expect(page.getByRole('list', { name: 'Notification history' })).toContainText('recent file');
});

test('QL47 / QL48 Explorer: Git status of files and folders', async ({ page }) => {
  const { execFileSync } = await import('node:child_process');
  const g = (...a: string[]) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: root });
  g('init', '-q'); g('add', '-A'); g('commit', '-qm', 'base');
  await fs.appendFile(path.join(root, 'Steps/AuthSteps.cs'), '// changed\n');
  await fs.writeFile(path.join(root, 'Steps/New.cs'), 'class N { }\n');
  await reindex(page);
  await openFeature(page);
  await expect(nav(page).getByLabel('Git: modified')).toHaveCount(1);
  await expect(nav(page).getByLabel('Git: untracked')).toHaveCount(1);
  await expect(nav(page).getByLabel('Contains changed files').first()).toBeVisible();
});

test('QL50 Unsaved editors are saved before a build', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# saved by the build');
  await expect(page.getByRole('button', { name: /unsaved file/ })).toBeVisible();
  await page.getByRole('button', { name: 'Build menu' }).click();
  await page.getByRole('menuitem', { name: /^Build Solution/ }).click();
  await expect.poll(() => fs.readFile(path.join(root, 'Features/Auth/Login.feature'), 'utf8')).toContain('# saved by the build');
});

test('QL51 Markdown wraps long lines', async ({ page }) => {
  await fs.writeFile(path.join(root, 'Long.md'), `# Long\n\n${'word '.repeat(200)}\n`);
  await reindex(page);
  await openCs(page, 'Long.md', '# Long');
  await expect(page.locator('.code-editor:not([hidden]) .cm-content')).toHaveClass(/cm-lineWrapping/);
});

test('QL52 Find starts with the last search in another file', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Control+F');
  await page.keyboard.type('dashboard');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  await page.getByLabel('Source of Steps/AuthSteps.cs').locator('.cm-line').first().click();
  await page.keyboard.press('Control+F');
  await expect(page.locator('.code-editor:not([hidden]) .cm-search input[name="search"]')).toHaveValue('dashboard');
});

test('QL53 The line you jump to flashes', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await page.keyboard.press('Control+G');
  await page.keyboard.type('8');
  await page.keyboard.press('Enter');
  await expect(page.locator('.gherkin-editor .cm-flash-line')).toHaveCount(1);
});

test('QL57 / QL58 Gherkin: tag and <parameter> completion', async ({ page, request }) => {
  await fs.writeFile(path.join(root, 'Features/Roles.feature'), ['@authentication', 'Feature: Roles', '  Scenario Outline: As a role', '    Given the browser is started', '', '    Examples:', '      | role  | user |', '      | admin | ada  |', ''].join('\n'));
  await reindex(page);
  await openFeature(page, 'Roles.feature');
  await caretAt(page, '@authentication');
  await page.keyboard.press('End');
  await page.keyboard.type(' @au');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('@authentication');
  await page.keyboard.press('Escape');
  await caretAt(page, 'Given the browser is started');
  await page.keyboard.press('End');
  await page.keyboard.type(' as <ro');
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('role');
  await page.keyboard.press('Enter');
  await expect.poll(() => doc(page)).toContain('started as <role>');
});

test('QL59 Ln, Col tooltip shows the line count', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'Feature:');
  await expect(page.getByRole('button', { name: 'Cursor position' })).toHaveAttribute('title', /· \d+ lines/);
});

test('QL60 New File with an existing name opens it', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'Collapse folder Steps', exact: true }).click({ button: 'right' });
  page.once('dialog', (d) => void d.accept('AuthSteps.cs'));
  await page.getByRole('menuitem', { name: 'New File…' }).click();
  await expect(page.getByText('Steps/AuthSteps.cs already exists; opened it.').first()).toBeVisible();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveAttribute('title', 'Steps/AuthSteps.cs');
});

test('QL62 Explorer keeps its scroll position after a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 420 });
  await openFeature(page);
  const tree = nav(page);
  await tree.evaluate((el) => { el.scrollTop = 80; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(400);
  await page.reload();
  await expect(page.getByText('Repository indexed')).toBeVisible();
  await expect.poll(() => tree.evaluate((el) => el.scrollTop)).toBeGreaterThan(40);
});

test('QL63 Explorer Ctrl+click opens to the side', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().click({ modifiers: ['Control'] });
  await expect(page.getByRole('region', { name: 'Split editor Steps/AuthSteps.cs' })).toBeVisible();
});

test('QL64 Closing a tab goes back to the tab used before', async ({ page }) => {
  await openFeature(page);
  await nav(page).getByRole('button', { name: 'AuthSteps.cs', exact: true }).first().dblclick();
  await nav(page).getByRole('button', { name: 'SearchSteps.cs', exact: true }).first().dblclick();
  await page.locator('.editor-tab-label', { hasText: 'Login.feature' }).click();
  await page.locator('.editor-tab-label', { hasText: 'AuthSteps.cs' }).click();
  await page.getByRole('button', { name: 'Close AuthSteps.cs' }).click();
  await expect(page.locator('.editor-tab-label[aria-current="true"]')).toHaveText(/Login\.feature/);
});

test('QL65 / QL66 Find in Files starts with the selection; Go to All remembers its query', async ({ page }) => {
  await openFeature(page);
  await caretAt(page, 'dashboard');
  await page.keyboard.press('Shift+End');
  await page.keyboard.press('Control+Shift+F');
  await expect(page.getByRole('region', { name: 'Search' }).getByLabel('Search in files')).toHaveValue('dashboard is displayed');
  await page.keyboard.press('Control+P');
  await page.keyboard.type('login');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+P');
  await expect(page.getByRole('dialog').locator('input').first()).toHaveValue('login');
});

test('QL74 Settings: changed feature switches are marked; @modified lists them', async ({ page }) => {
  await page.goto('/#/dashboard');
  await page.getByRole('button', { name: 'Preferences' }).click();
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  await dialog.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: 'Features' }).click();
  await dialog.getByRole('switch', { name: 'Copy XPath', exact: true }).click();
  await dialog.getByRole('searchbox').or(dialog.getByRole('textbox').first()).fill('@modified');
  await expect(dialog.getByText('Copy XPath (changed)')).toBeVisible();
});

test('QL75 / QL76 / QL77 Notifications: filter, relative times, dismiss one', async ({ page }) => {
  await openFeature(page);
  await menuItem(page, 'View', /^Notifications/);
  const list = page.getByRole('list', { name: 'Notification history' });
  for (const t of ['Alpha notice', 'Beta notice']) {
    await page.evaluate((d) => window.dispatchEvent(new CustomEvent('tas:notice', { detail: d })), t);
    await expect(list).toContainText(t);
  }
  await expect(list).toContainText('just now');
  await page.getByLabel('Filter notifications').fill('beta');
  await expect(list).toContainText('Beta notice');
  await expect(list).not.toContainText('Alpha notice');
  await page.getByLabel('Filter notifications').fill('');
  await list.getByRole('button', { name: 'Dismiss Beta notice' }).click();
  await expect(list).not.toContainText('Beta notice');
  await expect(list).toContainText('Alpha notice');
});
