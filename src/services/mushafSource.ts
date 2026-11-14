/**
 * Sumber gambar halaman Mushaf Madinah (604 halaman).
 *
 * Urutan sumber:
 * 1. LOKAL  : /mushaf/page001.webp … page604.webp (di folder public/mushaf/ proyek) — HANYA bila tersedia.
 * 2. Pihak ketiga: android.quran.com, lalu everyayah.com (cadangan).
 *
 * Ketersediaan gambar lokal diperiksa SEKALI per sesi dengan meminta halaman 1.
 * Bila folder public/mushaf/ tidak ada, server mengembalikan index.html (rewrite SPA) atau 404,
 * sehingga terdeteksi "tidak tersedia" dan aplikasi langsung memakai sumber pihak ketiga.
 */

export const MUSHAF_TOTAL_PAGES = 604;
export const LOCAL_MUSHAF_BASE = '/mushaf';

const SESSION_KEY = 'mtq_mushaf_local_available_v1';

export const padMushafPage = (page: number): string => String(page).padStart(3, '0');

export const localMushafUrl = (page: number): string => `${LOCAL_MUSHAF_BASE}/page${padMushafPage(page)}.webp`;

export const remoteMushafUrls = (page: number): string[] => {
  const pad = padMushafPage(page);
  return [
    `https://android.quran.com/data/width_1260/page${pad}.png`,
    `https://everyayah.com/data/quranpages_hafs_1260/page${pad}.png`
  ];
};

/** Daftar sumber berurutan untuk satu halaman. */
export const getMushafPageSources = (page: number, hasLocal: boolean): string[] =>
  hasLocal ? [localMushafUrl(page), ...remoteMushafUrls(page)] : remoteMushafUrls(page);

let cachedResult: boolean | null = null;
let pending: Promise<boolean> | null = null;

/** Nilai yang sudah diketahui tanpa menunggu jaringan (null = belum diperiksa). */
export function getKnownLocalMushafAvailability(): boolean | null {
  if (cachedResult !== null) return cachedResult;
  try {
    const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null;
    if (stored === '1' || stored === '0') {
      cachedResult = stored === '1';
      return cachedResult;
    }
  } catch {
    // sessionStorage bisa tidak tersedia (mode privat); abaikan
  }
  return null;
}

/** Periksa apakah folder public/mushaf/ tersedia. Hasil disimpan per sesi. */
export function detectLocalMushaf(): Promise<boolean> {
  const known = getKnownLocalMushafAvailability();
  if (known !== null) return Promise.resolve(known);
  if (pending) return pending;
  if (typeof fetch === 'undefined') return Promise.resolve(false);

  pending = fetch(localMushafUrl(1), { method: 'GET', cache: 'force-cache' })
    .then((res) => {
      const type = (res.headers.get('content-type') || '').toLowerCase();
      // Rewrite SPA mengembalikan text/html dengan status 200: itu berarti file TIDAK ada
      return res.ok && type.startsWith('image/');
    })
    .catch(() => false)
    .then((available) => {
      cachedResult = available;
      try {
        sessionStorage.setItem(SESSION_KEY, available ? '1' : '0');
      } catch {
        // abaikan
      }
      pending = null;
      return available;
    });
  return pending;
}

/**
 * Unduh lebih dulu halaman-halaman maqra agar tersimpan di cache perangkat (service worker),
 * sehingga mushaf tetap tampil bila Wi-Fi putus di tengah penilaian.
 */
export function prefetchMushafPages(pages: number[], hasLocal: boolean): void {
  if (typeof Image === 'undefined') return;
  const unique = Array.from(new Set(pages.filter((p) => p >= 1 && p <= MUSHAF_TOTAL_PAGES))).slice(0, 12);
  unique.forEach((page) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = getMushafPageSources(page, hasLocal)[0];
  });
}
