import { test, expect } from '@playwright/test';
import { enterDemoSimulation } from './helpers/auth';

test.describe('E2E: Manajemen Babak, Kualifikasi Peserta & Pengumuman Kelulusan', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoSimulation(page);
  });

  test('01. Memeriksa Struktur Babak Kompetisi (Penyisihan, Semifinal, Final)', async ({ page }) => {
    // Masuk ke Manajemen Babak
    await page.getByRole('button', { name: /Manajemen Babak/i }).click();
    await expect(page.getByText(/Manajemen Babak Musabaqah/i)).toBeVisible();

    // Verifikasi babak-babak resmi MTQ
    await expect(page.getByText(/Penyisihan/i).first()).toBeVisible();
    await expect(page.getByText(/Semifinal/i).first()).toBeVisible();
    await expect(page.getByText(/Final/i).first()).toBeVisible();

    // Verifikasi indikator kuota dan status babak
    await expect(page.getByText(/Kuota Melaju/i).first()).toBeVisible();
  });

  test('02. Memeriksa Modul Pengumuman Hasil Kelulusan & Penetapan Peringkat', async ({ page }) => {
    // Masuk ke Hasil Kelulusan
    await page.getByRole('button', { name: 'Hasil & Kelulusan', exact: true }).first().click();
    await expect(page.getByText(/Hasil Babak & Kelulusan/i).first()).toBeVisible();

    // Verifikasi filter babak
    await expect(page.getByRole('combobox').first()).toBeVisible();

    // Verifikasi tabel peringkat kualifikasi peserta
    await expect(page.getByText(/Peringkat & Kualifikasi Peserta/i).first()).toBeVisible();
  });
});
