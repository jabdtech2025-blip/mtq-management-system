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
export function isSupabaseConfigured(customUrl?: string, customAnonKey?: string): boolean {
  const urlToCheck = (customUrl !== undefined ? customUrl : rawUrl).trim();
  const keyToCheck = (customAnonKey !== undefined ? customAnonKey : rawAnonKey).trim();
  if (!urlToCheck || !keyToCheck) return false;
  if (
    urlToCheck.includes('placeholder.supabase.co') ||
    urlToCheck.includes('your-project-ref.supabase.co') ||
    urlToCheck.includes('example.supabase.co')
  ) {
    return false;
  }
  if (
    keyToCheck === 'placeholder-anon-key' ||
    keyToCheck === 'your-anon-key' ||
    keyToCheck.length < 20
  ) {
    return false;
  }
  try {
    const parsed = new URL(urlToCheck);
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

export type AccessGateReason =
  | 'supabase_unconfigured'
  | 'connection_checking'
  | 'schema_missing'
  | 'connection_error'
  | 'unauthenticated'
  | 'invalid_credentials'
  | 'profile_missing'
  | 'membership_empty'
  | 'membership_inactive'
  | 'query_error'
  | 'workspace_hydration_error'
  | null;

// Menyimpan hasil pemeriksaan koneksi database nyata terbaru
let runtimeConnectionState: {
  state: SupabaseDatabaseState;
  isDatabaseReady: boolean;
  isAuthenticated: boolean;
  lastError: string | null;
  isTestClientActive: boolean;
} = {
  state: isSupabaseConfigured() ? 'checking' : 'unconfigured',
  isDatabaseReady: false,
  isAuthenticated: false,
  lastError: null,
  isTestClientActive: false
};

export function setRuntimeSupabaseConnectionState(
  update: Partial<typeof runtimeConnectionState>
): void {
  runtimeConnectionState = {
    ...runtimeConnectionState,
    ...update
  };
}

export function getSupabaseConnectionInfo(): SupabaseConnectionInfo {
  const configured = isSupabaseConfigured() || runtimeConnectionState.isTestClientActive;
  const { state, isDatabaseReady, isAuthenticated, lastError, isTestClientActive } =
    runtimeConnectionState;

  if (!configured && state === 'unconfigured') {
    return {
      isConfigured: false,
      isDatabaseReady: false,
      isAuthenticated: false,
      state: 'unconfigured',
      mode: 'local_offline_fallback',
      statusLabel: 'Konfigurasi Supabase Tidak Tersedia (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY Kosong)',
      endpointHost: null,
      lastError: lastError || 'Variabel environment VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY belum dikonfigurasi.'
    };
  }

  let host: string | null = isTestClientActive ? 'pglite-local-test' : null;
  if (!host && rawUrl) {
    try {
      host = new URL(rawUrl).host;
    } catch {
      host = null;
    }
  }

  if (state === 'schema_missing') {
    return {
      isConfigured: true,
      isDatabaseReady: false,
      isAuthenticated,
      state: 'schema_missing',
      mode: 'local_offline_fallback',
      statusLabel: `Supabase (${host || 'Cloud'}): Skema SQL Belum Dijalankan`,
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
      statusLabel: `Gagal Terhubung ke Supabase (${host || 'Cloud'})`,
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

  return {
    isConfigured: configured,
    isDatabaseReady,
    isAuthenticated,
    state: 'checking',
    mode: configured ? 'supabase_live' : 'local_offline_fallback',
    statusLabel: `Memeriksa Koneksi Supabase (${host || 'Cloud'})...`,
    endpointHost: host,
    lastError
  };
}

/**
 * Evaluasi Gerbang Akses Workspace dengan prinsip FAIL-CLOSED.
 * Workspace operasional TIDAK PERNAH terbuka secara otomatis jika:
 * - Konfigurasi Supabase kosong/tidak valid pada deployment produksi
 * - Koneksi database gagal atau skema belum tersedia
 * - Pengguna belum login atau kredensial salah
 * - Baris profil pada tabel public.profiles tidak ditemukan
 * - Keanggotaan tenant (tenant_memberships) kosong atau seluruhnya Nonaktif
 * - Terjadi error saat query verifikasi profil/membership atau hidrasi workspace
 */
export function evaluateWorkspaceAccessGate(params: {
  isOfflineDemoSimulation: boolean;
  connectionInfo: SupabaseConnectionInfo;
  authenticatedProfile: {
    authUserId: string;
    globalRole: 'superadmin' | 'admin' | 'judge';
    hasProfileRow: boolean;
    inactiveMembershipsCount: number;
    verificationError?: string;
    memberships: Array<{ tenantId: string; role: string; status: string }>;
  } | null;
  dataSourceMode?: 'demo_local' | 'supabase_live' | 'supabase_error';
  workspaceError?: string | null;
}): {
  isAuthorized: boolean;
  reason: AccessGateReason;
} {
  if (params.isOfflineDemoSimulation) {
    return { isAuthorized: true, reason: null };
  }

  const { connectionInfo, authenticatedProfile, dataSourceMode, workspaceError } = params;

  if (!connectionInfo.isConfigured || connectionInfo.state === 'unconfigured') {
    return { isAuthorized: false, reason: 'supabase_unconfigured' };
  }

  if (connectionInfo.state === 'checking') {
    return { isAuthorized: false, reason: 'connection_checking' };
  }

  if (connectionInfo.state === 'schema_missing') {
    return { isAuthorized: false, reason: 'schema_missing' };
  }

  if (connectionInfo.state === 'connection_error' || !connectionInfo.isDatabaseReady) {
    return { isAuthorized: false, reason: 'connection_error' };
  }

  if (!connectionInfo.isAuthenticated || !authenticatedProfile || !authenticatedProfile.authUserId) {
    return { isAuthorized: false, reason: 'unauthenticated' };
  }

  if (authenticatedProfile.verificationError) {
    return { isAuthorized: false, reason: 'query_error' };
  }

  if (!authenticatedProfile.hasProfileRow) {
    return { isAuthorized: false, reason: 'profile_missing' };
  }

  const activeMemberships = (authenticatedProfile.memberships || []).filter(
    (m) => m.status === 'Aktif' && Boolean(m.tenantId)
  );
  if (activeMemberships.length === 0 && authenticatedProfile.globalRole !== 'superadmin') {
    return {
      isAuthorized: false,
      reason:
        authenticatedProfile.inactiveMembershipsCount > 0
          ? 'membership_inactive'
          : 'membership_empty'
    };
  }

  if (dataSourceMode === 'supabase_error' || Boolean(workspaceError)) {
    return { isAuthorized: false, reason: 'workspace_hydration_error' };
  }

  return { isAuthorized: true, reason: null };
}

// Inisialisasi client hanya jika konfigurasi nyata tersedia; jika tidak, bernilai null
export const supabase: SupabaseClient | null = isSupabaseConfigured()
  ? createClient(rawUrl, rawAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

/**
 * Membuat instance client Supabase Auth sementara (non-persisting) agar Admin / Superadmin
 * dapat mendaftarkan akun pengguna baru beserta kata sandi awal tanpa menimpa sesi login aktif milik Admin.
 */
export function createEphemeralSupabaseAuthClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  return createClient(rawUrl, rawAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: `mtq-ephemeral-auth-${Date.now()}`
    }
  });
}

