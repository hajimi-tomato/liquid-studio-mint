import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: process.env.CI ? 120_000 : 60_000,
  expect: { timeout: process.env.CI ? 30_000 : 5_000 },
  maxFailures: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:8000',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
    viewport: { width: 1400, height: 900 },
    screenshot: process.env.CI ? 'only-on-failure' : 'off',
    // Hosted runners have no physical GPU. These flags affect CI only.
    launchOptions: process.env.CI ? {
      args: ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader'],
    } : undefined,
  },
  webServer: {
    command: 'python -m http.server 8000 --bind 127.0.0.1 --directory dist',
    url: 'http://127.0.0.1:8000',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
