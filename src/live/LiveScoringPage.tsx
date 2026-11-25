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
import { LiveFrame } from './LiveFrame';

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

  const sessionNav =
    sessions.length > 1 ? (
      <nav className="flex flex-wrap justify-end gap-2" aria-label="Pilih sesi">
        {sessions.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => chooseSession(s.stageId)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border cursor-pointer ${
              selected?.id === s.id
                ? 'bg-emerald-200 border-emerald-200 text-emerald-950'
                : 'border-emerald-200/40 text-emerald-50 hover:bg-white/10'
            }`}
          >
            {liveSessionLabel(s.display)}
          </button>
        ))}
      </nav>
    ) : null;

  return (
    <LiveFrame organizerName={state?.tenantName} organizerLogoUrl={state?.tenantLogoUrl} headerExtra={sessionNav}>
      {!isLiveScoringConfigured() ? (
        <Notice text="Live scoring belum tersedia." />
      ) : loading ? (
        <Notice text="Memuat…" status />
      ) : failed && !state ? (
        <Notice text="Tidak dapat terhubung. Halaman akan mencoba lagi secara otomatis." />
      ) : !state?.found || !selected?.display ? (
        <Notice text="Belum ada sesi live yang berjalan. Halaman ini akan tampil otomatis begitu panitia memulai sesi." />
      ) : (
        <LiveDisplayCard display={selected.display} />
      )}
    </LiveFrame>
  );
};

const Notice: React.FC<{ text: string; status?: boolean }> = ({ text, status }) => (
  <main className="flex-1 flex items-center justify-center px-6 py-16">
    <p
      role={status ? 'status' : undefined}
      className="max-w-xl text-center text-base sm:text-lg lg:text-xl font-semibold text-emerald-100"
      data-testid="live-notice"
    >
      {text}
    </p>
  </main>
);

export default LiveScoringPage;
