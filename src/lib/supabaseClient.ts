import { createClient, SupabaseClient } from '@supabase/supabase-js';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : (process.env || {});
const rawUrl = ((env.VITE_SUPABASE_URL as string) || '').trim();
const rawAnonKey = ((env.VITE_SUPABASE_ANON_KEY as string) || '').trim();

/**
 * Memeriksa apakah kredensial Supabase nyata telah dikonfigurasi.
 * Menolak placeholder URL atau key kosong agar sistem tidak berpurpura-pura tersambung ke server.
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

export interface SupabaseConnectionInfo {
  isConfigured: boolean;
  mode: 'supabase_live' | 'local_offline_fallback';
  statusLabel: string;
  endpointHost: string | null;
}

export function getSupabaseConnectionInfo(): SupabaseConnectionInfo {
  const configured = isSupabaseConfigured();
  if (!configured) {
    return {
      isConfigured: false,
      mode: 'local_offline_fallback',
      statusLabel: 'Mode Lokal / Offline (VITE_SUPABASE_URL & ANON_KEY Belum Dikonfigurasi)',
      endpointHost: null
    };
  }
  let host: string | null = null;
  try {
    host = new URL(rawUrl).host;
  } catch {
    host = null;
  }
  return {
    isConfigured: true,
    mode: 'supabase_live',
    statusLabel: `Tersambung ke Supabase (${host || 'Cloud'})`,
    endpointHost: host
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
