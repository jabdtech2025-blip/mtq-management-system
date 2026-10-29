import { Page, expect } from '@playwright/test';

/**
 * Helper untuk navigasi dan penyiapan sesi pengujian Playwright dengan storage bersih (Gate fail-closed).
 */
export async function clearStorageAndOpenGate(page: Page) {
  await page.context().clearCookies();
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Helper untuk masuk ke Mode Simulasi Demo Lokal secara andal dan terisolasi.
 */
export async function enterDemoSimulation(page: Page) {
  await page.context().clearCookies();
  await page.goto('/');
  await page.evaluate(() => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      localStorage.setItem('mtq_offline_demo_simulation_v4', 'true');
    } catch {}
  });
  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');

  // Pastikan dashboard dan sidebar berhasil dimuat dan stabil
  await expect(page.getByText('Manajemen MTQ').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/LPTQ Provinsi Jawa Barat/i).first()).toBeVisible({ timeout: 15000 });
}
