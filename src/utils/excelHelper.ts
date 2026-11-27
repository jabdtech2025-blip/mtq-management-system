import type ExcelJS from 'exceljs';

// exceljs (~1 MB) dimuat hanya saat fitur import/ekspor Excel dipakai, bukan saat aplikasi dibuka.
async function loadExcelJS(): Promise<typeof ExcelJS> {
  const mod = await import('exceljs');
  return ((mod as unknown as { default?: typeof ExcelJS }).default ?? (mod as unknown as typeof ExcelJS));
}
import {
  CabangItem,
  StageItem,
  Kafilah,
  Participant,
  Question,
} from '../types/mtq';
import { resolveStageForBranch } from '../services/stageResolver';
import { validateMaqraRange } from '../services/quranIndex';
import { parseBirthDate, validateBirthDate } from './birthDate';

export const MAX_EXCEL_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_EXCEL_ROWS = 5000;

const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Algoritma Pengacakan Fisher-Yates (Knuth Shuffle) Tanpa Bias.
 * Menggunakan CSPRNG (crypto.getRandomValues) jika tersedia di browser/Node runtime,
 * dan fallback ke Math.random() hanya jika CSPRNG tidak tersedia.
 */
export function fisherYatesShuffle<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    let randomIndex: number;
    if (
      typeof globalThis !== 'undefined' &&
      globalThis.crypto &&
      typeof globalThis.crypto.getRandomValues === 'function'
    ) {
      const array = new Uint32Array(1);
      globalThis.crypto.getRandomValues(array);
      randomIndex = array[0] % (i + 1);
    } else {
      randomIndex = Math.floor(Math.random() * (i + 1));
    }
    const temp = result[i];
    result[i] = result[randomIndex];
    result[randomIndex] = temp;
  }
  return result;
}

export interface ImportRowValidationResult<TData> {
  rowNumber: number;
  rawRow: Record<string, string>;
  isValid: boolean;
  errors: string[];
  warnings: string[];
  data?: TData;
}

export interface ImportRowErrorSummary {
  rowNumber: number;
  identifier: string;
  reasons: string[];
  rawRow: Record<string, string>;
}

export interface ImportBatchValidationSummary<TData> {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: ImportRowValidationResult<TData>[];
  validRows: TData[];
  errors: ImportRowErrorSummary[];
}

export type ImportValidationResult<TData> = ImportBatchValidationSummary<TData>;
export type ValidatedParticipantRow = ParsedParticipantImportRow;
export type ValidatedQuestionRow = ParsedQuestionImportRow;

export interface ParsedParticipantImportRow {
  adminSequenceNumber: string;
  participantId: string;
  lotteryNumber: string;
  name: string;
  fatherName: string;
  gender: 'Putra' | 'Putri';
  originCity: string;
  originRegion: string;
  originInstitution: string;
  kafilahId: string;
  kafilahName: string;
  branchId: string;
  branchName: string;
  stageId?: string;
  stageName: string;
  status: 'Menunggu' | 'Berlangsung' | 'Lolos' | 'Gugur' | 'Final';
  /** Tanggal lahir YYYY-MM-DD; kosong = tidak diisi */
  birthDate?: string;
  /** id peserta yang sudah ada (cocok lewat Kode Peserta, atau Nama + Grup + Cabang) → diperbarui */
  existingId?: string;
  /** Label kolom yang berubah untuk peserta yang sudah ada (kosong = tidak ada perubahan) */
  changedFields?: string[];
}

export interface ParsedQuestionImportRow {
  code: string;
  title: string;
  surahName: string;
  surahNumber: number;
  startAyah: number;
  endAyah: number;
  pageNumber: number;
  pageStart: number;
  pageEnd: number;
  branchId: string;
  branchName: string;
  stageId?: string;
  stage: string;
  stageName: string;
  branchAndLevel: string;
  status: 'Aktif' | 'Nonaktif';
  description?: string;
}

function normalizeHeaderKey(header: string): string {
  return String(header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findCellValue(row: Record<string, unknown>, aliases: string[]): string {
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  for (const [key, value] of Object.entries(row)) {
    if (FORBIDDEN_OBJECT_KEYS.has(key)) continue;
    if (normalizedAliases.includes(normalizeHeaderKey(key))) {
      return value === null || value === undefined ? '' : String(value).trim();
    }
  }
  return '';
}

export function assertWorkbookBufferSize(buffer: ArrayBuffer | Uint8Array): void {
  const byteLength = buffer instanceof Uint8Array ? buffer.byteLength : buffer.byteLength;
  if (byteLength > MAX_EXCEL_FILE_BYTES) {
    throw new Error(
      `Ukuran file Excel (${(byteLength / (1024 * 1024)).toFixed(2)} MB) melebihi batas keamanan maksimum 5 MB.`
    );
  }
}

function isFormulaCellValue(val: unknown): boolean {
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('formula' in obj || 'sharedFormula' in obj) {
      return true;
    }
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed.startsWith('=')) {
      return true;
    }
  }
  return false;
}

function extractSafeCellPrimitive(val: unknown, rowNumber: number): string | number | boolean {
  if (isFormulaCellValue(val)) {
    throw new Error(
      `Sel bertipe formula tidak diizinkan demi keamanan (terdeteksi pada baris ${rowNumber}). Gunakan nilai teks atau angka murni.`
    );
  }
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part: { text?: string }) => String(part?.text || '')).join('');
    }
    if ('text' in obj && typeof obj.text === 'string') {
      return obj.text;
    }
  }
  return String(val);
}

/**
 * Memvalidasi matriks baris mentah (baris 0 = header, baris 1..N = data):
 * - Menolak > 5.000 baris data
 * - Menolak sel bertipe formula
 * - Membuang kunci berbahaya (__proto__, constructor, prototype) untuk mencegah Prototype Pollution
 */
