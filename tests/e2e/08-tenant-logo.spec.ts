import { test, expect } from '@playwright/test';
import { enterDemoSimulation } from './helpers/auth';

/** PNG 1×1 piksel untuk uji unggah logo */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

test.describe('E2E: Logo Penyelenggara di Form Superadmin', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoSimulation(page);
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    await page.getByText(/Nasaruddin/i).first().click();
    await expect(page.getByText(/Dashboard Superadmin MTQ Digital/i).first()).toBeVisible();
    await page.getByRole('button', { name: /Manajemen MTQ/i }).first().click();
    await expect(page.getByText(/Manajemen Penyelenggara MTQ/i).first()).toBeVisible();
  });

  test('01. Unggah logo, ganti ke tautan, validasi https, lalu simpan', async ({ page }) => {
    await page.getByTitle('Edit MTQ').first().click();
    await expect(page.getByText('Edit Data Penyelenggara MTQ')).toBeVisible();
    const preview = page.getByTestId('tenant-logo-preview');
    await expect(preview).toContainText('Belum ada logo');

    // Unggah: gambar diperkecil di peramban dan langsung tampil di pratinjau
    await page.getByTestId('tenant-logo-file').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_1PX });
    await expect(preview.locator('img')).toHaveAttribute('src', /^data:image\/(webp|png);base64,/);

    // Tautan: http ditolak, https diterima
    await page.getByRole('tab', { name: /Tautan/ }).click();
    const link = page.getByLabel('Tautan logo');
    await link.fill('http://contoh.id/logo.png');
    await expect(page.getByText('Tautan logo harus diawali https://')).toBeVisible();
    await page.getByRole('button', { name: 'Simpan Penyelenggara' }).click();
    await expect(page.getByText('Edit Data Penyelenggara MTQ')).toBeVisible();

    await link.fill('https://contoh.id/logo.png');
    await expect(preview.locator('img, span').first()).toBeVisible();
    await page.getByRole('button', { name: 'Simpan Penyelenggara' }).click();
    await expect(page.getByText('Edit Data Penyelenggara MTQ')).toHaveCount(0);

    // Dibuka lagi: tautan tersimpan, lalu bisa dihapus
    await page.getByTitle('Edit MTQ').first().click();
    await expect(page.getByLabel('Tautan logo')).toHaveValue('https://contoh.id/logo.png');
    await page.getByRole('button', { name: /Hapus logo/ }).click();
    await expect(preview).toContainText('Belum ada logo');
  });
});
