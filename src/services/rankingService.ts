import {
  Participant,
  StageParticipation,
  JudgeAssessment,
  JudgeAssignment,
  ParticipantRankingItem,
  StageResultSnapshot,
  AssignedMaqraItem,
  CompetitionRuleConfig
} from '../types/mtq';
import { getBranchRuleConfig } from './competitionRules';
import { aggregateParticipantScores } from './scoringEngine';

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
  isOverridden: boolean;
  overrideReason: string;
  tieBreakResolvedBy?: string;
  hasUnresolvedTieWithNext?: boolean;
  hasUnresolvedTie?: boolean;
}

/**
 * LAYANAN PENENTUAN PERINGKAT, TIE-BREAK, DAN KELULUSAN (Ranking & Qualification Service)
 * 
 * Menjamin:
 * 1. Isolasi Cabang: Peserta antar-cabang tidak pernah dicampur dalam ranking.
 * 2. Penegakan Tie-Break Resmi & Dinamis: Berasal dari konfigurasi aktif per cabang.
 * 3. Deteksi Nilai Seri Menyeluruh: Memeriksa podium Juara 1, 2, 3 serta batas kuota kelulusan.
 * 4. Konsistensi Pengesahan: Perhitungan di UI preview dan penyimpanan snapshot identik 100%.
 * 5. Pemblokiran Finalisasi Seri: Jika semua kriteria sama persis, wajib sidang pleno dewan hakim.
 */
