import { it, expect, vi } from 'vitest';
import { createServer } from 'node:http';
import { Recorder } from '../server/recorder';
it('records real browser events, redacts passwords, pauses and stops', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(
      '<!doctype html><label>Search<input aria-label="Search"></label><label>Password<input type="password" name="password" aria-label="Password"></label><button>Search</button>',
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const recorder = new Recorder();
  try {
    await recorder.start(`http://127.0.0.1:${port}`, true);
    const page = recorder.context!.pages()[0];
    await page.getByLabel('Search').fill('Dayforce.com');
    await page.getByLabel('Password').fill('never-store-this');
    await page.getByRole('button').click();
    await vi.waitFor(() => expect(recorder.actions.some((a) => a.action === 'click')).toBe(true));
    expect(recorder.actions.some((a) => a.value === 'Dayforce.com')).toBe(true);
    expect(JSON.stringify(recorder.actions)).not.toContain('never-store-this');
    expect(recorder.actions.some((a) => a.value === '[REDACTED]')).toBe(true);
    recorder.status = 'paused';
    const count = recorder.actions.length;
    await page.getByLabel('Search').fill('paused');
    await page.evaluate(() => new Promise((r) => setTimeout(r, 30)));
    expect(recorder.actions).toHaveLength(count);
    await recorder.stop();
    expect(recorder.status).toBe('stopped');
  } finally {
    await recorder.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 20000);
it('verifies dictionary selectors against a real page', async () => {
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><input data-testid="email" aria-label="Email"><button>Go</button><button>Go</button>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  try {
    const result = await new Recorder().verify(
      [
        { type: 'testid', value: 'email' },
        { type: 'ariarole.textbox', value: 'Email' },
        { type: 'text', value: 'Go' },
        { type: 'css', value: '#missing' },
        { type: 'weird', value: 'x' },
      ],
      `http://127.0.0.1:${port}/?token=secret`,
    );
    expect(result.results.map((r) => r.status)).toEqual(['verified', 'verified', 'multiple', 'none', 'unsupported']);
    expect(result.url).not.toContain('secret');
  } finally {
    server.close();
  }
}, 30000);
it('saves a Playwright trace when tracing is enabled', async () => {
  const server = createServer((_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><button>Go</button>'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const recorder = new Recorder();
  try {
    await recorder.start(`http://127.0.0.1:${port}`, true, { enabled: true, screenshots: false, snapshots: true, sources: false });
    await recorder.context!.pages()[0].getByRole('button').click();
    const trace = await recorder.stop();
    expect(trace).toMatch(/recording-.*\.zip$/);
    const { statSync, rmSync } = await import('node:fs');
    expect(statSync(trace!).size).toBeGreaterThan(1000);
    rmSync(trace!);
  } finally {
    server.close();
  }
}, 30000);
