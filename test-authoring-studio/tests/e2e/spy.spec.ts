import { test, expect, chromium, type Browser } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer, type Server } from 'node:http';

// Spy (GUI object recognition, after Ranorex Spy) end to end, on a local page. The Spy browser runs headless with a
// CDP port (STUDIO_RECORDER_CDP=1 in playwright.config.ts) so the test can click in it like a user.
test.use({ storageState: { cookies: [], origins: [] } });
test.setTimeout(180_000);

const SITE = `<!doctype html><title>Shop</title><main><h1>Checkout</h1>
<label>Coupon <input data-testid="coupon" name="coupon"></label>
<button type="button" id="apply">Apply coupon</button>
<nav><a href="/help">Help</a><a href="/help">Help</a></nav></main>`;

test('Spy: track and pick an element, browse the tree, check a selector, add it to a dictionary', async ({ page, request }) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-spy-'));
  await fs.cp(path.resolve(import.meta.dirname, '../../fixtures'), root, { recursive: true });
  const site: Server = createServer((_q, r) => { r.setHeader('Content-Type', 'text/html'); r.end(SITE); });
  await new Promise<void>((ok) => site.listen(0, '127.0.0.1', ok));
  const siteUrl = `http://127.0.0.1:${(site.address() as { port: number }).port}/checkout`;
  let browser: Browser | undefined;
  try {
    expect((await request.post('/api/workspace', { data: { repositoryRoot: root, targetProject: '.' } })).ok()).toBe(true);
    await page.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tas:prefs', JSON.stringify({ mode: 'advanced' })); sessionStorage.setItem('seeded', '1'); } });
    await page.goto('/#/features/spy');
    const spy = page.getByRole('region', { name: 'Spy' });
    await spy.getByLabel('Page URL').fill(siteUrl);
    await spy.getByRole('button', { name: 'Start Spy' }).click();
    await expect(spy.getByRole('button', { name: 'Track' })).toHaveAttribute('aria-pressed', 'true');
    const tree = spy.getByRole('region', { name: 'Element browser' });
    await expect(tree).toContainText('Apply coupon');

    // Track: click the button in the Spy browser; the studio selects it (the page does not react).
    const cdpPort = (await (await request.get('/api/spy')).json()).cdpPort;
    test.skip(!cdpPort, 'The dev server was started without STUDIO_RECORDER_CDP=1.');
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    const find = () => browser!.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith(siteUrl));
    await expect.poll(() => !!find(), { timeout: 10_000 }).toBe(true);
    await find()!.getByRole('button', { name: 'Apply coupon' }).click();
    const props = spy.getByRole('region', { name: 'Element properties' });
    await expect(props).toContainText('Apply coupon', { timeout: 10_000 });
    await expect(props).toContainText('#apply');
    const cands = spy.getByRole('list', { name: 'Selector candidates' });
    await expect(cands.locator('li').first()).toContainText('ariarole.button');
    await expect(cands.locator('li').first()).toContainText('unique');

    // Element browser: pick the coupon field; its test id is the best selector.
    await tree.getByRole('button', { name: /coupon/ }).filter({ hasText: 'testid=coupon' }).click();
    await expect(cands.locator('li').first()).toContainText('testid');
    await expect(cands.locator('li').first()).toContainText('coupon');

    // Selector editor: a non-unique selector shows its match count.
    await spy.getByLabel('Selector type').selectOption('ariarole.link');
    await spy.getByLabel('Selector value').fill('Help');
    await spy.getByRole('button', { name: 'Check', exact: true }).click();
    await expect(spy.getByRole('form', { name: 'Selector editor' }).getByRole('status')).toHaveText('2 matches');

    // Add to dictionary: a new file with the coupon field and its test id.
    await spy.getByLabel('Dictionary page').fill('CheckoutPage');
    await spy.getByLabel('Dictionary file').fill('Dictionaries/CheckoutPage.xml');
    await expect(spy.getByLabel('Dictionary field')).toHaveValue('Coupon');
    await spy.getByRole('button', { name: 'Preview dictionary change' }).click();
    await spy.getByRole('button', { name: /Approve and write/ }).click();
    await expect(page.getByText(/Added Coupon to Dictionaries\/CheckoutPage\.xml/).first()).toBeVisible();
    const xml = await fs.readFile(path.join(root, 'Dictionaries/CheckoutPage.xml'), 'utf8');
    expect(xml).toMatch(/<Field XRefCode="coupon" Type="TextBox">\s*<Selector Type="testid">coupon<\/Selector>/);
  } finally {
    await browser?.close().catch(() => {});
    await request.post('/api/spy/stop').catch(() => {});
    await request.post('/api/workspace', { data: previous });
    site.close();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
});
