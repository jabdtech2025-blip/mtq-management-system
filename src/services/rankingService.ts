import {
  Participant,
  StageParticipation,
  JudgeAssessment,
  JudgeAssignment,
  ParticipantRankingItem,
  StageResultSnapshot,
  AssignedMaqraItem,
  CompetitionRuleConfig,
  RubricVersion
} from '../types/mtq';
import { getBranchRuleConfig, resolveActiveRubricForBranch, INITIAL_RUBRIC_VERSIONS } from './competitionRules';
import { aggregateParticipantScores, getActiveRubricFields } from './scoringEngine';

export interface EvaluatedParticipantStage {
  participation: StageParticipation;
  participant: Participant;
  stageQuestions: AssignedMaqraItem[];
  averageFinalScore: number | null;
  provisionalScore: number | null;
  displayScore: number | null;
  fieldScores: Record<string, number>;
  isFullyFinalized: boolean;
  finalizedJudgeCount: number;
  totalAssignedJudges: number;
  rank: number;
  isQualified: boolean;
  autoQualified: boolean;
  isOverridden: boolean;
  hasOverrideConflict: boolean;
  overrideReason: string;
  tieBreakResolvedBy?: string;
  hasUnresolvedTieWithNext?: boolean;
  hasUnresolvedTie?: boolean;
}

/**
 * LAYANAN PENENTUAN PERINGKAT, TIE-BREAK, DAN KELULUSAN (Ranking & Qualification Service)
 *
 * Menjamin:
 * 1. Isolasi Cabang & Tahap Berbasis ID: Peserta antar-cabang/tahap tidak pernah dicampur.
 * 2. Penugasan Hakim Wajib: Menolak finalisasi jika belum ada penugasan hakim yang sah.
 * 3. Penegakan Tie-Break Resmi & Dinamis: Divalidasi terhadap bidang rubrik aktif.
 * 4. Deteksi Nilai Seri Menyeluruh: Memeriksa podium Juara 1, 2, 3 serta batas kuota kelulusan.
 * 5. Override Manual True & False: Mendeteksi konflik terhadap kuota otomatis dan mewajibkan alasan sah.
 */
