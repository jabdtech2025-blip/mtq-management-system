import ExcelJS from 'exceljs';
import {
  CabangItem,
  JenjangItem,
  StageItem,
  Kafilah,
  Participant,
  Question,
} from '../types/mtq';
import { validateMaqraRange } from '../services/quranIndex';

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
  levelId: string;
  levelName: string;
  stageId?: string;
  stageName: string;
  status: 'Menunggu' | 'Berlangsung' | 'Lolos' | 'Gugur' | 'Final';
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
  levelId: string;
  levelName: string;
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

/**
 * Membaca file Excel (.xlsx) dari ArrayBuffer atau Uint8Array menggunakan ExcelJS
 * dengan perlindungan ukuran file <= 5 MB, <= 5.000 baris, penolakan formula, & sanitasi prototype.
 */
export async function parseWorkbookToRows(
  buffer: ArrayBuffer | Uint8Array
): Promise<Record<string, unknown>[]> {
  assertWorkbookBufferSize(buffer);

  const uint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const exactArrayBuffer = uint8.buffer.slice(
    uint8.byteOffset,
    uint8.byteOffset + uint8.byteLength
  ) as ArrayBuffer;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exactArrayBuffer);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  if (worksheet.rowCount - 1 > MAX_EXCEL_ROWS) {
    throw new Error(
      `Jumlah baris dalam file Excel (${worksheet.rowCount - 1} baris) melebihi batas maksimum ${MAX_EXCEL_ROWS} baris.`
    );
  }

  const matrix: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(values);
  });

  return validateAndSanitizeRawSheetMatrix(matrix);
}

/**
 * Validasi baris import Peserta terhadap Master Data aktif (Kafilah, Cabang, Jenjang, Babak)
 * tanpa pernah membuat master data liar secara diam-diam.
 */
