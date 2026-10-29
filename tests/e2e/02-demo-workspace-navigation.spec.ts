import { test, expect } from '@playwright/test';
import { enterDemoSimulation } from './helpers/auth';

test.describe('E2E: Navigasi Workspace Demo Lokal & Antarmuka Responsif', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoSimulation(page);
  });

  test('01. Memuat Header dan Indikator Mode Simulasi Demo Terisolasi', async ({ page }) => {
    // Verifikasi nama tenant aktif di TopHeader
    await expect(page.getByText(/LPTQ Provinsi Jawa Barat/i).first()).toBeVisible();

    // Verifikasi badge identitas pengguna aktif (Admin default demo)
    await expect(page.getByText(/H\. Rachmat Hidayat/i).first()).toBeVisible();

    // Verifikasi indikator isolasi mode demo
    await expect(page.getByText(/Mode Simulasi/i).first()).toBeVisible();
  });

  test('02. Navigasi Melalui Seluruh Modul Operasional MTQ', async ({ page }) => {
    // 1. Dashboard Ringkasan
    await expect(page.getByText(/Peserta Terdaftar/i).first()).toBeVisible();
    await expect(page.getByText(/Grup \/ Kafilah/i).first()).toBeVisible();
    await expect(page.getByText(/Dewan Hakim/i).first()).toBeVisible();

    // 2. Navigasi ke Grup & Peserta
    await page.getByRole('button', { name: /Grup & Peserta/i }).first().click();
    await expect(page.getByText(/Grup & Peserta MTQ/i).first()).toBeVisible();

    // 3. Navigasi ke Bank Soal & Maqra
    await page.getByRole('button', { name: /Bank Soal & Maqra/i }).first().click();
    await expect(page.getByText(/Bank Soal & Maqra Tilawah/i).first()).toBeVisible();

    // 4. Navigasi ke Master Data & Rubrik
    await page.getByRole('button', { name: /Master Data & Rubrik/i }).first().click();
    await expect(page.getByText(/Master Data & Konfigurasi Kompetisi/i).first()).toBeVisible();

    // 5. Navigasi ke Monitoring Penilaian
    await page.getByRole('button', { name: /Monitoring Penilaian/i }).first().click();
    await expect(page.getByText(/Mode Pemantauan Penilaian Dewan Hakim/i).first()).toBeVisible();

    // 6. Navigasi ke Rekap Nilai Real-Time
    await page.getByRole('button', { name: /Rekap Nilai Real-Time/i }).first().click();
    await expect(page.getByText(/Rekap Nilai Real-Time/i).first()).toBeVisible();

    // 7. Navigasi ke Manajemen Babak
    await page.getByRole('button', { name: /Manajemen Babak/i }).first().click();
    await expect(page.getByText(/Manajemen Babak Musabaqah/i).first()).toBeVisible();

    // 8. Navigasi ke Hasil & Kelulusan
    await page.getByRole('button', { name: /Hasil & Kelulusan/i }).first().click();
    await expect(page.getByText(/Hasil Babak & Kelulusan/i).first()).toBeVisible();
  });

  test('03. Akses Workspace Superadmin Platform dan Kembali ke Tenant', async ({ page }) => {
    // Buka modal ganti persona demo di footer sidebar
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    await expect(page.getByText(/Mode Simulasi Demo Lokal & Persona Evaluasi/i)).toBeVisible();

    // Pilih persona Superadmin
    const superadminPersonaBtn = page.getByText(/Nasaruddin/i).first();
    await superadminPersonaBtn.click();

    // Verifikasi masuk ke dashboard Superadmin
    await expect(page.getByText(/Dashboard Superadmin MTQ Digital/i).first()).toBeVisible();

    // Navigasi ke Manajemen MTQ (Tenant)
    await page.getByRole('button', { name: /Manajemen MTQ/i }).first().click();
    await expect(page.getByText(/Manajemen Penyelenggara MTQ/i).first()).toBeVisible();

    // Kembali masuk ke workspace tenant Jawa Barat
    const enterTenantBtn = page.getByRole('button', { name: /Buka Workspace/i }).first();
    await enterTenantBtn.click();

    // Verifikasi kembali ke workspace operasional tenant
    await expect(page.getByText(/LPTQ Provinsi Jawa Barat/i).first()).toBeVisible();
  });
});
