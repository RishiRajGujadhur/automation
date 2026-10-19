import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateSettingsExport } from '../src/main/settingsValidation';

const exported = (patch: object) => ({ format: 'testauthoring-settings', version: 1, ...patch });
test('DQ19: validate all export sections without coercing or accepting unknown keys', () => {
  const valid = exported({ desktop: { zoom: 1, doNotDisturb: true, recent: ['C:/Repo'] }, studio: { webPort: 5173, apiPort: 4310, tracing: { enabled: false, screenshots: true, snapshots: true, sources: false } }, workspace: { repositoryRoot: 'C:/Repo', referenceScope: 'DirectReferences' } });
  expect(validateSettingsExport(valid).errors).toEqual([]);
  for (const value of [null, [], {}, exported({ version: 2, desktop: {} }), exported({ desktop: { zoom: '1' } }), exported({ desktop: { doNotDisturb: 'false' } }), exported({ desktop: [] }), exported({ workspace: { repositoryRoot: '' } }), exported({ desktop: { typo: true } }), exported({ desktop: { window: { width: -1 } } })]) {
    expect(validateSettingsExport(value).data).toBeUndefined();
    expect(validateSettingsExport(value).errors.length).toBeGreaterThan(0);
  }
  const invalid = validateSettingsExport(exported({ desktop: { autoRescan: 'yes' }, studio: { webPort: 80, apiPort: 80, tracing: {} }, workspace: { repositoryRoot: 123 } }));
  expect(invalid.errors.join('\n')).toContain('desktop.autoRescan');
  expect(invalid.errors.join('\n')).toContain('studio.webPort');
  expect(invalid.errors.join('\n')).toContain('workspace.repositoryRoot');
});

test('DQ19: invalid imports leave packaged settings unchanged and identify the invalid fields', async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-invalid-import-'));
  const imported = path.join(profile, 'invalid-export.json');
  fs.writeFileSync(imported, JSON.stringify(exported({ version: 2, desktop: { zoom: 'bad' } })));
  const args = [`--user-data-dir=${profile}`];
  const app = await electron.launch(process.env.TAS_EXE
    ? { executablePath: path.resolve(process.env.TAS_EXE), args, env: { ...process.env, TAS_TEST: '1' } }
    : { args: ['.', ...args], cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, TAS_TEST: '1' } });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText('Repository indexed')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(800); // allow normal window-bound persistence to settle
    const file = path.join(profile, 'desktop.json');
    const before = fs.readFileSync(file, 'utf8');
    await app.evaluate(({ dialog, Menu }, imported) => {
      const g = globalThis as any;
      g.importErrors = [];
      const open = dialog.showOpenDialog, error = dialog.showErrorBox;
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [imported] })) as typeof dialog.showOpenDialog;
      dialog.showErrorBox = (_title, detail) => { g.importErrors.push(detail); };
      g.restoreImportDialogs = () => { dialog.showOpenDialog = open; dialog.showErrorBox = error; };
      Menu.getApplicationMenu()!.items.find((i) => i.label.replace('&', '') === 'File')!.submenu!.items.find((i) => i.label === 'Desktop Settings')!.submenu!.items.find((i) => i.label === 'Import Settings…')!.click();
    }, imported);
    await expect.poll(() => app.evaluate(() => (globalThis as any).importErrors.join('\n'))).toContain('desktop.zoom');
    expect(await app.evaluate(() => (globalThis as any).importErrors.join('\n'))).toContain('version');
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
    await expect(page.getByText('Repository indexed')).toBeVisible();
  } finally {
    await app.evaluate(() => (globalThis as any).restoreImportDialogs?.());
    await app.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
