import React, { useState, useMemo } from 'react';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  Lock,
  ChevronRight,
  Users,
  Trophy,
  X,
  FileCheck2,
  RefreshCw
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Participant } from '../../types/mtq';

export const HasilKelulusanView: React.FC = () => {
  const {
    currentTenant,
    participants,
    stageParticipations,
    assessments,
    stages,
    judgeAssignments,
    users,
    getParticipantProgress,
    getParticipantStageQuestions,
    advanceQualifiers,
    setCurrentView,
    setSelectedParticipantId
  } = useMtq();

  // Active stage selector
  const [selectedStageName, setSelectedStageName] = useState<string>('Penyisihan');

  // Next stage target
  const currentStage = stages.find((s) => s.tenantId === currentTenant.id && s.name === selectedStageName) || stages[0];
  const nextStage = stages
    .filter((s) => s.tenantId === currentTenant.id && s.order > (currentStage?.order || 0))
    .sort((a, b) => a.order - b.order)[0] || null;

  // Manual overrides state: { [participantId]: boolean } and reasons { [participantId]: string }
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [overrideModalParticipant, setOverrideModalParticipant] = useState<Participant | null>(null);
  const [tempReasonText, setTempReasonText] = useState('');
  const [tempOverrideValue, setTempOverrideValue] = useState(true);

  // Confirmation modal & feedback
  const [isConfirmAdvancementOpen, setIsConfirmAdvancementOpen] = useState(false);
  const [advancementSuccessMessage, setAdvancementSuccessMessage] = useState('');
  const [advancementErrorMessage, setAdvancementErrorMessage] = useState('');

  // Active stage participations for current tenant & stage
  const currentStageParticipations = useMemo(() => {
    return stageParticipations.filter(
      (sp) => sp.tenantId === currentTenant.id && sp.stageName === selectedStageName
    );
  }, [stageParticipations, currentTenant.id, selectedStageName]);

  // Active judges assigned for this stage in this tenant
  const stageJudges = useMemo(() => {
    const assigned = judgeAssignments.filter(
      (ja) => ja.tenantId === currentTenant.id && ja.stageName === selectedStageName
    );
    if (assigned.length > 0) {
      return assigned.map((ja) => ja.judgeId);
    }
    return users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id).map((u) => u.id);
  }, [judgeAssignments, selectedStageName, users, currentTenant.id]);

  // Compute ranking, completion, and provisional vs valid scores with full multi-maqra support
  const rankedParticipants = useMemo(() => {
    return currentStageParticipations
      .map((sp) => {
        const participantObj = participants.find((p) => p.id === sp.participantId && p.tenantId === currentTenant.id);
        const stageQuestions = getParticipantStageQuestions(sp.participantId, selectedStageName);
        const progress = getParticipantProgress(sp.participantId, selectedStageName);

        // Gather assessments for all assigned questions and judges
        const allAssessmentUnits: NonNullable<(typeof assessments)[0]>[] = [];

        stageQuestions.forEach((q) => {
          stageJudges.forEach((jId) => {
            const match = assessments.find(
              (a) =>
                a.tenantId === currentTenant.id &&
                a.participantId === sp.participantId &&
                a.judgeId === jId &&
                a.stageName === selectedStageName &&
                a.questionId === q.questionId
            );
            if (match) {
              allAssessmentUnits.push(match);
            }
          });
        });

        const validFinalizedScores = allAssessmentUnits
          .filter((a) => a.status === 'finalized')
          .map((a) => a.finalScore);

        const allAvailableScores = allAssessmentUnits.map((a) => a.finalScore);

        const totalRequiredUnits = stageJudges.length * stageQuestions.length;
        const isFullyFinalized =
          progress === 'Lengkap' &&
          totalRequiredUnits > 0 &&
          validFinalizedScores.length === totalRequiredUnits;

        // Valid score only if fully finalized; otherwise provisional score for preview
        const averageFinalScore =
          isFullyFinalized && validFinalizedScores.length > 0
            ? Number((validFinalizedScores.reduce((a, b) => a + b, 0) / validFinalizedScores.length).toFixed(2))
            : null;

        const provisionalAverageScore =
          allAvailableScores.length > 0
            ? Number((allAvailableScores.reduce((a, b) => a + b, 0) / allAvailableScores.length).toFixed(2))
            : null;

        return {
          participation: sp,
          participant: participantObj || {
            id: sp.participantId,
            tenantId: currentTenant.id,
            participantId: sp.participantId,
            name: 'Peserta',
            kafilahId: '',
            kafilahName: '-',
            branchName: sp.branchName,
            level: 'Mutawassit',
            levelName: 'Mutawassit',
            gender: 'Putra' as const,
            lotteryNumber: sp.lotteryNumber,
            questionId: sp.questionId || '',
            assignedMaqra: sp.assignedMaqra || '-',
            pageNumber: sp.pageNumber || 1,
            stageName: selectedStageName,
            status: 'Menunggu' as const,
            progressStatus: 'Belum Dimulai' as const
          },
          stageQuestions,
          averageFinalScore,
          provisionalAverageScore,
          displayScore: averageFinalScore !== null ? averageFinalScore : provisionalAverageScore,
          isFullyFinalized,
          progress,
          finalizedJudgeCount: validFinalizedScores.length,
          totalAssignedJudges: totalRequiredUnits > 0 ? totalRequiredUnits : stageJudges.length
        };
      })
      .sort((a, b) => {
        const scoreA = a.displayScore ?? -1;
        const scoreB = b.displayScore ?? -1;
        return scoreB - scoreA;
      });
  }, [currentStageParticipations, stageJudges, assessments, participants, currentTenant.id, selectedStageName, getParticipantProgress, getParticipantStageQuestions]);

  // Quota configuration
  const quota = currentStage?.qualificationQuota || 3;

  // Check if all stage participants have completed evaluations
  const allAssessmentsFinalized = useMemo(() => {
    if (currentStageParticipations.length === 0) return false;
    return rankedParticipants.every((item) => item.isFullyFinalized);
  }, [currentStageParticipations.length, rankedParticipants]);

  // Incomplete participants for quick action
  const incompleteParticipants = useMemo(() => {
    return rankedParticipants.filter((item) => !item.isFullyFinalized);
  }, [rankedParticipants]);

  // Determine qualification status (Top-N + manual overrides)
  const evaluatedParticipants = useMemo(() => {
    return rankedParticipants.map((item, index) => {
      const rank = index + 1;
      const isOverridden = manualOverrides[item.participant.id] !== undefined;

      // Only qualify if fully finalized or explicitly overridden by jury board
      let qualified = false;
      if (isOverridden) {
        qualified = manualOverrides[item.participant.id];
      } else if (allAssessmentsFinalized && item.isFullyFinalized) {
        qualified = rank <= quota;
      }

      return {
        ...item,
        rank,
        isQualified: qualified,
        isOverridden,
        overrideReason: overrideReasons[item.participant.id] || ''
      };
    });
  }, [rankedParticipants, quota, manualOverrides, overrideReasons, allAssessmentsFinalized]);

  // Check if any tie exists on the boundary of quota among finalized participants
  const hasBoundaryTie = useMemo(() => {
    if (rankedParticipants.length <= quota) return false;
    const boundaryScore = rankedParticipants[quota - 1]?.averageFinalScore;
    const nextScore = rankedParticipants[quota]?.averageFinalScore;
    const isBoundaryOverridden =
      manualOverrides[rankedParticipants[quota - 1]?.participant.id] !== undefined ||
      manualOverrides[rankedParticipants[quota]?.participant.id] !== undefined;

    return (
      !isBoundaryOverridden &&
      boundaryScore !== null &&
      nextScore !== null &&
      boundaryScore !== undefined &&
      nextScore !== undefined &&
      boundaryScore === nextScore &&
      boundaryScore > 0
    );
  }, [rankedParticipants, quota, manualOverrides]);

  // Stage overall progress status
  const stageStatusBadge = useMemo(() => {
    if (currentStage?.isFinalized) {
      return {
        label: 'Hasil Babak Difinalisasi & Lolos',
        variant: 'emerald',
        description: 'Kelulusan babak ini telah ditetapkan secara resmi.'
      };
    }
    if (!allAssessmentsFinalized) {
      return {
        label: 'Penilaian Belum Lengkap (Peringkat Sementara)',
        variant: 'amber',
        description: `Terdapat ${incompleteParticipants.length} peserta yang penilaiannya belum difinalisasi seluruh juri.`
      };
    }
    if (hasBoundaryTie) {
      return {
        label: 'Siap Diverifikasi (Perlu Putusan Seri)',
        variant: 'rose',
        description: 'Penilaian lengkap, namun ada nilai kembar pada batas kuota Top-' + quota + '.'
      };
    }
    return {
      label: 'Siap Diverifikasi & Difinalisasi',
      variant: 'blue',
      description: 'Seluruh peserta telah dinilai lengkap oleh dewan hakim dan siap diverifikasi.'
    };
  }, [currentStage?.isFinalized, allAssessmentsFinalized, incompleteParticipants.length, hasBoundaryTie, quota]);

  const qualifiedParticipants = evaluatedParticipants.filter((p) => p.isQualified);

  // Manual Override Handler
  const handleOpenOverride = (p: Participant, currentQualified: boolean) => {
    setOverrideModalParticipant(p);
    setTempOverrideValue(!currentQualified);
    setTempReasonText(overrideReasons[p.id] || '');
  };

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModalParticipant || !tempReasonText.trim()) return;

    setManualOverrides((prev) => ({
      ...prev,
      [overrideModalParticipant.id]: tempOverrideValue
    }));
    setOverrideReasons((prev) => ({
      ...prev,
      [overrideModalParticipant.id]: tempReasonText.trim()
    }));

    setOverrideModalParticipant(null);
  };

  const handleResetOverride = (participantId: string) => {
    setManualOverrides((prev) => {
      const copy = { ...prev };
      delete copy[participantId];
      return copy;
    });
    setOverrideReasons((prev) => {
      const copy = { ...prev };
      delete copy[participantId];
      return copy;
    });
  };

  // Confirm Advancement to Next Stage with validation feedback
  const handleConfirmAdvancement = () => {
    if (!nextStage) return;

    const qualifiedIds = qualifiedParticipants.map((item) => item.participant.id);
    const result = advanceQualifiers(selectedStageName, nextStage.name, qualifiedIds, overrideReasons);

    setIsConfirmAdvancementOpen(false);
    if (result.success) {
      setAdvancementSuccessMessage(result.message);
      setAdvancementErrorMessage('');
    } else {
      setAdvancementErrorMessage(result.message);
      setAdvancementSuccessMessage('');
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Hasil Babak & Kelulusan (Kualifikasi)
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.name} · Verifikasi penilaian juri, penetapan peringkat, dan pelolosan peserta ke babak berikutnya
          </p>
        </div>

        {/* Stage Selector (No label) */}
        <div className="flex items-center gap-2">
          <select
            value={selectedStageName}
            onChange={(e) => {
              setSelectedStageName(e.target.value);
              setAdvancementSuccessMessage('');
            }}
            aria-label="Pilih Babak"
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 bg-white shadow-xs outline-none"
          >
            {stages.map((stg) => (
              <option key={stg.id} value={stg.name}>
                Babak {stg.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Alerts for feedback */}
      {advancementSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between text-xs text-emerald-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <p className="font-semibold">{advancementSuccessMessage}</p>
          </div>
          <button
            onClick={() => setAdvancementSuccessMessage('')}
            className="p-1 text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {advancementErrorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-between text-xs text-rose-900 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" />
            <p className="font-semibold">{advancementErrorMessage}</p>
          </div>
          <button
            onClick={() => setAdvancementErrorMessage('')}
            className="p-1 text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stage Overall Status Banner (Clean White, No Shield Icon) */}
      <div className="p-4 rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm text-slate-900">{stageStatusBadge.label}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{stageStatusBadge.description}</p>
        </div>

        {!allAssessmentsFinalized && (
          <button
            onClick={() => setCurrentView('rekap_nilai')}
            className="self-start sm:self-auto text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors shrink-0 border border-slate-200 cursor-pointer"
          >
            Tinjau di Rekap Nilai →
          </button>
        )}
      </div>

      {/* Stage Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Status Penilaian */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Status Penilaian Babak</span>
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {rankedParticipants.filter((item) => item.isFullyFinalized).length} / {currentStageParticipations.length}
            </span>
            <span className="text-xs text-slate-500">Peserta Lengkap</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {allAssessmentsFinalized ? (
              <span className="text-slate-500">Seluruh penilaian dewan juri lengkap</span>
            ) : (
              <span className="text-slate-500">
                {incompleteParticipants.length} peserta belum lengkap dinilai
              </span>
            )}
          </p>
        </div>

        {/* Card 2: Kuota Kualifikasi */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Kuota Kelulusan Babak</span>
            <Trophy className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              Top {quota}
            </span>
            <span className="text-xs text-slate-500">Peserta Terbaik</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Target melaju ke: <strong className="text-slate-700">{nextStage ? `Babak ${nextStage.name}` : 'Juara Akhir'}</strong>
          </p>
        </div>

        {/* Card 3: Peserta Lolos */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Calon Peserta Lolos</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono">
              {qualifiedParticipants.length}
            </span>
            <span className="text-xs text-slate-500">Peserta Terpilih</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {Object.keys(manualOverrides).length > 0
              ? `${Object.keys(manualOverrides).length} peserta disesuaikan (override)`
              : allAssessmentsFinalized
              ? 'Sesuai peringkat resmi'
              : 'Menunggu penilaian selesai'}
          </p>
        </div>
      </div>

      {/* Tie Alert Notice */}
      {hasBoundaryTie && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 flex items-start gap-3 text-xs text-rose-900">
          <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-sm">Perhatian: Nilai Seri pada Batas Kuota Kelulusan (Top {quota})!</p>
            <p className="mt-1 leading-relaxed">
              Terdapat nilai yang sama persis antara peserta di batas peringkat kelulusan. Sistem memblokir pelolosan otomatis agar tidak memotong peserta secara sepihak. Silakan gunakan tombol <strong>Aksi Override</strong> dengan mencantumkan Berita Acara Dewan Hakim resmi.
            </p>
          </div>
        </div>
      )}

      {/* Qualification Results Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900">
              Peringkat & Kualifikasi Peserta Babak {selectedStageName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Urutan berdasarkan rata-rata nilai dewan juri cabang {currentStage?.branchName}
            </p>
          </div>

          {/* Action to confirm advancement with strict conditions */}
          {nextStage && (
            <div>
              {currentStage?.isFinalized ? (
                <div className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 text-slate-500 rounded-xl font-bold text-xs border border-slate-200">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Babak Ini Telah Difinalisasi</span>
                </div>
              ) : !allAssessmentsFinalized ? (
                <div className="flex flex-col items-end gap-1">
                  <button
                    disabled
                    className="inline-flex items-center gap-2 bg-slate-200 text-slate-400 font-bold text-xs px-4 py-2 rounded-xl cursor-not-allowed shadow-none"
                    title="Penilaian belum lengkap"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Konfirmasi & Loloskan ke Babak {nextStage.name}</span>
                  </button>
                  <span className="text-[10px] text-amber-700 font-medium">
                    Belum dapat diloloskan ({incompleteParticipants.length} peserta belum lengkap)
                  </span>
                </div>
              ) : hasBoundaryTie ? (
                <div className="flex flex-col items-end gap-1">
                  <button
                    disabled
                    className="inline-flex items-center gap-2 bg-slate-200 text-slate-400 font-bold text-xs px-4 py-2 rounded-xl cursor-not-allowed shadow-none"
                    title="Ada nilai kembar pada batas kuota Top-N"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Konfirmasi & Loloskan ke Babak {nextStage.name}</span>
                  </button>
                  <span className="text-[10px] text-rose-700 font-medium">
                    Selesaikan nilai seri di batas Top-{quota} terlebih dahulu
                  </span>
                </div>
              ) : (
                <button
                  onClick={() => setIsConfirmAdvancementOpen(true)}
                  className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer self-start sm:self-auto"
                >
                  <FileCheck2 className="w-4 h-4" />
                  <span>Konfirmasi & Loloskan ke Babak {nextStage.name}</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                <th className="px-5 py-3 w-16 text-center">Rank</th>
                <th className="px-4 py-3 w-20">Undian</th>
                <th className="px-5 py-3">Nama Peserta & Grup</th>
                <th className="px-4 py-3 text-right">Nilai Akhir</th>
                <th className="px-4 py-3 text-center">Kelengkapan Juri</th>
                <th className="px-4 py-3 text-center">Status Kelulusan</th>
                <th className="px-5 py-3 text-right">Aksi Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluatedParticipants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    Belum ada peserta di babak {selectedStageName}.
                  </td>
                </tr>
              ) : (
                evaluatedParticipants.map((item) => {
                  const p = item.participant;

                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      {/* Rank */}
                      <td className="px-5 py-3.5 text-center font-mono font-bold text-xs text-slate-700">
                        #{item.rank}
                      </td>

                      {/* Lottery */}
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        #{p.lotteryNumber}
                      </td>

                      {/* Participant identity */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <button
                            onClick={() => {
                              setSelectedParticipantId(p.id);
                              setCurrentView('penilaian_dual_panel');
                            }}
                            className="text-[10px] text-slate-500 hover:text-slate-900 hover:underline font-medium cursor-pointer"
                            title="Buka Lembar Penilaian Peserta Ini"
                          >
                            [Buka]
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {p.participantId} · {p.kafilahName}
                        </p>
                        {item.isOverridden && (
                          <p className="text-[10px] text-slate-500 mt-0.5 italic">
                            Catatan Override: {item.overrideReason}
                          </p>
                        )}
                      </td>

                      {/* Score: Distinguish valid vs provisional with subtle neutral shades */}
                      <td className="px-4 py-3.5 text-right font-mono">
                        {item.isFullyFinalized && item.averageFinalScore !== null ? (
                          <div>
                            <span className="font-extrabold text-sm text-slate-900">
                              {item.averageFinalScore.toFixed(2)}
                            </span>
                            <span className="block text-[9px] font-medium text-slate-500">Resmi</span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-600 font-bold text-xs">
                              {item.provisionalAverageScore !== null
                                ? item.provisionalAverageScore.toFixed(2)
                                : '—'}
                            </span>
                            <span className="block text-[9px] font-medium text-slate-400">
                              (Sementara)
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Completeness (Neutral text) */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-[11px] font-medium text-slate-600">
                          {item.finalizedJudgeCount} / {item.totalAssignedJudges} Juri Final
                        </span>
                      </td>

                      {/* Qualification status (Subtle black-to-gray tones) */}
                      <td className="px-4 py-3.5 text-center">
                        {item.isOverridden ? (
                          item.isQualified ? (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-300">
                              Override (Lolos)
                            </span>
                          ) : (
                            <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Override (Gugur)
                            </span>
                          )
                        ) : !allAssessmentsFinalized ? (
                          <span className="inline-block text-[11px] text-slate-400">
                            Menunggu Penilaian
                          </span>
                        ) : item.isQualified ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-900 border border-slate-200">
                            Lolos
                          </span>
                        ) : (
                          <span className="inline-block text-[11px] text-slate-500">
                            Tidak Lolos
                          </span>
                        )}
                      </td>

                      {/* Manual Override Action */}
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => handleOpenOverride(p, item.isQualified)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 cursor-pointer"
                        >
                          {item.isQualified ? 'Gugurkan' : 'Loloskan'}
                        </button>
                        {item.isOverridden && (
                          <button
                            onClick={() => handleResetOverride(p.id)}
                            className="p-1 text-slate-400 hover:text-rose-700 rounded"
                            title="Reset Override ke Peringkat Asli"
                          >
                            <RefreshCw className="w-3.5 h-3.5 inline" />
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

      {/* Manual Override Dialog with Mandatory Reason */}
      {overrideModalParticipant && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-2">
              Penyesuaian Kualifikasi (Manual Override)
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Ubah status kelulusan peserta <strong>{overrideModalParticipant.name}</strong> secara manual. Alasan resmi keputusan dewan juri wajib diisi.
            </p>

            <form onSubmit={handleSaveOverride} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Status Kelulusan Baru:
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTempOverrideValue(true)}
                    className={`flex-1 py-2 rounded-lg font-bold border ${
                      tempOverrideValue
                        ? 'bg-emerald-800 text-white border-emerald-800'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Lolos ke Babak Berikutnya
                  </button>
                  <button
                    type="button"
                    onClick={() => setTempOverrideValue(false)}
                    className={`flex-1 py-2 rounded-lg font-bold border ${
                      !tempOverrideValue
                        ? 'bg-rose-800 text-white border-rose-800'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Tidak Lolos
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Alasan / Berita Acara Dewan Hakim (Wajib):
                </label>
                <textarea
                  value={tempReasonText}
                  onChange={(e) => setTempReasonText(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  placeholder="Contoh: Keputusan sidang pleno dewan hakim memenangkan tajwid jali pada poin seri..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setOverrideModalParticipant(null)}
                  className="px-4 py-2 border rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold"
                >
                  Simpan Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal to Advance Qualifiers to Next Stage */}
      {isConfirmAdvancementOpen && nextStage && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-emerald-800 mb-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Award className="w-5 h-5 text-emerald-800" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Konfirmasi Pelolosan Babak
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedStageName} ➔ Babak {nextStage.name}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Sebanyak <strong>{qualifiedParticipants.length} peserta</strong> di bawah ini akan diloloskan ke <strong>Babak {nextStage.name}</strong>:
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1 mb-4 text-xs">
              {qualifiedParticipants.map((item, idx) => (
                <div key={item.participant.id} className="flex justify-between py-1 border-b border-slate-100 last:border-0">
                  <span className="font-semibold text-slate-900">
                    {idx + 1}. #{item.participant.lotteryNumber} {item.participant.name}
                  </span>
                  <span className="font-mono text-emerald-800 font-bold">
                    {item.displayScore !== null ? item.displayScore.toFixed(2) : '—'}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mb-5">
              Peserta yang lolos akan memasuki Babak {nextStage.name} dengan paket maqra dan lembar penilaian baru. Rekam jejak babak sebelumnya tetap tersimpan rapi.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsConfirmAdvancementOpen(false)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmAdvancement}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                Ya, Loloskan Peserta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
