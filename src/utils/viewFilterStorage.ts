export interface FilterStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const FILTER_STORAGE_PREFIX = 'mtq_filter';

/**
 * Membuat kunci sessionStorage yang terisolasi per halaman, tenant, dan pengguna
 * agar filter tidak saling bertabrakan saat berpindah tenant atau akun.
 */
export function buildViewFilterKey(view: string, tenantId?: string, userId?: string): string {
  return `${FILTER_STORAGE_PREFIX}:${view}:${tenantId || 'default'}:${userId || 'anon'}`;
}

function resolveSessionStorage(storage?: FilterStorageLike): FilterStorageLike | null {
  if (storage) return storage;
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Membaca filter tampilan tersimpan dari sessionStorage secara aman.
 * Hanya field string yang terdaftar di `defaults` yang diterima; data rusak otomatis fallback ke `defaults`.
 */
export function readViewFilters<T extends Record<string, string>>(
  key: string,
  defaults: T,
  storage?: FilterStorageLike
): T {
  const store = resolveSessionStorage(storage);
  if (!store) return { ...defaults };

  try {
    const raw = store.getItem(key);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...defaults };
    }

    const merged: Record<string, string> = { ...defaults };
    for (const field of Object.keys(defaults)) {
      const value = (parsed as Record<string, unknown>)[field];
      if (typeof value === 'string') {
        merged[field] = value;
      }
    }
    return merged as T;
  } catch {
    return { ...defaults };
  }
}

/**
 * Menyimpan filter tampilan ke sessionStorage secara aman (tanpa throw di private browsing / quota penuh).
 */
export function writeViewFilters<T extends Record<string, string>>(
  key: string,
  values: T,
  storage?: FilterStorageLike
): void {
  const store = resolveSessionStorage(storage);
  if (!store) return;

  try {
    store.setItem(key, JSON.stringify(values));
  } catch {
    // Abaikan kegagalan storage agar tidak mengganggu alur penilaian
  }
}
