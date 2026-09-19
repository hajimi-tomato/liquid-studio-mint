import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:8000', channel: 'msedge', viewport: { width: 1400, height: 900 } },
  webServer: {
    command: 'python -m http.server 8000 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
