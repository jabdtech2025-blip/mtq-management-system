import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LivePublicState,
  LiveRealtimeStatus,
  applyLiveSessionChange,
  fetchLivePublicState,
  isLiveScoringConfigured,
  liveSessionLabel,
  subscribeLiveSessions
} from '../services/liveScoring';
import { LiveDisplayCard } from './LiveDisplayCard';

/** Muat ulang cadangan bila realtime tidak tersedia, dan pemeriksaan berkala bila tersedia. */
const FALLBACK_POLL_MS = 20_000;
const SAFETY_REFRESH_MS = 5 * 60_000;

const readSelectedFromUrl = (): string | null => {
  try {
    return new URLSearchParams(window.location.search).get('sesi');
  } catch {
    return null;
  }
};

/**
 * Halaman publik Live Scoring: /live/<KODE PENYELENGGARA>.
 * Menampilkan peserta yang sedang tampil (tanpa nilai). Tidak perlu login.
 */
const LiveScoringPage: React.FC<{ tenantCode: string }> = ({ tenantCode }) => {
  const [state, setState] = useState<LivePublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [rtStatus, setRtStatus] = useState<LiveRealtimeStatus>('connecting');
  const [selectedStageId, setSelectedStageId] = useState<string | null>(() => readSelectedFromUrl());
  const rtStatusRef = useRef<LiveRealtimeStatus>('connecting');

  useEffect(() => {
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.appendChild(robots);
    return () => {
      robots.remove();
    };
  }, []);

  const reload = useCallback(async () => {
    const res = await fetchLivePublicState(tenantCode);
    if (res) {
      setState(res);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, [tenantCode]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Realtime: setiap perubahan sesi diterapkan langsung tanpa meminta ulang data
  const tenantId = state?.tenantId;
  useEffect(() => {
    if (!tenantId) return;
    return subscribeLiveSessions(
      tenantId,
      (row) => setState((prev) => (prev ? { ...prev, sessions: applyLiveSessionChange(prev.sessions, row) } : prev)),
      (status) => {
        // Setelah tersambung kembali, ambil ulang agar perubahan selama terputus tidak terlewat
        if (status === 'live' && rtStatusRef.current === 'fallback') void reload();
        rtStatusRef.current = status;
        setRtStatus(status);
      }
    );
  }, [tenantId, reload]);

  useEffect(() => {
    // Belum ada sesi (kode belum dikenal) atau realtime tidak tersedia: periksa berkala
    const interval = window.setInterval(
      () => {
        if (document.visibilityState === 'visible') void reload();
      },
      state?.found && rtStatus === 'live' ? SAFETY_REFRESH_MS : FALLBACK_POLL_MS
    );
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [state?.found, rtStatus, reload]);

  useEffect(() => {
    if (state?.found) {
      document.title = `Live · ${state.eventName || state.tenantName || 'MTQ'}`;
    }
  }, [state?.found, state?.eventName, state?.tenantName]);

  const sessions = state?.sessions || [];
  const selected = useMemo(
    () => sessions.find((s) => s.stageId === selectedStageId) || sessions[0],
    [sessions, selectedStageId]
  );

  const chooseSession = (stageId: string) => {
    setSelectedStageId(stageId);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('sesi', stageId);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // abaikan
    }
  };

  const hasMushaf = Boolean(selected?.display?.participant?.maqra);

  return (
    <div className="min-h-screen bg-slate-950 text-white font-sans flex flex-col items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
      <div className={`w-full space-y-4 ${hasMushaf ? 'max-w-6xl' : 'max-w-2xl'}`}>
        {sessions.length > 1 && (
          <nav className="flex flex-wrap justify-center gap-2" aria-label="Pilih sesi">
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => chooseSession(s.stageId)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
                  selected?.id === s.id
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {liveSessionLabel(s.display)}
              </button>
            ))}
          </nav>
        )}

        <main>
          {!isLiveScoringConfigured() ? (
            <Notice text="Live scoring belum tersedia." />
          ) : loading ? (
            <div role="status" className="py-24 text-center text-slate-400">Memuat…</div>
          ) : failed && !state ? (
            <Notice text="Tidak dapat terhubung. Halaman akan mencoba lagi secara otomatis." />
          ) : !state?.found || !selected?.display ? (
            <Notice text="Belum ada sesi live yang berjalan. Halaman ini akan tampil otomatis begitu panitia memulai sesi." />
          ) : (
            <LiveDisplayCard display={selected.display} organizerName={state.tenantName} />
          )}
        </main>
      </div>
    </div>
  );
};

const Notice: React.FC<{ text: string }> = ({ text }) => (
  <div className="rounded-2xl border border-emerald-800/60 bg-emerald-950/60 py-16 px-6 text-center text-sm text-emerald-100">
    {text}
  </div>
);

export default LiveScoringPage;
