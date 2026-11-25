import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Play,
  RefreshCw,
  Square
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { supabaseDataService } from '../../services/supabaseDataService';
import {
  LiveDisplay,
  LiveEntry,
  LiveSessionRow,
  buildLiveDisplay,
  formatLiveMaqra,
  liveScoringPath,
  orderLiveEntries,
  orderLiveMaqras,
  stepLiveEntry
} from '../../services/liveScoring';
import { LiveDisplayCard } from '../../live/LiveDisplayCard';
import { LiveFrame } from '../../live/LiveFrame';
import { toDeterministicUuid } from '../../utils/uuid';
import { Badge, Button, Card, PageHeader, Select } from '../ui';

type ControlAction = 'start' | 'stop' | 'set' | 'next' | 'prev' | 'options' | 'refresh' | 'show_maqra' | 'hide_maqra';

const sameId = (a?: string, b?: string) =>
  Boolean(a && b) && (a === b || toDeterministicUuid(a!) === toDeterministicUuid(b!));

/**
 * SESI LIVE SCORING (admin penyelenggara)
 * Mengatur peserta yang tampil di layar publik /live/<KODE>. Tidak ada nilai yang ditampilkan.
 */
export const LiveScoringControlView: React.FC = () => {
  const {
    currentTenant,
    currentUser,
    stages,
    stageParticipations,
    participants,
    getParticipantStageQuestions,
    isOfflineDemoSimulation
  } = useMtq();

  const isLive = supabaseDataService.isLive() && !isOfflineDemoSimulation;
  const canControl = currentUser.role === 'admin' || currentUser.role === 'superadmin';

  const tenantStages = useMemo(
    () =>
      stages
        .filter((s) => s.tenantId === currentTenant.id)
        .slice()
        .sort((a, b) => (a.branchName || '').localeCompare(b.branchName || '', 'id') || a.order - b.order),
    [stages, currentTenant.id]
  );

  const [selectedStageId, setSelectedStageId] = useState<string>('');
  useEffect(() => {
    if (selectedStageId && tenantStages.some((s) => s.id === selectedStageId)) return;
    const preferred = tenantStages.find((s) => s.status === 'Aktif' && !s.isFinalized) || tenantStages[0];
    setSelectedStageId(preferred?.id || '');
  }, [tenantStages, selectedStageId]);
  const stage = tenantStages.find((s) => s.id === selectedStageId);

  // Peserta babak terpilih (tanpa yang Ditolak), urut nomor undian seperti server
  const entries = useMemo<LiveEntry[]>(() => {
    if (!stage) return [];
    const list: LiveEntry[] = [];
    stageParticipations
      .filter((sp) => sp.tenantId === currentTenant.id && (sp.stageId ? sameId(sp.stageId, stage.id) : sp.stageName === stage.name))
      .forEach((sp) => {
        const p = participants.find((x) => x.id === sp.participantId && x.tenantId === currentTenant.id);
        if (!p || p.verificationStatus === 'Ditolak') return;
        if (!sp.stageId && stage.branchName && stage.branchName !== 'Semua Cabang' && p.branchName !== stage.branchName) return;
        // Urutan Maqra 1, 2, ... sama dengan server
        const maqras = orderLiveMaqras(
          getParticipantStageQuestions(p.id, stage.name).map((q) => ({
            surahName: q.surahName || q.title,
            surahNumber: q.surahNumber,
            startAyah: q.startAyah,
            endAyah: q.endAyah,
            pageStart: q.pageStart ?? q.pageNumber,
            pageEnd: q.pageEnd ?? q.pageStart ?? q.pageNumber,
            assignedAt: q.assignedAt
          }))
        );
        list.push({
          id: sp.id,
          lotteryNumber: sp.lotteryNumber || p.lotteryNumber || '-',
          name: p.name,
          fatherName: p.fatherName,
          origin: p.kafilahName || '-',
          maqras
        });
      });
    return orderLiveEntries(list);
  }, [stage, stageParticipations, participants, currentTenant.id, getParticipantStageQuestions]);

  /* ------------------------------ Status sesi ------------------------------ */
  const [serverSessions, setServerSessions] = useState<LiveSessionRow[]>([]);
  const [localSessions, setLocalSessions] = useState<
    Record<string, { isActive: boolean; hideNames: boolean; currentId: string | null; shownMaqraIndex: number | null }>
  >({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const loadSessions = useCallback(async () => {
    if (!isLive) return;
    const res = await supabaseDataService.fetchLiveSessions(currentTenant.id);
    if (res.success) setServerSessions(res.sessions);
    else setMessage({ type: 'error', text: res.message || 'Gagal memuat sesi live.' });
  }, [isLive, currentTenant.id]);

  useEffect(() => {
    void loadSessions();
    const onFocus = () => void loadSessions();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadSessions]);

  const serverSession = stage ? serverSessions.find((s) => sameId(s.stageId, stage.id)) : undefined;
  const localSession = stage ? localSessions[stage.id] : undefined;
  const isActive = isLive ? Boolean(serverSession?.isActive) : Boolean(localSession?.isActive);
  const hideNames = isLive ? Boolean(serverSession?.hideNames) : Boolean(localSession?.hideNames);
  const currentId = isLive ? serverSession?.currentStageParticipationId || null : localSession?.currentId || null;
  const shownMaqraIndex = isLive ? serverSession?.shownMaqraIndex ?? null : localSession?.shownMaqraIndex ?? null;
  const activeCount = isLive
    ? serverSessions.filter((s) => s.isActive).length
    : Object.values(localSessions).filter((s) => s.isActive).length;

  const display: LiveDisplay | null = useMemo(() => {
    if (!stage || !isActive) return null;
    if (isLive) return serverSession?.display || null;
    return buildLiveDisplay({
      stageName: stage.name,
      branchName: stage.branchName || 'Semua Cabang',
      hideNames,
      entries,
      currentId,
      shownMaqraIndex
    });
  }, [stage, isActive, isLive, serverSession?.display, hideNames, entries, currentId, shownMaqraIndex]);

  const runAction = useCallback(
    async (
      action: ControlAction,
      opts: { stageParticipationId?: string | null; hideNames?: boolean; maqraIndex?: number } = {}
    ) => {
      if (!stage || busy || !canControl) return;
      setMessage(null);
      if (!isLive) {
        // Mode Demo: hanya pratinjau di perangkat ini
        setLocalSessions((prev) => {
          const cur = prev[stage.id] || { isActive: false, hideNames: false, currentId: null, shownMaqraIndex: null };
          const hide = opts.hideNames ?? cur.hideNames;
          let nextId = cur.currentId && entries.some((e) => e.id === cur.currentId) ? cur.currentId : null;
          if (action === 'start') nextId = opts.stageParticipationId || nextId || entries[0]?.id || null;
          if (action === 'set') nextId = opts.stageParticipationId || nextId;
          if (action === 'next') nextId = stepLiveEntry(entries, nextId, 1);
          if (action === 'prev') nextId = stepLiveEntry(entries, nextId, -1);
          // Maqra tersembunyi lagi setiap kali peserta berganti atau sesi dimulai/berhenti
          let maqra = cur.shownMaqraIndex;
          if (action === 'start' || action === 'stop' || action === 'hide_maqra' || nextId !== cur.currentId) maqra = null;
          if (action === 'show_maqra') maqra = opts.maqraIndex ?? null;
          return {
            ...prev,
            [stage.id]: {
              isActive: action === 'start' ? true : action === 'stop' ? false : cur.isActive,
              hideNames: hide,
              currentId: nextId,
              shownMaqraIndex: maqra
            }
          };
        });
        return;
      }
      setBusy(true);
      const res = await supabaseDataService.liveSessionControl({
        stageId: toDeterministicUuid(stage.id),
        action,
        stageParticipationId: opts.stageParticipationId ? toDeterministicUuid(opts.stageParticipationId) : null,
        hideNames: opts.hideNames ?? null,
        maqraIndex: opts.maqraIndex ?? null
      });
      setBusy(false);
      if (!res.success || !res.session) {
        setMessage({ type: 'error', text: res.message || 'Perintah sesi live gagal.' });
        return;
      }
      const session = res.session;
      setServerSessions((prev) => [...prev.filter((s) => s.id !== session.id), session]);
      if (action === 'start') setMessage({ type: 'success', text: 'Sesi live dimulai. Layar publik sudah menampilkan peserta.' });
      if (action === 'stop') setMessage({ type: 'success', text: 'Sesi live dihentikan. Data peserta tidak lagi tampil di layar publik.' });
    },
    [stage, busy, canControl, isLive, entries]
  );

  // Pintasan keyboard operator: panah kanan/kiri (atau Page Down/Up) untuk peserta berikut/sebelumnya
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        void runAction('next');
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        void runAction('prev');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, runAction]);

  const publicUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${liveScoringPath(currentTenant.code || '')}` : '';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ type: 'error', text: `Salin manual alamat ini: ${publicUrl}` });
    }
  };

  const currentIndex = currentId ? entries.findIndex((e) => sameId(e.id, currentId)) : -1;
  const currentEntry = currentIndex >= 0 ? entries[currentIndex] : undefined;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Sesi Live Scoring"
        description="Atur peserta yang sedang tampil di layar publik. Maqra tersembunyi sampai Anda menampilkannya. Nilai tidak pernah ditampilkan."
        badge={activeCount > 0 ? <Badge variant="danger">{activeCount} sesi berjalan</Badge> : undefined}
      />

      {!isLive && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Mode Demo: kendali di bawah hanya memperbarui pratinjau di perangkat ini. Layar publik membutuhkan
          koneksi database lomba.
        </div>
      )}
      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-xs font-semibold ${
            message.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {message.text}
        </div>
      )}

      <Card className="p-4 sm:p-5 space-y-3">
        <div className="text-xs font-bold text-slate-700">Alamat layar publik</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <code className="flex-1 min-w-0 truncate rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800" data-testid="live-public-url">
            {publicUrl}
          </code>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" leftIcon={<Copy />} onClick={() => void copyLink()}>
              {copied ? 'Tersalin' : 'Salin tautan'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leftIcon={<ExternalLink />}
              onClick={() => window.open(publicUrl, '_blank', 'noopener')}
            >
              Buka
            </Button>
          </div>
        </div>
        <p className="text-[11px] text-slate-500">
          Bagikan tautan ini atau tampilkan di proyektor. Satu tautan untuk seluruh penyelenggara; bila beberapa
          sesi berjalan bersamaan, pengunjung bisa memilih sesi.
        </p>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card className="p-4 sm:p-5 space-y-4">
            <Select
              label="Cabang & Babak"
              value={selectedStageId}
              onChange={(e) => setSelectedStageId(e.target.value)}
              data-testid="live-stage-select"
            >
              {tenantStages.map((s) => {
                const running = isLive
                  ? serverSessions.some((x) => x.isActive && sameId(x.stageId, s.id))
                  : Boolean(localSessions[s.id]?.isActive);
                return (
                  <option key={s.id} value={s.id}>
                    {(s.branchName || 'Semua Cabang') + ' · ' + s.name}
                    {running ? ' — LIVE' : ''}
                  </option>
                );
              })}
            </Select>

            <div className="flex flex-wrap items-center gap-2">
              {isActive ? (
                <Button variant="danger" leftIcon={<Square />} loading={busy} disabled={!canControl} onClick={() => void runAction('stop')} data-testid="live-stop">
                  Hentikan Sesi
                </Button>
              ) : (
                <Button
                  leftIcon={<Play />}
                  loading={busy}
                  disabled={!stage || entries.length === 0 || !canControl}
                  onClick={() => void runAction('start')}
                  data-testid="live-start"
                >
                  Mulai Sesi Live
                </Button>
              )}
              {isLive && (
                <Button size="sm" variant="ghost" leftIcon={<RefreshCw />} onClick={() => void (isActive ? runAction('refresh') : loadSessions())}>
                  Muat ulang
                </Button>
              )}
              <label className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideNames}
                  disabled={busy || !stage || !canControl}
                  onChange={(e) => void runAction('options', { hideNames: e.target.checked })}
                  data-testid="live-hide-names"
                />
                Sembunyikan nama peserta
              </label>
            </div>
            {stage && entries.length === 0 && (
              <p className="text-xs text-slate-500">Belum ada peserta terdaftar di babak ini.</p>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="lg"
                leftIcon={<ChevronLeft />}
                disabled={!isActive || busy || currentIndex === 0}
                onClick={() => void runAction('prev')}
                data-testid="live-prev"
              >
                Sebelumnya
              </Button>
              <div className="flex-1 text-center text-xs text-slate-600">
                {isActive && currentIndex >= 0 ? `Peserta ke-${currentIndex + 1} dari ${entries.length}` : 'Sesi belum berjalan'}
                <div className="text-[10px] text-slate-400">Pintasan: panah kiri / kanan</div>
              </div>
              <Button
                size="lg"
                rightIcon={<ChevronRight />}
                disabled={!isActive || busy || currentIndex === entries.length - 1}
                onClick={() => void runAction('next')}
                data-testid="live-next"
              >
                Berikutnya
              </Button>
            </div>
            {isActive && currentEntry && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2" data-testid="live-maqra-controls">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-700">Maqra peserta ini</span>
                  <span className={`text-[11px] font-semibold ${shownMaqraIndex ? 'text-emerald-700' : 'text-slate-500'}`}>
                    {shownMaqraIndex ? `Maqra ${shownMaqraIndex} tampil di layar publik` : 'Tersembunyi dari publik'}
                  </span>
                </div>
                {currentEntry.maqras.length === 0 ? (
                  <p className="text-xs text-slate-500">Peserta ini belum punya maqra.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {currentEntry.maqras.map((m, i) => {
                      const idx = i + 1;
                      const shown = shownMaqraIndex === idx;
                      return (
                        <li key={idx} className="flex items-center gap-2">
                          <span className="flex-1 min-w-0 text-xs text-slate-700 truncate">
                            <span className="font-bold">Maqra {idx}:</span> {formatLiveMaqra(m)}
                          </span>
                          {shown ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              leftIcon={<EyeOff />}
                              disabled={busy || !canControl}
                              onClick={() => void runAction('hide_maqra')}
                              data-testid="live-hide-maqra"
                            >
                              Sembunyikan Maqra
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              leftIcon={<Eye />}
                              disabled={busy || !canControl}
                              onClick={() => void runAction('show_maqra', { maqraIndex: idx })}
                              data-testid={`live-show-maqra-${idx}`}
                            >
                              Tampilkan Maqra {idx}
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 text-xs font-bold text-slate-700">
              Urutan tampil (nomor undian)
            </div>
            <ul className="max-h-[420px] overflow-y-auto divide-y divide-slate-100" data-testid="live-entry-list">
              {entries.map((e, i) => {
                const isCurrent = isActive && sameId(e.id, currentId || '');
                return (
                  <li key={e.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${isCurrent ? 'bg-emerald-50' : ''}`}>
                    <span className="w-6 text-right text-xs text-slate-400 tabular-nums">{i + 1}</span>
                    <span className="w-12 font-mono font-bold tabular-nums text-slate-900">#{e.lotteryNumber}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-slate-900 truncate">{e.name}</span>
                      <span className="block text-xs text-slate-500 truncate">{e.origin}</span>
                    </span>
                    {isCurrent ? (
                      <Badge variant="success">Sedang tampil</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!isActive || busy || !canControl}
                        onClick={() => void runAction('set', { stageParticipationId: e.id })}
                      >
                        Tampilkan
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-700">Pratinjau layar publik</div>
          {display ? (
            <LiveFrame organizerName={currentTenant.name} organizerLogoUrl={currentTenant.logoUrl} compact>
              <LiveDisplayCard display={display} compact />
            </LiveFrame>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-500">
              {isActive ? 'Memuat pratinjau…' : 'Layar publik kosong. Mulai sesi untuk menampilkan peserta.'}
            </div>
          )}
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Nama peserta yang tampil dapat dilihat siapa pun yang membuka tautan. Bila peserta masih anak-anak
            atau ada keberatan dari wali, aktifkan "Sembunyikan nama peserta". Saat sesi dihentikan, data peserta
            langsung dihapus dari layar publik.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LiveScoringControlView;
