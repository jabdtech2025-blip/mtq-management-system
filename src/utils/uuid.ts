/**
 * Utilitas Validasi dan Pemetaan UUID Deterministik untuk Integrasi PostgreSQL / Supabase.
 * Menjamin seluruh primary key dan foreign key sesuai dengan tipe UUID database,
 * serta mencegah pengiriman ID tidak valid pada operasi upsert/RPC.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Memeriksa apakah sebuah string merupakan UUID yang sah untuk PostgreSQL.
 */
export function isValidUuid(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (trimmed === NIL_UUID) return true;
  return UUID_REGEX.test(trimmed);
}

/**
 * Menghasilkan UUID v4 baru secara aman di browser maupun lingkungan Node.js.
 */
export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Peta kanonik untuk ID prototipe bawaan ke UUID deterministik yang sama dengan supabase/seed.sql.
 */
export const CANONICAL_SEED_UUIDS: Record<string, string> = {
  system: '00000000-0000-0000-0000-000000000000',
  platform: '00000000-0000-0000-0000-000000000000',
  'tenant-jabar': '11111111-1111-4111-8111-111111111101',
  'tenant-dki': '11111111-1111-4111-8111-111111111102',
  'user-superadmin': '22222222-2222-4222-8222-222222222201',
  'user-admin-rh': '22222222-2222-4222-8222-222222222202',
  'judge-1': '22222222-2222-4222-8222-222222222211',
  'judge-2': '22222222-2222-4222-8222-222222222212',
  'judge-3': '22222222-2222-4222-8222-222222222213',
  'rubric-seni-baca-2025': '33333333-3333-4333-8333-333333333301',
  'rubric-tahfizh-2025': '33333333-3333-4333-8333-333333333302',
  'rubric-tafsir-2025': '33333333-3333-4333-8333-333333333303',
  'field-tjw': '33333333-3333-4333-8333-333333333401',
  'field-fsh': '33333333-3333-4333-8333-333333333402',
  'field-lag': '33333333-3333-4333-8333-333333333403',
  'field-sua': '33333333-3333-4333-8333-333333333404',
  'stage-penyisihan': '44444444-4444-4444-8444-444444444401',
  'stage-semifinal': '44444444-4444-4444-8444-444444444402',
  'stage-final': '44444444-4444-4444-8444-444444444403'
};

/**
 * Mengonversi string non-UUID secara deterministik menjadi UUID v4-compatible (hash-based)
 * untuk menjaga konsistensi referensi jika terdapat ID legacy di localStorage.
 */
export function toDeterministicUuid(seed: string): string {
  const trimmed = (seed || '').trim();
  if (isValidUuid(trimmed)) return trimmed.toLowerCase();
  if (CANONICAL_SEED_UUIDS[trimmed]) return CANONICAL_SEED_UUIDS[trimmed];

  // FNV-1a 128-bit deterministic hash formatted as RFC4122 v4 UUID
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0xdeadbeef;
  let h4 = 0xcafebabe;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((ch << 5) | (ch >>> 3)), 0x01000193) >>> 0;
    h3 = Math.imul(h3 ^ (ch + i), 0x85ebca6b) >>> 0;
    h4 = Math.imul(h4 ^ (ch * 31 + i), 0xc2b2ae35) >>> 0;
  }

  const hex1 = h1.toString(16).padStart(8, '0');
  const hex2 = h2.toString(16).padStart(8, '0');
  const hex3 = h3.toString(16).padStart(8, '0');
  const hex4 = h4.toString(16).padStart(8, '0');

  const p1 = hex1;
  const p2 = hex2.slice(0, 4);
  const p3 = '4' + hex2.slice(5, 8);
  const variantNibble = ((parseInt(hex3[0], 16) & 0x3) | 0x8).toString(16);
  const p4 = variantNibble + hex3.slice(1, 4);
  const p5 = hex3.slice(4, 8) + hex4;

  return `${p1}-${p2}-${p3}-${p4}-${p5}`.toLowerCase();
}

/**
 * Memastikan seluruh ID dalam daftar referensi adalah UUID yang valid sebelum operasi database.
 */
export function validateDatabaseUuids(
  fields: Record<string, string | undefined | null>
): { valid: boolean; invalidFields: string[] } {
  const invalidFields: string[] = [];
  for (const [key, val] of Object.entries(fields)) {
    if (!isValidUuid(val)) {
      invalidFields.push(`${key} ("${val ?? ''}")`);
    }
  }
  return {
    valid: invalidFields.length === 0,
    invalidFields
  };
}
