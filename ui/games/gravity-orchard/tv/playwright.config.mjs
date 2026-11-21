import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.mjs', fullyParallel: true,
  forbidOnly: Boolean(process.env.CI), retries: 0, workers: process.env.CI ? 2 : 3,
  timeout: 30_000, expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { outputFolder: 'tests/report', open: 'never' }], ['json', { outputFile: 'tests/results.json' }]],
  outputDir: './tests/artifacts',
  use: {
    baseURL: 'http://127.0.0.1:4194', browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
    trace: 'retain-on-failure', screenshot: 'only-on-failure',
  },
  webServer: { command: 'node fixtures/server.mjs', cwd: fileURLToPath(new URL('.', import.meta.url)), url: 'http://127.0.0.1:4194/tv/fixtures/', reuseExistingServer: !process.env.CI, timeout: 15_000 },
});
