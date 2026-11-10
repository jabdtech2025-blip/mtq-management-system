import quranIndexData from '../data/quranIndex.json';

export interface SurahInfo {
  number: number;
  nameLatin: string;
  nameArabic: string;
  verseCount: number;
  revelationType: 'Makkiyah' | 'Madaniyah';
  pageStart: number;
  pageEnd: number;
}

export interface PageEntry {
  page: number;
  start: [number, number]; // [surah, ayah]
}

export interface MaqraValidationInput {
  surahNumber?: number;
  surahName?: string;
  startAyah: number;
  endAyah: number;
  pageStart?: number;
  pageEnd?: number;
  allowManualPageOverride?: boolean;
}

export interface MaqraValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  computedPageStart: number;
  computedPageEnd: number;
  surahNumber: number;
  surahNameLatin: string;
  surahNameArabic: string;
  pages: number[];
}

const resolvedQuranIndex = ((quranIndexData as unknown as { default?: typeof quranIndexData }).default ??
  quranIndexData) as {
  surahs: Array<{
    number: number;
    nameLatin: string;
    nameArabic: string;
    verseCount: number;
    revelationType?: 'Makkiyah' | 'Madaniyah';
    startPage?: number;
    endPage?: number;
    pageStart?: number;
    pageEnd?: number;
  }>;
  pageStarts?: Array<{ page: number; surah: number; ayah: number }>;
  pages?: Array<{ page: number; start: [number, number] }>;
};

const SURAHS: SurahInfo[] = (resolvedQuranIndex.surahs || []).map((s) => ({
  number: s.number,
  nameLatin: s.nameLatin,
  nameArabic: s.nameArabic,
  verseCount: s.verseCount,
  revelationType: s.revelationType || 'Makkiyah',
  pageStart: s.pageStart ?? s.startPage ?? 1,
  pageEnd: s.pageEnd ?? s.endPage ?? 1,
}));

const PAGES: PageEntry[] = resolvedQuranIndex.pages
  ? resolvedQuranIndex.pages
  : (resolvedQuranIndex.pageStarts || []).map((ps) => ({
      page: ps.page,
      start: [ps.surah, ps.ayah] as [number, number],
    }));

const SURAH_BY_NUMBER = new Map<number, SurahInfo>(
  SURAHS.map((s) => [s.number, s])
);

