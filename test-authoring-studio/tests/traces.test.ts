import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { collectTraces, type TestResult } from '../server/testRunner';

describe('collectTraces', () => {
  it('attaches new trace zips under bin/ to the test named in the file and copies them', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-traces-'));
    const into = path.join(root, 'store');
    try {
      const since = Date.now();
      await fs.mkdir(path.join(root, 'bin/Debug/net10.0/traces'), { recursive: true });
      await fs.writeFile(path.join(root, 'bin/Debug/net10.0/traces/AddsToCart.zip'), 'zip');
      await fs.writeFile(path.join(root, 'outside.zip'), 'zip'); // not under bin/ or TestResults/
      const results: TestResult[] = [
        { name: 'AddsToCart', className: 'Shop.CartTests', method: 'AddsToCart', outcome: 'failed', durationMs: 1 },
        { name: 'Removes', className: 'Shop.CartTests', method: 'Removes', outcome: 'passed', durationMs: 1 },
      ];
      await collectTraces(root, since, results, into);
      expect(results[0].traces).toHaveLength(1);
      expect(results[0].traces![0]).toMatch(/^AddsToCart-\w+\.zip$/);
      expect(results[1].traces).toBeUndefined();
      expect(await fs.readFile(path.join(into, results[0].traces![0]), 'utf8')).toBe('zip');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
