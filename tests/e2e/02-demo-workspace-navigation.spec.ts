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
    await expect(page.getByText('Mode Demo', { exact: true }).first()).toBeVisible();
  });

  test('02. Navigasi Melalui Seluruh Modul Operasional MTQ', async ({ page }) => {
    // 1. Dashboard Ringkasan
    await expect(page.getByText(/Peserta Terdaftar/i).first()).toBeVisible();
    await expect(page.getByText(/Grup \/ Kafilah/i).first()).toBeVisible();
    await expect(page.getByText(/Dewan Hakim/i).first()).toBeVisible();

    // 2. Navigasi ke Grup & Peserta
    await page.getByRole('button', { name: /Grup & Peserta/i }).first().click();
    await expect(page.getByText(/& Peserta MTQ/i).first()).toBeVisible();

    // 3. Navigasi ke Bank Soal & Maqra
    await page.getByRole('button', { name: /Bank Soal & Maqra/i }).first().click();
    await expect(page.getByText(/Bank Soal & Maqra Tilawah/i).first()).toBeVisible();

    // 4. Navigasi ke Master Data & Rubrik
    await page.getByRole('button', { name: /Master Data & Rubrik/i }).first().click();
    await expect(page.getByText(/Master Data & Konfigurasi Kompetisi/i).first()).toBeVisible();

    // 5. Navigasi ke Monitoring Penilaian
    await page.getByRole('button', { name: /Monitoring Penilaian/i }).first().click();
    await expect(page.getByText(/Monitoring Penilaian Dewan Hakim/i).first()).toBeVisible();

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
    await expect(page.getByText(/Mode Demo · Pilih Peran/i)).toBeVisible();

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

  test('04. Verifikasi Fitur PWA: Manifest, Menu Instal Aplikasi, dan Indikator Offline Header', async ({ page, context }) => {
    // 1. Verifikasi meta tag PWA & link apple-touch-icon di <head>
    const themeColor = await page.locator('meta[name="theme-color"]').getAttribute('content');
    expect(themeColor).toBe('#065f46');
    const appleCapable = await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content');
    expect(appleCapable).toBe('yes');
    const appleTouchHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(appleTouchHref).toContain('apple-touch-icon.png');

    // 2. Buka menu pengguna di footer sidebar dan verifikasi tombol "Instal Aplikasi"
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    const installBtn = page.getByTestId('pwa-install-btn');
    await expect(installBtn).toBeVisible();
    await expect(installBtn).toContainText('Instal Aplikasi');

    // Klik "Instal Aplikasi" untuk membuka petunjuk instalasi iOS/Browser
    await installBtn.click();
    await expect(page.getByTestId('pwa-ios-guide')).toBeVisible();
    await expect(page.getByText(/Tambahkan ke Layar Utama/i)).toBeVisible();

    // Tutup modal menu pengguna
    await page.getByRole('button', { name: 'Tutup', exact: true }).click();

    // 3. Simulasikan koneksi terputus (offline) dan verifikasi badge Offline di TopHeader
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    const offlineBadge = page.getByTestId('header-offline-badge');
    await expect(offlineBadge).toBeVisible();
    await expect(offlineBadge).toContainText(/Offline/i);
    await expect(offlineBadge).toContainText(/menunggu sinkron/i);

    // Kembalikan ke status online
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(offlineBadge).toBeHidden();
  });

  test('05. Superadmin: Menu SEO dan Meta Situs, Konfigurasi Favicon, Pratinjau Tab, Dialog Konfirmasi noindex, dan Audit Log', async ({ page }) => {
    // Beralih ke akun Superadmin
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    await page.getByText(/Nasaruddin/i).first().click();
    await expect(page.getByText(/Dashboard Superadmin MTQ Digital/i).first()).toBeVisible();

    // Klik menu "SEO dan Meta Situs" di sidebar Superadmin
    await page.getByRole('button', { name: 'SEO dan Meta Situs', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /SEO dan Meta Situs/i })).toBeVisible();

    // Verifikasi document.title menggunakan title_template
    await expect(page).toHaveTitle(/SEO dan Meta Situs — Manajemen MTQ/i);

    // Favicon: hanya URL (tanpa unggah berkas) + pratinjau tab
    await expect(page.getByTestId('seo-favicon-section')).toBeVisible();
    const faviconInput = page.getByTestId('seo-input-favicon');
    await expect(faviconInput).toBeVisible();
    await expect(page.getByTestId('seo-favicon-preview-img')).toBeVisible();
    await faviconInput.fill('/icon.svg');

    // Judul bawaan + penghitung karakter
    await page.getByTestId('seo-input-default-title').fill('MTQ Nasional Digital 2026 — LPTQ Resmi');
    await expect(page.getByTestId('seo-title-counter')).toContainText('38 / 70 karakter');

    // Pratinjau tautan landing page bersifat statis (index.html) dan hanya-baca
    await expect(page.getByTestId('seo-landing-preview')).toContainText(/tidak bisa diubah dari dashboard/i);

    // Simpan
    await page.getByTestId('seo-save-btn').click();
    await expect(page.getByTestId('seo-form-success')).toContainText(/berhasil diperbarui/i);

    // Periksa tercatat di Audit Log Platform
    await page.getByRole('button', { name: /Audit Log Platform/i }).first().click();
    await expect(page.getByText('SITE_SETTINGS_UPDATED').first()).toBeVisible();
  });

  test('06. Superadmin: Halaman Khusus Kesehatan Sistem (Health Check), Ringkasan Status, Accordion 9 Pemeriksaan, Checklist Manual, dan Periksa Ulang', async ({ page }) => {
    // Beralih ke akun Superadmin
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    await page.getByText(/Nasaruddin/i).first().click();
    await expect(page.getByText(/Dashboard Superadmin MTQ Digital/i).first()).toBeVisible();

    // Verifikasi bahwa health dashboard tidak ditaruh di dashboard, tetapi memiliki tombol tautan ke halaman khusus
    await expect(page.getByRole('button', { name: /Buka Kesehatan Sistem/i })).toBeVisible();

    // Navigasi ke halaman khusus Kesehatan Sistem melalui menu sidebar
    await page.getByRole('button', { name: 'Kesehatan Sistem (Health Check)', exact: true }).first().click();
    await expect(page.getByRole('heading', { name: /Kesehatan Sistem \(Health Check\)/i })).toBeVisible();

    // Verifikasi seksi Health Dashboard tampil beserta waktu WIB dan 3 kartu ringkasan
    const healthSection = page.getByTestId('platform-health-dashboard');
    await expect(healthSection).toBeVisible();
    await expect(page.getByTestId('health-last-checked')).toContainText('WIB');
    await expect(page.getByTestId('health-summary-critical')).toBeVisible();
    await expect(page.getByTestId('health-summary-warning')).toBeVisible();
    await expect(page.getByTestId('health-summary-ok')).toBeVisible();

    // Buka salah satu accordion pemeriksaan (schema_version) & periksa riwayat versi 20261118
    await page.getByTestId('health-toggle-schema_version').click();
    const schemaDetail = page.getByTestId('health-detail-schema_version');
    await expect(schemaDetail).toBeVisible();
    await expect(schemaDetail).toContainText('20261118');

    // Klik salah satu pemeriksaan manual & verifikasi tersimpan
    const manualSignupCheckbox = page.getByTestId('manual-check-self_signup_disabled');
    await expect(manualSignupCheckbox).toBeVisible();
    await manualSignupCheckbox.check();
    await expect(manualSignupCheckbox).toBeChecked();

    // Klik tombol "Periksa Ulang"
    await page.getByTestId('health-recheck-btn').click();
    await expect(page.getByTestId('health-last-checked')).toContainText('WIB');
  });

  test('07. Superadmin: Isolasi Menu Tenant dan Jalur Masuk Supervisi Terkendali dengan Alasan', async ({ page }) => {
    // Beralih ke akun Superadmin
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    await page.getByText(/Nasaruddin/i).first().click();
    await expect(page.getByText(/Dashboard Superadmin MTQ Digital/i).first()).toBeVisible();

    // Verifikasi secara default menu operasional tenant TIDAK muncul di sidebar
    const sidebarNav = page.getByRole('navigation', { name: 'Menu Utama' });
    await expect(sidebarNav.getByRole('button', { name: 'Dashboard Platform' })).toBeVisible();
    await expect(sidebarNav.getByRole('button', { name: 'Kesehatan Sistem (Health Check)' })).toBeVisible();
    await expect(sidebarNav.getByRole('button', { name: 'SEO dan Meta Situs' })).toBeVisible();
    await expect(sidebarNav.getByRole('button', { name: 'Konten Situs' })).toBeVisible();
    await sidebarNav.getByRole('button', { name: 'Konten Situs' }).click();
    await expect(page.getByRole('heading', { name: 'Konten Situs' })).toBeVisible();
    await expect(page.getByText(/Mode Demo: Anda dapat melihat editor/i)).toBeVisible();
    await page.getByRole('button', { name: /Bagian Utama \(Hero\)/i }).isVisible();
    await page.getByRole('tab', { name: /Halaman/i }).or(page.getByRole('button', { name: /^Halaman$/ })).first().click();
    await expect(page.getByRole('button', { name: /Kebijakan Privasi/i }).first()).toBeVisible();
    await sidebarNav.getByRole('button', { name: 'Dashboard Platform' }).click();
    await expect(page.getByRole('button', { name: 'Master Data & Rubrik' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Bank Soal & Maqra' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Grup & Peserta' })).toHaveCount(0);

    // Buka daftar Penyelenggara MTQ lalu masuk workspace salah satu penyelenggara dalam mode supervisi
    await sidebarNav.getByRole('button', { name: /Penyelenggara MTQ/i }).click();
    await page.getByRole('button', { name: /Buka Workspace/i }).first().click();
    await expect(page.getByText(/Konfirmasi Masuk Mode Supervisi Workspace/i)).toBeVisible();

    // Alasan supervisi wajib diisi sebelum tombol masuk aktif
    const masukBtn = page.getByRole('button', { name: /Masuk Mode Supervisi/i });
    const reasonInput = page.getByPlaceholder(/Audit operasional/i);
    await reasonInput.fill('');
    await expect(masukBtn).toBeDisabled();
    await reasonInput.fill('Audit operasional pengujian otomatis');
    await masukBtn.click();

    // Verifikasi banner supervisi aktif dan menu operasional tenant muncul
    await expect(page.getByText(/Supervisi Aktif/i).first()).toBeVisible();
    await expect(sidebarNav.getByRole('button', { name: 'Master Data & Rubrik' })).toBeVisible();

    // Keluar dari mode supervisi dan kembali ke platform
    await page.getByRole('button', { name: /Kembali ke Panel Platform/i }).first().click();
    await expect(sidebarNav.getByRole('button', { name: 'Dashboard Platform' })).toBeVisible();
    await expect(sidebarNav.getByRole('button', { name: 'Master Data & Rubrik' })).toHaveCount(0);
  });
});


