import React from 'react';
import {
  Users,
  Building,
  Gavel,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  Clock,
  AlertCircle,
  Award,
  Layers,
  Sparkles
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const DashboardView: React.FC = () => {
  const {
    currentTenant,
    participants,
    kafilahs,
    users,
    setCurrentView,
    setSelectedParticipantId,
    activityLogs,
    getParticipantProgress
  } = useMtq();

  // Statistics dynamically derived
  const totalParticipants = participants.length;
  const totalKafilah = kafilahs.length;
  const totalHakim = users.filter((u) => u.role === 'judge').length;

  const lengkapCount = participants.filter((p) => getParticipantProgress(p.id) === 'Lengkap').length;
  const ongoingCount = participants.filter((p) => getParticipantProgress(p.id) === 'Berlangsung').length;
  const pendingCount = participants.filter((p) => getParticipantProgress(p.id) === 'Belum Dimulai').length;
  const waitingOtherCount = participants.filter((p) => getParticipantProgress(p.id) === 'Menunggu Hakim Lain').length;

  const completionPercentage =
    totalParticipants > 0 ? Math.round((lengkapCount / totalParticipants) * 100) : 0;

  // Active participant currently being scored
  const ongoingParticipant =
    participants.find((p) => getParticipantProgress(p.id) === 'Berlangsung') ||
    participants.find((p) => p.status === 'Berlangsung') ||
    participants[0] ||
    null;

  const handleOpenActiveScoring = () => {
    if (ongoingParticipant) {
      setSelectedParticipantId(ongoingParticipant.id);
      setCurrentView('penilaian_dual_panel');
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 tracking-wide">
            {currentTenant.name}
          </p>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-0.5">
            Dashboard Utama
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{currentTenant.eventName}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentView('rekap_nilai')}
            className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Rekap Nilai</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards Row derived dynamically */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Peserta */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Total Peserta</span>
            <Users className="w-4 h-4" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums font-mono">
            {totalParticipants}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Terdaftar di seluruh babak</p>
        </div>

        {/* Grup */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Grup / Kafilah</span>
            <Building className="w-4 h-4" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums font-mono">
            {totalKafilah}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Kabupaten & Kota utusan</p>
        </div>

        {/* Hakim (Derived from active judge users, NOT hardcoded 18) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Dewan Hakim</span>
            <Gavel className="w-4 h-4" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums font-mono">
            {totalHakim}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Akun hakim penilai aktif</p>
        </div>

        {/* Penilaian Selesai */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Penilaian Lengkap</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-3xl font-bold text-slate-900 tabular-nums font-mono">
              {lengkapCount}
            </span>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
              {completionPercentage}%
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {waitingOtherCount > 0 ? `${waitingOtherCount} menunggu hakim lain` : 'Semua hakim sinkron'}
          </p>
        </div>
      </div>

      {/* Active Session & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Participant Scoring Banner */}
        <div className="lg:col-span-2 bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-2xl p-6 shadow-md flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/10 px-2.5 py-0.5 rounded-full text-emerald-200 border border-white/15">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                Sesi Penilaian Aktif
              </span>
            </div>

            {ongoingParticipant ? (
              <div className="space-y-1">
                <p className="text-xs text-emerald-300 font-mono">
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
              <p className="text-sm text-emerald-200">Belum ada peserta yang dinilai saat ini.</p>
            )}
          </div>

          <div className="pt-6 flex flex-wrap items-center gap-3">
            {ongoingParticipant && (
              <button
                onClick={handleOpenActiveScoring}
                className="inline-flex items-center gap-2 bg-white text-emerald-950 font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-emerald-50 active:scale-95 transition-all shadow-sm"
              >
                <span>Buka Lembar Mushaf & Penilaian</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setCurrentView('penilaian_hakim')}
              className="inline-flex items-center gap-2 bg-emerald-900/60 hover:bg-emerald-900 text-white font-medium text-xs px-4 py-2.5 rounded-xl border border-emerald-700/60 transition-all"
            >
              Lihat Daftar Antrean Peserta
            </button>
          </div>
        </div>

        {/* Quick Progression Navigation Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-slate-800 font-bold text-sm mb-3">
              <Award className="w-4 h-4 text-emerald-700" />
              <span>Alur Musabaqah & Kelulusan</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Setelah babak penyisihan selesai, admin dapat memfinalisasi peringkat peserta dan meloloskan peserta terbaik (Top-N) ke babak Semifinal atau Final.
            </p>

            <div className="space-y-2">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <span className="font-medium text-slate-700">Babak Aktif:</span>
                <span className="font-bold text-emerald-800 font-mono">Penyisihan</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                <span className="font-medium text-slate-700">Peserta Lengkap:</span>
                <span className="font-bold text-slate-900 font-mono">{lengkapCount} / {totalParticipants}</span>
              </div>
            </div>
          </div>

          <div className="pt-4 space-y-2">
            <button
              onClick={() => setCurrentView('hasil_kelulusan')}
              className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl shadow-xs transition-all"
            >
              Buka Hasil & Kelulusan Babak
            </button>
            <button
              onClick={() => setCurrentView('stage_management')}
              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all"
            >
              Konfigurasi Babak & Kuota
            </button>
          </div>
        </div>
      </div>

      {/* Activity Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-sm text-slate-900">
              Aktivitas Penilaian & Penyimpanan Terbaru
            </h3>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Tersimpan di local storage</span>
        </div>

        <div className="space-y-2.5">
          {activityLogs.slice(0, 5).map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-lg bg-slate-50 border border-slate-200/70 flex items-start justify-between gap-3 text-xs"
            >
              <div>
                <p className="font-bold text-slate-800">{log.title}</p>
                <p className="text-slate-600 mt-0.5">{log.description}</p>
              </div>
              <span className="text-[10px] font-mono text-slate-400 shrink-0">
                {log.timestamp}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
