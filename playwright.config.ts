import { defineConfig, devices } from '@playwright/test';

/**
 * Konfigurasi Playwright untuk MTQ Management System.
 * Mendukung pengujian E2E Desktop dan Tablet (Antarmuka Majelis Hakim & Penilaian).
 * Otomatis menyalakan dev server lokal jika belum berjalan.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45 * 1000,
  expect: {
    timeout: 8 * 1000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10 * 1000,
    navigationTimeout: 20 * 1000
  },
  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'iPad Pro Landscape (Dewan Hakim)',
      use: {
        ...devices['iPad Pro 11 landscape'],
        viewport: { width: 1194, height: 834 }
      }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60 * 1000
  }
});
