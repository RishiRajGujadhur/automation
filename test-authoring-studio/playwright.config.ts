import { defineConfig } from '@playwright/test';
import { readSettings } from './server/settings';

const { webPort } = readSettings();
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  // Snapshot fixtures/ before the run and restore it afterwards (returned teardown).
  globalSetup: './tests/e2e/fixtures-guard.ts',
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    viewport: { width: 1440, height: 1000 },
    // Most specs exercise every page, so they start in Advanced mode with the classic tab layout and every algorithm;
    // vscode.spec.ts covers the default VS Code layout and presets, basic.spec.ts overrides the mode.
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${webPort}`, localStorage: [{ name: 'tas:prefs', value: JSON.stringify({ mode: 'advanced', layout: 'classic', algorithmPreset: 'everything', autoSave: 'off' }) }] }] },
  },
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
