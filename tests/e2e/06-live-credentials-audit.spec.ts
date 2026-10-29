import { test, expect } from '@playwright/test';
import { clearStorageAndOpenGate } from './helpers/auth';

test.describe('Audit Live Backend & UI Multi-Peran (Supabase Live Mode)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to ensure clean fail-closed authentication gate
    await clearStorageAndOpenGate(page);
    await expect(page.getByText('Sistem Manajemen & Penilaian MTQ')).toBeVisible();
    await expect(page.getByText('Gerbang Keamanan Produksi MTQ (Fail-Closed)')).toBeVisible();
  });

  test('01. Live Super Admin (jabdtech2025@gmail.com) - Login, Platform Dashboard, MTQ & Akun Global', async ({ page }) => {
    // 1. Input Super Admin credentials
    const emailInput = page.getByPlaceholder('nama@instansi.mtq.id');
    const passInput = page.getByPlaceholder('Masukkan kata sandi Supabase Auth');
    const submitBtn = page.getByRole('button', { name: /Masuk ke Workspace Produksi/i });

    await emailInput.fill('jabdtech2025@gmail.com');
    await passInput.fill('password123');
    await submitBtn.click();

    // 2. Validate successful entry to Superadmin Platform
    await expect(page.getByText(/Dashboard Platform/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Superadmin/i).first()).toBeVisible();

    // 3. Check navigation to Manajemen MTQ (tenants from live Supabase)
    const manajemenMtqBtn = page.getByRole('button', { name: /Manajemen MTQ/i }).first();
    await manajemenMtqBtn.click();
    await expect(page.getByText(/Manajemen Penyelenggara MTQ/i).first()).toBeVisible();
    await expect(page.getByText(/LPTQ Provinsi Jawa Barat/i).first()).toBeVisible();

    // 4. Check navigation to Manajemen Akun Global (from profiles table)
    const manajemenAkunBtn = page.getByRole('button', { name: /Manajemen Akun/i }).first();
    await manajemenAkunBtn.click();
    await expect(page.getByText(/Manajemen Akun Global/i).first()).toBeVisible();
    await expect(page.getByText(/jabdtech2025@gmail.com/i).first()).toBeVisible();
    await expect(page.getByText(/jabdrise@gmail.com/i).first()).toBeVisible();
    await expect(page.getByText(/assuddy005@gmail.com/i).first()).toBeVisible();

    // 5. Check navigation to Audit Log Platform
    const auditBtn = page.getByRole('button', { name: /Audit Log Platform/i }).first();
    await auditBtn.click();
    await expect(page.getByText(/Audit Log Platform Global/i).first()).toBeVisible();

    // 6. Sign out via modal
    await page.getByText(/Ganti/i).first().click();
    await expect(page.getByText(/Sesi Autentikasi & Keamanan Supabase/i)).toBeVisible();
    await page.getByRole('button', { name: /Keluar/i }).first().click();
    await expect(page.getByText('Gerbang Keamanan Produksi MTQ (Fail-Closed)')).toBeVisible({ timeout: 10000 });
  });

  test('02. Live Admin MTQ (jabdrise@gmail.com) - Login, Workspace Jawa Barat, CRUD & Monitoring', async ({ page }) => {
    // 1. Input Admin MTQ credentials
    const emailInput = page.getByPlaceholder('nama@instansi.mtq.id');
    const passInput = page.getByPlaceholder('Masukkan kata sandi Supabase Auth');
    const submitBtn = page.getByRole('button', { name: /Masuk ke Workspace Produksi/i });

    await emailInput.fill('jabdrise@gmail.com');
    await passInput.fill('password123');
    await submitBtn.click();

    // 2. Validate tenant workspace loading
    await expect(page.getByText(/LPTQ Provinsi Jawa Barat/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Jundi Abdullah/i).first()).toBeVisible();
    await expect(page.getByText(/Admin MTQ/i).first()).toBeVisible();

    // 3. Navigate through key Admin views
    // A. Grup & Peserta
    await page.getByRole('button', { name: /Grup & Peserta/i }).first().click();
    await expect(page.getByText(/Grup & Peserta MTQ/i).first()).toBeVisible();
    await expect(page.getByText(/Kota Bandung/i).first()).toBeVisible();
    
    // Klik Lihat Detail untuk melihat peserta Kota Bandung
    await page.getByRole('button', { name: /Lihat Detail/i }).first().click();
    await expect(page.getByText(/Muhammad Hammam/i).first()).toBeVisible();
    // Tutup drawer/modal peserta
    await page.getByRole('button', { name: 'Tutup' }).click();

    // B. Bank Soal & Maqra
    await page.getByRole('button', { name: /Bank Soal & Maqra/i }).first().click();
    await expect(page.getByText(/Bank Soal & Maqra Tilawah/i).first()).toBeVisible();

    // C. Master Data & Rubrik
    await page.getByRole('button', { name: /Master Data & Rubrik/i }).first().click();
    await expect(page.getByText(/Master Data & Konfigurasi Kompetisi/i).first()).toBeVisible();

    // D. Monitoring Penilaian
    await page.getByRole('button', { name: /Monitoring Penilaian/i }).first().click();
    await expect(page.getByText(/Mode Pemantauan Penilaian Dewan Hakim/i).first()).toBeVisible();

    // E. Rekap Nilai Real-Time
    await page.getByRole('button', { name: /Rekap Nilai Real-Time/i }).first().click();
    await expect(page.getByText(/Rekap Nilai Real-Time/i).first()).toBeVisible();

    // F. Manajemen Babak
    await page.getByRole('button', { name: /Manajemen Babak/i }).first().click();
    await expect(page.getByText(/Manajemen Babak Musabaqah/i).first()).toBeVisible();

    // G. Hasil & Kelulusan
    await page.getByRole('button', { name: /Hasil & Kelulusan/i }).first().click();
    await expect(page.getByText(/Hasil Babak & Kelulusan/i).first()).toBeVisible();

    // 4. Sign out
    await page.getByText(/Ganti/i).first().click();
    await page.getByRole('button', { name: /Keluar/i }).first().click();
    await expect(page.getByText('Gerbang Keamanan Produksi MTQ (Fail-Closed)')).toBeVisible({ timeout: 10000 });
  });

  test('03. Live Hakim (assuddy005@gmail.com) - Login, Penilaian, Bidang Tajwid & Rekap', async ({ page }) => {
    // 1. Input Hakim credentials
    const emailInput = page.getByPlaceholder('nama@instansi.mtq.id');
    const passInput = page.getByPlaceholder('Masukkan kata sandi Supabase Auth');
    const submitBtn = page.getByRole('button', { name: /Masuk ke Workspace Produksi/i });

    await emailInput.fill('assuddy005@gmail.com');
    await passInput.fill('password123');
    await submitBtn.click();

    // 2. Validate Hakim authentication and workspace
    await expect(page.getByText(/Al-Ustadz Abu Ismail Arif/i).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Dewan Hakim|Hakim/i).first()).toBeVisible();

    // 3. Verify Hakim navigation options in Sidebar
    await expect(page.getByRole('button', { name: /Peserta Saya/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Penilaian Mushaf/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Rekap \/ Riwayat Nilai/i }).first()).toBeVisible();

    // 4. Check Peserta Saya view
    await page.getByRole('button', { name: /Peserta Saya/i }).first().click();
    await expect(page.getByText(/Daftar Penugasan Penilaian Peserta/i).first()).toBeVisible();
    await expect(page.getByText(/Muhammad Hammam/i).first()).toBeVisible();

    // 5. Check Rekap / Riwayat Nilai
    await page.getByRole('button', { name: /Rekap \/ Riwayat Nilai/i }).first().click();
    await expect(page.getByText(/Rekap Nilai Real-Time/i).first()).toBeVisible();

    // 6. Sign out
    await page.getByText(/Ganti/i).first().click();
    await page.getByRole('button', { name: /Keluar/i }).first().click();
    await expect(page.getByText('Gerbang Keamanan Produksi MTQ (Fail-Closed)')).toBeVisible({ timeout: 10000 });
  });
});
