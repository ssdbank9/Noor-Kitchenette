import { defineConfig } from '@playwright/test';

// Phone-sized checks in Karachi time, against the built app (so the service worker and
// manifest are the real ones). Uses the installed Google Chrome; no browser download.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Karachi',
    locale: 'en-GB',
  },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
