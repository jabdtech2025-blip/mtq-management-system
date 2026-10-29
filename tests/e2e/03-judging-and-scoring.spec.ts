import { test, expect } from '@playwright/test';
import { enterDemoSimulation } from './helpers/auth';

test.describe('E2E: Lembar Penilaian Dewan Hakim, Dual Panel & Anotasi Mushaf', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoSimulation(page);
  });

  test('01. Membuka Daftar Peserta Penilaian dan Memilih Dewan Hakim', async ({ page }) => {
    // Navigasi ke modul Penilaian Dewan Hakim
    await page.getByRole('button', { name: /Monitoring Penilaian/i }).first().click();
    await expect(page.getByText(/Mode Pemantauan Penilaian Dewan Hakim/i).first()).toBeVisible();

    // Verifikasi statistik penugasan penilaian
    await expect(page.getByText(/Total Ditugaskan/i).first()).toBeVisible();

    // Verifikasi tombol buka penilaian untuk peserta
    const openScoringBtns = page.getByRole('button', { name: /Mulai Menilai|Lanjut Menilai|Lihat Lembar/i });
    await expect(openScoringBtns.first()).toBeVisible();
  });

  test('02. Antarmuka Dual Panel: Mushaf Digital & Lembar Penilaian Hakim', async ({ page }) => {
    // Beralih ke persona Dewan Hakim untuk menguji fitur anotasi interaktif
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    const judgeBtn = page.locator('button:has-text("KH. Ahmad Dahlan")').first();
    await judgeBtn.scrollIntoViewIfNeeded();
    await judgeBtn.click({ force: true });

    // Verifikasi berada di halaman Penilaian Hakim
    await expect(page.getByText(/Daftar Penugasan Penilaian Peserta/i)).toBeVisible();

    // Buka Lembar Penilaian Peserta
    await page.getByRole('button', { name: /Mulai Menilai|Lanjut Menilai|Buka Lembar/i }).first().click();

    // Verifikasi header Lembar Penilaian Dewan Hakim
    await expect(page.getByText(/Lembar Penilaian Dewan Hakim/i).first()).toBeVisible();

    // Verifikasi panel kiri: Mushaf Madinah & toolbar anotasi
    await expect(page.getByText(/Hal\./i).first()).toBeVisible();

    // Verifikasi toolbar alat anotasi: Pena, Stabilo, Penghapus
    await expect(page.getByTitle(/Pena Koreksi Anotasi/i)).toBeVisible();
    await expect(page.getByTitle(/Stabilo Transparan/i)).toBeVisible();
    await expect(page.getByTitle(/Penghapus Anotasi/i)).toBeVisible();

    // Verifikasi panel kanan: Peserta Sedang Dinilai & Nilai Akhir
    await expect(page.getByText(/Peserta Sedang Dinilai/i).first()).toBeVisible();
    await expect(page.getByText(/Nilai Akhir Hakim/i).first()).toBeVisible();
    await expect(page.getByText(/\/ 100/i).first()).toBeVisible();
  });

  test('03. Interaksi Anotasi Canvas Mushaf Digital oleh Dewan Hakim', async ({ page }) => {
    // Beralih ke persona Dewan Hakim
    await page.getByRole('button', { name: /Ganti/i }).first().click();
    const judgeBtn = page.locator('button:has-text("KH. Ahmad Dahlan")').first();
    await judgeBtn.scrollIntoViewIfNeeded();
    await judgeBtn.click({ force: true });

    // Buka lembar penilaian
    await page.getByRole('button', { name: /Mulai Menilai|Lanjut Menilai|Buka Lembar/i }).first().click();

    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();

    // Lakukan aksi gambar goresan pada canvas
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 50, box.y + 50);
      await page.mouse.down();
      await page.mouse.move(box.x + 120, box.y + 120, { steps: 5 });
      await page.mouse.up();
    }

    // Ganti ke alat Stabilo
    await page.getByTitle(/Stabilo Transparan/i).click();

    // Goreskan stabilo
    if (box) {
      await page.mouse.move(box.x + 60, box.y + 80);
      await page.mouse.down();
      await page.mouse.move(box.x + 150, box.y + 80, { steps: 5 });
      await page.mouse.up();
    }
  });

  test('04. Navigasi Kembali ke Rekap Nilai Babak', async ({ page }) => {
    await page.getByRole('button', { name: /Monitoring Penilaian/i }).first().click();
    await page.getByRole('button', { name: /Mulai Menilai|Lanjut Menilai|Lihat Lembar/i }).first().click();

    // Klik tombol navigasi ke Rekap Nilai
    await page.getByRole('button', { name: /Lihat Rekap Nilai Babak Ini/i }).click();

    // Verifikasi berada di halaman Rekapitulasi Nilai
    await expect(page.getByText(/Rekap Nilai Real-Time/i).first()).toBeVisible();
  });
});