export class RankingService {
  static evaluateStageParticipants(params: {
    tenantId: string;
    stageId?: string;
    stageName: string;
    branchId?: string;
    branchName?: string;
    participations: StageParticipation[];
    participants: Participant[];
    assessments: JudgeAssessment[];
    judgeAssignments: JudgeAssignment[];
    stageQuestionsGetter: (participantId: string, stageName: string) => AssignedMaqraItem[];
    quota: number;
    manualOverrides?: Record<string, boolean>;
    overrideReasons?: Record<string, string>;
    customRuleConfigs?: CompetitionRuleConfig[];
    customRubricVersions?: RubricVersion[];
  }): {
    evaluatedParticipants: EvaluatedParticipantStage[];
    allFinalized: boolean;
    incompleteCount: number;
    podiumTies: Array<{ rank: number; participantIds: string[]; score: number }>;
    boundaryTie: boolean;
    unresolvedTiesCount: number;
    isTieBreakConfigValid: boolean;
    canFinalize: boolean;
    blockingReason?: string;
  } {
    const {
      tenantId,
      stageId,
      stageName,
      branchId,
      branchName,
      participations,
      participants,
      assessments,
      judgeAssignments,
      stageQuestionsGetter,
      quota,
      manualOverrides = {},
      overrideReasons = {},
      customRuleConfigs,
      customRubricVersions = INITIAL_RUBRIC_VERSIONS
    } = params;

    // 1. Filter partisipasi babak dengan isolasi ketat tenantId, stageId, dan branchId (P0-8)
    const filteredParticipations = participations.filter((sp) => {
      if (sp.tenantId !== tenantId) return false;

      if (stageId) {
        if (!sp.stageId || sp.stageId !== stageId) return false;
      } else if (sp.stageName !== stageName) {
        return false;
      }

      const partObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
      const effectiveBranchId = sp.branchId || partObj?.branchId;

      if (branchId) {
        if (!effectiveBranchId || effectiveBranchId !== branchId) return false;
      } else if (branchName && branchName !== 'Semua Cabang') {
        if (sp.branchName !== branchName) return false;
      }

      return true;
    });

    if (filteredParticipations.length === 0) {
      return {
        evaluatedParticipants: [],
        allFinalized: false,
        incompleteCount: 0,
        podiumTies: [],
        boundaryTie: false,
        unresolvedTiesCount: 0,
        isTieBreakConfigValid: true,
        canFinalize: false,
        blockingReason: 'Tidak ada peserta terdaftar pada babak dan cabang ini.'
      };
    }

    // 2. Kumpulkan dewan hakim yang ditugaskan khusus untuk cabang dan babak ini (tanpa fallback ke seluruh hakim tenant)
    const targetBranch =
      branchName && branchName !== 'Semua Cabang'
        ? branchName
        : filteredParticipations[0]?.branchName || '';
    const targetBranchId = branchId || filteredParticipations[0]?.branchId;

    const relevantAssignments = judgeAssignments.filter((ja) => {
      if (ja.tenantId !== tenantId) return false;

      if (stageId && ja.stageId) {
        if (ja.stageId !== stageId) return false;
      } else if (ja.stageName !== stageName) {
        return false;
      }

      if (targetBranchId && ja.branchId) {
        if (ja.branchId !== targetBranchId) return false;
      } else if (targetBranch && ja.branchName) {
        if (ja.branchName !== targetBranch && !targetBranch.includes(ja.branchName)) {
          return false;
        }
      }

      return true;
    });

    const requiredJudgeIds = Array.from(new Set(relevantAssignments.map((ja) => ja.judgeId)));

    // 3. Hitung skor tiap peserta menggunakan Scoring Engine terpusat dengan isolasi stageId & stageParticipationId
    const tenantAssessments = assessments.filter((a) => a.tenantId === tenantId);

    const evaluatedItems = filteredParticipations.map((sp) => {
      const partObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
      const stageQuestions = stageQuestionsGetter(sp.participantId, stageName);

      // P0-7: JANGAN mengganti daftar hakim wajib dengan assessment acak jika penugasan wajib tidak ditemukan
      const agg = aggregateParticipantScores(
        sp.participantId,
        stageName,
        stageQuestions,
        requiredJudgeIds,
        tenantAssessments,
        stageId || sp.stageId,
        sp.id
      );

      const participantSafe: Participant = partObj || {
        id: sp.participantId,
        tenantId,
        participantId: sp.participantId,
        name: 'Peserta',
        kafilahId: '',
        kafilahName: '-',
        branchId: sp.branchId,
        branchName: sp.branchName,
        levelName: 'Ulya',
        gender: 'Putra',
        lotteryNumber: sp.lotteryNumber,
        questionId: sp.questionId || '',
        assignedMaqra: sp.assignedMaqra || '-',
        pageNumber: sp.pageNumber || 1,
        stageName,
        status: 'Menunggu'
      };

      return {
        participation: sp,
        participant: participantSafe,
        stageQuestions,
        averageFinalScore: agg.averageFinalScore,
        provisionalScore: agg.provisionalScore,
        displayScore: agg.averageFinalScore !== null ? agg.averageFinalScore : agg.provisionalScore,
        fieldScores: agg.fieldAverages,
        isFullyFinalized: agg.isFullyFinalized,
        finalizedJudgeCount: agg.finalizedCount,
        totalAssignedJudges: agg.totalRequiredUnits
      };
    });

    // 4. Resolusi Konfigurasi Aturan & Validasi Tie-Break terhadap Rubrik Aktif
    const ruleConfig = getBranchRuleConfig(targetBranch, tenantId, customRuleConfigs, targetBranchId);
    const rubricRes = resolveActiveRubricForBranch({
      branchName: targetBranch,
      branchId: targetBranchId,
      tenantId,
      competitionRules: customRuleConfigs,
      rubricVersions: customRubricVersions
    });

    const tieBreakOrder = ruleConfig.tieBreakOrder || [];
    const validRubricFieldNames = new Set<string>(
      rubricRes.rubric ? getActiveRubricFields(rubricRes.rubric).map((f) => f.name) : []
    );

    const isTieBreakConfigValid =
      Array.isArray(tieBreakOrder) &&
      tieBreakOrder.length > 0 &&
      tieBreakOrder.every((crit) => {
        if (crit === 'total') return true;
        if (validRubricFieldNames.size > 0) {
          return validRubricFieldNames.has(crit);
        }
        return true;
      });

    const tieBreakLogMap: Record<string, string> = {};
    const unresolvedMap: Record<string, boolean> = {};

    evaluatedItems.sort((a, b) => {
      const scoreA = a.displayScore ?? -1;
      const scoreB = b.displayScore ?? -1;

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // Skor total sama -> terapkan urutan tie-break resmi dinamis jika valid
      if (isTieBreakConfigValid) {
        for (const criterion of tieBreakOrder) {
          if (criterion === 'total') continue;

          const valA = a.fieldScores[criterion] ?? 0;
          const valB = b.fieldScores[criterion] ?? 0;

          if (valA !== valB) {
            tieBreakLogMap[a.participant.id] = `Diputuskan unggul melalui Bidang ${criterion} (${valA.toFixed(2)} vs ${valB.toFixed(2)})`;
            tieBreakLogMap[b.participant.id] = `Peringkat diselesaikan melalui Bidang ${criterion} (${valB.toFixed(2)} vs ${valA.toFixed(2)})`;
            return valB - valA;
          }
        }
      }

      // P0: Jika seluruh kriteria bidang tetap seri identik, tandai sebagai belum terselesaikan.
      // DILARANG memutus juara secara sewenang-wenang lewat nomor undian!
      if (scoreA > 0) {
        unresolvedMap[a.participant.id] = true;
        unresolvedMap[b.participant.id] = true;
        tieBreakLogMap[a.participant.id] = 'Nilai seri identik pada seluruh kriteria bidang (Perlu Keputusan Sidang Pleno / Penampilan Ulang)';
        tieBreakLogMap[b.participant.id] = 'Nilai seri identik pada seluruh kriteria bidang (Perlu Keputusan Sidang Pleno / Penampilan Ulang)';
      }

      // Stabilitas tampilan visual (hanya untuk urutan render tabel, bukan penentuan pemenang)
      return a.participant.lotteryNumber.localeCompare(b.participant.lotteryNumber);
    });

    // 5. Penetapan Peringkat dan Status Kelulusan (Mendukung Override True & False)
    const isQuotaValid = typeof quota === 'number' && Number.isInteger(quota) && quota > 0;
    const allFinalized =
      requiredJudgeIds.length > 0 &&
      evaluatedItems.length > 0 &&
      evaluatedItems.every((item) => item.isFullyFinalized);
    const incompleteCount = evaluatedItems.filter((item) => !item.isFullyFinalized).length;

    let missingOverrideReasonParticipant: string | null = null;

    const evaluatedParticipants: EvaluatedParticipantStage[] = evaluatedItems.map((item, index) => {
      const rank = index + 1;
      const autoQualified = Boolean(isQuotaValid && allFinalized && item.isFullyFinalized && rank <= quota);
      const isOverridden = manualOverrides[item.participant.id] !== undefined;

      let qualified = autoQualified;
      if (isOverridden) {
        qualified = Boolean(manualOverrides[item.participant.id]);
      }

      const hasOverrideConflict = isOverridden && qualified !== autoQualified;
      const reasonText = (overrideReasons[item.participant.id] || '').trim();

      if (isOverridden && (hasOverrideConflict || unresolvedMap[item.participant.id]) && reasonText.length < 5) {
        missingOverrideReasonParticipant = item.participant.name;
      }

      return {
        ...item,
        rank,
        isQualified: qualified,
        autoQualified,
        isOverridden,
        hasOverrideConflict,
        overrideReason: reasonText,
        tieBreakResolvedBy: tieBreakLogMap[item.participant.id],
        hasUnresolvedTieWithNext: unresolvedMap[item.participant.id] && index < evaluatedItems.length - 1,
        hasUnresolvedTie: !!unresolvedMap[item.participant.id]
      };
    });

    // 6. Deteksi Nilai Seri pada Posisi Kritis (Podium Juara 1, 2, 3 dan Batas Kuota)
    const podiumTies: Array<{ rank: number; participantIds: string[]; score: number }> = [];
    const scoresMap: Record<number, string[]> = {};

    evaluatedParticipants.forEach((ep) => {
      if (ep.displayScore && ep.displayScore > 0) {
        if (!scoresMap[ep.displayScore]) scoresMap[ep.displayScore] = [];
        scoresMap[ep.displayScore].push(ep.participant.id);
      }
    });

    Object.entries(scoresMap).forEach(([scoreStr, pIds]) => {
      if (pIds.length > 1) {
        const tiedPodiumParticipants = evaluatedParticipants.filter(
          (ep) => pIds.includes(ep.participant.id) && ep.rank <= 3 && ep.hasUnresolvedTie
        );
        if (tiedPodiumParticipants.length > 1) {
          podiumTies.push({
            rank: tiedPodiumParticipants[0].rank,
            participantIds: tiedPodiumParticipants.map((ep) => ep.participant.id),
            score: Number(scoreStr)
          });
        }
      }
    });

    // P0-D: Cek batas kuota kelulusan (Boundary Tie)
    // HANYA memblokir jika peserta pada batas kuota (quota vs quota+1) TETAP SERI IDENTIK
    // setelah seluruh kriteria tie-break resmi dievaluasi (unresolved tie).
    let boundaryTie = false;
    if (isQuotaValid && evaluatedParticipants.length > quota) {
      const quotaItem = evaluatedParticipants[quota - 1];
      const nextItem = evaluatedParticipants[quota];
      const isBoundaryOverridden =
        manualOverrides[quotaItem?.participant.id] !== undefined ||
        manualOverrides[nextItem?.participant.id] !== undefined;

      const hasUnresolvedBoundaryTie =
        Boolean(quotaItem?.hasUnresolvedTie && nextItem?.hasUnresolvedTie) ||
        Boolean(quotaItem?.hasUnresolvedTieWithNext);

      if (
        !isBoundaryOverridden &&
        hasUnresolvedBoundaryTie &&
        quotaItem?.displayScore &&
        nextItem?.displayScore &&
        quotaItem.displayScore === nextItem.displayScore &&
        quotaItem.displayScore > 0
      ) {
        boundaryTie = true;
      }
    }

    const unresolvedTiesCount = Object.keys(unresolvedMap).length;

    // 7. Evaluasi Kelayakan Finalisasi (canFinalize)
    let canFinalize = allFinalized;
    let blockingReason: string | undefined;

    if (!isQuotaValid) {
      canFinalize = false;
      blockingReason = `Kuota kelulusan babak tidak valid (${quota}). Harus berupa bilangan bulat positif.`;
    } else if (requiredJudgeIds.length === 0) {
      canFinalize = false;
      blockingReason = `Belum ada penugasan dewan hakim resmi untuk cabang "${targetBranch}" pada babak "${stageName}".`;
    } else if (!ruleConfig || !ruleConfig.rubricVersionId || ruleConfig.status === 'Draft') {
      canFinalize = false;
      blockingReason = `Cabang "${targetBranch}" belum memiliki konfigurasi aturan kompetisi resmi atau rubrik aktif yang valid.`;
    } else if (!isTieBreakConfigValid) {
      canFinalize = false;
      blockingReason = `Konfigurasi urutan kriteria tie-break pada cabang "${targetBranch}" tidak valid atau memuat bidang di luar rubrik aktif.`;
    } else if (!allFinalized) {
      canFinalize = false;
      blockingReason = `Terdapat ${incompleteCount} peserta yang penilaiannya belum lengkap dari seluruh dewan hakim.`;
    } else if (missingOverrideReasonParticipant) {
      canFinalize = false;
      blockingReason = `Keputusan override manual untuk peserta "${missingOverrideReasonParticipant}" wajib mencantumkan alasan tertulis minimal 5 karakter.`;
    } else if (boundaryTie) {
      canFinalize = false;
      blockingReason = 'Terdapat nilai seri identik tak terpecahkan pada batas kuota kelulusan. Wajib diselesaikan melalui sidang pleno atau override manual berizin sebelum babak disahkan.';
    } else {
      const podiumUnresolved = evaluatedParticipants.some(
        (ep) => ep.rank <= 3 && ep.hasUnresolvedTie && !ep.isOverridden
      );
      if (podiumUnresolved) {
        canFinalize = false;
        blockingReason = 'Terdapat nilai seri identik pada posisi Podium Juara (1/2/3). Wajib diputuskan dalam sidang pleno dewan hakim atau melalui override manual.';
      }
    }

    return {
      evaluatedParticipants,
      allFinalized,
      incompleteCount,
      podiumTies,
      boundaryTie,
      unresolvedTiesCount,
      isTieBreakConfigValid,
      canFinalize,
      blockingReason
    };
  }

