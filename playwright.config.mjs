import { defineConfig } from '@playwright/test';

const localBrowser = process.env.CI ? {} : { channel: 'chrome' };

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node automation/serve.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true
  },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', ...localBrowser, viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-chromium', use: { browserName: 'chromium', ...localBrowser, viewport: { width: 390, height: 844 } } }
  ]
});
