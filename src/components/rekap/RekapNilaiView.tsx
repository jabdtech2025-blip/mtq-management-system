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
  Clock
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
    errorCategories,
    getJudgeAssessment: getJudgeAssessmentFromContext,
    getParticipantProgress,
    getParticipantStageQuestions,
    setSelectedParticipantId,
    setCurrentView
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState('Semua Babak');
  const [selectedKafilah, setSelectedKafilah] = useState('Semua Grup');
  const [selectedStatus, setSelectedStatus] = useState('Semua Status');
  const [inspectedParticipant, setInspectedParticipant] = useState<Participant | null>(null);
  const [modalSelectedQuestionId, setModalSelectedQuestionId] = useState<string>('');

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

      const progress = getParticipantProgress(p.id, p.stageName);
      const matchesStatus =
        selectedStatus === 'Semua Status' ||
        progress === selectedStatus ||
        p.status === selectedStatus;

      return matchesSearch && matchesStage && matchesKafilah && matchesStatus;
    });
  }, [participants, searchQuery, selectedStage, selectedKafilah, selectedStatus, getParticipantProgress]);

  const getJudgeAssessment = (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ) => {
    return getJudgeAssessmentFromContext(participantId, judgeId, stageName, questionId);
  };

  // Export CSV dynamically including all assigned maqras per participant
  const handleExportCSV = () => {
    const headers = [
      'No Undian',
      'ID Peserta',
      'Nama Peserta',
      'Grup',
      'Babak',
      'Kode Maqra',
      'Judul Maqra',
      ...activeJudges.map((j) => `Pengurangan ${j.name} (${j.field})`),
      ...activeJudges.map((j) => `Nilai ${j.name} (${j.field})`),
      'Rata-rata Maqra',
      'Status Maqra',
      'Rata-rata Keseluruhan',
      'Status Kelengkapan'
    ];

    const rows: string[] = [];

    filteredParticipants.forEach((p) => {
      const stageQuestions = getParticipantStageQuestions(p.id, p.stageName);
      const overallProgress = getParticipantProgress(p.id, p.stageName);

      // Compute participant overall average across all maqras
      let allScoresSum = 0;
      let allScoresCount = 0;
      let allUnitsFinalized = true;

      stageQuestions.forEach((q) => {
        activeJudges.forEach((j) => {
          const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
          if (asm && asm.status === 'finalized') {
            allScoresSum += asm.finalScore;
            allScoresCount++;
          } else {
            allUnitsFinalized = false;
            if (asm) {
              allScoresSum += asm.finalScore;
              allScoresCount++;
            }
          }
        });
      });

      const participantOverallAvg =
        allScoresCount > 0
          ? `${(allScoresSum / allScoresCount).toFixed(2)}${!allUnitsFinalized ? ' (Sementara)' : ''}`
          : '-';

      if (stageQuestions.length === 0) {
        rows.push([
          `"${p.lotteryNumber}"`,
          `"${p.participantId}"`,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.kafilahName.replace(/"/g, '""')}"`,
          `"${p.stageName}"`,
          `"-"`,
          `"Maqra Belum Ditetapkan"`,
          ...activeJudges.map(() => `"-"`),
          ...activeJudges.map(() => `"-"`),
          `"-"`,
          `"Belum Ditetapkan"`,
          `"-"`,
          `"${overallProgress}"`
        ].join(','));
      } else {
        stageQuestions.forEach((q) => {
          const judgeAssessments = activeJudges.map((j) =>
            getJudgeAssessment(p.id, j.id, p.stageName, q.questionId)
          );
          const deductions = judgeAssessments.map((a) => (a ? `-${a.totalDeductions.toFixed(2)}` : `"-"`));
          const scores = judgeAssessments.map((a) => (a ? `"${a.finalScore.toFixed(2)}"` : `"-"`));
          const validScores = judgeAssessments
            .map((a) => (a ? a.finalScore : null))
            .filter((s): s is number => s !== null);

          const isMaqraFinalized =
            judgeAssessments.every((a) => a?.status === 'finalized') && activeJudges.length > 0;

          const maqraAvg =
            validScores.length > 0
              ? `${(validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)}${
                  !isMaqraFinalized ? ' (Sementara)' : ''
                }`
              : '-';

          const maqraStatus = isMaqraFinalized
            ? 'Selesai'
            : judgeAssessments.some((a) => a?.status === 'in_progress')
            ? 'Berlangsung'
            : 'Menunggu';

          rows.push([
            `"${p.lotteryNumber}"`,
            `"${p.participantId}"`,
            `"${p.name.replace(/"/g, '""')}"`,
            `"${p.kafilahName.replace(/"/g, '""')}"`,
            `"${p.stageName}"`,
            `"${q.code}"`,
            `"${q.title.replace(/"/g, '""')}"`,
            ...deductions,
            ...scores,
            `"${maqraAvg}"`,
            `"${maqraStatus}"`,
            `"${participantOverallAvg}"`,
            `"${overallProgress}"`
          ].join(','));
        });
      }
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
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Rekap Nilai Real-Time
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.eventName} · {selectedStage === 'Semua Babak' ? 'Seluruh Babak' : `Babak ${selectedStage}`}
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
          <table className="w-full text-left border-collapse min-w-[950px]">
            <thead>
              {/* Top Grouped Header */}
              <tr className="bg-slate-100/80 text-slate-600 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                <th colSpan={2} className="sticky left-0 z-30 bg-slate-100 px-4 py-2.5 border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                  Identitas Peserta
                </th>
                <th className="px-3 py-2.5 border-r border-slate-200 text-center bg-slate-50 text-slate-700 min-w-[190px]">
                  Babak & Maqra
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
                <th colSpan={2} className="px-4 py-2.5 text-center bg-slate-100 text-slate-700 border-l border-slate-200">
                  Hasil Rekap
                </th>
                <th className="px-3 py-2.5 text-center bg-slate-50 text-slate-700 w-16">
                  Aksi
                </th>
              </tr>

              {/* Secondary Subheaders with Centered Text */}
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[10px] font-semibold uppercase">
                <th className="sticky left-0 z-20 bg-slate-50 px-4 py-2 w-16">Undian</th>
                <th className="sticky left-16 z-20 bg-slate-50 px-4 py-2 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">Nama & Grup</th>
                <th className="px-3 py-2 border-r border-slate-200 text-center">Maqra / Soal</th>

                {activeJudges.map((j) => (
                  <React.Fragment key={j.id}>
                    <th className="px-2.5 py-2 text-center w-24 min-w-[96px] border-r border-slate-200 whitespace-nowrap">
                      Pengurangan
                    </th>
                    <th className="px-2.5 py-2 text-center w-24 min-w-[96px] border-r border-slate-200 whitespace-nowrap">
                      Nilai Hakim
                    </th>
                  </React.Fragment>
                ))}

                <th className="px-3 py-2 text-center w-24 border-l border-slate-200 text-slate-600">
                  Rata-Rata
                </th>
                <th className="px-4 py-2 text-center w-28 text-slate-600">
                  Status
                </th>
                <th className="px-3 py-2 text-center w-16 text-slate-600">
                  Rincian
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td
                    colSpan={6 + activeJudges.length * 2}
                    className="p-8 text-center text-slate-400"
                  >
                    Tidak ada data peserta yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p) => {
                  const stageQuestions = getParticipantStageQuestions(p.id, p.stageName);
                  const overallProgress = getParticipantProgress(p.id, p.stageName);

                  // Calculate overall average across all questions for this participant
                  let totalScoreSum = 0;
                  let totalScoreCount = 0;
                  let allFinalized = true;

                  stageQuestions.forEach((q) => {
                    activeJudges.forEach((j) => {
                      const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
                      if (asm && asm.status === 'finalized') {
                        totalScoreSum += asm.finalScore;
                        totalScoreCount++;
                      } else {
                        allFinalized = false;
                        if (asm) {
                          totalScoreSum += asm.finalScore;
                          totalScoreCount++;
                        }
                      }
                    });
                  });

                  const overallAvg =
                    totalScoreCount > 0 ? totalScoreSum / totalScoreCount : null;

                  // Case 1: Participant has NO assigned questions for this stage
                  if (stageQuestions.length === 0) {
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 font-mono font-bold text-slate-900">
                          #{p.lotteryNumber}
                        </td>
                        <td className="sticky left-16 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                          <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {p.participantId} · {p.kafilahName}
                          </p>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-200 text-center">
                          <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Maqra Belum Ditetapkan
                          </span>
                        </td>
                        {activeJudges.map((j) => (
                          <React.Fragment key={j.id}>
                            <td className="px-2.5 py-3 text-center font-mono text-[11px] text-slate-400 border-r border-slate-200">
                              -
                            </td>
                            <td className="px-2.5 py-3 text-center font-mono text-slate-300 border-r border-slate-200">
                              --
                            </td>
                          </React.Fragment>
                        ))}
                        <td className="px-3 py-3 text-center font-mono text-slate-300 border-l border-slate-100">
                          --
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[11px] font-medium text-amber-700">
                            {overallProgress}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-slate-300">-</span>
                        </td>
                      </tr>
                    );
                  }

                  // Case 2: Participant has exactly 1 assigned question
                  if (stageQuestions.length === 1) {
                    const q = stageQuestions[0];
                    const judgeAssessments = activeJudges.map((j) =>
                      getJudgeAssessment(p.id, j.id, p.stageName, q.questionId)
                    );
                    const validScores = judgeAssessments
                      .map((a) => (a ? a.finalScore : null))
                      .filter((s): s is number => s !== null);
                    const isSingleFinalized =
                      judgeAssessments.every((a) => a?.status === 'finalized') &&
                      activeJudges.length > 0;
                    const avgScore =
                      validScores.length > 0
                        ? validScores.reduce((a, b) => a + b, 0) / validScores.length
                        : null;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 font-mono font-bold text-slate-900">
                          #{p.lotteryNumber}
                        </td>
                        <td className="sticky left-16 z-10 bg-white group-hover:bg-slate-50 px-4 py-3 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)]">
                          <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {p.participantId} · {p.kafilahName}
                          </p>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-200 text-center">
                          <div className="inline-block text-center max-w-[220px]">
                            <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mr-1">
                              {q.code}
                            </span>
                            <span className="text-slate-800 font-medium text-[11px] truncate block">
                              {q.title}
                            </span>
                          </div>
                        </td>
                        {activeJudges.map((j) => {
                          const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
                          return (
                            <React.Fragment key={j.id}>
                              <td className="px-2.5 py-3 text-center font-mono text-[11px] text-slate-500 tabular-nums border-r border-slate-200 w-24 min-w-[96px]">
                                {asm ? `-${asm.totalDeductions.toFixed(2)}` : '-'}
                              </td>
                              <td className="px-2.5 py-3 text-center font-mono font-bold border-r border-slate-200 tabular-nums w-24 min-w-[96px] whitespace-nowrap">
                                {asm ? (
                                  <span className="text-slate-900">{asm.finalScore.toFixed(2)}</span>
                                ) : (
                                  <span className="text-slate-300 font-normal">--</span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-3 text-center font-mono font-extrabold text-slate-900 border-l border-slate-100">
                          {avgScore !== null ? (
                            <div>
                              <span className="text-sm">{avgScore.toFixed(2)}</span>
                              {!isSingleFinalized && (
                                <span className="block text-[9px] text-slate-500 font-normal">
                                  Sementara
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs font-medium text-slate-700">
                            {overallProgress}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => {
                              setModalSelectedQuestionId(q.questionId);
                              setInspectedParticipant(p);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-emerald-800 hover:bg-slate-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                            title="Lihat Rincian Pengurangan Nilai"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  // Case 3: Participant has MULTIPLE assigned questions (Setiap satu maqra satu baris + baris akumulasi)
                  return (
                    <React.Fragment key={p.id}>
                      {stageQuestions.map((q, qIdx) => {
                        const judgeAssessments = activeJudges.map((j) =>
                          getJudgeAssessment(p.id, j.id, p.stageName, q.questionId)
                        );
                        const validScores = judgeAssessments
                          .map((a) => (a ? a.finalScore : null))
                          .filter((s): s is number => s !== null);
                        const isMaqraFinalized =
                          judgeAssessments.every((a) => a?.status === 'finalized') &&
                          activeJudges.length > 0;
                        const maqraAvg =
                          validScores.length > 0
                            ? validScores.reduce((a, b) => a + b, 0) / validScores.length
                            : null;
                        const maqraStatus = isMaqraFinalized
                          ? 'Selesai'
                          : judgeAssessments.some((a) => a?.status === 'in_progress')
                          ? 'Berlangsung'
                          : 'Menunggu';

                        return (
                          <tr
                            key={`${p.id}-${q.questionId}`}
                            className={`hover:bg-slate-50/80 transition-colors ${
                              qIdx === 0 ? 'border-t-2 border-slate-200' : ''
                            }`}
                          >
                            {/* Sticky Participant columns for first question row, or empty continuation */}
                            <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-mono font-bold text-slate-900 border-b border-slate-100">
                              #{p.lotteryNumber}
                            </td>
                            <td className="sticky left-16 z-10 bg-white px-4 py-2.5 min-w-[170px] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] border-b border-slate-100">
                              <p className="font-bold text-slate-900 leading-tight">
                                {p.name}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {p.participantId} · {p.kafilahName}
                              </p>
                            </td>

                            {/* Maqra Specific Column */}
                            <td className="px-3 py-2.5 border-r border-slate-200 text-center bg-slate-50/30">
                              <div className="inline-flex items-center gap-1.5 max-w-[240px]">
                                <span className="font-mono text-[10px] font-bold text-emerald-800 bg-emerald-100/70 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                                  Maqra {qIdx + 1}
                                </span>
                                <span className="text-slate-800 font-semibold text-[11px] truncate">
                                  [{q.code}] {q.title}
                                </span>
                              </div>
                            </td>

                            {/* Scores for this specific maqra */}
                            {activeJudges.map((j) => {
                              const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
                              return (
                                <React.Fragment key={j.id}>
                                  <td className="px-2.5 py-2.5 text-center font-mono text-[11px] text-slate-500 tabular-nums border-r border-slate-200 w-24 min-w-[96px]">
                                    {asm ? `-${asm.totalDeductions.toFixed(2)}` : '-'}
                                  </td>
                                  <td className="px-2.5 py-2.5 text-center font-mono font-bold border-r border-slate-200 tabular-nums w-24 min-w-[96px] whitespace-nowrap">
                                    {asm ? (
                                      <span className="text-slate-900">{asm.finalScore.toFixed(2)}</span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">--</span>
                                    )}
                                  </td>
                                </React.Fragment>
                              );
                            })}

                            {/* Rata-Rata Maqra */}
                            <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800 border-l border-slate-100">
                              {maqraAvg !== null ? (
                                <div>
                                  <span className="text-xs">{maqraAvg.toFixed(2)}</span>
                                  {!isMaqraFinalized && (
                                    <span className="block text-[8px] text-slate-400 font-normal">
                                      Sementara
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300">--</span>
                              )}
                            </td>

                            {/* Status Maqra */}
                            <td className="px-4 py-2.5 text-center">
                              <span
                                className={`text-[11px] font-semibold ${
                                  isMaqraFinalized
                                    ? 'text-emerald-700'
                                    : maqraStatus === 'Berlangsung'
                                    ? 'text-amber-700'
                                    : 'text-slate-400'
                                }`}
                              >
                                {maqraStatus}
                              </span>
                            </td>

                            {/* Aksi Per Maqra */}
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => {
                                  setModalSelectedQuestionId(q.questionId);
                                  setInspectedParticipant(p);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-emerald-800 hover:bg-slate-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title={`Rincian Maqra ${qIdx + 1}`}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Participant Aggregate Summary Row */}
                      <tr className="bg-emerald-50/40 border-b-2 border-slate-300 text-xs font-semibold">
                        <td
                          colSpan={2}
                          className="sticky left-0 z-10 bg-emerald-50/90 px-4 py-2 text-slate-700 font-bold text-[11px] uppercase tracking-wide border-r border-slate-200"
                        >
                          Akumulasi Peserta #{p.lotteryNumber}
                        </td>
                        <td className="px-3 py-2 text-center text-emerald-950 font-bold text-[11px] border-r border-slate-200">
                          Rata-Rata Keseluruhan ({stageQuestions.length} Maqra)
                        </td>
                        {activeJudges.map((j) => {
                          const judgeScores = stageQuestions
                            .map((q) => getJudgeAssessment(p.id, j.id, p.stageName, q.questionId))
                            .map((a) => (a ? a.finalScore : null))
                            .filter((s): s is number => s !== null);
                          const jAvg =
                            judgeScores.length > 0
                              ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length
                              : null;

                          return (
                            <React.Fragment key={j.id}>
                              <td className="px-2.5 py-2 text-center text-slate-400 font-mono text-[10px] border-r border-slate-200">
                                Σ Maqra
                              </td>
                              <td className="px-2.5 py-2 text-center font-mono font-extrabold text-emerald-950 border-r border-slate-200">
                                {jAvg !== null ? jAvg.toFixed(2) : '--'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-mono font-extrabold text-emerald-950 border-l border-slate-200 text-sm">
                          {overallAvg !== null ? (
                            <div>
                              <span>{overallAvg.toFixed(2)}</span>
                              {!allFinalized && (
                                <span className="block text-[8px] text-amber-700 font-normal">
                                  Sementara
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <span className="text-xs font-bold text-emerald-900">
                            {overallProgress}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              setModalSelectedQuestionId(stageQuestions[0]?.questionId || '');
                              setInspectedParticipant(p);
                            }}
                            className="p-1 rounded text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                            title="Buka Rincian Lengkap"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Breakdown Modal per Judge & Maqra for Inspected Participant */}
      {inspectedParticipant && (() => {
        const participantQuestions = getParticipantStageQuestions(
          inspectedParticipant.id,
          inspectedParticipant.stageName
        );
        const activeQuestionId =
          modalSelectedQuestionId || participantQuestions[0]?.questionId || '';
        const activeQuestion =
          participantQuestions.find((q) => q.questionId === activeQuestionId) ||
          participantQuestions[0];

        const participantAssessments = activeJudges.map((j) =>
          getJudgeAssessment(
            inspectedParticipant.id,
            j.id,
            inspectedParticipant.stageName,
            activeQuestionId
          )
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

              {/* Maqra Navigation Tabs if Multi-Maqra */}
              {participantQuestions.length > 1 && (
                <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-slate-100/80 border-b border-slate-200 overflow-x-auto">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0 mr-1">
                    Pilih Maqra:
                  </span>
                  {participantQuestions.map((q, idx) => {
                    const isSelected = q.questionId === activeQuestionId;
                    return (
                      <button
                        key={q.questionId}
                        onClick={() => setModalSelectedQuestionId(q.questionId)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        <span className="font-mono text-[10px] opacity-75">Maqra {idx + 1}:</span>
                        <span>[{q.code}] {q.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active Maqra Context Banner */}
              {activeQuestion && (
                <div className="px-4 sm:px-5 py-2.5 bg-emerald-50/50 border-b border-emerald-100 flex flex-wrap items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {activeQuestion.code}
                    </span>
                    <span className="font-semibold text-slate-800">{activeQuestion.title}</span>
                  </div>
                  <span className="text-slate-600 text-[11px] font-medium">
                    {activeQuestion.surahName ? `QS. ${activeQuestion.surahName}: ${activeQuestion.startAyah || 1} - ${activeQuestion.endAyah || 1}` : ''}
                    {activeQuestion.pageStart ? ` · Halaman ${activeQuestion.pageStart}` : ''}
                  </span>
                </div>
              )}

              {/* Summary Metrics Cards */}
              <div className="grid grid-cols-3 gap-3 p-4 sm:p-5 bg-white border-b border-slate-100">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 block font-medium">Hakim Bertugas</span>
                  <span className="font-mono font-bold text-base text-slate-900 mt-0.5 block tabular-nums">
                    {activeJudges.length} Dewan Hakim
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80">
                  <span className="text-[11px] text-emerald-800 block font-medium">Status Penilaian Maqra</span>
                  <span className="font-mono font-bold text-base text-emerald-900 mt-0.5 block tabular-nums">
                    {finalizedJudges} dari {activeJudges.length} Selesai
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[11px] text-slate-500 block font-medium">Rata-Rata Maqra Ini</span>
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
                        <th className="px-3 py-2.5 text-center">Pengurangan</th>
                        <th className="px-3 py-2.5 text-center">Nilai Akhir</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeJudges.map((j) => {
                        const asm = getJudgeAssessment(
                          inspectedParticipant.id,
                          j.id,
                          inspectedParticipant.stageName,
                          activeQuestionId
                        );
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
                                    const categoryObj = errorCategories.find((c) => c.id === catId);
                                    const categoryName = categoryObj
                                      ? categoryObj.name
                                      : catId.replace('cat-', '').replace(/-/g, ' ');
                                    return (
                                      <div
                                        key={catId}
                                        className="flex items-center justify-between text-[11px] gap-2"
                                      >
                                        <span className="text-slate-700 font-medium">
                                          {categoryName}:
                                        </span>
                                        <span className="font-mono text-slate-500 tabular-nums">
                                          {count}x (-{deduction.toFixed(2)})
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-3 align-top text-center font-mono font-bold text-rose-600 tabular-nums">
                              {asm ? `-${asm.totalDeductions.toFixed(2)}` : '—'}
                            </td>

                            <td className="px-3 py-3 align-top text-center font-mono font-bold text-slate-900 text-sm tabular-nums">
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
                  Tersimpan di browser (Lokal Prototipe)
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
