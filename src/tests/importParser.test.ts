import ExcelJS from 'exceljs';
import {
  KAFILAH_IMPORT_HEADERS,
  PARTICIPANT_IMPORT_HEADERS,
  QUESTION_IMPORT_HEADERS,
  getImportRowNumber,
  parseWorkbookToRows,
  validateKafilahImportRows,
  validateParticipantImportRows,
  validateQuestionImportRows
} from '../utils/excelHelper';

type TestResult = { name: string; success: boolean; details?: string };

/**
 * Pengujian impor Excel/CSV (peserta, bank soal, grup) tanpa jenjang,
 * dengan babak yang wajib milik cabang yang sama.
 */
export async function runImportParserTests(): Promise<{ passed: number; failed: number; results: TestResult[] }> {
  const results: TestResult[] = [];
  const check = async (name: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      results.push({ name, success: true });
    } catch (err) {
      results.push({ name, success: false, details: err instanceof Error ? err.message : String(err) });
    }
  };
  const expect = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };
  const toBuffer = async (wb: ExcelJS.Workbook) => new Uint8Array(await wb.xlsx.writeBuffer());

  const participantHeader = ['ID Peserta', 'Nama Peserta', 'Jenis Kelamin', 'Grup / Kafilah', 'Cabang Lomba', 'Babak Aktif', 'Nomor Undian'];
  const participantRow = ['TLW-201', 'Ahmad', 'Putra', 'Grup Kota Bandung', 'Tilawah Dewasa Putra', 'Penyisihan', '07'];

  await check('IMP-01. Excel dengan Format as Table (tableParts) terbaca tanpa galat "reading name"', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Data');
    ws.addTable({
      name: 'TabelPeserta',
      ref: 'A1',
      headerRow: true,
      columns: participantHeader.map((name) => ({ name })),
      rows: [participantRow]
    });
    const rows = await parseWorkbookToRows(await toBuffer(wb), PARTICIPANT_IMPORT_HEADERS);
    expect(rows.length === 1, `jumlah baris ${rows.length}`);
    expect(rows[0]['nama_peserta'] === 'Ahmad' || Object.values(rows[0]).includes('Ahmad'), 'nama tidak terbaca');
  });

  await check('IMP-02. Data di sheet kedua dengan baris judul di atas header tetap ditemukan, nomor baris Excel asli dipertahankan', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Petunjuk').addRow(['Isi data peserta pada sheet berikutnya']);
    const ws = wb.addWorksheet('Peserta');
    ws.addRow(['DAFTAR PESERTA MTQ 2026']);
    ws.addRow([]);
    ws.addRow(participantHeader);
    ws.addRow(participantRow);
    ws.addRow([]);
    ws.addRow(['TLW-202', 'Budi', 'Putra', 'Grup Kota Bandung', 'Tilawah Dewasa Putra', 'Penyisihan', '08']);
    const rows = await parseWorkbookToRows(await toBuffer(wb), PARTICIPANT_IMPORT_HEADERS);
    expect(rows.length === 2, `jumlah baris ${rows.length} (baris kosong harus dilewati)`);
    expect(getImportRowNumber(rows[0], 0) === 4, `nomor baris pertama ${getImportRowNumber(rows[0], 0)}, harusnya 4`);
    expect(getImportRowNumber(rows[1], 1) === 6, `nomor baris kedua ${getImportRowNumber(rows[1], 1)}, harusnya 6`);
  });

  await check('IMP-03. CSV dengan pemisah titik koma (Excel Indonesia) dan kutip ganda terbaca', async () => {
    const csv =
      'Kode Maqra;Nama Surah;Nomor Surah;Ayat Mulai;Ayat Selesai;Cabang Lomba;Babak\n' +
      '"MQ-01";"Al-Mulk";67;1;10;"Tilawah Dewasa Putra";Penyisihan\n';
    const rows = await parseWorkbookToRows(new TextEncoder().encode(csv), QUESTION_IMPORT_HEADERS);
    expect(rows.length === 1, `jumlah baris ${rows.length}`);
    expect(Object.values(rows[0]).includes('Al-Mulk'), 'nama surah tidak terbaca');
  });

  await check('IMP-04. Berkas tanpa judul kolom yang dikenali ditolak dengan pesan jelas, bukan galat teknis', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Lain').addRow(['foo', 'bar']);
    let message = '';
    try {
      await parseWorkbookToRows(await toBuffer(wb), PARTICIPANT_IMPORT_HEADERS);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message.includes('Baris judul kolom tidak ditemukan'), `pesan: ${message}`);
  });

  await check('IMP-05. Berkas .xls lama ditolak dengan petunjuk Simpan Sebagai .xlsx', async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    let message = '';
    try {
      await parseWorkbookToRows(ole, PARTICIPANT_IMPORT_HEADERS);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message.includes('.xlsx'), `pesan: ${message}`);
  });

  // ---------------------------------------------------------------------------
  // Babak wajib milik cabang yang sama (multi-cabang)
  // ---------------------------------------------------------------------------
  const kafilahs = [
    { id: 'k-bdg', tenantId: 't-1', code: 'GRP-BDG', name: 'Grup Kota Bandung', region: 'Jawa Barat', participantCount: 0, contactPerson: '', contactPhone: '', status: 'Aktif' as const }
  ];
  const cabangList = [
    { id: 'c-pa', tenantId: 't-1', code: 'TLW-PA', name: 'Tilawah Dewasa Putra', description: '', status: 'Aktif' as const },
    { id: 'c-pi', tenantId: 't-1', code: 'TLW-PI', name: 'Tilawah Dewasa Putri', description: '', status: 'Aktif' as const }
  ];
  const stages = [
    { id: 's-pa-1', tenantId: 't-1', name: 'Penyisihan', branchId: 'c-pa', branchName: 'Tilawah Dewasa Putra', order: 1, qualificationQuota: 6, qualificationMethod: 'top_n' as const, status: 'Aktif' as const }
  ];

  await check('IMP-06. Peserta cabang yang belum punya babak ditolak dan diarahkan ke Master Data > Babak Musabaqah', () => {
    const res = validateParticipantImportRows(
      [
        { id_peserta: 'TLW-301', nama_peserta: 'Putra', jenis_kelamin: 'Putra', kafilah: 'Grup Kota Bandung', cabang: 'Tilawah Dewasa Putra', babak: 'Penyisihan', nomor_undian: '01' },
        { id_peserta: 'TLW-302', nama_peserta: 'Putri', jenis_kelamin: 'Putri', kafilah: 'Grup Kota Bandung', cabang: 'Tilawah Dewasa Putri', babak: 'Penyisihan', nomor_undian: '01' }
      ],
      { kafilahs, cabangList, stages, existingParticipants: [], tenantId: 't-1' }
    );
    expect(res.validRows.length === 1 && res.validRows[0].stageId === 's-pa-1', `valid: ${res.validRows.length}`);
    const err = res.rows.find((r) => !r.isValid)?.errors.join(' ') || '';
    expect(err.includes('Babak Musabaqah') && err.includes('Tilawah Dewasa Putri'), `galat: ${err}`);
  });

  await check('IMP-08. Peserta tanpa nomor undian tetap bisa diimpor; nomor yang terisi tetap dicek ganda', () => {
    const res = validateParticipantImportRows(
      [
        { id_peserta: 'TLW-501', nama_peserta: 'Tanpa Undian A', jenis_kelamin: 'Putra', kafilah: 'Grup Kota Bandung', cabang: 'Tilawah Dewasa Putra', babak: 'Penyisihan' },
        { id_peserta: 'TLW-502', nama_peserta: 'Tanpa Undian B', jenis_kelamin: 'Putra', kafilah: 'Grup Kota Bandung', cabang: 'Tilawah Dewasa Putra', babak: 'Penyisihan', nomor_undian: '' },
        { id_peserta: 'TLW-503', nama_peserta: 'Undian 07', jenis_kelamin: 'Putra', kafilah: 'Grup Kota Bandung', cabang: 'Tilawah Dewasa Putra', babak: 'Penyisihan', nomor_undian: '07' },
        { id_peserta: 'TLW-504', nama_peserta: 'Undian 07 Ganda', jenis_kelamin: 'Putra', kafilah: 'Grup Kota Bandung', cabang: 'Tilawah Dewasa Putra', babak: 'Penyisihan', nomor_undian: '07' }
      ],
      { kafilahs, cabangList, stages, existingParticipants: [], tenantId: 't-1' }
    );
    const codes = res.validRows.map((r) => r.participantId).join(',');
    expect(codes === 'TLW-501,TLW-502,TLW-503', `valid: ${codes}; ${res.rows.map((r) => r.errors.join('/')).join(' | ')}`);
    expect(res.validRows[0].lotteryNumber === '', 'nomor undian kosong tetap kosong');
    expect((res.rows[0].warnings || []).some((w) => w.includes('Nomor undian kosong')), 'ada peringatan nomor undian kosong');
    expect((res.rows[3].errors || []).some((e) => e.includes('Duplikasi Nomor Undian')), 'nomor terisi ganda tetap ditolak');
  });

  await check('IMP-07. Kolom Jenjang lama di berkas diabaikan; peserta dan soal tidak membawa levelId', () => {
    const part = validateParticipantImportRows(
      [{ id_peserta: 'TLW-401', nama_peserta: 'A', jenis_kelamin: 'Putra', kafilah: 'Grup Kota Bandung', cabang: 'Tilawah Dewasa Putra', jenjang: 'Ulya', babak: 'Penyisihan', nomor_undian: '02' }],
      { kafilahs, cabangList, stages, existingParticipants: [], tenantId: 't-1' }
    );
    const q = validateQuestionImportRows(
      [{ kode_maqra: 'MQ-401', nama_surah: 'Al-Mulk', nomor_surah: '67', ayat_mulai: '1', ayat_selesai: '10', halaman_mulai: '562', halaman_selesai: '562', cabang: 'Tilawah Dewasa Putra', jenjang: 'Ulya', babak: 'Penyisihan' }],
      { cabangList, stages, existingQuestions: [], tenantId: 't-1' } as Parameters<typeof validateQuestionImportRows>[1]
    );
    expect(part.validRows.length === 1, `peserta: ${part.rows[0]?.errors.join('; ')}`);
    expect(q.validRows.length === 1, `soal: ${q.rows[0]?.errors.join('; ')}`);
    expect(!('levelId' in part.validRows[0]) && !('levelId' in q.validRows[0]), 'masih ada levelId');
  });

  // ---------------------------------------------------------------------------
  // Impor Grup / Kafilah
  // ---------------------------------------------------------------------------
  await check('IMP-08. Impor grup: kode ada = diperbarui, kode baru = dibuat, duplikat & telepon tidak sah ditolak', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Template_Grup');
    ws.addRow(['Kode Grup', 'Nama Grup', 'Wilayah', 'Penanggung Jawab', 'Telepon', 'Status']);
    ws.addRow(['GRP-BDG', 'Grup Kota Bandung', 'Jawa Barat', 'H. Asep', '0812-3456-789', 'Aktif']);
    ws.addRow(['GRP-BGR', 'Grup Kota Bogor', 'Jawa Barat', 'H. Ujang', '+62 811 222', 'Aktif']);
    ws.addRow(['GRP-BGR', 'Grup Bogor Ganda', '', '', '', '']);
    ws.addRow(['GRP-X', 'Grup Kota Bandung', '', '', '', '']);
    ws.addRow(['GRP-Y', 'Grup Telepon Salah', '', '', 'telp: abc', '']);
    const rows = await parseWorkbookToRows(await toBuffer(wb), KAFILAH_IMPORT_HEADERS);
    const res = validateKafilahImportRows(rows, { existingKafilahs: kafilahs });
    const valid = res.validRows;
    expect(valid.length === 2, `valid ${valid.length}: ${res.rows.map((r) => r.errors.join('/')).join(' | ')}`);
    expect(valid.find((v) => v.code === 'GRP-BDG')?.existingId === 'k-bdg', 'GRP-BDG harus memperbarui grup lama');
    expect(!valid.find((v) => v.code === 'GRP-BGR')?.existingId, 'GRP-BGR harus grup baru');
    expect(res.rows.filter((r) => !r.isValid).length === 3, 'tiga baris harus ditolak');
  });

  const passed = results.filter((r) => r.success).length;
  return { passed, failed: results.length - passed, results };
}
