import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tracesDir } from '../../server/settings';

// Traces and Spy snapshots live under .local/, which Express's send refuses by default (dot-folders).
test('trace downloads are served from the .local traces folder', async ({ request }) => {
  await fs.mkdir(tracesDir, { recursive: true });
  const name = `e2e-download-${Date.now()}.zip`;
  await fs.writeFile(path.join(tracesDir, name), 'PK-not-really-a-zip');
  try {
    const r = await request.get(`/api/traces/${name}`);
    expect(r.status()).toBe(200);
    expect(r.headers()['content-disposition']).toContain(name);
    expect(await r.text()).toBe('PK-not-really-a-zip');
  } finally {
    await fs.rm(path.join(tracesDir, name), { force: true });
  }
});
