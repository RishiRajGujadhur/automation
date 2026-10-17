import { test, expect, chromium, type Browser } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';

// Real recording end to end: the studio's recorder browser (headless, CDP when playwright.config.ts sets it) is driven
// through a local sign-in page, then Save recording writes the feature file and the XML dictionary.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(180_000);

const SITE = `<!doctype html><title>Shop sign in</title><h1>Sign in</h1>
<label>Email <input data-testid="email" aria-label="Email" autocomplete="username"></label>
<label>Password <input type="password" aria-label="Password" name="password"></label>
<button id="go" onclick="document.querySelector('#msg').textContent='Welcome'">Sign in</button><p id="msg"></p>`;

test('Record a sign-in, then Save recording writes the feature file and the dictionary', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-rec-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  const site: Server = createServer((_q, r) => { r.setHeader('Content-Type', 'text/html'); r.end(SITE); });
  await new Promise<void>((ok) => site.listen(0, '127.0.0.1', ok));
  const siteUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}/signin`;
  let browser: Browser | undefined;
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/recorder');
    await expect(page.getByText('Repository indexed')).toBeVisible();

    // Start recording from the recorder page.
    await page.getByRole('button', { name: 'Start recording' }).first().click();
    await page.getByLabel('START URL').fill(siteUrl);
    await page.getByRole('button', { name: 'Launch browser' }).click();
    await expect.poll(async () => (await (await request.get('/api/recording')).json()).status, { timeout: 30_000 }).toBe('recording');

    // Act in the recording browser.
    const cdpPort = (await (await request.get('/api/recording')).json()).cdpPort;
    test.skip(!cdpPort, 'The dev server was started without STUDIO_RECORDER_CDP=1 (see playwright.config.ts).');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    // Pages show up over CDP a moment after attaching.
    const findPage = () => browser!.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(siteUrl));
    await expect.poll(() => !!findPage(), { timeout: 10_000 }).toBe(true);
    const recPage = findPage()!;
    await recPage.getByLabel('Email').fill('ann@example.com', { timeout: 10_000 });
    await recPage.getByLabel('Password').fill('hunter2', { timeout: 10_000 });
    await recPage.getByRole('button', { name: 'Sign in' }).click({ timeout: 10_000 });
    await expect(recPage.getByText('Welcome')).toBeVisible();
    await expect.poll(async () => (await (await request.get('/api/recording')).json()).actions.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(4);
    await expect(page.getByText(/actions captured/)).toBeVisible();
    await page.getByRole('button', { name: 'Stop', exact: true }).click();

    // Save recording: new feature file + new dictionary.
    await page.getByRole('button', { name: /Save recording/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Save recording' });
    await dialog.getByLabel('New feature file').fill('Features/Shop/SignIn.feature');
    await dialog.getByLabel('Feature name').fill('Shop sign in');
    await dialog.getByLabel('Scenario name').fill('Sign in with email');
    await dialog.getByLabel('Dictionary page').fill('SignInPage');
    await dialog.getByRole('radio', { name: 'New file' }).click();
    await dialog.getByLabel('New dictionary file').fill('Dictionaries/SignInPage.xml');
    await dialog.getByRole('button', { name: 'Preview changes' }).click();
    const steps = dialog.getByRole('region', { name: 'Scenario steps' });
    await expect(steps).toContainText(`Given the user opens "${siteUrl}"`);
    await expect(steps).toContainText('the user enters "ann@example.com" into the "Email" field');
    await expect(steps).toContainText('the user enters "<secret>" into the "Password" field');
    await expect(steps).toContainText('the user clicks "SignIn"');
    await expect(dialog.getByLabel('Diff for Dictionaries/SignInPage.xml')).toContainText('email');
    await dialog.getByRole('button', { name: 'Save feature and dictionary' }).click();
    await expect(dialog).toHaveCount(0);

    // Both files are on disk, the password never is, and the feature is open in the editor.
    const feature = await fs.readFile(path.join(root, 'Features/Shop/SignIn.feature'), 'utf8');
    expect(feature).toMatch(/^Feature: Shop sign in/);
    expect(feature).toContain('Scenario: Sign in with email');
    expect(feature).toMatch(/When the user enters "ann@example\.com" into the "Email" field\s+And the user enters "<secret>"/);
    expect(feature).not.toContain('hunter2');
    const xml = await fs.readFile(path.join(root, 'Dictionaries/SignInPage.xml'), 'utf8');
    // The repository's format: Page → Section → Field (lower-case XRefCode, looked up case-insensitively) → Selector.
    expect(xml).toMatch(/<Field XRefCode="email" Type="TextBox">\s*<Selector Type="testid">email<\/Selector>/);
    expect(xml).toMatch(/<Field XRefCode="signin" Type="Button">/);
    expect(xml).not.toContain('hunter2');
    await expect(page.getByLabel('Gherkin source')).toContainText('Scenario: Sign in with email');
  } finally {
    await browser?.close().catch(() => {});
    await request.post('/api/recording/stop').catch(() => {});
    await request.post('/api/workspace', { data: previous });
    site.close();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
