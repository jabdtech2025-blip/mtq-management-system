import React from 'react';
import {
  Users,
  Building,
  Gavel,
  CheckCircle2,
  ArrowRight,
  Clock,
  Award
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { formatTimestampDisplay } from '../../utils/dateTime';
import { StatCard, Card, Button, Badge } from '../ui';

export const DashboardView: React.FC = () => {
  const {
    currentTenant,
    participants,
    stageParticipations,
    kafilahs,
    users,
    assessments,
    setCurrentView,
    selectedParticipantId,
    setSelectedParticipantId,
    activityLogs,
    getParticipantProgress,
    questions
  } = useMtq();

  // Statistics dynamically derived and strictly scoped to currentTenant
  const tenantParticipants = participants.filter((p) => p.tenantId === currentTenant.id);
  const tenantStageParticipations = stageParticipations.filter((sp) => sp.tenantId === currentTenant.id);
  const tenantKafilahs = kafilahs.filter((k) => k.tenantId === currentTenant.id);
  const tenantJudges = users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id);

  const totalUniqueParticipants = tenantParticipants.length;
  const totalStageParticipations = tenantStageParticipations.length;
  const totalKafilah = tenantKafilahs.length;
  const totalHakim = tenantJudges.length;

  const lengkapCount = tenantParticipants.filter((p) => getParticipantProgress(p.id) === 'Lengkap').length;
  const waitingOtherCount = tenantParticipants.filter((p) => getParticipantProgress(p.id) === 'Menunggu Hakim Lain').length;

  const completionPercentage =
    totalUniqueParticipants > 0 ? Math.round((lengkapCount / totalUniqueParticipants) * 100) : 0;

  // Real ongoing participant actively being scored or latest active
  const ongoingParticipant = React.useMemo(() => {
    const inProgPart = tenantParticipants.find(
      (p) =>
        getParticipantProgress(p.id) === 'Berlangsung' ||
        (p.status as string) === 'Berlangsung' ||
        (p.status as string) === 'Sedang Tampil'
    );
    if (inProgPart) return inProgPart;

    const activeInProgAsm = assessments.find(
      (a) =>
        (!currentTenant.id || a.tenantId === currentTenant.id) &&
        a.status === 'in_progress'
    );
    if (activeInProgAsm) {
      const match = tenantParticipants.find((p) => p.id === activeInProgAsm.participantId);
      if (match) return match;
    }

    const waitingPart = tenantParticipants.find(
      (p) => getParticipantProgress(p.id) === 'Menunggu Hakim Lain'
    );
    if (waitingPart) return waitingPart;

    if (selectedParticipantId) {
      const selPart = tenantParticipants.find((p) => p.id === selectedParticipantId);
      if (selPart) return selPart;
    }

    const latestAsm = assessments
      .filter((a) => !currentTenant.id || a.tenantId === currentTenant.id)
      .slice()
      .reverse()[0];
    if (latestAsm) {
      const match = tenantParticipants.find((p) => p.id === latestAsm.participantId);
      if (match) return match;
    }

    return tenantParticipants[0] || null;
  }, [tenantParticipants, assessments, currentTenant.id, getParticipantProgress, selectedParticipantId]);

  const handleOpenActiveScoring = () => {
    if (ongoingParticipant) {
      setSelectedParticipantId(ongoingParticipant.id);
      setCurrentView('penilaian_dual_panel');
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* 4 Stat Cards Row derived dynamically */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Peserta Terdaftar"
          value={totalUniqueParticipants}
          subtitle={`${totalStageParticipations} partisipasi babak`}
          icon={<Users />}
          tone="emerald"
        />
        <StatCard
          label="Grup / Kafilah"
          value={totalKafilah}
          subtitle="Utusan daerah aktif"
          icon={<Building />}
          tone="sky"
        />
        <StatCard
          label="Dewan Hakim"
          value={totalHakim}
          subtitle="Hakim penilai di event ini"
          icon={<Gavel />}
          tone="amber"
        />
        <StatCard
          label="Penilaian Lengkap"
          value={lengkapCount}
          badge={<Badge variant="success">{completionPercentage}%</Badge>}
          subtitle={waitingOtherCount > 0 ? `${waitingOtherCount} menunggu hakim lain` : 'Semua hakim sinkron'}
          icon={<CheckCircle2 />}
          tone="emerald"
        />
      </div>

      {/* Active Session & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Participant Scoring Banner (Hero Card: rounded-xl / 20px) */}
        <div className="lg:col-span-2 bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-white/10 px-2.5 py-0.5 rounded-full text-emerald-200 border border-white/15">
                <span className={`w-2 h-2 rounded-full ${ongoingParticipant ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`}></span>
                Sesi Penilaian Aktif
              </span>
            </div>

            {ongoingParticipant ? (
              <div className="space-y-1">
                <p className="text-xs text-emerald-300 font-mono tabular-nums">
                  NOMOR UNDIAN #{ongoingParticipant.lotteryNumber} · {ongoingParticipant.participantId}
                </p>
                <h3 className="text-2xl font-extrabold text-white">
                  {ongoingParticipant.name}
                </h3>
                <p className="text-xs text-emerald-200/90 pt-1">
                  {ongoingParticipant.kafilahName} · {ongoingParticipant.branchName} · {ongoingParticipant.assignedMaqra}
                </p>
              </div>
            ) : (
              <div className="py-2">
                <p className="text-base font-bold text-emerald-100">
                  Tidak ada peserta yang sedang dinilai saat ini
                </p>
                <p className="text-xs text-emerald-300/80 mt-1">
                  Pilih peserta dari antrean penjurian dewan hakim untuk memulai penilaian mimbar musabaqah.
                </p>
              </div>
            )}
          </div>

          <div className="pt-6 flex flex-wrap items-center gap-3">
            {ongoingParticipant ? (
              <button
                type="button"
                onClick={handleOpenActiveScoring}
                className="inline-flex items-center gap-2 h-10 bg-white text-emerald-950 font-bold text-xs px-4 rounded-md hover:bg-emerald-50 transition-all shadow-sm cursor-pointer"
              >
                <span>Buka Lembar Mushaf & Penilaian</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCurrentView('penilaian_hakim')}
              className="inline-flex items-center gap-2 h-10 bg-emerald-900/60 hover:bg-emerald-900 text-white font-semibold text-xs px-4 rounded-md border border-emerald-700/60 transition-all cursor-pointer"
            >
              Lihat Daftar Antrean Peserta
            </button>
          </div>
        </div>

        {/* Quick Progression Navigation Card */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-3">
              <Award className="w-4 h-4 text-emerald-700" />
              <span>Alur Musabaqah & Kelulusan</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Setelah babak penyisihan selesai, admin dapat memfinalisasi peringkat peserta dan meloloskan peserta terbaik (Top-N) ke babak Semifinal atau Final.
            </p>

            <div className="space-y-2">
              <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <span className="font-medium text-slate-700">Babak Aktif:</span>
                <span className="font-bold text-emerald-800 font-mono">Penyisihan</span>
              </div>
              <div className="p-2.5 rounded-md bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <span className="font-medium text-slate-700">Peserta Lengkap:</span>
                <span className="font-bold text-slate-900 font-mono tabular-nums">{lengkapCount} / {totalUniqueParticipants}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => setCurrentView('hasil_kelulusan')}
            >
              Buka Hasil & Kelulusan Babak
            </Button>
            <Button
              variant="secondary"
              size="md"
              fullWidth
              onClick={() => setCurrentView('stage_management')}
            >
              Konfigurasi Babak & Kuota
            </Button>
          </div>
        </Card>
      </div>

      {/* Activity Logs Table */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm text-slate-900">
              Aktivitas Penilaian & Penyimpanan Terbaru
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setCurrentView('log_aktivitas')}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 hover:underline cursor-pointer transition-colors"
          >
            Lihat Semua Log Aktivitas →
          </button>
        </div>

        <div className="space-y-2.5">
          {(() => {
            const list: Array<{ id: string; title: string; description: string; timestamp: string }> = [];

            assessments
              .filter((a) => !currentTenant.id || a.tenantId === currentTenant.id)
              .slice()
              .reverse()
              .forEach((a) => {
                const part = tenantParticipants.find((p) => p.id === a.participantId);
                const partName = part ? `${part.name} (#${part.lotteryNumber})` : a.participantId;
                const statusLabel = a.status === 'finalized' ? 'Finalisasi Nilai Dewan Hakim' : 'Penyimpanan Lembar Penilaian';
                const maqraCode = a.questionId ? questions.find((q) => q.id === a.questionId)?.code : undefined;
                const contextLabel = [maqraCode, a.stageName].filter(Boolean).join(' · ');
                const desc = `Hakim ${a.judgeName} (${a.judgeField}) - Nilai Akhir: ${a.finalScore.toFixed(2)} pts untuk ${partName}${contextLabel ? ` · ${contextLabel}` : ''}.`;
                const ts = a.finalizedAt || a.lastUpdated || 'Baru saja';

                list.push({
                  id: `asm-log-${a.id}`,
                  title: statusLabel,
                  description: desc,
                  timestamp: ts
                });
              });

            activityLogs
              .filter((l) => !currentTenant.id || l.tenantId === currentTenant.id)
              .forEach((l) => {
                if (!list.some((existing) => existing.description === l.description)) {
                  list.push({
                    id: l.id,
                    title: l.title || 'Aktivitas Penilaian',
                    description: l.description,
                    timestamp: l.timestamp
                  });
                }
              });

            if (list.length === 0) {
              list.push({
                id: 'default-log-1',
                title: 'Workspace MTQ Aktif',
                description: `Penyelenggaraan ${currentTenant.name} (${currentTenant.eventName}) siap untuk penjurian.`,
                timestamp: 'Baru saja'
              });
            }

            return list.slice(0, 5).map((log, idx) => (
              <div
                key={`${log.id}-${idx}`}
                className="p-3 rounded-md bg-slate-50 border border-slate-200/80 flex items-start justify-between gap-3 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-800">{log.title}</p>
                  <p className="text-slate-600 mt-0.5">{log.description}</p>
                </div>
                <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                  {formatTimestampDisplay(log.timestamp)}
                </span>
              </div>
            ));
          })()}
        </div>
      </Card>
    </div>
  );
};
