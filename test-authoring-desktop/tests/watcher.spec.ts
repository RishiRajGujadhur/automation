import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('DQ33: disabling auto-rescan cancels queued changes and re-enabling still works', async () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-watch-'));
  const repo = path.join(sandbox, 'repo');
  fs.cpSync(path.resolve(import.meta.dirname, '../../test-authoring-studio/fixtures'), repo, { recursive: true });
  const args = [`--user-data-dir=${path.join(sandbox, 'profile')}`, repo];
  const app = await electron.launch(process.env.TAS_EXE
    ? { executablePath: path.resolve(process.env.TAS_EXE), args, env: { ...process.env, TAS_TEST: '1' } }
    : { args: ['.', ...args], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
    await page.evaluate(() => {
      (window as any).watchEvents = 0;
      (window as any).desktop.onMenu((command: string) => { if (command === 'repository-changed') (window as any).watchEvents++; });
    });
    const toggle = () => app.evaluate(({ Menu }) => {
      Menu.getApplicationMenu()!.items.find((i) => i.label.replace('&', '') === 'View')!.submenu!.items.find((i) => i.label === 'Auto-rescan When Files Change')!.click();
    });
    const file = path.join(repo, 'Features', 'Watcher.feature');
    fs.writeFileSync(file, 'Feature: Watcher\n  Scenario: Pending\n    Given x\n');
    await page.waitForTimeout(250); // enqueue the filesystem event inside the 1.2 s debounce
    await toggle();
    await page.waitForTimeout(1600);
    expect(await page.evaluate(() => (window as any).watchEvents)).toBe(0);
    await toggle();
    fs.appendFileSync(file, '\n# resumed\n');
    await expect.poll(() => page.evaluate(() => (window as any).watchEvents)).toBe(1);
  } finally {
    await app.close();
    fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
