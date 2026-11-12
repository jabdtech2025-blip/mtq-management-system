import { test, expect } from '@playwright/test';

test.describe('E2E: Landing Page Publik', () => {
  test('01. Landing page tampil di "/" dengan judul, menu, dan kontak', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { level: 1, name: /Penilaian yang tertib, hasil yang dapat dipertanggungjawabkan/i })
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /Enam tahapan penyelenggaraan/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Pertanyaan yang sering diajukan/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'admin@mtqsystem.web.id' })).toHaveAttribute(
      'href',
      'mailto:admin@mtqsystem.web.id'
    );
    await expect(page.getByRole('link', { name: /Hubungi Pengelola/i })).toHaveAttribute('href', /wa\.me\/6282134342089/);
    // Halaman landing tidak boleh diberi noindex; halaman aplikasi boleh
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  });

  test('02. Tombol "Masuk Panitia & Dewan Hakim" membuka aplikasi', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Masuk Panitia & Dewan Hakim/i }).click();
    await expect(page.getByRole('button', { name: /Coba Mode Demo/i })).toBeVisible({ timeout: 15000 });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('03. Tanya jawab dapat dibuka dan ditutup', async ({ page }) => {
    await page.goto('/');
    const question = page.getByText('Apakah peserta perlu membuat akun?');
    await question.click();
    await expect(page.getByText(/Akun hanya untuk panitia dan dewan hakim/i)).toBeVisible();
  });

  test('04. Tautan email Supabase yang mendarat di "/" diproses aplikasi, bukan landing', async ({ page }) => {
    await page.goto('/#error_description=contoh&error=access_denied');
    await expect(page.getByRole('button', { name: /Coba Mode Demo/i })).toBeVisible({ timeout: 15000 });
  });
});
