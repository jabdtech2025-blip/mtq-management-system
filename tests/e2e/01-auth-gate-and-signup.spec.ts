import { test, expect } from '@playwright/test';
import { clearStorageAndOpenGate } from './helpers/auth';

// Form login hanya tampil bila VITE_SUPABASE_URL/ANON_KEY terpasang. Set E2E_SUPABASE_CONFIGURED=true
// saat menjalankan E2E terhadap build yang tersambung ke Supabase agar tes form login ikut dijalankan.
const SUPABASE_CONFIGURED = process.env.E2E_SUPABASE_CONFIGURED === 'true';

test.describe('E2E: Gerbang Akses (Pendaftaran Mandiri Ditutup)', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndOpenGate(page);
  });

  test('01. Menampilkan Gerbang Akses Bersih dengan Bahasa Operasional & Tombol Mode Demo', async ({ page }) => {
    await expect(page.getByText('Sistem Manajemen & Penilaian MTQ')).toBeVisible();
    await expect(page.getByText(/Akses Terbatas Panitia & Dewan Hakim/i)).toBeVisible();
    await expect(page.getByText(/Masuk dengan akun yang diberikan panitia penyelenggara/i)).toBeVisible();

    // Tidak ada istilah teknis atau status koneksi database di layar login
    await expect(page.getByText(/Fail-Closed/i)).toHaveCount(0);
    await expect(page.getByText(/Status Koneksi Supabase/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Cek Koneksi/i })).toHaveCount(0);

    await expect(page.getByRole('button', { name: /Coba Mode Demo/i })).toBeVisible();
  });

  test('02. Pendaftaran Akun Mandiri Tidak Tersedia', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Daftar Akun Baru/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Daftarkan Akun Baru/i })).toHaveCount(0);
    await expect(page.getByPlaceholder('Ulangi kata sandi')).toHaveCount(0);
  });

  test('03. Alur "Lupa Kata Sandi?" dan Kembali ke Form Login', async ({ page }) => {
    test.skip(!SUPABASE_CONFIGURED, 'Form login hanya tampil saat Supabase dikonfigurasi (E2E_SUPABASE_CONFIGURED=true).');

    await page.getByRole('button', { name: /Lupa Kata Sandi\?/i }).click();
    await expect(page.getByText(/Kirim Tautan Pemulihan Kata Sandi/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Kirim Tautan Reset/i })).toBeVisible();

    await page.getByRole('button', { name: /Kembali Login/i }).click();
    await expect(page.getByRole('button', { name: /Lupa Kata Sandi\?/i })).toBeVisible();
  });
});
