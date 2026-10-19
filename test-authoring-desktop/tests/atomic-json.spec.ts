import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readObject, writeObject } from '../src/main/atomicJson';

test('DQ22: valid backups survive corrupt state and interrupted replacement', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-atomic-'));
  const file = path.join(dir, 'desktop.json');
  try {
    writeObject(file, { zoom: 1 });
    writeObject(file, { zoom: 2 });
    expect(readObject(`${file}.bak`)).toEqual({ zoom: 1 });
    fs.writeFileSync(file, '{broken');
    expect(readObject(file) ?? readObject(`${file}.bak`)).toEqual({ zoom: 1 });
    writeObject(file, { zoom: 3 });
    expect(readObject(`${file}.bak`)).toEqual({ zoom: 1 });
    // A locked destination models Windows refusing the final atomic replacement.
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => { if (to === file) throw new Error('Destination locked'); rename(from, to); };
    try { expect(() => writeObject(file, { zoom: 4 })).toThrow('Destination locked'); }
    finally { fs.renameSync = rename; }
    expect(readObject(file)).toEqual({ zoom: 3 });
    expect(readObject(`${file}.bak`)).toEqual({ zoom: 3 });
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    for (const invalid of ['null', '[]', '"text"']) { fs.writeFileSync(file, invalid); expect(readObject(file)).toBeUndefined(); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('DQ22: packaged startup recovers desktop preferences from the last good backup', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-recovery-'));
  fs.writeFileSync(path.join(profile, 'desktop.json'), '{interrupted');
  fs.writeFileSync(path.join(profile, 'desktop.json.bak'), JSON.stringify({ zoom: 1, autoRescan: false, firstRunDone: true }));
  const args = [`--user-data-dir=${profile}`];
  const app = await electron.launch(process.env.TAS_EXE
    ? { executablePath: path.resolve(process.env.TAS_EXE), args, env: { ...process.env, TAS_TEST: '1' } }
    : { args: ['.', ...args], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomLevel())).toBeCloseTo(1);
    expect(await app.evaluate(({ Menu }) => Menu.getApplicationMenu()!.items.find((i) => i.label.replace('&', '') === 'View')!.submenu!.items.find((i) => i.label === 'Auto-rescan When Files Change')!.checked)).toBe(false);
    expect(readObject(path.join(profile, 'desktop.json'))?.zoom).toBe(1);
  } finally {
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
