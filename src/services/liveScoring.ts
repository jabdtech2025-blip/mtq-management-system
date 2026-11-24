/**
 * LIVE SCORING — layar publik peserta yang sedang tampil (tanpa nilai).
 *
 * Modul ini dipakai halaman publik /live/<KODE> sehingga sengaja ringan: hanya fetch ke REST API
 * Supabase untuk bacaan awal, dan pustaka supabase-js dimuat belakangan khusus untuk realtime.
 * Data yang tampil dibuat server (RPC live_session_control, migrasi 20261127), bukan oleh browser.
 */

const env = (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {}) as Record<string, string | undefined>;
const SUPABASE_URL = (env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = (env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isLiveScoringConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && /^https:\/\//.test(SUPABASE_URL) && !SUPABASE_URL.includes('placeholder'));

/* --------------------------------- Tipe data -------------------------------- */

export interface LiveMaqra {
  surahName: string;
  surahNumber?: number;
  startAyah?: number;
  endAyah?: number;
  pageStart?: number;
  pageEnd?: number;
}

/** Maqra yang sedang ditampilkan ke publik (index 1 = Maqra 1). */
export interface LiveShownMaqra extends LiveMaqra {
  index: number;
}

export interface LiveParticipantDisplay {
  lotteryNumber: string;
  /** null bila nama disembunyikan */
  name: string | null;
  nameHidden: boolean;
  /** Nama ayah (bin/binti); null bila kosong atau nama disembunyikan */
  fatherName: string | null;
  origin: string;
  branchName: string;
  /** Jumlah maqra peserta (isinya tidak dikirim sampai ditampilkan admin) */
  maqraCount: number;
  /** Maqra yang sedang ditampilkan; null = maqra masih tersembunyi */
  maqra: LiveShownMaqra | null;
}

export interface LiveDisplay {
  stageName: string;
  branchName: string;
  hideNames: boolean;
  participant: LiveParticipantDisplay | null;
  position: number | null;
  total: number;
  updatedAt?: string;
}

export interface LiveSessionRow {
  id: string;
  tenantId?: string;
  stageId: string;
  isActive: boolean;
  hideNames: boolean;
  currentStageParticipationId?: string | null;
  /** Maqra yang sedang ditampilkan (1, 2, ...); null = tersembunyi */
  shownMaqraIndex: number | null;
  display: LiveDisplay | null;
  startedAt?: string | null;
  updatedAt?: string;
}

export interface LivePublicState {
  found: boolean;
  tenantId?: string;
  tenantName?: string;
  eventName?: string;
  tenantCode?: string;
  sessions: LiveSessionRow[];
}

/* ------------------------------ Pembaca & format ----------------------------- */

const str = (v: unknown, fallback = ''): string => (v === null || v === undefined ? fallback : String(v));
const num = (v: unknown): number | undefined => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? undefined : n;
};

/** Ubah isi kolom `display` (snake_case dari server) menjadi bentuk aplikasi. null = tidak ada tampilan. */
export function normalizeLiveDisplay(raw: unknown): LiveDisplay | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  if (!d.stage_name && !d.stageName) return null;
  const p = (d.participant ?? null) as Record<string, unknown> | null;
  const m = (p?.maqra ?? null) as Record<string, unknown> | null;
  return {
    stageName: str(d.stage_name ?? d.stageName),
    branchName: str(d.branch_name ?? d.branchName, 'Semua Cabang'),
    hideNames: Boolean(d.hide_names ?? d.hideNames),
    position: num(d.position) ?? null,
    total: num(d.total) ?? 0,
    updatedAt: d.updated_at || d.updatedAt ? str(d.updated_at ?? d.updatedAt) : undefined,
    participant: p
      ? {
          lotteryNumber: str(p.lottery_number ?? p.lotteryNumber, '-'),
          name: p.name === null || p.name === undefined || p.name === '' ? null : str(p.name),
          fatherName: String(p.father_name ?? p.fatherName ?? '').trim() || null,
          nameHidden: Boolean(p.name_hidden ?? p.nameHidden),
          origin: str(p.origin, '-'),
          branchName: str(p.branch_name ?? p.branchName),
          maqraCount: num(p.maqra_count ?? p.maqraCount) ?? 0,
          maqra: m
            ? {
                index: num(m.index) ?? 1,
                surahName: str(m.surah_name ?? m.surahName),
                surahNumber: num(m.surah_number ?? m.surahNumber),
                startAyah: num(m.start_ayah ?? m.startAyah),
                endAyah: num(m.end_ayah ?? m.endAyah),
                pageStart: num(m.page_start ?? m.pageStart),
                pageEnd: num(m.page_end ?? m.pageEnd)
              }
            : null
        }
      : null
  };
}

