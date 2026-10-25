import React, { useState, useMemo } from 'react';
import {
  Download,
  Search,
  AlertCircle,
  Eye,
  X,
  Lock,
  Layers,
  CheckCircle2,
  Clock,
  Sparkles
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Participant, JudgeAssessment } from '../../types/mtq';

export const RekapNilaiView: React.FC = () => {
  const {
    currentTenant,
    participants,
    assessments,
    users,
    stages,
    judgeAssignments,
    kafilahs,
    getParticipantProgress,
    setSelectedParticipantId,
    setCurrentView
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState('Semua Babak');
  const [selectedKafilah, setSelectedKafilah] = useState('Semua Grup');
  const [selectedStatus, setSelectedStatus] = useState('Semua Status');
  const [inspectedParticipant, setInspectedParticipant] = useState<Participant | null>(null);

  // Available stages from configured stages
  const stageOptions = useMemo(() => {
    const list = stages.map((s) => s.name);
    return ['Semua Babak', ...Array.from(new Set(list))];
  }, [stages]);

  // Available kafilahs from active records
  const kafilahOptions = useMemo(() => {
    const list = kafilahs.map((k) => k.name);
    return ['Semua Grup', ...Array.from(new Set(list))];
  }, [kafilahs]);

  // Dynamic judges assigned to the competition stage / tenant
  const activeJudges = useMemo(() => {
    // If specific stage is selected, filter judge assignments for that stage
    if (selectedStage !== 'Semua Babak') {
      const assigned = judgeAssignments.filter((ja) => ja.stageName === selectedStage);
      if (assigned.length > 0) {
        return assigned.map((ja) => {
          const userObj = users.find((u) => u.id === ja.judgeId);
          return {
            id: ja.judgeId,
            name: ja.judgeName,
            field: ja.judgeField,
            category: userObj?.judgeCategory || 'Hakim'
          };
        });
      }
    }

    // Default to all judges in current tenant
    const judgesInTenant = users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id);
    if (judgesInTenant.length > 0) {
      return judgesInTenant.map((u) => ({
        id: u.id,
        name: u.name,
        field: u.judgeField || 'Dewan Hakim',
        category: u.judgeCategory || 'Hakim'
      }));
    }

    // Fallback if none defined
    return users.slice(1, 4).map((u) => ({
      id: u.id,
      name: u.name,
      field: u.judgeField || 'Dewan Hakim',
      category: u.judgeCategory || 'Hakim'
    }));
  }, [selectedStage, judgeAssignments, users, currentTenant.id]);

  // Filter participants
  const filteredParticipants = useMemo(() => {
    return participants.filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.participantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.lotteryNumber.includes(searchQuery) ||
        p.kafilahName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStage = selectedStage === 'Semua Babak' || p.stageName === selectedStage;
      const matchesKafilah = selectedKafilah === 'Semua Grup' || p.kafilahName === selectedKafilah;

      const progress = getParticipantProgress(p.id);
      const matchesStatus =
        selectedStatus === 'Semua Status' ||
        progress === selectedStatus ||
        p.status === selectedStatus;

      return matchesSearch && matchesStage && matchesKafilah && matchesStatus;
    });
  }, [participants, searchQuery, selectedStage, selectedKafilah, selectedStatus, getParticipantProgress]);

  const getJudgeAssessment = (participantId: string, judgeId: string) => {
    return assessments.find((a) => a.participantId === participantId && a.judgeId === judgeId);
  };

  // Export CSV dynamically based on active judges and escaped cells
  const handleExportCSV = () => {
    const headers = [
      'No Undian',
      'ID Peserta',
      'Nama Peserta',
      'Grup',
      'Babak',
      ...activeJudges.map((j) => `Nilai ${j.name} (${j.field})`),
      'Rata-rata Akhir',
      'Status Kelengkapan'
    ];

    const rows = filteredParticipants.map((p) => {
      const judgeScores = activeJudges.map((j) => {
        const asm = getJudgeAssessment(p.id, j.id);
        return asm ? asm.finalScore : null;
      });

      const validScores = judgeScores.filter((s): s is number => s !== null);
      const isComplete = validScores.length === activeJudges.length && activeJudges.length > 0;

      const avgText =
        validScores.length > 0
          ? `${(validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)}${
              !isComplete ? ' (Sementara)' : ''
            }`
          : '-';

      const progress = getParticipantProgress(p.id);

      return [
        `"${p.lotteryNumber}"`,
        `"${p.participantId}"`,
        `"${p.name.replace(/"/g, '""')}"`,
        `"${p.kafilahName.replace(/"/g, '""')}"`,
        `"${p.stageName}"`,
        ...judgeScores.map((s) => (s !== null ? `"${s.toFixed(2)}"` : `"-"`)),
        `"${avgText}"`,
        `"${progress}"`
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_mtq_${currentTenant.code}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Rekap Nilai Real-Time
            </h1>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Matriks Dinamis
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.eventName} · {selectedStage === 'Semua Babak' ? 'Seluruh Babak' : `Babak ${selectedStage}`} · {activeJudges.length} Penilai Terkonfigurasi
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Ekspor CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor undian, nama peserta, atau grup..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            {stageOptions.map((stg) => (
              <option key={stg} value={stg}>
                {stg === 'Semua Babak' ? 'Semua Babak' : `Babak ${stg}`}
              </option>
            ))}
          </select>

          <select
            value={selectedKafilah}
            onChange={(e) => setSelectedKafilah(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            {kafilahOptions.map((kaf) => (
              <option key={kaf} value={kaf}>
                {kaf}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            <option value="Semua Status">Semua Status</option>
            <option value="Belum Dimulai">Belum Dimulai</option>
            <option value="Berlangsung">Berlangsung</option>
            <option value="Menunggu Hakim Lain">Menunggu Hakim Lain</option>
            <option value="Lengkap">Lengkap (Final)</option>
          </select>
        </div>
      </div>

      {/* Dynamic Grouped-Header Table with Sticky Identification & Horizontal Scrolling */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              {/* Top Grouped Header */}
              <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                <th colSpan={3} className="px-4 py-2.5 border-r border-slate-200">
                  Identitas Peserta
                </th>
                {activeJudges.map((j) => (
                  <th
                    key={j.id}
                    colSpan={2}
                    className="px-3 py-2.5 border-r border-slate-200 text-center bg-slate-50"
                  >
                    <span className="block text-slate-800">{j.name.split(',')[0]}</span>
                    <span className="text-[10px] text-slate-400 font-normal lowercase tracking-normal">
                      {j.field}
                    </span>
                  </th>
                ))}
                <th colSpan={2} className="px-4 py-2.5 text-center bg-emerald-50 text-emerald-900">
                  Hasil Rekap
                </th>
              </tr>

              {/* Secondary Subheaders */}
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] font-semibold uppercase">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-2 w-16">Undian</th>
                <th className="sticky left-16 z-20 bg-slate-50 px-4 py-2 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">Nama & Grup</th>
                <th className="px-3 py-2 w-24 border-r border-slate-200">Babak</th>

                {activeJudges.map((j) => (
                  <React.Fragment key={j.id}>
                    <th className="px-2 py-2 text-right w-16">Pengurangan</th>
                    <th className="px-3 py-2 text-right w-20 border-r border-slate-200">
                      Nilai Hakim
                    </th>
                  </React.Fragment>
                ))}

                <th className="px-3 py-2 text-right w-24 bg-emerald-50/50 text-emerald-950">
                  Rata-Rata
                </th>
                <th className="px-4 py-2 text-center w-28 bg-emerald-50/50 text-emerald-950">
                  Status
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td
                    colSpan={5 + activeJudges.length * 2}
                    className="p-8 text-center text-slate-400"
                  >
                    Tidak ada data peserta yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => {
                  const progress = getParticipantProgress(p.id);

                  // Collect valid judge scores
                  const judgeAssessments = activeJudges.map((j) =>
                    getJudgeAssessment(p.id, j.id)
                  );

                  const scores = judgeAssessments.map((a) => (a ? a.finalScore : null));
                  const validScores = scores.filter((s): s is number => s !== null);
                  const isAllFinalized =
                    judgeAssessments.every((a) => a?.status === 'finalized') &&
                    activeJudges.length > 0;

                  const averageScore =
                    validScores.length > 0
                      ? validScores.reduce((a, b) => a + b, 0) / validScores.length
                      : null;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                      {/* Undian (Sticky left) */}
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 font-mono font-bold text-slate-900 transition-colors">
                        #{p.lotteryNumber}
                      </td>

                      {/* Participant identity (Sticky left-16 with shadow delimiter) */}
                      <td className="sticky left-16 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] transition-colors">
                        <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {p.participantId} · {p.kafilahName}
                        </p>
                      </td>

                      {/* Babak */}
                      <td className="px-3 py-3 border-r border-slate-200 text-slate-600 font-medium">
                        {p.stageName}
                      </td>

                      {/* Judge columns */}
                      {activeJudges.map((j) => {
                        const asm = getJudgeAssessment(p.id, j.id);
                        const isFinal = asm?.status === 'finalized';
                        const inProgress = asm?.status === 'in_progress';

                        return (
                          <React.Fragment key={j.id}>
                            <td className="px-2 py-3 text-right font-mono text-[11px] text-slate-500 tabular-nums">
                              {asm ? `-${asm.totalDeductions.toFixed(2)}` : '-'}
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-bold border-r border-slate-200 tabular-nums">
                              {asm ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span
                                    className={
                                      isFinal
                                        ? 'text-slate-900'
                                        : 'text-amber-700 italic'
                                    }
                                  >
                                    {asm.finalScore.toFixed(2)}
                                  </span>
                                  {isFinal ? (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-emerald-600 shrink-0"
                                      title="Final"
                                    />
                                  ) : inProgress ? (
                                    <span
                                      className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                                      title="Sedang Dinilai"
                                    />
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-slate-300 font-normal">--</span>
                              )}
                            </td>
                          </React.Fragment>
                        );
                      })}

                      {/* Aggregated Average Score */}
                      <td className="px-3 py-3 text-right font-mono font-extrabold text-slate-900 bg-emerald-50/30">
                        {averageScore !== null ? (
                          <div>
                            <span className="text-sm">{averageScore.toFixed(2)}</span>
                            {!isAllFinalized && (
                              <span className="block text-[9px] text-amber-700 font-normal">
                                Provisional
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300">--</span>
                        )}
                      </td>

                      {/* Actions & Detail */}
                      <td className="px-4 py-3 text-center bg-emerald-50/30">
                        <div className="flex items-center justify-center gap-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              progress === 'Lengkap'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : progress === 'Menunggu Hakim Lain'
                                ? 'bg-amber-50 text-amber-800 border border-amber-300'
                                : progress === 'Berlangsung'
                                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {progress}
                          </span>
                          <button
                            onClick={() => setInspectedParticipant(p)}
                            className="p-1 rounded text-slate-400 hover:text-emerald-800 hover:bg-emerald-50 transition-colors"
                            title="Lihat Rincian Pengurangan Nilai"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Breakdown Modal per Judge for Inspected Participant */}
      {inspectedParticipant && (() => {
        const participantAssessments = activeJudges.map((j) =>
          getJudgeAssessment(inspectedParticipant.id, j.id)
        );
        const finalizedJudges = participantAssessments.filter((a) => a?.status === 'finalized').length;
        const validJudgeScores = participantAssessments
          .map((a) => (a ? a.finalScore : null))
          .filter((s): s is number => s !== null);
        const avgScore =
          validJudgeScores.length > 0
            ? (validJudgeScores.reduce((a, b) => a + b, 0) / validJudgeScores.length).toFixed(2)
            : '—';

        return (
          <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50">
            <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-2.5 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider">
                      Rincian Penilaian Juri
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-semibold text-slate-600">
                      Babak {inspectedParticipant.stageName}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-lg text-slate-900 leading-tight">
                    #{inspectedParticipant.lotteryNumber} {inspectedParticipant.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {inspectedParticipant.participantId} · {inspectedParticipant.kafilahName} · {inspectedParticipant.branchName}
                  </p>
                </div>
                <button
                  onClick={() => setInspectedParticipant(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Metrics Cards */}
              <div className="grid grid-cols-3 gap-3 p-4 sm:p-5 bg-white border-b border-slate-100">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 block font-medium">Hakim Bertugas</span>
                  <span className="font-mono font-bold text-base text-slate-900 mt-0.5 block tabular-nums">
                    {activeJudges.length} Dewan Hakim
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80">
                  <span className="text-[11px] text-emerald-800 block font-medium">Status Penilaian</span>
                  <span className="font-mono font-bold text-base text-emerald-900 mt-0.5 block tabular-nums">
                    {finalizedJudges} dari {activeJudges.length} Selesai
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 block font-medium">Rata-Rata Saat Ini</span>
                  <span className="font-mono font-bold text-base text-emerald-900 mt-0.5 block tabular-nums">
                    {avgScore} {validJudgeScores.length < activeJudges.length && validJudgeScores.length > 0 ? '(Sementara)' : ''}
                  </span>
                </div>
              </div>

              {/* Structured Judges Breakdown Table */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                        <th className="px-4 py-2.5">Dewan Hakim & Bidang</th>
                        <th className="px-4 py-2.5">Rincian Kesalahan</th>
                        <th className="px-3 py-2.5 text-right">Pengurangan</th>
                        <th className="px-3 py-2.5 text-right">Nilai Akhir</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeJudges.map((j) => {
                        const asm = getJudgeAssessment(inspectedParticipant.id, j.id);
                        const isFinal = asm?.status === 'finalized';
                        const inProgress = asm?.status === 'in_progress';
                        const activeErrors = Object.entries(asm?.errorCounts || {}).filter(
                          ([_, count]) => count > 0
                        );

                        return (
                          <tr key={j.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 align-top">
                              <p className="font-bold text-slate-900">{j.name}</p>
                              <p className="text-[11px] text-slate-500 mt-0.5">{j.field}</p>
                              {asm?.annotations && asm.annotations.length > 0 && (
                                <span className="inline-block text-[10px] text-slate-400 mt-1 font-mono">
                                  {asm.annotations.length} anotasi mushaf
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 align-top">
                              {!asm ? (
                                <span className="text-slate-400 italic">Belum mulai menilai</span>
                              ) : activeErrors.length === 0 ? (
                                <span className="text-emerald-700 font-medium">
                                  Sempurna (0 kesalahan tercatat)
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {activeErrors.map(([catId, count]) => {
                                    const deduction = asm.deductions?.[catId] || 0;
                                    return (
                                      <div
                                        key={catId}
                                        className="flex items-center justify-between text-[11px] gap-2"
                                      >
                                        <span className="text-slate-700 capitalize">
                                          {catId.replace('cat-', '').replace(/-/g, ' ')}:
                                        </span>
                                        <span className="font-mono text-slate-500">
                                          {count}x (-{deduction.toFixed(2)})
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-3 align-top text-right font-mono font-bold text-rose-600 tabular-nums">
                              {asm ? `-${asm.totalDeductions.toFixed(2)}` : '—'}
                            </td>

                            <td className="px-3 py-3 align-top text-right font-mono font-bold text-slate-900 text-sm tabular-nums">
                              {asm ? asm.finalScore.toFixed(2) : '—'}
                            </td>

                            <td className="px-4 py-3 align-top text-center">
                              {isFinal ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Terkunci</span>
                                </span>
                              ) : inProgress ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Menilai</span>
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                  Menunggu
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Data penilaian tersinkronisasi antar dewan juri
                </span>
                <button
                  onClick={() => setInspectedParticipant(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Tutup Rincian
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
