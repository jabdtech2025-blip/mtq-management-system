import { test, expect } from '@playwright/test';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import { enterDemoSimulation } from './helpers/auth';

test.describe('E2E: Ekspor Excel Peserta lalu Impor Kembali untuk Memperbarui', () => {
  test.beforeEach(async ({ page }) => {
    await enterDemoSimulation(page);
    await page.getByRole('button', { name: /Grup & Peserta/i }).first().click();
    await expect(page.getByText('Grup & Peserta MTQ').first()).toBeVisible();
  });

  test('01. Ekspor, isi tanggal lahir, impor ulang: peserta diperbarui tanpa duplikat', async ({ page }, testInfo) => {
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-participants-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^Peserta_.*\.xlsx$/);
    const exportedPath = testInfo.outputPath('ekspor.xlsx');
    await download.saveAs(exportedPath);

    // Baca hasil ekspor
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(exportedPath);
    const ws = wb.getWorksheet('Peserta');
    expect(ws).toBeTruthy();
    const header = (ws!.getRow(1).values as unknown[]).map((v) => String(v ?? ''));
    const col = (name: string) => header.indexOf(name);
    for (const name of ['ID_Peserta', 'Nomor_Undian_Babak', 'Nama_Lengkap', 'Nama_Ayah', 'Tanggal_Lahir', 'Usia', 'Kafilah', 'Cabang', 'Babak']) {
      expect(col(name), `kolom ${name}`).toBeGreaterThan(0);
    }
    const totalRows = ws!.actualRowCount - 1;
    expect(totalRows).toBeGreaterThan(0);
    const firstCode = String(ws!.getRow(2).getCell(col('ID_Peserta')).value);
    const firstName = String(ws!.getRow(2).getCell(col('Nama_Lengkap')).value);

    // Isi tanggal lahir peserta pertama, kosongkan nama ayahnya (sel kosong tidak boleh menghapus)
    ws!.getRow(2).getCell(col('Tanggal_Lahir')).value = '15/08/2012';
    ws!.getRow(2).getCell(col('Nama_Ayah')).value = '';
    const editedPath = testInfo.outputPath('impor.xlsx');
    await wb.xlsx.writeFile(editedPath);

    // Impor kembali
    await page.getByTestId('import-dropdown-btn').click();
    await page.getByTestId('open-participant-import-btn').click();
    await page.getByTestId('participant-excel-file-input').setInputFiles({
      name: 'impor.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: fs.readFileSync(editedPath)
    });
    const summary = page.getByTestId('participant-import-summary');
    await expect(summary).toContainText('0 peserta baru');
    await expect(summary).toContainText('1 diperbarui');
    await expect(summary).toContainText(`${totalRows - 1} tanpa perubahan`);
    await page.getByTestId('commit-participant-import-btn').click();
    await expect(page.getByText(/Impor peserta: 0 ditambahkan, 1 diperbarui/)).toBeVisible();

    // Detail peserta menampilkan tanggal lahir & usia
    await page.getByPlaceholder(/Cari/i).first().fill(firstCode);
    await page.getByTitle('Lihat detail lengkap peserta').first().click();
    await expect(page.getByText(`Detail Peserta: ${firstName}`)).toBeVisible();
    await expect(page.getByTestId('detail-birth-date')).toContainText('15/08/2012');
    await expect(page.getByTestId('detail-birth-date')).toContainText('tahun');
  });
});
