import { test, expect } from '@playwright/test';
import { clearStorageAndOpenGate } from './helpers/auth';

test.describe('E2E: Gerbang Autentikasi Produksi & Fitur Sign-Up Pengguna Baru', () => {
  test.beforeEach(async ({ page }) => {
    await clearStorageAndOpenGate(page);
  });

  test('01. Menampilkan Gerbang Keamanan Fail-Closed & Status Koneksi Supabase', async ({ page }) => {
    // Verifikasi branding dan judul sistem
    await expect(page.getByText('Sistem Manajemen & Penilaian MTQ')).toBeVisible();
    await expect(page.getByText(/Gerbang Keamanan Produksi MTQ/i)).toBeVisible();
    await expect(page.getByText(/Status Koneksi Supabase/i)).toBeVisible();

    // Verifikasi tombol pengecekan koneksi
    const checkConnBtn = page.getByRole('button', { name: /Cek Koneksi/i });
    await expect(checkConnBtn).toBeVisible();

    // Verifikasi area simulasi demo lokal tetap tersedia sebagai escape hatch resmi
    await expect(page.getByText(/Evaluasi Tanpa Akun Database\?/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Mode Simulasi Lokal/i })).toBeVisible();
  });

  test('02. Beralih Antara Tab "Masuk (Login)" dan "Daftar Akun Baru (Sign Up)"', async ({ page }) => {
    const loginTab = page.getByRole('button', { name: /Masuk \(Login\)/i });
    const signUpTab = page.getByRole('button', { name: /Daftar Akun Baru/i });

    // Kondisi awal: Tab Login aktif
    await expect(loginTab).toBeVisible();
    await expect(signUpTab).toBeVisible();
    await expect(page.getByRole('button', { name: /Masuk ke Workspace Produksi/i })).toBeVisible();

    // Klik tab Daftar Akun Baru
    await signUpTab.click();
    await expect(page.getByText(/Pendaftaran akan membuat akun autentikasi resmi di/i)).toBeVisible();
    await expect(page.getByPlaceholder('Contoh: H. Ahmad Fauzi, M.Ag')).toBeVisible();
    await expect(page.getByPlaceholder('Minimal 8 karakter')).toBeVisible();
    await expect(page.getByPlaceholder('Ulangi kata sandi')).toBeVisible();
    await expect(page.getByRole('button', { name: /Daftarkan Akun Baru/i })).toBeVisible();

    // Klik kembali ke tab Masuk
    await loginTab.click();
    await expect(page.getByRole('button', { name: /Masuk ke Workspace Produksi/i })).toBeVisible();
  });

  test('03. Validasi Form Sign-Up: Kata Sandi Kurang dari 8 Karakter & Konfirmasi Tidak Cocok', async ({ page }) => {
    // Beralih ke Sign-Up
    await page.getByRole('button', { name: /Daftar Akun Baru/i }).click();

    const nameInput = page.getByPlaceholder('Contoh: H. Ahmad Fauzi, M.Ag');
    const emailInput = page.getByPlaceholder('nama@instansi.mtq.id');
    const passwordInput = page.getByPlaceholder('Minimal 8 karakter');
    const confirmInput = page.getByPlaceholder('Ulangi kata sandi');
    const submitBtn = page.getByRole('button', { name: /Daftarkan Akun Baru/i });

    // Isi nama dan email valid, tetapi password pendek (< 8)
    await nameInput.fill('Ust. Fajar Ramadhan');
    await emailInput.fill('fajar@jabar.mtq.id');
    await passwordInput.fill('12345');
    await confirmInput.fill('12345');

    // HTML5 minlength validation mencegah submit atau menampilkan error
    await submitBtn.click();
    const isPasswordInvalid = await passwordInput.evaluate((el: HTMLInputElement) => !el.checkValidity());
    expect(isPasswordInvalid).toBe(true);

    // Sekarang isi kata sandi >= 8 tapi konfirmasi berbeda
    await passwordInput.fill('Password123!');
    await confirmInput.fill('PasswordLain!');
    await submitBtn.click();

    // Verifikasi pesan error feedback
    await expect(page.getByText(/Konfirmasi kata sandi tidak cocok/i)).toBeVisible();
  });

  test('04. Alur "Lupa Kata Sandi?" dan Kembali ke Form Login', async ({ page }) => {
    // Klik "Lupa Kata Sandi?"
    await page.getByRole('button', { name: /Lupa Kata Sandi\?/i }).click();

    // Form reset kata sandi muncul
    await expect(page.getByText(/Kirim Tautan Pemulihan Kata Sandi/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Kirim Tautan Reset/i })).toBeVisible();

    // Klik "Kembali Login"
    await page.getByRole('button', { name: /Kembali Login/i }).click();
    await expect(page.getByRole('button', { name: /Masuk ke Workspace Produksi/i })).toBeVisible();
  });
});