export function normalizeLiveSessionRow(raw: unknown): LiveSessionRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!r.id || !(r.stage_id || r.stageId)) return null;
  const isActive = r.is_active === undefined && r.isActive === undefined ? true : Boolean(r.is_active ?? r.isActive);
  const display = normalizeLiveDisplay(r.display);
  return {
    id: str(r.id),
    tenantId: r.tenant_id ? str(r.tenant_id) : undefined,
    stageId: str(r.stage_id ?? r.stageId),
    isActive,
    hideNames: Boolean(r.hide_names ?? r.hideNames ?? display?.hideNames),
    currentStageParticipationId: r.current_stage_participation_id ? str(r.current_stage_participation_id) : null,
    shownMaqraIndex: num(r.shown_maqra_index ?? r.shownMaqraIndex) ?? null,
    display,
    startedAt: r.started_at ? str(r.started_at) : null,
    updatedAt: r.updated_at ? str(r.updated_at) : undefined
  };
}

export function normalizeLivePublicState(raw: unknown): LivePublicState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  if (!r.found) return { found: false, sessions: [] };
  const sessions = (Array.isArray(r.sessions) ? r.sessions : [])
    .map((s) => normalizeLiveSessionRow(s))
    .filter((s): s is LiveSessionRow => Boolean(s && s.display));
  return {
    found: true,
    tenantId: str(r.tenant_id),
    tenantName: str(r.tenant_name),
    eventName: str(r.event_name),
    tenantCode: str(r.tenant_code),
    sessions: sortLiveSessions(sessions)
  };
}

export const liveSessionLabel = (d: LiveDisplay | null | undefined): string =>
  d ? `${d.branchName} · ${d.stageName}` : 'Sesi';

export function sortLiveSessions(sessions: LiveSessionRow[]): LiveSessionRow[] {
  return sessions
    .slice()
    .sort((a, b) => liveSessionLabel(a.display).localeCompare(liveSessionLabel(b.display), 'id'));
}

/**
 * Terapkan satu event realtime (baris live_sessions baru) ke daftar sesi aktif.
 * Sesi yang dihentikan dihapus dari daftar.
 */
export function applyLiveSessionChange(sessions: LiveSessionRow[], rawRow: unknown): LiveSessionRow[] {
  const row = normalizeLiveSessionRow(rawRow);
  if (!row) return sessions;
  const rest = sessions.filter((s) => s.id !== row.id);
  if (!row.isActive || !row.display) return rest;
  return sortLiveSessions([...rest, row]);
}

/** Teks maqra, mis. "QS. Al-Mulk (67): 1–5 · Hal. 562". */
export function formatLiveMaqra(m: LiveMaqra): string {
  const surah = `QS. ${m.surahName}${m.surahNumber ? ` (${m.surahNumber})` : ''}`;
  const ayat =
    m.startAyah !== undefined
      ? `: ${m.startAyah}${m.endAyah !== undefined && m.endAyah !== m.startAyah ? `–${m.endAyah}` : ''}`
      : '';
  const page =
    m.pageStart !== undefined
      ? ` · Hal. ${m.pageStart}${m.pageEnd !== undefined && m.pageEnd !== m.pageStart ? `–${m.pageEnd}` : ''}`
      : '';
  return `${surah}${ayat}${page}`;
}