function normalizeSurahName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^qs\.?\s*/i, '')
    .replace(/^surah\s*/i, '')
    .replace(/^surat\s*/i, '')
    .replace(/['`’‘-]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

const SURAH_ALIASES: Record<string, number> = {
  alfatihah: 1,
  fatihah: 1,
  albaqarah: 2,
  baqarah: 2,
  aliimran: 3,
  alimran: 3,
  annisa: 4,
  nisa: 4,
  almaidah: 5,
  maidah: 5,
  alanam: 6,
  alaraf: 7,
  alanfal: 8,
  attaubah: 9,
  taubah: 9,
  atttawbah: 9,
  yunus: 10,
  hud: 11,
  yusuf: 12,
  arrad: 13,
  ibrahim: 14,
  alhijr: 15,
  annahl: 16,
  alisra: 17,
  baniisrail: 17,
  alkahfi: 18,
  alkahf: 18,
  kahfi: 18,
  maryam: 19,
  taha: 20,
  thaha: 20,
  alanbiya: 21,
  alhajj: 22,
  almuminun: 23,
  annur: 24,
  alfurqan: 25,
  asyshuara: 26,
  asysyuara: 26,
  annaml: 27,
  alqasas: 28,
  alqashash: 28,
  alankabut: 29,
  arrum: 30,
  luqman: 31,
  assajdah: 32,
  alahzab: 33,
  saba: 34,
  fatir: 35,
  fathir: 35,
  yasin: 36,
  yaasin: 36,
  assaffat: 37,
  ashshaffat: 37,
  sad: 38,
  shad: 38,
  azzumar: 39,
  ghafir: 40,
  almumin: 40,
  fussilat: 41,
  fushshilat: 41,
  asyshura: 42,
  asysyura: 42,
  azzukhruf: 43,
  addukhan: 44,
  aljasiyah: 45,
  aljatsiyah: 45,
  alahqaf: 46,
  muhammad: 47,
  alfath: 48,
  alhujurat: 49,
  qaf: 50,
  azzariyat: 51,
  adzdzaariyat: 51,
  attur: 52,
  annajm: 53,
  alqamar: 54,
  arrahman: 55,
  alwaqiah: 56,
  waqiah: 56,
  alhadid: 57,
  almujadilah: 58,
  almujadalah: 58,
  alhasyr: 59,
  alhashr: 59,
  almumtahanah: 60,
  assaff: 61,
  ashshaff: 61,
  aljumuah: 62,
  almunafiqun: 63,
  attaghabun: 64,
  attalaq: 65,
  attahrim: 66,
  almulk: 67,
  mulk: 67,
  alqalam: 68,
  alhaqqah: 69,
  almaarij: 70,
  nuh: 71,
  aljinn: 72,
  aljin: 72,
  almuzzammil: 73,
  almuddassir: 74,
  almuddatstsir: 74,
  alqiyamah: 75,
  alinsan: 76,
  almursalat: 77,
  annaba: 78,
  annaziat: 79,
  abasa: 80,
  attakwir: 81,
  alinfitar: 82,
  alinfithar: 82,
  almutaffifin: 83,
  almuthaffifin: 83,
  alinsyiqaq: 84,
  alburuj: 85,
  attariq: 86,
  aththariq: 86,
  alala: 87,
  alghasyiyah: 88,
  alfajr: 89,
  albalad: 90,
  asysyams: 91,
  allail: 92,
  allayl: 92,
  adduha: 93,
  adhdhuha: 93,
  alinsyirah: 94,
  asysyarh: 94,
  alamnasyrah: 94,
  attin: 95,
  alalaq: 96,
  alqadr: 97,
  albayyinah: 98,
  alzalzalah: 99,
  aladiyat: 100,
  alqariah: 101,
  attakasur: 102,
  attakatsur: 102,
  alasr: 103,
  alashr: 103,
  alhumazah: 104,
  alfil: 105,
  quraisy: 106,
  quraish: 106,
  almaun: 107,
  alkausar: 108,
  alkautsar: 108,
  alkafirun: 109,
  annasr: 110,
  annashr: 110,
  allahab: 111,
  almasad: 111,
  alikhlas: 112,
  alfalaq: 113,
  annas: 114,
};

export function getAllSurahs(): SurahInfo[] {
  return SURAHS;
}

export function getSurah(surahNumber: number): SurahInfo | undefined {
  if (!Number.isInteger(surahNumber)) return undefined;
  return SURAH_BY_NUMBER.get(surahNumber);
}

export function findSurahByName(name: string): SurahInfo | undefined {
  if (!name || typeof name !== 'string') return undefined;
  const trimmed = name.trim();
  const numericMatch = trimmed.match(/^(\d{1,3})\b/);
  if (numericMatch) {
    const num = Number(numericMatch[1]);
    const foundByNum = getSurah(num);
    if (foundByNum) return foundByNum;
  }
  const normalized = normalizeSurahName(trimmed);
  if (!normalized) return undefined;

  const aliasNum = SURAH_ALIASES[normalized];
  if (aliasNum) {
    return getSurah(aliasNum);
  }

  for (const s of SURAHS) {
    if (normalizeSurahName(s.nameLatin) === normalized || s.nameArabic === trimmed) {
      return s;
    }
  }
  return undefined;
}

function compareSurahAyah(s1: number, a1: number, s2: number, a2: number): number {
  if (s1 !== s2) return s1 - s2;
  return a1 - a2;
}

/**
 * Returns the Madinah Mushaf page (1..604) where the given (surah, ayah) appears.
 * Throws an Error if surah or ayah is out of bounds.
 */
export function pageOfAyah(surahNumber: number, ayahNumber: number): number {
  const surah = getSurah(surahNumber);
  if (!surah) {
    throw new Error(`Nomor surah tidak valid: ${surahNumber} (harus 1..114).`);
  }
  if (!Number.isInteger(ayahNumber) || ayahNumber < 1 || ayahNumber > surah.verseCount) {
    throw new Error(
      `Nomor ayat tidak valid untuk QS. ${surah.nameLatin}: ayat ${ayahNumber} (batas 1..${surah.verseCount}).`
    );
  }

  let low = 0;
  let high = PAGES.length - 1;
  let resultPage = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const [pSurah, pAyah] = PAGES[mid].start;
    const cmp = compareSurahAyah(surahNumber, ayahNumber, pSurah, pAyah);
    if (cmp >= 0) {
      resultPage = PAGES[mid].page;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return resultPage;
}

/**
 * Returns the start page, end page, and array of pages for a given surah and ayah range.
 */
export function pagesForRange(
  surahNumber: number,
  startAyah: number,
  endAyah: number
): { pageStart: number; pageEnd: number; pages: number[] } {
  const surah = getSurah(surahNumber);
  if (!surah) {
    throw new Error(`Nomor surah tidak valid: ${surahNumber} (harus 1..114).`);
  }
  if (!Number.isInteger(startAyah) || startAyah < 1 || startAyah > surah.verseCount) {
    throw new Error(
      `Ayat mulai (${startAyah}) di luar batas QS. ${surah.nameLatin} (1..${surah.verseCount}).`
    );
  }
  if (!Number.isInteger(endAyah) || endAyah < startAyah || endAyah > surah.verseCount) {
    throw new Error(
      `Ayat selesai (${endAyah}) tidak valid untuk QS. ${surah.nameLatin} (harus antara ${startAyah}..${surah.verseCount}).`
    );
  }

  const pageStart = pageOfAyah(surahNumber, startAyah);
  const pageEnd = pageOfAyah(surahNumber, endAyah);
  const pages: number[] = [];
  for (let p = pageStart; p <= pageEnd; p++) {
    pages.push(p);
  }
  return { pageStart, pageEnd, pages };
}

/**
 * Returns the human-readable Surah:Ayat range present on a given Mushaf page (1..604).
 */
export function getPageVerseRangeSummary(pageNumber: number): {
  page: number;
  startSurahNumber: number;
  startSurahName: string;
  startAyah: number;
  endSurahNumber: number;
  endSurahName: string;
  endAyah: number;
  label: string;
} | null {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 604) return null;
  const entry = PAGES[pageNumber - 1];
  if (!entry) return null;

  const [startSurahNumber, startAyah] = entry.start;
  const startSurah = getSurah(startSurahNumber)!;

  let endSurahNumber = 114;
  let endAyah = 6;

  if (pageNumber < 604) {
    const [nextSurah, nextAyah] = PAGES[pageNumber].start;
    if (nextAyah > 1) {
      endSurahNumber = nextSurah;
      endAyah = nextAyah - 1;
    } else {
      endSurahNumber = nextSurah - 1;
      const prevSurah = getSurah(endSurahNumber);
      endAyah = prevSurah ? prevSurah.verseCount : 1;
    }
  }

  const endSurah = getSurah(endSurahNumber)!;
  const label =
    startSurahNumber === endSurahNumber
      ? `QS. ${startSurah.nameLatin} (${startSurahNumber}): ${startAyah}–${endAyah}`
      : `QS. ${startSurah.nameLatin} (${startSurahNumber}): ${startAyah} – QS. ${endSurah.nameLatin} (${endSurahNumber}): ${endAyah}`;

  return {
    page: pageNumber,
    startSurahNumber,
    startSurahName: startSurah.nameLatin,
    startAyah,
    endSurahNumber,
    endSurahName: endSurah.nameLatin,
    endAyah,
    label,
  };
}

/**
 * Validates a maqra range (surah, startAyah, endAyah, and optional pageStart/pageEnd)
 * against the 114-surah 604-page Madinah Mushaf index.
 */
export function validateMaqraRange(input: MaqraValidationInput): MaqraValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  let resolvedSurah: SurahInfo | undefined;
  if (input.surahNumber !== undefined && input.surahNumber !== null) {
    resolvedSurah = getSurah(Number(input.surahNumber));
    if (!resolvedSurah) {
      errors.push(`Nomor surah ${input.surahNumber} tidak valid (harus 1..114).`);
    }
  }

  if (input.surahName && input.surahName.trim().length > 0) {
    const byName = findSurahByName(input.surahName);
    if (!byName) {
      errors.push(`Nama surah "${input.surahName}" tidak ditemukan dalam indeks 114 surah Al-Qur'an.`);
    } else if (resolvedSurah && resolvedSurah.number !== byName.number) {
      errors.push(
        `Nama surah "${input.surahName}" (QS. ${byName.number}) tidak cocok dengan nomor surah ${resolvedSurah.number} (QS. ${resolvedSurah.nameLatin}).`
      );
    } else if (!resolvedSurah) {
      resolvedSurah = byName;
    }
  }

  if (!resolvedSurah) {
    if (errors.length === 0) {
      errors.push('Surah wajib dipilih dari indeks 114 surah Al-Qur\'an.');
    }
    return {
      valid: false,
      errors,
      warnings,
      computedPageStart: 1,
      computedPageEnd: 1,
      surahNumber: Number(input.surahNumber) || 0,
      surahNameLatin: input.surahName || '',
      surahNameArabic: '',
      pages: [],
    };
  }

  const startAyah = Number(input.startAyah);
  const endAyah = Number(input.endAyah);

  if (!Number.isInteger(startAyah) || startAyah < 1 || startAyah > resolvedSurah.verseCount) {
    errors.push(
      `Ayat mulai (${input.startAyah}) di luar batas QS. ${resolvedSurah.nameLatin} (1..${resolvedSurah.verseCount} ayat).`
    );
  }

  if (!Number.isInteger(endAyah) || endAyah < 1 || endAyah > resolvedSurah.verseCount) {
    errors.push(
      `Ayat selesai (${input.endAyah}) di luar batas QS. ${resolvedSurah.nameLatin} (1..${resolvedSurah.verseCount} ayat).`
    );
  } else if (Number.isInteger(startAyah) && endAyah < startAyah) {
    errors.push(`Ayat selesai (${endAyah}) tidak boleh lebih kecil dari ayat mulai (${startAyah}).`);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      computedPageStart: resolvedSurah.pageStart,
      computedPageEnd: resolvedSurah.pageStart,
      surahNumber: resolvedSurah.number,
      surahNameLatin: resolvedSurah.nameLatin,
      surahNameArabic: resolvedSurah.nameArabic,
      pages: [],
    };
  }

  const { pageStart: computedPageStart, pageEnd: computedPageEnd, pages } = pagesForRange(
    resolvedSurah.number,
    startAyah,
    endAyah
  );

  const hasExplicitPages =
    input.pageStart !== undefined &&
    input.pageStart !== null &&
    input.pageEnd !== undefined &&
    input.pageEnd !== null;

  if (hasExplicitPages) {
    const pStart = Number(input.pageStart);
    const pEnd = Number(input.pageEnd);

    if (!Number.isInteger(pStart) || pStart < 1 || pStart > 604) {
      errors.push(`Halaman mulai (${input.pageStart}) harus berada di antara 1..604.`);
    }
    if (!Number.isInteger(pEnd) || pEnd < 1 || pEnd > 604) {
      errors.push(`Halaman selesai (${input.pageEnd}) harus berada di antara 1..604.`);
    }
    if (Number.isInteger(pStart) && Number.isInteger(pEnd) && pEnd < pStart) {
      errors.push(`Halaman selesai (${pEnd}) tidak boleh lebih kecil dari halaman mulai (${pStart}).`);
    }

    if (
      errors.length === 0 &&
      (pStart !== computedPageStart || pEnd !== computedPageEnd)
    ) {
      const mismatchMsg = `Halaman mushaf (${pStart}–${pEnd}) tidak sesuai dengan indeks Mushaf Madinah untuk QS. ${resolvedSurah.nameLatin}: ${startAyah}–${endAyah} (seharusnya halaman ${computedPageStart}–${computedPageEnd}).`;
      if (input.allowManualPageOverride) {
        warnings.push(mismatchMsg);
      } else {
        errors.push(mismatchMsg);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    computedPageStart,
    computedPageEnd,
    surahNumber: resolvedSurah.number,
    surahNameLatin: resolvedSurah.nameLatin,
    surahNameArabic: resolvedSurah.nameArabic,
    pages,
  };
}
