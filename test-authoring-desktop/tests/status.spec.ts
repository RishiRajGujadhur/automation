import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('DQ29: packaged status polling bounds hung requests and resumes after recovery', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-status-'));
  const args = [`--user-data-dir=${profile}`];
  const app = await electron.launch(process.env.TAS_EXE
    ? { executablePath: path.resolve(process.env.TAS_EXE), args, env: { ...process.env, TAS_TEST: '1' } }
    : { args: ['.', ...args], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
    await app.evaluate(() => {
      const g = globalThis as any;
      const original = g.fetch;
      g.statusProbe = { original, active: 0, peak: 0, aborted: 0, recovered: 0, hang: true };
      g.fetch = (input: unknown, options: RequestInit = {}) => {
        if (!/\/api\/(recording|execution)$/.test(String(input))) return original(input, options);
        const probe = g.statusProbe;
        if (!probe.hang) { probe.recovered++; return original(input, options); }
        probe.active++; probe.peak = Math.max(probe.peak, probe.active);
        return new Promise((_resolve, reject) => options.signal?.addEventListener('abort', () => {
          probe.active--; probe.aborted++; reject(new Error('Simulated request timeout'));
        }, { once: true }));
      };
    });
    await page.waitForTimeout(15_000); // exceed the request timeout and begin the next cycle
    const probe = await app.evaluate(() => {
      const p = (globalThis as any).statusProbe;
      p.hang = false;
      return { peak: p.peak, aborted: p.aborted };
    });
    expect(probe.peak).toBe(2);
    expect(probe.aborted).toBeGreaterThanOrEqual(2);
    await expect.poll(() => app.evaluate(() => (globalThis as any).statusProbe.recovered), { timeout: 16_000 }).toBeGreaterThanOrEqual(2);
  } finally {
    await app.evaluate(() => { const g = globalThis as any; if (g.statusProbe) g.fetch = g.statusProbe.original; });
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