/** Halaman mushaf yang ditampilkan (urut, unik, maksimal `limit`). */
export function liveMushafPages(maqras: LiveMaqra[], limit = 4): number[] {
  const pages: number[] = [];
  maqras.forEach((m) => {
    if (m.pageStart === undefined) return;
    const end = m.pageEnd !== undefined && m.pageEnd >= m.pageStart ? m.pageEnd : m.pageStart;
    for (let p = m.pageStart; p <= end; p += 1) {
      if (p >= 1 && p <= 604 && !pages.includes(p)) pages.push(p);
    }
  });
  return pages.sort((a, b) => a - b).slice(0, limit);
}

/** Alamat halaman publik live untuk kode penyelenggara. */
export function liveScoringPath(tenantCode: string): string {
  return `/live/${encodeURIComponent((tenantCode || '').trim())}`;
}

/** Kode penyelenggara dari path "/live/<KODE>". null = bukan halaman live. */
export function liveCodeFromPath(pathname: string): string | null {
  const m = /^\/live\/([^/]+)\/?$/.exec(pathname || '');
  if (!m) return null;
  try {
    const code = decodeURIComponent(m[1]).trim();
    return code || null;
  } catch {
    return null;
  }
}

/**
 * Urutan tampil = sama dengan server (live_stage_order): angka nomor undian, teks undian, lalu nama.
 */
export function compareLiveOrder(
  a: { lotteryNumber?: string; name?: string; id?: string },
  b: { lotteryNumber?: string; name?: string; id?: string }
): number {
  const digits = (v?: string) => {
    const d = String(v || '').replace(/[^0-9]/g, '');
    return d === '' ? null : Number(d);
  };
  const na = digits(a.lotteryNumber);
  const nb = digits(b.lotteryNumber);
  if (na !== nb) {
    if (na === null) return 1;
    if (nb === null) return -1;
    return na - nb;
  }
  const la = a.lotteryNumber || '';
  const lb = b.lotteryNumber || '';
  if (la !== lb) return la < lb ? -1 : 1;
  const nameCmp = (a.name || '').localeCompare(b.name || '');
  if (nameCmp !== 0) return nameCmp;
  return (a.id || '') < (b.id || '') ? -1 : (a.id || '') > (b.id || '') ? 1 : 0;
}

/* --------------------------------- Jaringan ---------------------------------- */

/** Bacaan awal halaman publik (tanpa login). null = gagal terhubung. */
export async function fetchLivePublicState(tenantCode: string, timeoutMs = 8000): Promise<LivePublicState | null> {
  if (!isLiveScoringConfigured() || typeof fetch === 'undefined') return null;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_live_sessions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ p_tenant_code: tenantCode }),
      signal: controller?.signal
    });
    if (!res.ok) return null;
    return normalizeLivePublicState(await res.json());
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type LiveRealtimeStatus = 'connecting' | 'live' | 'fallback';

/**
 * Berlangganan perubahan live_sessions milik satu penyelenggara (pengunjung tanpa login).
 * Memakai klien terpisah tanpa sesi login agar tidak memakai/mengganggu sesi admin di browser yang sama.
 * Mengembalikan fungsi untuk berhenti berlangganan.
 */
