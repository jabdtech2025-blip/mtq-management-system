import React, { useState, useMemo } from 'react';
import {
  BookmarkCheck,
  Search,
  Lock,
  Clock,
  Sparkles
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';

export const PenilaianHakimListView: React.FC = () => {
  const {
    currentTenant,
    currentUser,
    users,
    participants,
    stageParticipations,
    judgeAssignments,
    assessments,
    setSelectedParticipantId,
    setCurrentView
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua Status');
  const [branchFilter, setBranchFilter] = useState('Semua Cabang');

  // List of judges in current tenant for admin monitoring selection
  const tenantJudges = useMemo(() => {
    return users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id);
  }, [users, currentTenant.id]);

  const [adminSelectedJudgeId, setAdminSelectedJudgeId] = useState<string>(
    currentUser.role === 'judge' ? currentUser.id : tenantJudges[0]?.id || ''
  );

  const activeJudgeId = currentUser.role === 'judge' ? currentUser.id : adminSelectedJudgeId;
  const activeJudge = users.find((u) => u.id === activeJudgeId) || {
    id: activeJudgeId,
    name: 'Dewan Hakim',
    judgeField: 'Dewan Hakim Penilai',
    mimbarLocation: 'Mimbar Utama'
  };

  // Find assignments strictly for this judge in currentTenant
  const myAssignments = useMemo(() => {
    return judgeAssignments.filter(
      (ja) => ja.tenantId === currentTenant.id && ja.judgeId === activeJudgeId
    );
  }, [judgeAssignments, currentTenant.id, activeJudgeId]);

  // Assigned participants strictly matched by branch and stage in assignments
  const assignedParticipants = useMemo(() => {
    if (myAssignments.length === 0) {
      // STRICT: No silent fallback to all participants!
      return [];
    }

    return participants.filter((p) => {
      if (p.tenantId !== currentTenant.id) return false;
      return myAssignments.some((ja) => {
        const matchesStage = !ja.stageName || ja.stageName === p.stageName;
        const matchesBranch = !ja.branchName || p.branchName.includes(ja.branchName) || ja.branchName.includes(p.branchName);
        return matchesStage && matchesBranch;
      });
    });
  }, [participants, myAssignments, currentTenant.id]);

  // Get assessment for each participant by this judge
  const participantsWithJudgeState = useMemo(() => {
    return assignedParticipants.map((p) => {
      const asm = assessments.find(
        (a) =>
          a.tenantId === currentTenant.id &&
          a.participantId === p.id &&
          a.judgeId === activeJudgeId &&
          (a.stageName === p.stageName || !a.stageName)
      );
      const score = asm ? asm.finalScore.toFixed(2) : '--';
      const status = asm ? asm.status : 'not_started';
      return {
        ...p,
        judgeAssessment: asm,
        judgeScore: score,
        judgeStatus: status
      };
    });
  }, [assignedParticipants, assessments, currentTenant.id, activeJudgeId]);

  const filteredParticipants = participantsWithJudgeState.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.participantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.lotteryNumber.includes(searchQuery) ||
      p.kafilahName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'Semua Status' ||
      (statusFilter === 'Final' && p.judgeStatus === 'finalized') ||
      (statusFilter === 'Berlangsung' && p.judgeStatus === 'in_progress') ||
      (statusFilter === 'Menunggu' && p.judgeStatus === 'not_started');

    const matchesBranch =
      branchFilter === 'Semua Cabang' || p.branchName.includes(branchFilter);

    return matchesSearch && matchesStatus && matchesBranch;
  });

  const totalAssigned = assignedParticipants.length;
  const totalFinal = participantsWithJudgeState.filter(
    (p) => p.judgeStatus === 'finalized'
  ).length;
  const totalInProgress = participantsWithJudgeState.filter(
    (p) => p.judgeStatus === 'in_progress'
  ).length;
  const totalPending = participantsWithJudgeState.filter(
    (p) => p.judgeStatus === 'not_started'
  ).length;

  const handleOpenScoring = (participantId: string) => {
    setSelectedParticipantId(participantId);
    setCurrentView('penilaian_dual_panel');
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Banner Tag matching persona */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider">
              <Sparkles className="w-3 h-3 text-emerald-600" />
              {currentUser.role === 'judge' ? 'Portal Penjurian Mandiri' : 'Mode Pemantauan Penilaian Dewan Hakim'}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500 font-medium">{currentTenant.name}</span>
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900">
            Daftar Penugasan Penilaian Peserta
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Dewan Hakim: <span className="font-semibold text-slate-800">{activeJudge.name}</span> ·{' '}
            {activeJudge.judgeField || 'Bidang Penilaian'} · {activeJudge.mimbarLocation || 'Mimbar Utama'}
          </p>
        </div>

        {/* If Admin / Superadmin: Allow picking which judge to monitor */}
        {currentUser.role !== 'judge' && tenantJudges.length > 0 && (
          <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs flex items-center gap-2">
            <label className="text-xs font-bold text-slate-600">Pantau Hakim:</label>
            <select
              value={adminSelectedJudgeId}
              onChange={(e) => setAdminSelectedJudgeId(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 bg-white"
            >
              {tenantJudges.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} ({j.judgeField || 'Hakim'})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 4 Summary Boxes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Ditugaskan */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Total Ditugaskan</p>
          <p className="text-3xl font-bold text-slate-900 mt-2 tabular-nums font-mono">
            {totalAssigned}
          </p>
        </div>

        {/* Selesai (Final/Terkunci) - Green Border */}
        <div className="bg-white p-5 rounded-xl border-2 border-emerald-200 bg-emerald-50/20 shadow-xs">
          <p className="text-xs font-semibold text-emerald-800">Selesai (Final/Terkunci)</p>
          <p className="text-3xl font-bold text-emerald-800 mt-2 tabular-nums font-mono">
            {totalFinal}
          </p>
        </div>

        {/* Sedang Berlangsung - Yellow Border */}
        <div className="bg-white p-5 rounded-xl border-2 border-amber-200 bg-amber-50/20 shadow-xs">
          <p className="text-xs font-semibold text-amber-700">Sedang Berlangsung</p>
          <p className="text-3xl font-bold text-amber-700 mt-2 tabular-nums font-mono">
            {totalInProgress}
          </p>
        </div>

        {/* Menunggu Tampil */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <p className="text-xs font-medium text-slate-500">Menunggu Tampil</p>
          <p className="text-3xl font-bold text-slate-800 mt-2 tabular-nums font-mono">
            {totalPending}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar matching screenshot */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor undian, nama peserta, atau grup..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Status Penilaian:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none"
            >
              <option value="Semua Status">Semua Status</option>
              <option value="Berlangsung">Berlangsung</option>
              <option value="Final">Final/Terkunci</option>
              <option value="Menunggu">Menunggu</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Cabang:</span>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs outline-none"
            >
              <option value="Semua Cabang">Semua Cabang</option>
              <option value="Tilawah Dewasa Putra">Tilawah Dewasa Putra</option>
              <option value="Tilawah Dewasa Putri">Tilawah Dewasa Putri</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-medium ml-2">
            {filteredParticipants.length} Peserta Ditampilkan
          </span>
        </div>
      </div>

      {/* Participants Assignment Table matching screenshot */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3.5 px-4 text-center">Undian</th>
                <th className="py-3.5 px-4">ID Peserta</th>
                <th className="py-3.5 px-4">Nama Lengkap Peserta</th>
                <th className="py-3.5 px-4">Grup</th>
                <th className="py-3.5 px-4">Cabang & Babak</th>
                <th className="py-3.5 px-4">Soal Maqra Ditugaskan</th>
                <th className="py-3.5 px-4 text-center">Status Saya</th>
                <th className="py-3.5 px-4 text-center">Nilai Saya</th>
                <th className="py-3.5 px-4 text-center">Aksi Penilaian</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <p className="font-semibold text-slate-600">
                      Belum ada peserta yang ditugaskan kepada Anda untuk babak dan cabang ini.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Silakan hubungi administrator MTQ untuk konfigurasi penugasan dewan hakim.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => {
                  const isFinal = p.judgeStatus === 'finalized';
                const isInProgress = p.judgeStatus === 'in_progress';

                return (
                  <tr key={p.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-4 text-center font-bold text-slate-900 font-mono text-sm">
                      {p.lotteryNumber}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-emerald-800">
                      {p.participantId}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {p.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{p.kafilahName}</td>
                    <td className="py-3.5 px-4">
                      <p className="font-medium text-slate-800">{p.branchName}</p>
                      <p className="text-[11px] text-slate-400">{p.stageName}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-emerald-800">{p.assignedMaqra}</p>
                      <p className="text-[11px] text-slate-400">Riwayat Hafs 'an 'Ashim</p>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {isFinal ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Lock className="w-3 h-3" />
                          Final/Terkunci
                        </span>
                      ) : isInProgress ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                          Berlangsung
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                          <Clock className="w-3 h-3 text-slate-400" />
                          Menunggu
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center font-bold font-mono text-sm tabular-nums text-slate-900">
                      {p.judgeScore}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {isInProgress ? (
                        <button
                          onClick={() => handleOpenScoring(p.id)}
                          className="inline-flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg shadow-xs transition-all"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5" />
                          <span>Mulai Menilai</span>
                        </button>
                      ) : isFinal ? (
                        <button
                          onClick={() => handleOpenScoring(p.id)}
                          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>Lihat Lembar</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenScoring(p.id)}
                          className="inline-flex items-center gap-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs px-3 py-1.5 rounded-lg transition-all"
                        >
                          <BookmarkCheck className="w-3.5 h-3.5 text-slate-400" />
                          <span>Mulai Menilai</span>
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
