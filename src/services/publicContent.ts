/**
 * Pengambil konten publik (landing page & halaman Panduan/Privasi/Ketentuan) untuk pengunjung tanpa login.
 *
 * Sengaja memakai fetch langsung ke REST API Supabase (bukan pustaka supabase-js) agar landing page tetap ringan.
 * Hanya membaca tabel yang memang terbuka untuk publik (site_content, site_pages berstatus published).
 * Hasil disimpan di localStorage agar kunjungan berikutnya langsung tampil, lalu diperbarui di latar.
 */
import { SitePage, SitePageCategory } from '../content/defaultPages';

const env = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}) as Record<string, string | undefined>;
const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY || '').trim();

const CACHE_PREFIX = 'mtq_public_cache_v1:';

export const isPublicContentConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && /^https:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('placeholder'));

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
  } catch {
    // abaikan (mode privat / kuota penuh)
  }
}

async function restGet<T>(pathAndQuery: string, timeoutMs = 6000): Promise<T | null> {
  if (!isPublicContentConfigured() || typeof fetch === 'undefined') return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      signal: controller?.signal
    });
    if (!res.ok) return null; // mis. tabel belum dibuat (migrasi belum dijalankan): pakai bawaan
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ------------------------------ Konten landing ------------------------------ */

export type LandingOverride = Record<string, unknown>;

export const getCachedLandingOverride = (): LandingOverride | null => readCache<LandingOverride>('landing');

export async function fetchLandingOverride(): Promise<LandingOverride | null> {
  const rows = await restGet<Array<{ content: LandingOverride }>>('site_content?key=eq.landing&select=content');
  if (!rows) return null;
  const content = rows[0]?.content && typeof rows[0].content === 'object' ? rows[0].content : {};
  writeCache('landing', content);
  return content;
}

/* ------------------------------ Halaman publik ------------------------------ */

export function mapSitePageRow(r: Record<string, unknown>): SitePage {
  return {
    id: r.id ? String(r.id) : undefined,
    slug: String(r.slug || ''),
    title: String(r.title || ''),
    summary: String(r.summary || ''),
    category: (r.category as SitePageCategory) || 'lainnya',
    bodyMd: String(r.body_md || ''),
    status: r.status === 'published' ? 'published' : 'draft',
    effectiveDate: r.effective_date ? String(r.effective_date) : undefined,
    sortOrder: Number(r.sort_order ?? 100),
    showInFooter: Boolean(r.show_in_footer),
    updatedAt: r.updated_at ? String(r.updated_at) : undefined
  };
}

const PAGE_LIST_COLUMNS = 'id,slug,title,summary,category,status,effective_date,sort_order,show_in_footer,updated_at';

export const getCachedPublishedPages = (): SitePage[] | null => readCache<SitePage[]>('pages');

/** Daftar halaman terbit (tanpa isi) untuk menu & footer. */
export async function fetchPublishedPages(): Promise<SitePage[] | null> {
  const rows = await restGet<Array<Record<string, unknown>>>(
    `site_pages?status=eq.published&select=${PAGE_LIST_COLUMNS}&order=sort_order.asc`
  );
  if (!rows) return null;
  const pages = rows.map(mapSitePageRow);
  writeCache('pages', pages);
  return pages;
}

export const getCachedPage = (slug: string): SitePage | null => readCache<SitePage>(`page:${slug}`);

/** Satu halaman terbit lengkap dengan isinya. null = tidak ada di database (pakai bawaan bila ada). */
export async function fetchPublishedPage(slug: string): Promise<SitePage | null | 'error'> {
  const rows = await restGet<Array<Record<string, unknown>>>(
    `site_pages?status=eq.published&slug=eq.${encodeURIComponent(slug)}&select=*&limit=1`
  );
  if (!rows) return 'error';
  if (!rows[0]) {
    writeCache(`page:${slug}`, null);
    return null;
  }
  const page = mapSitePageRow(rows[0]);
  writeCache(`page:${slug}`, page);
  return page;
}
