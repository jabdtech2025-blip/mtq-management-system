import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : (process.env || {});
const rawUrl = ((env.VITE_SUPABASE_URL as string) || '').trim();
const rawAnonKey = ((env.VITE_SUPABASE_ANON_KEY as string) || '').trim();

/**
 * Memeriksa apakah variabel environment VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY tersedia
 * dan bukan nilai placeholder palsu.
 * Catatan penting: Fungsi ini hanya memeriksa keberadaan kredensial, BUKAN membuktikan
 * bahwa tabel/skema database sudah dijalankan. Pemeriksaan nyata dilakukan oleh verifyDatabaseConnection().
 */
export function isSupabaseConfigured(): boolean {
  if (!rawUrl || !rawAnonKey) return false;
  if (rawUrl.includes('placeholder.supabase.co') || rawUrl.includes('your-project-ref.supabase.co')) return false;
  if (rawAnonKey === 'placeholder-anon-key' || rawAnonKey === 'your-anon-key') return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export type SupabaseDatabaseState =
  | 'unconfigured'
  | 'checking'
  | 'schema_missing'
  | 'connected_unauthenticated'
  | 'connected_authenticated'
  | 'connection_error';

export interface SupabaseConnectionInfo {
  isConfigured: boolean;
  isDatabaseReady: boolean;
  isAuthenticated: boolean;
  state: SupabaseDatabaseState;
  mode: 'supabase_live' | 'local_offline_fallback';
  statusLabel: string;
  endpointHost: string | null;
  lastError?: string | null;
}

// Menyimpan hasil pemeriksaan koneksi database nyata terbaru
let runtimeConnectionState: {
  state: SupabaseDatabaseState;
  isDatabaseReady: boolean;
  isAuthenticated: boolean;
  lastError: string | null;
} = {
  state: isSupabaseConfigured() ? 'checking' : 'unconfigured',
  isDatabaseReady: false,
  isAuthenticated: false,
  lastError: null
};

export function setRuntimeSupabaseConnectionState(update: Partial<typeof runtimeConnectionState>): void {
  runtimeConnectionState = {
    ...runtimeConnectionState,
    ...update
  };
}

export function getSupabaseConnectionInfo(): SupabaseConnectionInfo {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return {
      isConfigured: false,
      isDatabaseReady: false,
      isAuthenticated: false,
      state: 'unconfigured',
      mode: 'local_offline_fallback',
      statusLabel: 'Mode Lokal / Offline (VITE_SUPABASE_URL & ANON_KEY Belum Dikonfigurasi)',
      endpointHost: null,
      lastError: null
    };
  }

  let host: string | null = null;
  try {
    host = new URL(rawUrl).host;
  } catch {
    host = null;
  }

  const { state, isDatabaseReady, isAuthenticated, lastError } = runtimeConnectionState;

  if (state === 'schema_missing') {
    return {
      isConfigured: true,
      isDatabaseReady: false,
      isAuthenticated,
      state: 'schema_missing',
      mode: 'local_offline_fallback',
      statusLabel: `Supabase (${host || 'Cloud'}): Skema SQL Belum Dijalankan (Fallback Lokal)`,
      endpointHost: host,
      lastError
    };
  }

  if (state === 'connection_error') {
    return {
      isConfigured: true,
      isDatabaseReady: false,
      isAuthenticated: false,
      state: 'connection_error',
      mode: 'local_offline_fallback',
      statusLabel: `Gagal Terhubung ke Supabase (${host || 'Cloud'}) — Mode Lokal`,
      endpointHost: host,
      lastError
    };
  }

  if (state === 'connected_authenticated') {
    return {
      isConfigured: true,
      isDatabaseReady: true,
      isAuthenticated: true,
      state: 'connected_authenticated',
      mode: 'supabase_live',
      statusLabel: `Tersambung ke Supabase (${host || 'Cloud'} · Auth & RLS Aktif)`,
      endpointHost: host,
      lastError: null
    };
  }

  if (state === 'connected_unauthenticated') {
    return {
      isConfigured: true,
      isDatabaseReady: true,
      isAuthenticated: false,
      state: 'connected_unauthenticated',
      mode: 'supabase_live',
      statusLabel: `Skema Supabase Siap (${host || 'Cloud'} · Belum Login Auth)`,
      endpointHost: host,
      lastError: null
    };
  }

  // Default saat kredensial ada tetapi probe jaringan/skema belum selesai atau dalam lingkungan unit test statis
  return {
    isConfigured: true,
    isDatabaseReady,
    isAuthenticated,
    state: 'checking',
    mode: 'supabase_live',
    statusLabel: `Kredensial Supabase Terdeteksi (${host || 'Cloud'})`,
    endpointHost: host,
    lastError
  };
}

// Inisialisasi client hanya jika konfigurasi nyata tersedia; jika tidak, bernilai null
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(rawUrl, rawAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;
