import { defineConfig } from '@playwright/test';
import { readSettings } from './server/settings';

const { webPort } = readSettings();
// Existing end-to-end suites exercise every page; fresh-default coverage uses an empty storageState in its own spec.
const pageSettings = Object.fromEntries([
  'dashboard', 'test-generator', 'recorder', 'scenario-builder', 'spy', 'dictionary-inspector',
  'test-design', 'step-catalog', 'backgrounds', 'selectors', 'project-explorer', 'config',
  'search', 'testing', 'git',
].map((id) => [`workbench.pages.${id}`, true]));
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
    storageState: { cookies: [], origins: [{ origin: `http://127.0.0.1:${webPort}`, localStorage: [{ name: 'tas:prefs', value: JSON.stringify({ mode: 'advanced', layout: 'classic', algorithmPreset: 'everything', autoSave: 'off' }) }, { name: 'tas:settings', value: JSON.stringify(pageSettings) }] }] },
  },
  webServer: {
    command: 'npm run dev',
    // The API starts a moment after Vite: wait until it answers through the proxy.
    url: `http://127.0.0.1:${webPort}/api/health`,
    reuseExistingServer: true,
    timeout: 30000,
    // The recorder e2e test drives the recording browser over CDP (port reported by GET /api/recording).
    env: { STUDIO_RECORDER_CDP: '1' },
  },
});
