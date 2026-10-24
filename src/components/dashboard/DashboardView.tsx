import React from 'react';
import {
  Users,
  Building,
  Gavel,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const DashboardView: React.FC = () => {
  const {
    currentTenant,
    participants,
    kafilahs,
    setCurrentView,
    setSelectedParticipantId,
    activityLogs
  } = useMtq();

  // Statistics
  const totalParticipants = participants.length;
  const totalKafilah = kafilahs.length;
  const totalHakim = 18; // Default panel configuration

  const finalCount = participants.filter((p) => p.status === 'Final').length;
  const ongoingCount = participants.filter((p) => p.status === 'Berlangsung').length;
  const pendingCount = participants.filter((p) => p.status === 'Menunggu').length;

  const finalPercentage = totalParticipants > 0 ? Math.round((finalCount / totalParticipants) * 100) : 0;

  // Active participant currently being scored
  const ongoingParticipant = participants.find((p) => p.status === 'Berlangsung') || participants[0];

  const handleOpenActiveScoring = () => {
    if (ongoingParticipant) {
      setSelectedParticipantId(ongoingParticipant.id);
      setCurrentView('penilaian_dual_panel');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Breadcrumb & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-slate-500 tracking-wide">
            {currentTenant.name}
          </p>
          <h1 className="text-2xl font-extrabold text-slate-900 mt-0.5">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">{currentTenant.eventName}</p>
        </div>

        <div>
          <button
            onClick={() => setCurrentView('rekap_nilai')}
            className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Rekap nilai</span>
          </button>
        </div>
      </div>

      {/* 4 Stat Cards Row matching screenshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Peserta */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Peserta</span>
            <Users className="w-4 h-4" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums font-mono">
            {totalParticipants}
          </p>
        </div>

        {/* Grup */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Grup</span>
            <Building className="w-4 h-4" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums font-mono">
            {totalKafilah}
          </p>
        </div>

        {/* Hakim */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Hakim</span>
            <Gavel className="w-4 h-4" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums font-mono">
            {totalHakim}
          </p>
        </div>

        {/* Penilaian Final */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Penilaian final</span>
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-3xl font-bold text-slate-900 mt-3 tabular-nums font-mono">
            {finalPercentage}%
          </p>
        </div>
      </div>

      {/* Middle Row: Progress Penilaian & Perlu Perhatian */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Progres Penilaian */}
        <div className="md:col-span-2 bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Progres penilaian</h3>
                <p className="text-xs text-slate-400 mt-0.5">Babak penyisihan</p>
              </div>
              <span className="text-lg font-bold text-slate-800 tabular-nums">
                {finalPercentage}%
              </span>
            </div>

            {/* Tri-color progress bar */}
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex mt-6">
              <div
                style={{ width: `${(finalCount / totalParticipants) * 100}%` }}
                className="bg-emerald-500 h-full transition-all"
                title={`Final: ${finalCount}`}
              />
              <div
                style={{ width: `${(ongoingCount / totalParticipants) * 100}%` }}
                className="bg-amber-400 h-full transition-all"
                title={`Berlangsung: ${ongoingCount}`}
              />
              <div
                style={{ width: `${(pendingCount / totalParticipants) * 100}%` }}
                className="bg-slate-200 h-full transition-all"
                title={`Belum dimulai: ${pendingCount}`}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-8 mt-4 border-t border-slate-100 text-xs">
            <div>
              <p className="text-slate-400 font-medium">Belum dimulai</p>
              <p className="text-base font-bold text-slate-800 mt-1 tabular-nums font-mono">
                {pendingCount}
              </p>
            </div>
            <div>
              <p className="text-amber-600 font-medium">Berlangsung</p>
              <p className="text-base font-bold text-amber-600 mt-1 tabular-nums font-mono">
                {ongoingCount}
              </p>
            </div>
            <div>
              <p className="text-emerald-700 font-medium">Final</p>
              <p className="text-base font-bold text-emerald-700 mt-1 tabular-nums font-mono">
                {finalCount}
              </p>
            </div>
          </div>
        </div>

        {/* Perlu Perhatian */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Perlu perhatian</h3>

          <div className="space-y-4 text-xs">
            <div className="pb-3 border-b border-slate-100">
              <p className="font-semibold text-slate-800">2 peserta belum mendapat maqra</p>
              <p className="text-slate-400 mt-0.5">Jadwal undian pukul 13.30 WIB</p>
            </div>

            <div className="pb-3 border-b border-slate-100">
              <p className="font-semibold text-slate-800">Rubrik “Aslah” belum dikonfirmasi</p>
              <p className="text-slate-400 mt-0.5">Menunggu pengesahan dewan hakim</p>
            </div>

            <div>
              <p className="font-semibold text-slate-800">Semua kanal sinkronisasi aktif</p>
              <p className="text-slate-400 mt-0.5">Tidak ada perubahan tertunda</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Sedang Dinilai & Aktivitas Terbaru */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Sedang Dinilai */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Sedang dinilai</h3>
            <button
              onClick={() => setCurrentView('penilaian_hakim')}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
            >
              Lihat semua <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {ongoingParticipant ? (
            <div
              onClick={handleOpenActiveScoring}
              className="mt-4 p-4 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/20 cursor-pointer transition-all flex items-center justify-between"
            >
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {ongoingParticipant.name}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ongoingParticipant.participantId} · {ongoingParticipant.kafilahName}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-emerald-700 tabular-nums font-mono">
                  98.00
                </span>
                <ArrowRight className="w-4 h-4 text-slate-400" />
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400 mt-4">Tidak ada sesi yang sedang berlangsung.</p>
          )}

          <div className="mt-4 pt-3 text-[11px] text-slate-400">
            Klik kartu untuk langsung menuju lembar penilaian hakim dual-panel.
          </div>
        </div>

        {/* Aktivitas Terbaru */}
        <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-900">Aktivitas terbaru</h3>
            </div>
          </div>

          <div className="mt-3 space-y-3.5 text-xs">
            {activityLogs.slice(0, 3).map((log) => (
              <div key={log.id} className="pb-3 border-b border-slate-100 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800">{log.title}</p>
                  <span className="text-[11px] text-slate-400">{log.timestamp}</span>
                </div>
                <p className="text-slate-500 text-[11px] mt-0.5 line-clamp-1">
                  {log.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