export class RankingService {
  /**
   * Mengelompokkan dan mengevaluasi peserta per babak dan cabang.
   */
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
  }): {
    evaluatedParticipants: EvaluatedParticipantStage[];
    allFinalized: boolean;
    incompleteCount: number;
    podiumTies: Array<{ rank: number; participantIds: string[]; score: number }>;
    boundaryTie: boolean;
    unresolvedTiesCount: number;
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
      customRuleConfigs
    } = params;

    // 1. Filter partisipasi babak dengan isolasi tenant, stageId, dan cabang (P0-C)
    const filteredParticipations = participations.filter((sp) => {
      if (sp.tenantId !== tenantId) return false;
      if (stageId && sp.stageId && sp.stageId !== stageId) return false;
      if (sp.stageName !== stageName) return false;
      if (branchId && sp.branchId && sp.branchId !== branchId) return false;
      if (branchName && branchName !== 'Semua Cabang' && sp.branchName !== branchName) {
        return false;
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
        canFinalize: false,
        blockingReason: 'Tidak ada peserta terdaftar pada babak ini.'
      };
    }

    // 2. Kumpulkan dewan hakim yang ditugaskan khusus untuk cabang dan babak ini
    const targetBranch = branchName || filteredParticipations[0]?.branchName || '';
    const relevantAssignments = judgeAssignments.filter((ja) => {
      if (ja.tenantId !== tenantId) return false;
      if (ja.stageName !== stageName) return false;
      if (targetBranch && ja.branchName && ja.branchName !== targetBranch && !targetBranch.includes(ja.branchName)) {
        return false;
      }
      return true;
    });

    const requiredJudgeIds = Array.from(new Set(relevantAssignments.map((ja) => ja.judgeId)));

    // 3. Hitung skor tiap peserta menggunakan Scoring Engine terpusat
    const evaluatedItems = filteredParticipations.map((sp) => {
      const partObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
      const stageQuestions = stageQuestionsGetter(sp.participantId, stageName);

      const judgeIdsToUse = requiredJudgeIds.length > 0
        ? requiredJudgeIds
        : Array.from(new Set(assessments.filter((a) => a.participantId === sp.participantId && a.stageName === stageName).map((a) => a.judgeId)));

      const agg = aggregateParticipantScores(
        sp.participantId,
        stageName,
        stageQuestions,
        judgeIdsToUse,
        assessments.filter((a) => a.tenantId === tenantId)
      );

      const participantSafe: Participant = partObj || {
        id: sp.participantId,
        tenantId,
        participantId: sp.participantId,
        name: 'Peserta',
        kafilahId: '',
        kafilahName: '-',
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

    // 4. Pengurutan & Tie-Break resmi (Dinamis dari Konfigurasi Admin / Regulasi Terverifikasi)
    const ruleConfig = getBranchRuleConfig(targetBranch, tenantId, customRuleConfigs);
    const tieBreakOrder = ruleConfig.tieBreakOrder; // e.g. ['total', 'Tajwid', 'Lagu', 'Fashahah']

    const tieBreakLogMap: Record<string, string> = {};
    const unresolvedMap: Record<string, boolean> = {};

    evaluatedItems.sort((a, b) => {
      const scoreA = a.displayScore ?? -1;
      const scoreB = b.displayScore ?? -1;

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // Skor total sama -> terapkan urutan tie-break resmi dinamis
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

      // P0: Jika seluruh kriteria bidang tetap seri identik, tandai sebagai belum terselesaikan.
      // DILARANG memutus juara secara sewenang-wenang lewat nomor undian!
      if (scoreA > 0) {
        unresolvedMap[a.participant.id] = true;
        unresolvedMap[b.participant.id] = true;
        tieBreakLogMap[a.participant.id] = 'Nilai seri identik pada seluruh kriteria bidang (Perlu Keputusan Sidang Pleno / Penampilan Ulang)';
        tieBreakLogMap[b.participant.id] = 'Nilai seri identik pada seluruh kriteria bidang (Perlu Keputusan Sidang Pleno / Penampilan Ulang)';
      }

      // Stabilitas tampilan visual (hanya untuk rendering sementara, bukan penentuan keabsahan juara)
      return a.participant.lotteryNumber.localeCompare(b.participant.lotteryNumber);
    });

    // 5. Penetapan Peringkat dan Status Kelulusan
    const allFinalized = evaluatedItems.length > 0 && evaluatedItems.every((item) => item.isFullyFinalized);
    const incompleteCount = evaluatedItems.filter((item) => !item.isFullyFinalized).length;

    const evaluatedParticipants: EvaluatedParticipantStage[] = evaluatedItems.map((item, index) => {
      const rank = index + 1;
      const isOverridden = manualOverrides[item.participant.id] !== undefined;

      let qualified = false;
      if (isOverridden) {
        qualified = manualOverrides[item.participant.id];
      } else if (allFinalized && item.isFullyFinalized) {
        qualified = rank <= quota;
      }

      return {
        ...item,
        rank,
        isQualified: qualified,
        isOverridden,
        overrideReason: overrideReasons[item.participant.id] || '',
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
    // Jika peserta sudah dibedakan oleh bidang tie-break (misal Tajwid/Lagu), TIDAK boleh diblokir!
    let boundaryTie = false;
    if (evaluatedParticipants.length > quota && quota > 0) {
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

    // Evaluasi kelayakan finalisasi (canFinalize)
    let canFinalize = allFinalized;
    let blockingReason: string | undefined;

    if (!ruleConfig || !ruleConfig.rubricVersionId || ruleConfig.status === 'Draft') {
      canFinalize = false;
      blockingReason = `Cabang "${targetBranch}" belum memiliki konfigurasi aturan kompetisi resmi atau rubrik aktif yang valid.`;
    } else if (!allFinalized) {
      canFinalize = false;
      blockingReason = `Terdapat ${incompleteCount} peserta yang penilaiannya belum lengkap dari seluruh dewan hakim.`;
    } else if (boundaryTie) {
      canFinalize = false;
      blockingReason = 'Terdapat nilai seri identik tak terpecahkan pada batas kuota kelulusan. Wajib diselesaikan melalui sidang pleno atau override manual berizin sebelum babak disahkan.';
    } else {
      // Periksa apakah ada nilai seri tak terpecahkan di posisi podium tanpa override
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
    branchName: string;
    quota: number;
    finalizedBy: string;
    evaluatedParticipants: EvaluatedParticipantStage[];
    customRuleConfigs?: CompetitionRuleConfig[];
  }): StageResultSnapshot {
    const {
      tenantId,
      stageId,
      stageName,
      branchName,
      quota,
      finalizedBy,
      evaluatedParticipants,
      customRuleConfigs
    } = params;

    const ruleConfig = getBranchRuleConfig(branchName, tenantId, customRuleConfigs);

    const rankings: ParticipantRankingItem[] = evaluatedParticipants.map((item) => ({
      participantId: item.participant.id,
      participantName: item.participant.name,
      lotteryNumber: item.participant.lotteryNumber,
      kafilahName: item.participant.kafilahName,
      branchName: item.participant.branchName,
      stageName,
      totalScore: item.displayScore || 0,
      fieldScores: item.fieldScores,
      rank: item.rank,
      isQualified: item.isQualified,
      reason: item.isOverridden
        ? `Override Dewan Hakim: ${item.overrideReason}`
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
      branchName,
      quota,
      finalizedAt: new Date().toISOString(),
      finalizedBy,
      rubricVersionId: ruleConfig.rubricVersionId,
      tieBreakRuleUsed: ruleConfig.tieBreakOrder.join(' ➔ '),
      rankings
    };
  }
}
