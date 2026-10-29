import { test, expect } from '@playwright/test';
import { enterDemoSimulation } from './helpers/auth';

test.describe('E2E: Manajemen Pengguna, Input Kata Sandi Baru & Pemetaan Akun Global', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoSimulation(page);
  });

  test('01. Modal Tambah Pengguna Admin MTQ Menyediakan Input Kata Sandi Awal', async ({ page }) => {
    // Masuk ke menu Pengguna & Hakim
    await page.getByRole('button', { name: /Pengguna & Hakim/i }).click();
    await expect(page.getByText(/Manajemen Pengguna & Dewan Hakim/i)).toBeVisible();

    // Klik tombol Tambah Pengguna / Hakim
    await page.getByRole('button', { name: /Tambah Pengguna \/ Hakim/i }).click();

    // Verifikasi modal terbuka
    await expect(page.getByText(/Tambah Pengguna Baru/i)).toBeVisible();

    // Verifikasi kolom Kata Sandi Awal (Minimal 8 Karakter) tersedia
    const passwordLabel = page.getByText(/Kata Sandi Awal \(Minimal 8 Karakter\)/i);
    await expect(passwordLabel).toBeVisible();

    const passwordInput = page.getByPlaceholder(/Isi kata sandi untuk langsung membuat akun login/i);
    await expect(passwordInput).toBeVisible();

    // Verifikasi petunjuk pendaftaran langsung tanpa logout sesi aktif
    await expect(
      page.getByText(/Jika diisi, sistem akan langsung mendaftarkan akun di auth\.users dan public\.profiles/i)
    ).toBeVisible();

    // Tutup modal
    await page.getByRole('button', { name: /Batal/i }).click();
    await expect(page.getByText(/Tambah Pengguna Baru/i)).not.toBeVisible();
  });

  test('02. Manajemen Akun Global Superadmin: Filter Akun Belum Ditugaskan & Input Kata Sandi', async ({ page }) => {
    // Buka switcher persona demo di footer sidebar
    await page.getByRole('button', { name: /Ganti/i }).click();
    await expect(page.getByText(/Mode Simulasi Demo Lokal & Persona Evaluasi/i)).toBeVisible();

    // Pilih persona Superadmin
    const superadminPersonaBtn = page.getByText(/Prof\. Dr\. H\. Nasaruddin/i).first();
    await superadminPersonaBtn.click();
    await expect(page.getByText(/Dashboard Superadmin MTQ Digital/i)).toBeVisible();

    // Masuk ke Manajemen Akun
    await page.getByRole('button', { name: /Manajemen Akun/i }).click();
    await expect(page.getByText(/Manajemen Akun Global/i)).toBeVisible();
    await expect(page.getByText(/Superadmin Platform/i).first()).toBeVisible();

    // Verifikasi dropdown filter tenant mencakup "Belum Ditugaskan (Tabel Profiles)"
    const tenantFilter = page.locator('select').nth(1);
    await expect(tenantFilter).toContainText(/Belum Ditugaskan \(Tabel Profiles\)/i);

    // Buka modal Tambah Akun Baru
    await page.getByRole('button', { name: /Tambah Akun Baru/i }).click();
    await expect(page.getByText(/Tambah Akun Global/i)).toBeVisible();

    // Verifikasi kolom kata sandi awal tersedia
    await expect(page.getByText(/Kata Sandi Awal \(Minimal 8 Karakter\)/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Isi kata sandi untuk langsung membuat akun login/i)).toBeVisible();

    // Tutup modal
    await page.getByRole('button', { name: /Batal/i }).click();
    await expect(page.getByText(/Tambah Akun Global/i)).not.toBeVisible();
  });

  test('03. Validasi Kata Sandi Pendek (< 8 Karakter) Menampilkan Peringatan', async ({ page }) => {
    // Masuk ke Manajemen Pengguna
    await page.getByRole('button', { name: /Pengguna & Hakim/i }).click();
    await page.getByRole('button', { name: /Tambah Pengguna \/ Hakim/i }).click();

    // Isi nama, username, email, dan password pendek
    await page.getByPlaceholder('KH. Ahmad Dahlan, M.Ag').fill('Ustadz Penguji');
    await page.getByPlaceholder('hakim_dahlan').fill('ustadz_penguji');
    await page.getByPlaceholder('hakim@mtq.id').fill('penguji@mtq.id');
    const passInput = page.getByPlaceholder(/Isi kata sandi untuk langsung membuat akun login/i);
    await passInput.fill('12345');

    // Submit form (spesifik tombol submit di modal)
    await page.getByRole('button', { name: 'Tambah Pengguna', exact: true }).click();

    // Verifikasi validasi HTML5 minlength aktif
    const isInvalid = await passInput.evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isInvalid).toBe(true);
  });
});
