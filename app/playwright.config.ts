import { defineConfig } from '@playwright/test';

// PW_PORT lets parallel worktrees run browser tests without fighting over one port.
const port = Number(process.env.PW_PORT ?? 4173);

// Phone-sized checks in Karachi time, against the built app (so the service worker and
// manifest are the real ones). Uses the installed Google Chrome; no browser download.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  // One retry: on a busy machine a navigation can be aborted or a click can time out. A test that
  // passes only on retry is listed as "flaky" in the report, so it is visible, not hidden.
  retries: 1,
  use: {
    baseURL: `http://localhost:${port}`,
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Karachi',
    locale: 'en-GB',
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
