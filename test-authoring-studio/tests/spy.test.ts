import { it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { Spy, type SpyTreeNode } from '../server/spy';

const PAGE = `<!doctype html><title>Shop</title>
<main><h1>Sign in</h1>
<form><label>Email <input data-testid="email" name="email"></label>
<label>Password <input type="password" id="pw"></label>
<button type="submit">Sign in</button><button type="button">Help</button><button type="button">Help</button></form>
<a href="/forgot">Forgot password?</a></main>`;

it('tracks and selects elements, builds the tree, and verifies selector candidates on the live page', async () => {
  process.env.STUDIO_RECORDER_CDP = '1'; // headless + CDP, so the test can act in the Spy browser
  const server = createServer((_q, r) => { r.setHeader('Content-Type', 'text/html'); r.end(PAGE); });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const spy = new Spy();
  try {
    await spy.start(`http://127.0.0.1:${(server.address() as { port: number }).port}/`);
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${spy.cdpPort}`);
    await vi.waitFor(() => expect(browser.contexts().flatMap((c) => c.pages()).length).toBeGreaterThan(0));
    const page = browser.contexts().flatMap((c) => c.pages())[0];

    // Track: clicking selects instead of submitting the form.
    await page.getByRole('button', { name: 'Sign in' }).click();
    await vi.waitFor(() => expect(spy.selected?.element.name).toBe('Sign in'));
    const sel = spy.selected!;
    expect(sel.element).toMatchObject({ tag: 'button', role: 'button', visible: true, enabled: true });
    expect(sel.element.path.map((p) => p.tag)).toEqual(['body', 'main', 'form', 'button']);
    expect(sel.candidates[0]).toMatchObject({ type: 'ariarole.button', value: 'Sign in', status: 'unique', count: 1 });
    expect(sel.candidates.find((c) => c.type === 'text')).toMatchObject({ status: 'multiple' }); // h1 + button
    expect(page.url()).not.toContain('?'); // the form was not submitted

    // Tree → select by id: the email field, whose best selector is its test id.
    const flat = (n: SpyTreeNode[]): SpyTreeNode[] => n.flatMap((x) => [x, ...flat(x.children)]);
    const email = flat(await spy.tree()).find((n) => n.testId === 'email')!;
    expect(email).toMatchObject({ tag: 'input', role: 'textbox', name: 'Email' });
    const picked = await spy.select(email.id);
    expect(picked.candidates[0]).toMatchObject({ type: 'testid', value: 'email', status: 'unique' });
    expect(picked.candidates.find((c) => c.type === 'ariarole.textbox')).toMatchObject({ value: 'Email', status: 'unique' });

    // Verify any selector; screenshot an element.
    expect(await spy.verify('ariarole.button', 'Help')).toMatchObject({ count: 2, status: 'multiple' });
    expect(await spy.verify('css', '#missing')).toMatchObject({ count: 0, status: 'none' });
    expect(Buffer.from(await spy.screenshot(email.id), 'base64').subarray(1, 4).toString()).toBe('PNG');

    // Tracking off: clicks reach the page again.
    await spy.track(false);
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await vi.waitFor(() => expect(page.url()).toContain('/forgot'));
    await browser.close().catch(() => {});
  } finally {
    await spy.stop();
    server.close();
    delete process.env.STUDIO_RECORDER_CDP;
  }
}, 60_000);