export function subscribeLiveSessions(
  tenantId: string,
  onRow: (row: unknown) => void,
  onStatus: (status: LiveRealtimeStatus) => void
): () => void {
  let stopped = false;
  let cleanup: (() => void) | null = null;
  if (!isLiveScoringConfigured()) {
    onStatus('fallback');
    return () => undefined;
  }
  onStatus('connecting');
  void import('@supabase/supabase-js')
    .then(({ createClient }) => {
      if (stopped) return;
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'mtq-live-public' }
      });
      const channel = client
        .channel(`live-sessions-${tenantId}`)
        .on(
          'postgres_changes' as never,
          { event: '*', schema: 'public', table: 'live_sessions', filter: `tenant_id=eq.${tenantId}` },
          (payload: { new?: unknown }) => {
            if (payload?.new && Object.keys(payload.new as object).length > 0) onRow(payload.new);
          }
        )
        .subscribe((status: string) => {
          if (status === 'SUBSCRIBED') onStatus('live');
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') onStatus('fallback');
        });
      cleanup = () => {
        void client.removeChannel(channel);
      };
    })
    .catch(() => onStatus('fallback'));
  return () => {
    stopped = true;
    if (cleanup) cleanup();
  };
}

/* ------------------------- Tampilan lokal (Mode Demo) ------------------------- */

export interface LiveEntry {
  /** id partisipasi babak */
  id: string;
  lotteryNumber: string;
  name: string;
  fatherName?: string;
  origin: string;
  maqras: LiveMaqra[];
}

/** Urutan maqra seperti server (live_participation_maqras): halaman awal, lalu waktu penetapan. */
export function orderLiveMaqras<T extends LiveMaqra & { assignedAt?: string }>(maqras: T[]): T[] {
  return maqras
    .slice()
    .sort((a, b) => (a.pageStart ?? 9999) - (b.pageStart ?? 9999) || String(a.assignedAt || '').localeCompare(String(b.assignedAt || '')));
}

/** Urutkan peserta babak seperti server (nomor undian). */
export function orderLiveEntries<T extends { id: string; lotteryNumber?: string; name?: string }>(entries: T[]): T[] {
  return entries.slice().sort(compareLiveOrder);
}

/**
 * Isi layar publik yang dibangun di perangkat (Mode Demo / pratinjau). Sama bentuknya dengan
 * fungsi server live_session_build_display.
 */
export function buildLiveDisplay(params: {
  stageName: string;
  branchName: string;
  hideNames: boolean;
  entries: LiveEntry[];
  currentId: string | null;
  /** Maqra yang ditampilkan (1, 2, ...); null = tersembunyi */
  shownMaqraIndex?: number | null;
}): LiveDisplay {
  const ordered = orderLiveEntries(params.entries);
  const index = params.currentId ? ordered.findIndex((e) => e.id === params.currentId) : -1;
  const current = index >= 0 ? ordered[index] : null;
  return {
    stageName: params.stageName,
    branchName: params.branchName,
    hideNames: params.hideNames,
    position: current ? index + 1 : null,
    total: ordered.length,
    updatedAt: new Date().toISOString(),
    participant: current
      ? {
          lotteryNumber: current.lotteryNumber || '-',
          name: params.hideNames ? null : current.name,
          fatherName: params.hideNames || !current.fatherName?.trim() ? null : current.fatherName.trim(),
          nameHidden: params.hideNames,
          origin: current.origin || '-',
          branchName: params.branchName,
          maqraCount: current.maqras.length,
          maqra:
            params.shownMaqraIndex && current.maqras[params.shownMaqraIndex - 1]
              ? { ...current.maqras[params.shownMaqraIndex - 1], index: params.shownMaqraIndex }
              : null
        }
      : null
  };
}

/** Peserta berikut/sebelumnya menurut urutan undian (tetap di ujung bila sudah awal/akhir). */
export function stepLiveEntry(entries: Array<{ id: string; lotteryNumber?: string; name?: string }>, currentId: string | null, dir: 1 | -1): string | null {
  const ordered = orderLiveEntries(entries);
  if (ordered.length === 0) return null;
  const index = currentId ? ordered.findIndex((e) => e.id === currentId) : -1;
  if (index < 0) return dir === 1 ? ordered[0].id : ordered[ordered.length - 1].id;
  const next = Math.min(ordered.length - 1, Math.max(0, index + dir));
  return ordered[next].id;
}