  /**
   * Menghasilkan Snapshot Hasil Babak Resmi untuk audit dan ekspor permanen.
   */
  static createStageResultSnapshot(params: {
    tenantId: string;
    stageId: string;
    stageName: string;
    branchId?: string;
    branchName: string;
    quota: number;
    qualificationMethod?: 'top_n' | 'manual';
    finalizedBy: string;
    evaluatedParticipants: EvaluatedParticipantStage[];
    customRuleConfigs?: CompetitionRuleConfig[];
  }): StageResultSnapshot {
    const {
      tenantId,
      stageId,
      stageName,
      branchId,
      branchName,
      quota,
      qualificationMethod = 'top_n',
      finalizedBy,
      evaluatedParticipants,
      customRuleConfigs
    } = params;

    const ruleConfig = getBranchRuleConfig(branchName, tenantId, customRuleConfigs, branchId);

    const rankings: ParticipantRankingItem[] = evaluatedParticipants.map((item) => ({
      participantId: item.participant.id,
      participantName: item.participant.name,
      lotteryNumber: item.participant.lotteryNumber,
      kafilahName: item.participant.kafilahName,
      branchId: branchId || item.participant.branchId,
      branchName: item.participant.branchName,
      stageId,
      stageName,
      totalScore: item.displayScore || 0,
      fieldScores: { ...item.fieldScores },
      rank: item.rank,
      isQualified: item.isQualified,
      autoQualified: item.autoQualified,
      isOverridden: item.isOverridden,
      overrideReason: item.overrideReason || undefined,
      hasOverrideConflict: item.hasOverrideConflict,
      reason: item.isOverridden
        ? `Override Dewan Hakim (${item.isQualified ? 'Lolos' : 'Tidak Lolos'}): ${item.overrideReason || 'Keputusan Pleno'}`
        : item.isQualified
        ? `Lolos Kuota Top ${quota}`
        : 'Tidak memenuhi kuota kelulusan',
      tieBreakResolvedBy: item.tieBreakResolvedBy
    }));

    return {
      id: `snap-${tenantId}-${stageId}-${Date.now()}`,
      tenantId,
      stageId,
      stageName,
      branchId,
      branchName,
      quota,
      qualificationMethod,
      finalizedAt: new Date().toISOString(),
      finalizedBy,
      rubricVersionId: ruleConfig.rubricVersionId,
      tieBreakRuleUsed: ruleConfig.tieBreakOrder.join(' ➔ '),
      rankings
    };
  }
}
