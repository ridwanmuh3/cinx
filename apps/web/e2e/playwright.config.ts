import { defineConfig } from '@playwright/test';
import { join } from 'node:path';

const WEB_DIR = join(__dirname, '..');
const ROOT_DIR = join(__dirname, '../../..');

export default defineConfig({
  testDir: __dirname,
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  globalSetup: join(__dirname, 'global-setup.ts'),
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'sh scripts/e2e-services.sh',
      url: 'http://localhost:3000/api/v1/health',
      timeout: 360_000,
      reuseExistingServer: !process.env.CI,
      cwd: ROOT_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm exec vite --port 4200 --host 0.0.0.0',
      url: 'http://localhost:4200',
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      cwd: WEB_DIR,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
