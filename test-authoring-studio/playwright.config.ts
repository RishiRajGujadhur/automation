import { defineConfig } from '@playwright/test';
import { readSettings } from './server/settings';

const { webPort } = readSettings();
export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${webPort}`, viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'npm run dev',
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: true,
    timeout: 30000,
  },
});