export function validateAndSanitizeRawSheetMatrix(matrix: unknown[][]): Record<string, unknown>[] {
  if (!Array.isArray(matrix) || matrix.length <= 1) {
    return [];
  }

  const dataRowCount = matrix.length - 1;
  if (dataRowCount > MAX_EXCEL_ROWS) {
    throw new Error(
      `Jumlah baris dalam file Excel (${dataRowCount} baris) melebihi batas maksimum ${MAX_EXCEL_ROWS} baris per unggahan.`
    );
  }

  const rawHeaders = Array.isArray(matrix[0]) ? matrix[0] : [];
  const sanitizedHeaders: Array<string | null> = rawHeaders.map((h) => {
    const clean = String(extractSafeCellPrimitive(h, 1)).trim();
    if (!clean || FORBIDDEN_OBJECT_KEYS.has(clean) || FORBIDDEN_OBJECT_KEYS.has(clean.toLowerCase())) {
      return null;
    }
    return clean;
  });

  const rows: Record<string, unknown>[] = [];
  for (let rIdx = 1; rIdx < matrix.length; rIdx++) {
    const rawCells = Array.isArray(matrix[rIdx]) ? matrix[rIdx] : [];
    const rowObj: Record<string, unknown> = {};
    let hasNonEmptyValue = false;

    for (let cIdx = 0; cIdx < sanitizedHeaders.length; cIdx++) {
      const headerKey = sanitizedHeaders[cIdx];
      if (!headerKey) continue;
      const cellVal = extractSafeCellPrimitive(rawCells[cIdx], rIdx + 1);
      if (cellVal !== '') {
        hasNonEmptyValue = true;
      }
      Object.defineProperty(rowObj, headerKey, {
        value: cellVal,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }

    if (hasNonEmptyValue) {
      rows.push(rowObj);
    }
  }

  return rows;
}

/** Nomor baris Excel asli dari sebuah baris hasil baca (header bisa berada di bawah baris judul). */
export function getImportRowNumber(row: Record<string, unknown>, fallbackIndex: number): number {
  const n = (row as { __excelRow?: unknown }).__excelRow;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallbackIndex + 2;
}

/** Judul kolom yang dikenali per jenis impor (dipakai untuk menemukan sheet & baris header). */
export const PARTICIPANT_IMPORT_HEADERS = [
  'no_urut', 'nomor_urut', 'nomor_urut_administratif', 'no_urut_administratif', 'no_urut_administrasi',
  'nomor_urut_administrasi', 'no', 'admin_sequence_number',
  'id_peserta', 'kode_peserta', 'participant_id', 'participant_code', 'nomor_peserta',
  'nomor_undian', 'no_undian', 'undian', 'lottery_number',
  'nama_lengkap', 'nama_peserta', 'nama', 'name',
  'nama_ayah', 'bin_binti', 'ayah', 'father_name',
  'tanggal_lahir', 'tgl_lahir', 'tanggal_kelahiran', 'birth_date',
  'jenis_kelamin', 'gender', 'jk', 'putra_putri',
  'asal_kota', 'kota_asal', 'kota_kabupaten', 'asal_kota_kabupaten', 'origin_city',
  'asal_wilayah', 'daerah_asal', 'asal_daerah', 'asal_wilayah_provinsi', 'provinsi', 'asal_provinsi', 'origin_region',
  'lembaga_asal', 'asal_lembaga', 'asal_pesantren_sekolah', 'pesantren_sekolah', 'instansi', 'origin_institution',
  'kafilah', 'grup', 'grup_kafilah', 'kafilah_grup', 'nama_kafilah', 'kode_kafilah', 'kafilah_name', 'nama_grup', 'kode_grup',
  'cabang', 'cabang_lomba', 'nama_cabang', 'kode_cabang', 'branch',
  'babak', 'babak_aktif', 'babak_musabaqah', 'stage',
  'status'
];

export const QUESTION_IMPORT_HEADERS = [
  'kode_maqra', 'kode_soal', 'kode', 'code',
  'judul_paket', 'judul_maqra', 'judul', 'title',
  'nama_surah', 'surah', 'surah_name',
  'nomor_surah', 'no_surah', 'surah_number',
  'ayat_mulai', 'start_ayah', 'ayat_awal',
  'ayat_selesai', 'end_ayah', 'ayat_akhir',
  'halaman_mulai', 'halaman_awal', 'page_start', 'halaman',
  'halaman_selesai', 'halaman_akhir', 'page_end',
  'cabang', 'cabang_lomba', 'nama_cabang', 'kode_cabang', 'branch',
  'babak', 'babak_aktif', 'babak_musabaqah', 'stage',
  'status', 'deskripsi', 'catatan', 'keterangan', 'description'
];

export const KAFILAH_IMPORT_HEADERS = [
  'kode_grup', 'kode_kafilah', 'kode', 'code',
  'nama_grup', 'nama_kafilah', 'grup', 'kafilah', 'nama', 'name',
  'wilayah', 'asal_wilayah', 'daerah', 'region', 'kota_kabupaten',
  'penanggung_jawab', 'kontak', 'nama_kontak', 'contact_person', 'ketua', 'ketua_kafilah',
  'telepon', 'no_telepon', 'nomor_telepon', 'no_hp', 'hp', 'whatsapp', 'contact_phone',
  'status'
];

/** Pembagi CSV sederhana (RFC 4180): kutip ganda, koma atau titik koma, baris baru di dalam kutipan. */
function parseCsvText(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] || '';
  const delimiter =
    (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Nilai sel yang aman: rumus diganti hasil terhitungnya (bila ada), teks kaya digabung, tanggal ISO. */
function readCellLoosely(val: unknown): { value: string | number | boolean; isFormula: boolean } {
  if (val === null || val === undefined) return { value: '', isFormula: false };
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return { value: val, isFormula: false };
  }
  if (val instanceof Date) return { value: val.toISOString().slice(0, 10), isFormula: false };
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if ('formula' in obj || 'sharedFormula' in obj) {
      const result = obj.result;
      if (typeof result === 'string' || typeof result === 'number' || typeof result === 'boolean') {
        return { value: result, isFormula: true };
      }
      if (result instanceof Date) return { value: result.toISOString().slice(0, 10), isFormula: true };
      return { value: '', isFormula: true };
    }
    if (Array.isArray(obj.richText)) {
      return {
        value: obj.richText.map((part: { text?: string }) => String(part?.text || '')).join(''),
        isFormula: false
      };
    }
    if ('text' in obj && typeof obj.text === 'string') return { value: obj.text, isFormula: false };
    if ('error' in obj) return { value: '', isFormula: false };
  }
  return { value: String(val), isFormula: false };
}

const isXlsZipSignature = (u: Uint8Array) => u.length >= 4 && u[0] === 0x50 && u[1] === 0x4b;
const isLegacyXlsSignature = (u: Uint8Array) =>
  u.length >= 4 && u[0] === 0xd0 && u[1] === 0xcf && u[2] === 0x11 && u[3] === 0xe0;

/**
 * Membaca file impor (.xlsx atau .csv) menjadi baris objek per judul kolom.
 *
 * Tahan terhadap bentuk berkas yang umum dipakai panitia:
 * - data yang diformat sebagai Tabel Excel ("Format as Table");
 * - sheet petunjuk di depan: sheet dipilih berdasarkan judul kolom yang dikenali;
 * - baris judul/keterangan di atas baris header;
 * - format/warna sampai ribuan baris kosong (hanya baris berisi yang dihitung);
 * - kolom berisi rumus yang tidak dipakai (diabaikan); rumus di kolom yang dipakai memakai hasil hitungnya.
 * Batasan keamanan tetap: <= 5 MB, <= 5.000 baris data, teks yang diawali "=" ditolak,
 * kunci berbahaya (__proto__ dsb.) dibuang.
 *
 * `knownHeaders` = alias judul kolom yang dikenali untuk jenis impor ini. Kolom lain diabaikan.
 */
export async function parseWorkbookToRows(
  buffer: ArrayBuffer | Uint8Array,
  knownHeaders?: string[]
): Promise<Record<string, unknown>[]> {
  assertWorkbookBufferSize(buffer);
  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (isLegacyXlsSignature(uint8)) {
    throw new Error(
      'Format .xls (Excel 97-2003) tidak didukung. Buka berkas di Excel, lalu pilih Simpan Sebagai > "Buku Kerja Excel (.xlsx)", kemudian unggah ulang.'
    );
  }

  const sheets: Array<{ name: string; matrix: unknown[][]; rowNumbers: number[] }> = [];

  if (!isXlsZipSignature(uint8)) {
    // Bukan .xlsx: coba sebagai CSV (teks)
    const text = new TextDecoder('utf-8').decode(uint8);
    if (text.includes('\u0000')) {
      throw new Error('Berkas tidak dikenali. Gunakan templat .xlsx dari tombol Download Template, atau berkas .csv.');
    }
    const csvRows = parseCsvText(text);
    const matrix: unknown[][] = [];
    const rowNumbers: number[] = [];
    csvRows.forEach((r, i) => {
      if (r.some((c) => String(c).trim() !== '')) {
        matrix.push(r);
        rowNumbers.push(i + 1);
      }
    });
    sheets.push({ name: 'CSV', matrix, rowNumbers });
  } else {
    const exactArrayBuffer = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
    const ExcelLib = await loadExcelJS();
    const workbook = new ExcelLib.Workbook();
    try {
      // tableParts diabaikan: pustaka ExcelJS gagal membaca berkas yang diformat sebagai Tabel Excel,
      // padahal isi selnya tetap utuh tanpa definisi tabel.
      await workbook.xlsx.load(exactArrayBuffer, { ignoreNodes: ['tableParts'] } as never);
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Berkas Excel tidak dapat dibaca (${detail}). Pastikan berkas berformat .xlsx dan tidak terkunci kata sandi; bila perlu salin datanya ke templat dari tombol Download Template.`
      );
    }
    workbook.worksheets.forEach((ws) => {
      const matrix: unknown[][] = [];
      const rowNumbers: number[] = [];
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        const values = Array.isArray(row.values) ? row.values.slice(1) : [];
        if (values.some((v) => String(readCellLoosely(v).value).trim() !== '')) {
          matrix.push(values);
          rowNumbers.push(rowNumber);
        }
      });
      sheets.push({ name: ws.name, matrix, rowNumbers });
    });
  }

  // Temukan sheet + baris header: baris (di 15 baris berisi pertama) dengan judul kolom paling banyak dikenali
  const known = new Set((knownHeaders || []).map(normalizeHeaderKey));
  let best: { sheet: (typeof sheets)[number]; headerIdx: number; score: number } | null = null;
  sheets.forEach((sheet, sheetIdx) => {
    const limit = Math.min(sheet.matrix.length, 15);
    for (let i = 0; i < limit; i++) {
      const cells = Array.isArray(sheet.matrix[i]) ? sheet.matrix[i] : [];
      const score =
        known.size > 0
          ? cells.filter((c) => known.has(normalizeHeaderKey(String(readCellLoosely(c).value)))).length
          : cells.filter((c) => String(readCellLoosely(c).value).trim() !== '').length > 0 && i === 0 && sheetIdx === 0
            ? 1
            : 0;
      if (score > 0 && (!best || score > best.score)) {
        best = { sheet, headerIdx: i, score };
      }
    }
  });

  const chosen = best as { sheet: (typeof sheets)[number]; headerIdx: number; score: number } | null;
  if (!chosen || (known.size > 0 && chosen.score < 2)) {
    if (sheets.every((s) => s.matrix.length === 0)) return [];
    throw new Error(
      'Baris judul kolom tidak ditemukan. Pastikan salah satu baris berisi judul kolom seperti pada templat (mis. Nama_Lengkap, Cabang, Babak), lalu unggah ulang.'
    );
  }

  const { sheet, headerIdx } = chosen;
  const dataCount = sheet.matrix.length - headerIdx - 1;
  if (dataCount > MAX_EXCEL_ROWS) {
    throw new Error(
      `Jumlah baris data (${dataCount}) melebihi batas maksimum ${MAX_EXCEL_ROWS} baris per unggahan. Bagi berkas menjadi beberapa bagian.`
    );
  }

  const headerCells = Array.isArray(sheet.matrix[headerIdx]) ? sheet.matrix[headerIdx] : [];
  const headers: Array<string | null> = headerCells.map((h) => {
    const clean = String(readCellLoosely(h).value).trim();
    if (!clean || FORBIDDEN_OBJECT_KEYS.has(clean) || FORBIDDEN_OBJECT_KEYS.has(clean.toLowerCase())) return null;
    if (known.size > 0 && !known.has(normalizeHeaderKey(clean))) return null; // kolom lain diabaikan
    return clean;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = headerIdx + 1; r < sheet.matrix.length; r++) {
    const cells = Array.isArray(sheet.matrix[r]) ? sheet.matrix[r] : [];
    const excelRow = sheet.rowNumbers[r];
    const rowObj: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((key, c) => {
      if (!key) return;
      const { value, isFormula } = readCellLoosely(cells[c]);
      if (isFormula && value === '') {
        throw new Error(
          `Sel rumus tanpa hasil terhitung pada baris ${excelRow}, kolom "${key}". Ganti rumus dengan nilainya (Salin > Tempel Spesial > Nilai).`
        );
      }
      if (typeof value === 'string' && value.trim().startsWith('=')) {
        throw new Error(
          `Teks diawali tanda "=" tidak diizinkan demi keamanan (baris ${excelRow}, kolom "${key}").`
        );
      }
      if (String(value).trim() !== '') hasValue = true;
      Object.defineProperty(rowObj, key, { value, enumerable: true, writable: true, configurable: true });
    });
    if (hasValue) {
      Object.defineProperty(rowObj, '__excelRow', { value: excelRow, enumerable: false });
      rows.push(rowObj);
    }
  }
  return rows;
}

/**
 * Validasi baris import Peserta terhadap Master Data aktif (Kafilah, Cabang, Babak milik cabang itu)
 * tanpa pernah membuat master data liar secara diam-diam.
 *
 * Impor juga dipakai untuk MEMPERBARUI peserta yang sudah ada:
 * - dicocokkan lewat Kode Peserta; bila kode kosong, lewat Nama + Grup + Cabang (harus tepat satu);
 * - sel yang terisi menggantikan data lama, sel KOSONG tidak menghapus apa pun;
 * - nomor hasil undian babak tidak pernah disentuh (kolom "Nomor Undian Babak" diabaikan).
 */
export function validateParticipantImportRows(
  rawRows: Record<string, unknown>[],
  context: {
    kafilahs: Kafilah[];
    cabangList: CabangItem[];
    stages: StageItem[];
    existingParticipants: Participant[];
    /** id tenant aktif, untuk mencari babak milik cabang */
    tenantId?: string;
  }
): ImportBatchValidationSummary<ParsedParticipantImportRow> {
  const seenParticipantCodes = new Set<string>();
  const seenExistingIds = new Set<string>();
  const seenBranchLottery = new Set<string>();
  const lower = (v?: string) => (v || '').trim().toLowerCase();

  const existingByCode = new Map(
    context.existingParticipants.map((p) => [p.participantId.trim().toUpperCase(), p] as const)
  );

  const findKafilah = (ref: string) =>
    context.kafilahs.find(
      (k) =>
        k.status === 'Aktif' &&
        (lower(k.name) === lower(ref) || lower(k.code) === lower(ref) || k.id === ref)
    );
  const findBranch = (ref: string) =>
    context.cabangList.find(
      (c) =>
        c.status === 'Aktif' &&
        (lower(c.name) === lower(ref) || lower(c.code) === lower(ref) || c.id === ref)
    );

  const results: ImportRowValidationResult<ParsedParticipantImportRow>[] = rawRows.map((raw, idx) => {
    const rowNumber = getImportRowNumber(raw, idx);
    const errors: string[] = [];
    const warnings: string[] = [];

    const adminSequenceRaw = findCellValue(raw, [
      'no_urut',
      'nomor_urut',
      'nomor_urut_administratif',
      'no_urut_administratif',
      'no_urut_administrasi',
      'nomor_urut_administrasi',
      'no',
      'admin_sequence_number',
    ]);
    const codeRaw = findCellValue(raw, [
      'id_peserta',
      'kode_peserta',
      'participant_id',
      'participant_code',
      'nomor_peserta',
    ]).toUpperCase();
    const lotteryRaw = findCellValue(raw, ['nomor_undian', 'no_undian', 'undian', 'lottery_number']);
    const nameRaw = findCellValue(raw, ['nama_lengkap', 'nama_peserta', 'nama', 'name']);
    const fatherRaw = findCellValue(raw, ['nama_ayah', 'bin_binti', 'ayah', 'father_name']);
    const birthRaw = findCellValue(raw, ['tanggal_lahir', 'tgl_lahir', 'tanggal_kelahiran', 'birth_date']);
    const genderRaw = findCellValue(raw, ['jenis_kelamin', 'gender', 'jk', 'putra_putri']);
    const cityRaw = findCellValue(raw, ['asal_kota', 'kota_asal', 'kota_kabupaten', 'asal_kota_kabupaten', 'origin_city']);
    const regionRaw = findCellValue(raw, [
      'asal_wilayah',
      'daerah_asal',
      'asal_daerah',
      'asal_wilayah_provinsi',
      'provinsi',
      'asal_provinsi',
      'origin_region',
    ]);
    const institutionRaw = findCellValue(raw, [
      'lembaga_asal',
      'asal_lembaga',
      'asal_pesantren_sekolah',
      'pesantren_sekolah',
      'instansi',
      'origin_institution',
    ]);
    const kafilahRef = findCellValue(raw, [
      'kafilah',
      'grup',
      'grup_kafilah',
      'kafilah_grup',
      'nama_kafilah',
      'kode_kafilah',
      'kafilah_name',
      'nama_grup',
      'kode_grup',
    ]);
    const branchRef = findCellValue(raw, ['cabang', 'cabang_lomba', 'nama_cabang', 'kode_cabang', 'branch']);
    const stageRaw = findCellValue(raw, ['babak', 'babak_aktif', 'babak_musabaqah', 'stage']);
    const statusRaw = findCellValue(raw, ['status']);

    // --- Cocokkan dengan peserta yang sudah ada ---
    let existing: Participant | undefined = codeRaw ? existingByCode.get(codeRaw) : undefined;
    if (!existing && !codeRaw && nameRaw) {
      const refKafilah = kafilahRef ? findKafilah(kafilahRef) : undefined;
      const refBranch = branchRef ? findBranch(branchRef) : undefined;
      const candidates = context.existingParticipants.filter(
        (p) =>
          lower(p.name) === lower(nameRaw) &&
          (!kafilahRef || p.kafilahId === refKafilah?.id || lower(p.kafilahName) === lower(kafilahRef)) &&
          (!branchRef || p.branchId === refBranch?.id || lower(p.branchName) === lower(branchRef))
      );
      if (candidates.length === 1) {
        existing = candidates[0];
      } else if (candidates.length > 1) {
        errors.push(
          `Ada ${candidates.length} peserta bernama "${nameRaw}"${kafilahRef ? '' : ' (grup tidak diisi)'}. Isi Kode Peserta agar tidak salah peserta.`
        );
      }
    }
    if (existing) {
      if (seenExistingIds.has(existing.id)) {
        errors.push(`Peserta "${existing.name}" (${existing.participantId}) muncul lebih dari sekali di file.`);
      }
      seenExistingIds.add(existing.id);
    }

    // --- Nilai akhir: sel kosong memakai data lama (peserta lama) atau bawaan (peserta baru) ---
    const participantId = codeRaw || existing?.participantId || '';
    const name = nameRaw || existing?.name || '';
    const fatherName = fatherRaw || existing?.fatherName || '';
    const adminSequenceNumber = adminSequenceRaw || existing?.adminSequenceNumber || (existing ? '' : String(idx + 1));
    const lotteryNumber = lotteryRaw || existing?.lotteryNumber || '';
    const originInstitution = institutionRaw || existing?.originInstitution || '';

    let birthDate = existing?.birthDate || '';
    if (birthRaw) {
      const parsed = parseBirthDate(birthRaw);
      const problem = parsed === null ? 'Format tanggal lahir tidak dikenali.' : validateBirthDate(parsed);
      if (problem) errors.push(`Tanggal lahir "${birthRaw}": ${problem} Gunakan 31/12/2012 atau 2012-12-31.`);
      else if (parsed) birthDate = parsed;
    }

    if (!name) errors.push('Nama lengkap peserta wajib diisi.');
    if (!participantId) errors.push('ID/Kode peserta wajib diisi.');
    if (!existing && !lotteryNumber) warnings.push('Nomor undian kosong; nomor akan diberikan saat undian babak.');

    let gender: 'Putra' | 'Putri' = existing?.gender || 'Putra';
    if (genderRaw || !existing) {
      const g = genderRaw.toLowerCase();
      if (g === 'putra' || g === 'l' || g === 'laki-laki') gender = 'Putra';
      else if (g === 'putri' || g === 'p' || g === 'perempuan') gender = 'Putri';
      else errors.push(`Jenis kelamin "${genderRaw || '-'}" tidak valid (gunakan Putra atau Putri).`);
    }

    const matchedKafilah = kafilahRef
      ? findKafilah(kafilahRef)
      : existing
      ? context.kafilahs.find((k) => k.id === existing!.kafilahId)
      : undefined;
    if (!matchedKafilah) {
      errors.push(`Kafilah/Grup "${kafilahRef || '-'}" tidak ditemukan pada Master Data Kafilah Aktif.`);
    }

    const matchedBranch = branchRef
      ? findBranch(branchRef)
      : existing
      ? context.cabangList.find((c) => c.id === existing!.branchId || c.name === existing!.branchName)
      : undefined;
    if (!matchedBranch) {
      errors.push(`Cabang lomba "${branchRef || '-'}" tidak ditemukan pada Master Data Cabang Aktif.`);
    }

    // Babak: kosong pada peserta lama = babak tetap; peserta baru bawaan "Penyisihan"
    const branchChanged = Boolean(
      existing &&
        matchedBranch &&
        matchedBranch.id !== existing.branchId &&
        lower(matchedBranch.name) !== lower(existing.branchName)
    );
    // Babak sama dengan yang tersimpan (atau kosong) dan cabang tetap → babak tidak disentuh
    const keepStage = Boolean(
      existing && !branchChanged && (!stageRaw || lower(stageRaw) === lower(existing.stageName))
    );
    const stageRef = stageRaw || existing?.stageName || 'Penyisihan';
    const stageNameExact =
      context.stages.find((st) => lower(st.name) === lower(stageRef))?.name || stageRef;
    const matchedStage = keepStage
      ? { id: existing!.stageId || '', name: existing!.stageName }
      : matchedBranch
      ? resolveStageForBranch(context.stages, {
          tenantId: context.tenantId || '',
          stageName: stageNameExact,
          branchId: matchedBranch.id,
          branchName: matchedBranch.name
        })
      : undefined;
    if (matchedBranch && !matchedStage) {
      errors.push(
        `Cabang "${matchedBranch.name}" belum memiliki babak "${stageRef}". Buat babaknya di Master Data & Rubrik > Babak Musabaqah.`
      );
    }

    if (participantId) {
      if (seenParticipantCodes.has(participantId)) {
        errors.push(`Duplikasi ID Peserta "${participantId}" di dalam file Excel.`);
      }
      seenParticipantCodes.add(participantId);
      const owner = existingByCode.get(participantId);
      if (owner && existing && owner.id !== existing.id) {
        errors.push(`Kode Peserta "${participantId}" sudah dipakai ${owner.name}.`);
      }
    }

    if (matchedBranch && lotteryRaw) {
      const branchLotteryKey = `${matchedBranch.id}::${lotteryRaw}`;
      if (seenBranchLottery.has(branchLotteryKey)) {
        errors.push(`Duplikasi Nomor Undian "${lotteryRaw}" pada cabang "${matchedBranch.name}" di dalam file.`);
      }
      seenBranchLottery.add(branchLotteryKey);
    }

    const validStatuses = ['Menunggu', 'Berlangsung', 'Lolos', 'Gugur', 'Final'] as const;
    const matchedStatus =
      validStatuses.find((st) => st.toLowerCase() === statusRaw.toLowerCase()) ||
      (existing && !statusRaw ? existing.status : 'Menunggu');

    const rawRowStringified: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (!FORBIDDEN_OBJECT_KEYS.has(k)) {
        rawRowStringified[k] = v === null || v === undefined ? '' : String(v);
      }
    });

    const isValid = errors.length === 0 && Boolean(matchedKafilah && matchedBranch && matchedStage);
    if (!isValid || !matchedKafilah || !matchedBranch || !matchedStage) {
      return { rowNumber, rawRow: rawRowStringified, isValid: false, errors, warnings, data: undefined };
    }

    const data: ParsedParticipantImportRow = {
      adminSequenceNumber,
      participantId,
      lotteryNumber,
      name,
      fatherName,
      gender,
      originCity: cityRaw || (existing ? existing.originCity || '' : matchedKafilah.region),
      originRegion: regionRaw || (existing ? existing.originRegion || '' : matchedKafilah.region),
      originInstitution,
      kafilahId: matchedKafilah.id,
      kafilahName: matchedKafilah.name,
      // Cabang tidak berubah: pertahankan id cabang yang tersimpan (agar babak tidak dianggap pindah)
      branchId: existing && !branchChanged ? existing.branchId || matchedBranch.id : matchedBranch.id,
      branchName: existing && !branchChanged ? existing.branchName : matchedBranch.name,
      stageId: matchedStage.id || undefined,
      stageName: matchedStage.name,
      status: matchedStatus,
      birthDate: birthDate || undefined
    };

    if (existing) {
      const changes: string[] = [];
      const diff = (label: string, before: unknown, after: unknown) => {
        if (String(before ?? '').trim() !== String(after ?? '').trim()) changes.push(label);
      };
      diff('Kode Peserta', existing.participantId, data.participantId);
      diff('No Urut', existing.adminSequenceNumber, data.adminSequenceNumber);
      diff('Nomor Undian Pendaftaran', existing.lotteryNumber, data.lotteryNumber);
      diff('Nama', existing.name, data.name);
      diff('Nama Ayah', existing.fatherName, data.fatherName);
      diff('Tanggal Lahir', existing.birthDate, data.birthDate);
      diff('Jenis Kelamin', existing.gender, data.gender);
      diff('Kota Asal', existing.originCity, data.originCity);
      diff('Provinsi Asal', existing.originRegion, data.originRegion);
      diff('Lembaga Asal', existing.originInstitution, data.originInstitution);
      if (existing.kafilahId !== data.kafilahId && lower(existing.kafilahName) !== lower(data.kafilahName)) changes.push('Grup');
      if (branchChanged) changes.push('Cabang');
      diff('Babak', existing.stageName, data.stageName);
      diff('Status', existing.status, data.status);
      data.existingId = existing.id;
      data.changedFields = changes;
      warnings.push(
        changes.length > 0
          ? `Peserta "${existing.name}" (${existing.participantId}) diperbarui: ${changes.join(', ')}.`
          : `Peserta "${existing.name}" (${existing.participantId}) sudah sama, tidak ada perubahan.`
      );
    }

    return { rowNumber, rawRow: rawRowStringified, isValid: true, errors, warnings, data };
  });

  const validRows = results.filter((r) => r.isValid && r.data).map((r) => r.data!);
  const errorSummaries: ImportRowErrorSummary[] = results
    .filter((r) => !r.isValid)
    .map((r) => ({
      rowNumber: r.rowNumber,
      identifier:
        r.rawRow['ID Peserta'] ||
        r.rawRow['ID_Peserta'] ||
        r.rawRow['Kode Peserta'] ||
        r.rawRow['Nama Peserta'] ||
        r.rawRow['Nama_Lengkap'] ||
        r.rawRow['Nama'] ||
        `Baris ${r.rowNumber}`,
      reasons: r.errors,
      rawRow: r.rawRow,
    }));

  return {
    totalRows: results.length,
    validCount: validRows.length,
    invalidCount: results.length - validRows.length,
    rows: results,
    validRows,
    errors: errorSummaries,
  };
}

/** Ringkasan impor peserta: baru, diperbarui, sama (tanpa perubahan). */
export function summarizeParticipantImport(rows: ParsedParticipantImportRow[]): {
  created: number;
  updated: number;
  unchanged: number;
} {
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  rows.forEach((r) => {
    if (!r.existingId) created += 1;
    else if ((r.changedFields || []).length > 0) updated += 1;
    else unchanged += 1;
  });
  return { created, updated, unchanged };
}

/**
 * Validasi baris import Bank Soal (Maqra) terhadap Master Data aktif (Cabang, Babak milik cabang itu).
 */
export function validateQuestionImportRows(
  rawRows: Record<string, unknown>[],
  context: {
    cabangList: CabangItem[];
    stages: StageItem[];
    existingQuestions: Question[];
    tenantId?: string;
  }
): ImportBatchValidationSummary<ParsedQuestionImportRow> {
  const seenCodes = new Set<string>();
  const existingCodes = new Set(context.existingQuestions.map((q) => q.code.trim().toUpperCase()));

  const results: ImportRowValidationResult<ParsedQuestionImportRow>[] = rawRows.map((raw, idx) => {
    const rowNumber = getImportRowNumber(raw, idx);
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = findCellValue(raw, ['kode_maqra', 'kode_soal', 'kode', 'code']).toUpperCase();
    const title = findCellValue(raw, ['judul_paket', 'judul_maqra', 'judul', 'title']);
    const surahName = findCellValue(raw, ['nama_surah', 'surah', 'surah_name']);
    const surahNumber = Number(
      findCellValue(raw, ['nomor_surah', 'no_surah', 'surah_number']) || '0'
    );
    const startAyah = Number(
      findCellValue(raw, ['ayat_mulai', 'start_ayah', 'ayat_awal']) || '0'
    );
    const endAyah = Number(
      findCellValue(raw, ['ayat_selesai', 'end_ayah', 'ayat_akhir']) || '0'
    );
    const pageStart = Number(
      findCellValue(raw, ['halaman_mulai', 'halaman_awal', 'page_start', 'halaman']) || '0'
    );
    const pageEnd = Number(
      findCellValue(raw, ['halaman_selesai', 'halaman_akhir', 'page_end']) || String(pageStart)
    );
    const branchRef = findCellValue(raw, [
      'cabang',
      'cabang_lomba',
      'nama_cabang',
      'kode_cabang',
      'branch',
    ]);
    const stageRef =
      findCellValue(raw, ['babak', 'babak_aktif', 'babak_musabaqah', 'stage']) || 'Penyisihan';
    const statusRaw = findCellValue(raw, ['status']) || 'Aktif';
    const description = findCellValue(raw, ['deskripsi', 'catatan', 'keterangan', 'description']);

    if (!code) errors.push('Kode Maqra wajib diisi.');
    if (!surahName) errors.push('Nama Surah wajib diisi.');

    const maqraCheck = validateMaqraRange({
      surahNumber: surahNumber > 0 ? surahNumber : undefined,
      surahName,
      startAyah,
      endAyah,
      pageStart: pageStart > 0 ? pageStart : undefined,
      pageEnd: pageEnd > 0 ? pageEnd : undefined,
      allowManualPageOverride: false,
    });

    if (!maqraCheck.valid) {
      errors.push(...maqraCheck.errors);
    } else {
      if (!Number.isInteger(pageStart) || pageStart < 1 || pageStart > 604) {
        errors.push('Halaman mulai harus berada pada rentang Mushaf Madinah (1 - 604).');
      }
      if (!Number.isInteger(pageEnd) || pageEnd < pageStart || pageEnd > 604) {
        errors.push('Halaman selesai harus >= Halaman mulai dan <= 604.');
      }
    }

    const matchedBranch = context.cabangList.find(
      (c) =>
        c.status === 'Aktif' &&
        (c.name.toLowerCase() === branchRef.toLowerCase() ||
          (c.code || '').toLowerCase() === branchRef.toLowerCase() ||
          c.id === branchRef)
    );
    if (!matchedBranch) {
      errors.push(
        `Cabang lomba "${branchRef || '-'}" tidak ditemukan pada Master Data Cabang Aktif.`
      );
    }

    // Babak dicari per cabang: nama babak yang sama ada di setiap cabang dan tidak boleh tertukar.
    const stageNameExact =
      context.stages.find((s) => s.name.trim().toLowerCase() === stageRef.trim().toLowerCase())?.name || stageRef;
    const matchedStage = matchedBranch
      ? resolveStageForBranch(context.stages, {
          tenantId: context.tenantId || '',
          stageName: stageNameExact,
          branchId: matchedBranch.id,
          branchName: matchedBranch.name
        })
      : undefined;

    if (matchedBranch && !matchedStage) {
      errors.push(
        `Cabang "${matchedBranch.name}" belum memiliki babak "${stageRef}". Buat babaknya di Master Data & Rubrik > Babak Musabaqah.`
      );
    }

    if (code) {
      if (seenCodes.has(code)) {
        errors.push(`Duplikasi Kode Maqra "${code}" di dalam file Excel.`);
      }
      seenCodes.add(code);
      if (existingCodes.has(code)) {
        warnings.push(`Kode Maqra "${code}" sudah terdaftar dan akan diperbarui.`);
      }
    }

    const status: 'Aktif' | 'Nonaktif' =
      statusRaw.toLowerCase() === 'nonaktif' ? 'Nonaktif' : 'Aktif';

    const rawRowStringified: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (!FORBIDDEN_OBJECT_KEYS.has(k)) {
        rawRowStringified[k] = v === null || v === undefined ? '' : String(v);
      }
    });

    const isValid = errors.length === 0 && Boolean(matchedBranch && matchedStage);

    return {
      rowNumber,
      rawRow: rawRowStringified,
      isValid,
      errors,
      warnings,
      data:
        isValid && matchedBranch && matchedStage
          ? {
              code,
              title: title || `QS. ${surahName}: ${startAyah}-${endAyah}`,
              surahName,
              surahNumber,
              startAyah,
              endAyah,
              pageNumber: pageStart,
              pageStart,
              pageEnd,
              branchId: matchedBranch.id,
              branchName: matchedBranch.name,
              stageId: matchedStage.id,
              stage: matchedStage.name,
              stageName: matchedStage.name,
              branchAndLevel: matchedBranch.name,
              status,
              description: description || undefined,
            }
          : undefined,
    };
  });

  const validRows = results.filter((r) => r.isValid && r.data).map((r) => r.data!);
  const errorSummaries: ImportRowErrorSummary[] = results
    .filter((r) => !r.isValid)
    .map((r) => ({
      rowNumber: r.rowNumber,
      identifier:
        r.rawRow['Kode Soal'] ||
        r.rawRow['Kode_Maqra'] ||
        r.rawRow['Judul Maqra'] ||
        r.rawRow['Judul_Paket'] ||
        `Baris ${r.rowNumber}`,
      reasons: r.errors,
      rawRow: r.rawRow,
    }));

  return {
    totalRows: results.length,
    validCount: validRows.length,
    invalidCount: results.length - validRows.length,
    rows: results,
    validRows,
    errors: errorSummaries,
  };
}

export interface ParsedKafilahImportRow {
  code: string;
  name: string;
  region: string;
  contactPerson: string;
  contactPhone: string;
  status: 'Aktif' | 'Nonaktif';
  /** id grup yang sudah ada (kode sama) -> diperbarui, bukan digandakan */
  existingId?: string;
}

/**
 * Validasi baris impor Grup / Kafilah.
 * Kode wajib dan unik (di berkas dan di penyelenggara); kode yang sudah ada diperbarui.
 */
export function validateKafilahImportRows(
  rawRows: Record<string, unknown>[],
  context: { existingKafilahs: Kafilah[] }
): ImportBatchValidationSummary<ParsedKafilahImportRow> {
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  const existingByCode = new Map(context.existingKafilahs.map((k) => [k.code.trim().toUpperCase(), k]));

  const results: ImportRowValidationResult<ParsedKafilahImportRow>[] = rawRows.map((raw, idx) => {
    const rowNumber = getImportRowNumber(raw, idx);
    const errors: string[] = [];
    const warnings: string[] = [];

    const code = findCellValue(raw, ['kode_grup', 'kode_kafilah', 'kode', 'code']).toUpperCase();
    const name = findCellValue(raw, ['nama_grup', 'nama_kafilah', 'grup', 'kafilah', 'nama', 'name']);
    const region = findCellValue(raw, ['wilayah', 'asal_wilayah', 'daerah', 'region', 'kota_kabupaten']);
    const contactPerson = findCellValue(raw, [
      'penanggung_jawab', 'kontak', 'nama_kontak', 'contact_person', 'ketua', 'ketua_kafilah'
    ]);
    const contactPhone = findCellValue(raw, [
      'telepon', 'no_telepon', 'nomor_telepon', 'no_hp', 'hp', 'whatsapp', 'contact_phone'
    ]);
    const statusRaw = findCellValue(raw, ['status']) || 'Aktif';

    if (!code) errors.push('Kode grup wajib diisi.');
    if (!name) errors.push('Nama grup wajib diisi.');
    if (code && code.length > 30) errors.push('Kode grup maksimal 30 karakter.');
    if (name && name.length > 150) errors.push('Nama grup maksimal 150 karakter.');
    if (contactPhone && !/^[0-9+()\-\s.]{5,25}$/.test(contactPhone)) {
      errors.push(`Nomor telepon "${contactPhone}" tidak valid (hanya angka, spasi, +, -, titik, kurung).`);
    }

    if (code) {
      if (seenCodes.has(code)) errors.push(`Duplikasi kode grup "${code}" di dalam berkas.`);
      seenCodes.add(code);
    }
    if (name) {
      const nameKey = name.trim().toLowerCase();
      if (seenNames.has(nameKey)) errors.push(`Duplikasi nama grup "${name}" di dalam berkas.`);
      seenNames.add(nameKey);
      const sameNameOtherCode = context.existingKafilahs.find(
        (k) => k.name.trim().toLowerCase() === nameKey && k.code.trim().toUpperCase() !== code
      );
      if (sameNameOtherCode) {
        errors.push(
          `Nama grup "${name}" sudah dipakai grup lain berkode "${sameNameOtherCode.code}". Pakai kode yang sama untuk memperbarui grup itu.`
        );
      }
    }
    const existing = code ? existingByCode.get(code) : undefined;
    if (existing) warnings.push(`Grup berkode "${code}" sudah ada dan akan diperbarui.`);

    const status: 'Aktif' | 'Nonaktif' = statusRaw.toLowerCase() === 'nonaktif' ? 'Nonaktif' : 'Aktif';

    const rawRowStringified: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (!FORBIDDEN_OBJECT_KEYS.has(k)) rawRowStringified[k] = v === null || v === undefined ? '' : String(v);
    });

    const isValid = errors.length === 0;
    return {
      rowNumber,
      rawRow: rawRowStringified,
      isValid,
      errors,
      warnings,
      data: isValid
        ? {
            code,
            name,
            region: region || existing?.region || '-',
            contactPerson: contactPerson || existing?.contactPerson || '',
            contactPhone: contactPhone || existing?.contactPhone || '',
            status,
            existingId: existing?.id
          }
        : undefined
    };
  });

  const validRows = results.filter((r) => r.isValid && r.data).map((r) => r.data!);
  return {
    totalRows: results.length,
    validCount: validRows.length,
    invalidCount: results.length - validRows.length,
    rows: results,
    validRows,
    errors: results
      .filter((r) => !r.isValid)
      .map((r) => ({
        rowNumber: r.rowNumber,
        identifier: r.rawRow['Kode_Grup'] || r.rawRow['Nama_Grup'] || `Baris ${r.rowNumber}`,
        reasons: r.errors,
        rawRow: r.rawRow
      }))
  };
}

function appendObjectsToWorksheet(
  workbook: ExcelJS.Workbook,
  sheetName: string,
  rows: Record<string, unknown>[]
): void {
  const sheet = workbook.addWorksheet(sheetName);
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  sheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.max(h.length + 4, 18),
  }));
  rows.forEach((row) => {
    sheet.addRow(row);
  });
}

async function triggerWorkbookDownload(
  workbook: ExcelJS.Workbook,
  filename: string
): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Mengunduh Template Excel (.xlsx) untuk Import Peserta.
 */
export async function downloadParticipantExcelTemplate(context: {
  kafilahs: Kafilah[];
  cabangList: CabangItem[];
  stages: StageItem[];
}): Promise<void> {
  const sampleKafilah =
    context.kafilahs.find((k) => k.status === 'Aktif')?.name || 'Kafilah Kota Surabaya';
  const sampleBranch =
    context.cabangList.find((c) => c.status === 'Aktif')?.name || 'Tilawah Dewasa Putra';
  const sampleStage = context.stages[0]?.name || 'Penyisihan';

  const templateData = [
    {
      No_Urut_Administratif: '001',
      ID_Peserta: 'TLW-101',
      Nomor_Undian: '15',
      Nama_Lengkap: 'Ahmad Zaki Mubarak',
      Nama_Ayah: 'H. Abdullah Mubarak',
      Tanggal_Lahir: '31/12/2012',
      Jenis_Kelamin: 'Putra',
      Asal_Kota_Kabupaten: 'Kota Surabaya',
      Asal_Wilayah_Provinsi: 'Jawa Timur',
      Lembaga_Asal: 'PP. Darul Ulum',
      Kafilah: sampleKafilah,
      Cabang: sampleBranch,
      Babak: sampleStage,
      Status: 'Menunggu',
    },
  ];

  const ExcelLib = await loadExcelJS();
  const wb = new ExcelLib.Workbook();
  appendObjectsToWorksheet(wb, 'Template_Peserta', templateData);

  const masterRefRows = [
    ...context.cabangList
      .filter((c) => c.status === 'Aktif')
      .map((c) => ({ Kategori: 'Cabang Aktif', Kode: c.code, Nama: c.name })),
    ...context.kafilahs
      .filter((k) => k.status === 'Aktif')
      .map((k) => ({ Kategori: 'Grup / Kafilah Aktif', Kode: k.code, Nama: k.name })),
    ...context.stages.map((s) => ({
      Kategori: `Babak (${s.branchName || 'Semua Cabang'})`,
      Kode: s.name,
      Nama: `${s.name} - ${s.branchName || 'Semua Cabang'}`,
    })),
  ];
  if (masterRefRows.length > 0) {
    appendObjectsToWorksheet(wb, 'Referensi_Master_Data', masterRefRows);
  }

  void triggerWorkbookDownload(wb, 'Template_Import_Peserta_MTQ.xlsx');
}

/**
 * Ekspor peserta (Grup & Peserta) ke Excel.
 *
 * Sheet "Peserta" memakai judul kolom yang sama dengan template impor, sehingga file ini bisa
 * langsung dilengkapi (mis. Tanggal Lahir) lalu diimpor kembali untuk memperbarui data.
 * Kolom yang hanya untuk dibaca (Nomor_Undian_Babak, Usia, Verifikasi) diabaikan saat impor.
 */
export async function exportParticipantsExcel(params: {
  participants: Participant[];
  kafilahs: Kafilah[];
  /** Nomor hasil undian babak per peserta (kosong = belum diundi) */
  lotteryOf: (p: Participant) => string;
  ageOf: (p: Participant) => number | undefined;
  formatDate: (iso?: string) => string;
  groupLabel?: string;
  filename?: string;
}): Promise<number> {
  const rows = params.participants.map((p) => ({
    No_Urut_Administratif: p.adminSequenceNumber || '',
    ID_Peserta: p.participantId,
    Nomor_Undian_Babak: params.lotteryOf(p) || '',
    Nama_Lengkap: p.name,
    Nama_Ayah: p.fatherName || '',
    Tanggal_Lahir: params.formatDate(p.birthDate),
    Usia: params.ageOf(p) ?? '',
    Jenis_Kelamin: p.gender,
    Asal_Kota_Kabupaten: p.originCity || '',
    Asal_Wilayah_Provinsi: p.originRegion || '',
    Lembaga_Asal: p.originInstitution || '',
    Kafilah: p.kafilahName,
    Cabang: p.branchName,
    Babak: p.stageName,
    Status: p.status,
    Verifikasi: p.verificationStatus || 'Diverifikasi',
  }));

  const ExcelLib = await loadExcelJS();
  const wb = new ExcelLib.Workbook();
  appendObjectsToWorksheet(
    wb,
    'Peserta',
    rows.length > 0 ? rows : [{ Keterangan: 'Tidak ada peserta pada filter ini' }]
  );
  const pesertaSheet = wb.getWorksheet('Peserta');
  if (pesertaSheet && rows.length > 0) {
    pesertaSheet.getRow(1).font = { bold: true };
    pesertaSheet.views = [{ state: 'frozen', ySplit: 1 }];
    // Teks agar Excel tidak mengubah format (mis. "007" menjadi 7)
    ['A', 'B', 'C', 'F'].forEach((col) => {
      pesertaSheet.getColumn(col).numFmt = '@';
    });
  }

  // Sheet grup: jumlah peserta per grup dan per cabang (sesuai filter)
  const branches = Array.from(new Set(params.participants.map((p) => p.branchName))).sort((a, b) =>
    a.localeCompare(b, 'id')
  );
  const byKafilah = new Map<string, Participant[]>();
  params.participants.forEach((p) => {
    const list = byKafilah.get(p.kafilahId) || [];
    list.push(p);
    byKafilah.set(p.kafilahId, list);
  });
  const groupRows = Array.from(byKafilah.entries())
    .map(([kafilahId, list]) => {
      const k = params.kafilahs.find((item) => item.id === kafilahId);
      const row: Record<string, unknown> = {
        Kode_Grup: k?.code || '',
        Nama_Grup: k?.name || list[0]?.kafilahName || '',
        Wilayah: k?.region || '',
        Jumlah_Peserta: list.length,
      };
      branches.forEach((b) => {
        row[b] = list.filter((p) => p.branchName === b).length;
      });
      return row;
    })
    .sort((a, b) => String(a.Nama_Grup).localeCompare(String(b.Nama_Grup), 'id'));
  if (groupRows.length > 0) {
    appendObjectsToWorksheet(wb, (params.groupLabel || 'Grup').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31), groupRows);
  }

  await triggerWorkbookDownload(wb, params.filename || 'Data_Peserta_MTQ.xlsx');
  return rows.length;
}

/**
 * Mengunduh Template Excel (.xlsx) untuk Import Bank Soal (Maqra).
 */
export async function downloadQuestionExcelTemplate(context: {
  cabangList: CabangItem[];
  stages: StageItem[];
}): Promise<void> {
  const sampleBranch =
    context.cabangList.find((c) => c.status === 'Aktif')?.name || 'Tilawah Dewasa Putra';
  const sampleStage = context.stages[0]?.name || 'Penyisihan';

  const templateData = [
    {
      Kode_Maqra: 'MQR-201',
      Judul_Paket: 'Maqra Tilawah Juz 15 Paket A',
      Nama_Surah: 'Al-Isra',
      Nomor_Surah: 17,
      Ayat_Mulai: 1,
      Ayat_Selesai: 10,
      Halaman_Mulai: 282,
      Halaman_Selesai: 283,
      Cabang: sampleBranch,
      Babak: sampleStage,
      Status: 'Aktif',
      Deskripsi: "Fokus mad thabi'i dan waqaf tam",
    },
  ];

  const ExcelLib = await loadExcelJS();
  const wb = new ExcelLib.Workbook();
  appendObjectsToWorksheet(wb, 'Template_Bank_Soal', templateData);

  const masterRefRows = [
    ...context.cabangList
      .filter((c) => c.status === 'Aktif')
      .map((c) => ({ Kategori: 'Cabang Aktif', Kode: c.code, Nama: c.name })),
    ...context.stages.map((s) => ({
      Kategori: `Babak (${s.branchName || 'Semua Cabang'})`,
      Kode: s.name,
      Nama: `${s.name} - ${s.branchName || 'Semua Cabang'}`,
    })),
  ];
  if (masterRefRows.length > 0) {
    appendObjectsToWorksheet(wb, 'Referensi_Master_Data', masterRefRows);
  }

  void triggerWorkbookDownload(wb, 'Template_Import_Bank_Soal_MTQ.xlsx');
}

/**
 * Mengunduh Template Excel (.xlsx) untuk Impor Grup / Kafilah.
 */
export async function downloadKafilahExcelTemplate(context: { groupLabel?: string }): Promise<void> {
  const templateData = [
    {
      Kode_Grup: 'KF-BDG',
      Nama_Grup: 'Kota Bandung',
      Wilayah: 'Jawa Barat',
      Penanggung_Jawab: 'Ust. Ahmad Fauzi',
      Telepon: '0812-3456-7890',
      Status: 'Aktif'
    },
    {
      Kode_Grup: 'KF-BGR',
      Nama_Grup: 'Kabupaten Bogor',
      Wilayah: 'Jawa Barat',
      Penanggung_Jawab: 'H. Dedi Mulyadi',
      Telepon: '0811-1122-4455',
      Status: 'Aktif'
    }
  ];
  const ExcelLib = await loadExcelJS();
  const wb = new ExcelLib.Workbook();
  appendObjectsToWorksheet(wb, 'Template_Grup', templateData);
  appendObjectsToWorksheet(wb, 'Petunjuk', [
    { Kolom: 'Kode_Grup', Keterangan: 'Wajib, unik. Kode yang sudah ada akan diperbarui, bukan digandakan.' },
    { Kolom: 'Nama_Grup', Keterangan: `Wajib. Nama ${context.groupLabel || 'grup / kafilah'}.` },
    { Kolom: 'Wilayah', Keterangan: 'Opsional. Kota/kabupaten atau provinsi asal.' },
    { Kolom: 'Penanggung_Jawab', Keterangan: 'Opsional. Nama ketua atau kontak grup.' },
    { Kolom: 'Telepon', Keterangan: 'Opsional. Angka, spasi, +, -, titik, kurung.' },
    { Kolom: 'Status', Keterangan: 'Aktif atau Nonaktif (bawaan Aktif).' }
  ]);
  void triggerWorkbookDownload(wb, 'Template_Import_Grup_MTQ.xlsx');
}

/**
 * Mengunduh laporan baris gagal/error hasil validasi import dalam format Excel (.xlsx).
 */
export async function downloadImportErrorReport<TData>(
  rows: Array<ImportRowValidationResult<TData> | ImportRowErrorSummary>,
  filename = 'Laporan_Error_Import_MTQ.xlsx'
): Promise<void> {
  const reportData = rows
    .filter((r) => ('isValid' in r ? !r.isValid : true))
    .map((r) => {
      if ('reasons' in r) {
        return {
          Baris_Excel: r.rowNumber,
          Identitas: r.identifier,
          Status_Validasi: 'GAGAL',
          Alasan_Penolakan: r.reasons.join(' | '),
          ...r.rawRow,
        };
      }
      return {
        Baris_Excel: r.rowNumber,
        Status_Validasi: 'GAGAL',
        Alasan_Penolakan: r.errors.join(' | '),
        Peringatan: r.warnings.join(' | '),
        ...r.rawRow,
      };
    });

  const ExcelLib = await loadExcelJS();
  const wb = new ExcelLib.Workbook();
  appendObjectsToWorksheet(
    wb,
    'Laporan_Error',
    reportData.length > 0
      ? reportData
      : [{ Baris_Excel: '-', Status_Validasi: 'OK', Alasan_Penolakan: 'Tidak ada baris error' }]
  );
  void triggerWorkbookDownload(wb, filename);
}
