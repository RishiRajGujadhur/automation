import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('requires preview approval, rejects stale writes and traversal, and applies exact source', async ({
  request,
}) => {
  const previous = (await (await request.get('/api/workspace')).json()).config;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-test-'));
  try {
    await fs.writeFile(
      path.join(temp, 'Example.feature'),
      'Feature: Example\n  Scenario: Original\n    Given a user\n',
    );
    expect((await request.post('/api/workspace', { data: { repositoryRoot: temp } })).ok()).toBe(
      true,
    );
    const source = 'Feature: Example\n  Scenario: Changed\n    Given a user\n';
    const p = await (
      await request.post('/api/generation/preview', { data: { file: 'Example.feature', source } })
    ).json();
    expect((await request.post('/api/generation/apply', { data: { id: p.id } })).ok()).toBe(false);
    await fs.appendFile(path.join(temp, 'Example.feature'), '# external change\n');
    expect(
      (
        await request.post('/api/generation/apply', { data: { id: p.id, approved: true } })
      ).status(),
    ).toBe(409);
    expect(
      (
        await request.post('/api/generation/preview', {
          data: { file: '../escaped.feature', source },
        })
      ).ok(),
    ).toBe(false);
    const fresh = await (
      await request.post('/api/generation/preview', { data: { file: 'Example.feature', source } })
    ).json();
    expect(
      (
        await request.post('/api/generation/apply', { data: { id: fresh.id, approved: true } })
      ).ok(),
    ).toBe(true);
    expect(await fs.readFile(path.join(temp, 'Example.feature'), 'utf8')).toBe(source);
    expect(
      (
        await request.post('/api/generation/apply', { data: { id: fresh.id, approved: true } })
      ).ok(),
    ).toBe(false);
  } finally {
    await request.post('/api/workspace', { data: previous });
    if (
      path.dirname(path.resolve(temp)) !== path.resolve(os.tmpdir()) ||
      !path.basename(temp).startsWith('studio-test-')
    )
      throw new Error('Unexpected cleanup path');
    await fs.rm(temp, { recursive: true, force: true });
  }
});
