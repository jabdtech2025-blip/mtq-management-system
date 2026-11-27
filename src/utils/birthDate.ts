/**
 * Tanggal lahir peserta (participants.birth_date, format YYYY-MM-DD) dan usia.
 * Usia dihitung dalam tahun penuh pada tanggal acuan (bawaan: hari ini).
 */

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const validYmd = (y: number, m: number, d: number): boolean => {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};

const todayIso = (): string => {
  const now = new Date();
  return isoOf(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

/**
 * Ubah nilai sel/isian menjadi tanggal YYYY-MM-DD.
 * Menerima: objek Date (sel tanggal Excel), angka seri Excel, "31/12/2012", "31-12-2012",
 * "31.12.2012", dan "2012-12-31". Kosong → ''. Tidak dikenali → null.
 */
export function parseBirthDate(value: unknown): string | null | '' {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // Sel tanggal Excel dibaca sebagai tengah malam UTC
    const y = value.getUTCFullYear();
    const m = value.getUTCMonth() + 1;
    const d = value.getUTCDate();
    return validYmd(y, m, d) ? isoOf(y, m, d) : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1 || value > 120000) return null;
    const ms = Math.round((value - 25569) * 86400000); // seri Excel → epoch
    return parseBirthDate(new Date(ms));
  }
  const text = String(value).trim();
  if (!text) return '';
  let m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? isoOf(y, mo, d) : null;
  }
  m = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? isoOf(y, mo, d) : null;
  }
  if (/^\d+(\.\d+)?$/.test(text)) return parseBirthDate(Number(text));
  return null;
}

/** Pesan galat tanggal lahir; null = valid (kosong juga valid). */
export function validateBirthDate(iso: string, today: string = todayIso()): string | null {
  if (!iso) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return 'Format tanggal lahir tidak dikenali. Gunakan 31/12/2012 atau 2012-12-31.';
  if (iso < '1900-01-01') return 'Tanggal lahir terlalu lama (sebelum tahun 1900).';
  if (iso > today) return 'Tanggal lahir tidak boleh di masa depan.';
  return null;
}

/** Usia dalam tahun penuh; undefined bila tanggal kosong/tidak valid. */
export function ageFromBirthDate(iso?: string | null, onDate: string = todayIso()): number | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso > onDate) return undefined;
  const [y, m, d] = iso.split('-').map(Number);
  const [ty, tm, td] = onDate.split('-').map(Number);
  let age = ty - y;
  if (tm < m || (tm === m && td < d)) age -= 1;
  return age >= 0 ? age : undefined;
}

/** Tampilan tanggal Indonesia: "31/12/2012" */
export function formatBirthDate(iso?: string | null): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