export function validateParticipantImportRows(
  rawRows: Record<string, unknown>[],
  context: {
    kafilahs: Kafilah[];
    cabangList: CabangItem[];
    jenjangList: JenjangItem[];
    stages: StageItem[];
    existingParticipants: Participant[];
  }
): ImportBatchValidationSummary<ParsedParticipantImportRow> {
  const seenParticipantCodes = new Set<string>();
  const seenBranchLottery = new Set<string>();

  const existingCodes = new Set(
    context.existingParticipants.map((p) => p.participantId.trim().toUpperCase())
  );

  const results: ImportRowValidationResult<ParsedParticipantImportRow>[] = rawRows.map((raw, idx) => {
    const rowNumber = idx + 2; // Baris 1 adalah header
    const errors: string[] = [];
    const warnings: string[] = [];

    const adminSequenceNumber =
      findCellValue(raw, [
        'no_urut',
        'nomor_urut',
        'nomor_urut_administratif',
        'no_urut_administratif',
        'no_urut_administrasi',
        'nomor_urut_administrasi',
        'no',
        'admin_sequence_number',
      ]) || String(idx + 1);

    const participantId = findCellValue(raw, [
      'id_peserta',
      'kode_peserta',
      'participant_id',
      'participant_code',
      'nomor_peserta',
    ]).toUpperCase();

    const lotteryNumber = findCellValue(raw, [
      'nomor_undian',
      'no_undian',
      'undian',
      'lottery_number',
    ]);

    const name = findCellValue(raw, ['nama_lengkap', 'nama_peserta', 'nama', 'name']);
    const fatherName = findCellValue(raw, ['nama_ayah', 'bin_binti', 'ayah', 'father_name']);
    const genderRaw = findCellValue(raw, ['jenis_kelamin', 'gender', 'jk', 'putra_putri']);
    const originCity = findCellValue(raw, [
      'asal_kota',
      'kota_asal',
      'kota_kabupaten',
      'asal_kota_kabupaten',
      'origin_city',
    ]);
    const originRegion = findCellValue(raw, [
      'asal_wilayah',
      'daerah_asal',
      'asal_daerah',
      'asal_wilayah_provinsi',
      'provinsi',
      'asal_provinsi',
      'origin_region',
    ]);
    const originInstitution = findCellValue(raw, [
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
    ]);
    const branchRef = findCellValue(raw, [
      'cabang',
      'cabang_lomba',
      'nama_cabang',
      'kode_cabang',
      'branch',
    ]);
    const levelRef = findCellValue(raw, [
      'jenjang',
      'jenjang_lomba',
      'golongan',
      'marhalah',
      'nama_jenjang',
      'kode_jenjang',
      'level',
    ]);
    const stageRef =
      findCellValue(raw, ['babak', 'babak_aktif', 'babak_musabaqah', 'stage']) || 'Penyisihan';
    const statusRaw = findCellValue(raw, ['status']) || 'Menunggu';

    if (!name) errors.push('Nama lengkap peserta wajib diisi.');
    if (!participantId) errors.push('ID/Kode peserta wajib diisi.');
    if (!lotteryNumber) errors.push('Nomor undian wajib diisi.');

    const normalizedGender = genderRaw.toLowerCase();
    let gender: 'Putra' | 'Putri' = 'Putra';
    if (
      normalizedGender === 'putra' ||
      normalizedGender === 'l' ||
      normalizedGender === 'laki-laki'
    ) {
      gender = 'Putra';
    } else if (
      normalizedGender === 'putri' ||
      normalizedGender === 'p' ||
      normalizedGender === 'perempuan'
    ) {
      gender = 'Putri';
    } else {
      errors.push(`Jenis kelamin "${genderRaw || '-'}" tidak valid (gunakan Putra atau Putri).`);
    }

    const matchedKafilah = context.kafilahs.find(
      (k) =>
        k.status === 'Aktif' &&
        (k.name.toLowerCase() === kafilahRef.toLowerCase() ||
          (k.code || '').toLowerCase() === kafilahRef.toLowerCase() ||
          k.id === kafilahRef)
    );
    if (!matchedKafilah) {
      errors.push(
        `Kafilah/Grup "${kafilahRef || '-'}" tidak ditemukan pada Master Data Kafilah Aktif.`
      );
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

    const fallbackLevel: JenjangItem =
      context.jenjangList.find((j) => j.status === 'Aktif') ||
      context.jenjangList[0] || {
        id: 'jnj-default',
        code: 'UMUM',
        name: 'Umum',
        status: 'Aktif',
      };

    const matchedLevel = levelRef
      ? context.jenjangList.find(
          (j) =>
            j.status === 'Aktif' &&
            (j.name.toLowerCase() === levelRef.toLowerCase() ||
              (j.code || '').toLowerCase() === levelRef.toLowerCase() ||
              j.id === levelRef)
        ) || fallbackLevel
      : fallbackLevel;

    const matchedStage =
      context.stages.find(
        (s) =>
          s.name.toLowerCase() === stageRef.toLowerCase() &&
          (!matchedBranch ||
            !s.branchId ||
            s.branchId === matchedBranch.id ||
            s.branchName === matchedBranch.name)
      ) || context.stages.find((s) => s.name.toLowerCase() === stageRef.toLowerCase());

    if (!matchedStage) {
      errors.push(`Babak "${stageRef}" tidak ditemukan pada konfigurasi Babak Musabaqah.`);
    }

    if (participantId) {
      if (seenParticipantCodes.has(participantId)) {
        errors.push(`Duplikasi ID Peserta "${participantId}" di dalam file Excel.`);
      }
      seenParticipantCodes.add(participantId);
      if (existingCodes.has(participantId)) {
        warnings.push(
          `ID Peserta "${participantId}" sudah ada dan akan diperbarui (idempotent upsert).`
        );
      }
    }

    if (matchedBranch && lotteryNumber) {
      const branchLotteryKey = `${matchedBranch.id}::${lotteryNumber}`;
      if (seenBranchLottery.has(branchLotteryKey)) {
        errors.push(
          `Duplikasi Nomor Undian "${lotteryNumber}" pada cabang "${matchedBranch.name}" di dalam file.`
        );
      }
      seenBranchLottery.add(branchLotteryKey);
    }

    const validStatuses = ['Menunggu', 'Berlangsung', 'Lolos', 'Gugur', 'Final'] as const;
    const matchedStatus =
      validStatuses.find((s) => s.toLowerCase() === statusRaw.toLowerCase()) || 'Menunggu';

    const rawRowStringified: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      if (!FORBIDDEN_OBJECT_KEYS.has(k)) {
        rawRowStringified[k] = v === null || v === undefined ? '' : String(v);
      }
    });

    const isValid = errors.length === 0 && Boolean(matchedKafilah && matchedBranch && matchedLevel);

    return {
      rowNumber,
      rawRow: rawRowStringified,
      isValid,
      errors,
      warnings,
      data:
        isValid && matchedKafilah && matchedBranch && matchedLevel
          ? {
              adminSequenceNumber,
              participantId,
              lotteryNumber,
              name,
              fatherName,
              gender,
              originCity: originCity || matchedKafilah.region,
              originRegion: originRegion || matchedKafilah.region,
              originInstitution,
              kafilahId: matchedKafilah.id,
              kafilahName: matchedKafilah.name,
              branchId: matchedBranch.id,
              branchName: matchedBranch.name,
              levelId: matchedLevel.id,
              levelName: matchedLevel.name,
              stageId: matchedStage?.id,
              stageName: matchedStage?.name || stageRef || 'Penyisihan',
              status: matchedStatus,
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
        r.rawRow['ID Peserta'] ||
        r.rawRow['ID_Peserta'] ||
        r.rawRow['Nama Peserta'] ||
        r.rawRow['Nama_Lengkap'] ||
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

/**
 * Validasi baris import Bank Soal (Maqra) terhadap Master Data aktif (Cabang, Jenjang, Babak).
 */
export function validateQuestionImportRows(
  rawRows: Record<string, unknown>[],
  context: {
    cabangList: CabangItem[];
    jenjangList: JenjangItem[];
    stages: StageItem[];
    existingQuestions: Question[];
  }
): ImportBatchValidationSummary<ParsedQuestionImportRow> {
  const seenCodes = new Set<string>();
  const existingCodes = new Set(context.existingQuestions.map((q) => q.code.trim().toUpperCase()));

  const results: ImportRowValidationResult<ParsedQuestionImportRow>[] = rawRows.map((raw, idx) => {
    const rowNumber = idx + 2;
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
    const levelRef = findCellValue(raw, [
      'jenjang',
      'jenjang_lomba',
      'golongan',
      'marhalah',
      'nama_jenjang',
      'kode_jenjang',
      'level',
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

    const fallbackLevel: JenjangItem =
      context.jenjangList.find((j) => j.status === 'Aktif') ||
      context.jenjangList[0] || {
        id: 'jnj-default',
        code: 'UMUM',
        name: 'Umum',
        status: 'Aktif',
      };

    const matchedLevel = levelRef
      ? context.jenjangList.find(
          (j) =>
            j.status === 'Aktif' &&
            (j.name.toLowerCase() === levelRef.toLowerCase() ||
              (j.code || '').toLowerCase() === levelRef.toLowerCase() ||
              j.id === levelRef)
        ) || fallbackLevel
      : fallbackLevel;

    const matchedStage =
      context.stages.find(
        (s) =>
          s.name.toLowerCase() === stageRef.toLowerCase() &&
          (!matchedBranch ||
            !s.branchId ||
            s.branchId === matchedBranch.id ||
            s.branchName === matchedBranch.name)
      ) || context.stages.find((s) => s.name.toLowerCase() === stageRef.toLowerCase());

    if (!matchedStage) {
      errors.push(`Babak "${stageRef}" tidak ditemukan pada Master Data Babak.`);
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

    const isValid = errors.length === 0 && Boolean(matchedBranch && matchedLevel);

    return {
      rowNumber,
      rawRow: rawRowStringified,
      isValid,
      errors,
      warnings,
      data:
        isValid && matchedBranch && matchedLevel
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
              levelId: matchedLevel.id,
              levelName: matchedLevel.name,
              stageId: matchedStage?.id,
              stage: matchedStage?.name || stageRef || 'Penyisihan',
              stageName: matchedStage?.name || stageRef || 'Penyisihan',
              branchAndLevel: `${matchedBranch.name} - ${matchedLevel.name}`,
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
export function downloadParticipantExcelTemplate(context: {
  kafilahs: Kafilah[];
  cabangList: CabangItem[];
  jenjangList: JenjangItem[];
  stages: StageItem[];
}): void {
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

  const wb = new ExcelJS.Workbook();
  appendObjectsToWorksheet(wb, 'Template_Peserta', templateData);

  const masterRefRows = [
    ...context.cabangList
      .filter((c) => c.status === 'Aktif')
      .map((c) => ({ Kategori: 'Cabang Aktif', Kode: c.code, Nama: c.name })),
    ...context.kafilahs
      .filter((k) => k.status === 'Aktif')
      .map((k) => ({ Kategori: 'Grup / Kafilah Aktif', Kode: k.code, Nama: k.name })),
    ...context.stages.map((s) => ({
      Kategori: 'Babak Aktif',
      Kode: s.id,
      Nama: s.name,
    })),
  ];
  if (masterRefRows.length > 0) {
    appendObjectsToWorksheet(wb, 'Referensi_Master_Data', masterRefRows);
  }

  void triggerWorkbookDownload(wb, 'Template_Import_Peserta_MTQ.xlsx');
}

/**
 * Mengunduh Template Excel (.xlsx) untuk Import Bank Soal (Maqra).
 */
export function downloadQuestionExcelTemplate(context: {
  cabangList: CabangItem[];
  jenjangList: JenjangItem[];
  stages: StageItem[];
}): void {
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

  const wb = new ExcelJS.Workbook();
  appendObjectsToWorksheet(wb, 'Template_Bank_Soal', templateData);

  const masterRefRows = [
    ...context.cabangList
      .filter((c) => c.status === 'Aktif')
      .map((c) => ({ Kategori: 'Cabang Aktif', Kode: c.code, Nama: c.name })),
    ...context.stages.map((s) => ({
      Kategori: 'Babak Aktif',
      Kode: s.id,
      Nama: s.name,
    })),
  ];
  if (masterRefRows.length > 0) {
    appendObjectsToWorksheet(wb, 'Referensi_Master_Data', masterRefRows);
  }

  void triggerWorkbookDownload(wb, 'Template_Import_Bank_Soal_MTQ.xlsx');
}

/**
 * Mengunduh laporan baris gagal/error hasil validasi import dalam format Excel (.xlsx).
 */
export function downloadImportErrorReport<TData>(
  rows: Array<ImportRowValidationResult<TData> | ImportRowErrorSummary>,
  filename = 'Laporan_Error_Import_MTQ.xlsx'
): void {
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

  const wb = new ExcelJS.Workbook();
  appendObjectsToWorksheet(
    wb,
    'Laporan_Error',
    reportData.length > 0
      ? reportData
      : [{ Baris_Excel: '-', Status_Validasi: 'OK', Alasan_Penolakan: 'Tidak ada baris error' }]
  );
  void triggerWorkbookDownload(wb, filename);
}
