import {
  Participant,
  StageParticipation,
  JudgeAssessment,
  JudgeAssignment,
  ParticipantRankingItem,
  StageResultSnapshot,
  AssignedMaqraItem
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
}

/**
 * LAYANAN PENENTUAN PERINGKAT, TIE-BREAK, DAN KELULUSAN (Ranking & Qualification Service)
 * 
 * Menjamin:
 * 1. Isolasi Cabang: Peserta antar-cabang tidak pernah dicampur dalam ranking.
 * 2. Penegakan Tie-Break Resmi: Mengikuti aturan per cabang (contoh Seni Baca: Total -> Tajwid -> Lagu -> Fashahah).
 * 3. Deteksi Nilai Seri Menyeluruh: Memeriksa podium Juara 1, 2, 3 serta batas kuota kelulusan.
 * 4. Konsistensi Pengesahan: Perhitungan di UI preview dan penyimpanan snapshot identik 100%.
 */
export class RankingService {
  /**
   * Mengelompokkan dan mengevaluasi peserta per babak dan cabang.
   */
  static evaluateStageParticipants(params: {
    tenantId: string;
    stageName: string;
    branchName?: string;
    participations: StageParticipation[];
    participants: Participant[];
    assessments: JudgeAssessment[];
    judgeAssignments: JudgeAssignment[];
    stageQuestionsGetter: (participantId: string, stageName: string) => AssignedMaqraItem[];
    quota: number;
    manualOverrides?: Record<string, boolean>;
    overrideReasons?: Record<string, string>;
  }): {
    evaluatedParticipants: EvaluatedParticipantStage[];
    allFinalized: boolean;
    incompleteCount: number;
    podiumTies: Array<{ rank: number; participantIds: string[]; score: number }>;
    boundaryTie: boolean;
    unresolvedTiesCount: number;
  } {
    const {
      tenantId,
      stageName,
      branchName,
      participations,
      participants,
      assessments,
      judgeAssignments,
      stageQuestionsGetter,
      quota,
      manualOverrides = {},
      overrideReasons = {}
    } = params;

    // 1. Filter partisipasi babak dengan isolasi tenant dan cabang
    const filteredParticipations = participations.filter((sp) => {
      if (sp.tenantId !== tenantId) return false;
      if (sp.stageName !== stageName) return false;
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
        unresolvedTiesCount: 0
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

    // 4. Pengurutan & Tie-Break resmi
    const ruleConfig = getBranchRuleConfig(targetBranch, tenantId);
    const tieBreakOrder = ruleConfig.tieBreakOrder; // e.g. ['total', 'Tajwid', 'Lagu', 'Fashahah']

    const tieBreakLogMap: Record<string, string> = {};
    const unresolvedMap: Record<string, boolean> = {};

    evaluatedItems.sort((a, b) => {
      const scoreA = a.displayScore ?? -1;
      const scoreB = b.displayScore ?? -1;

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // Skor total sama -> terapkan urutan tie-break resmi
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

      // Jika seluruh kriteria bidang tetap seri identik
      if (scoreA > 0) {
        unresolvedMap[a.participant.id] = true;
        unresolvedMap[b.participant.id] = true;
        tieBreakLogMap[a.participant.id] = 'Nilai seri identik pada semua bidang (Perlu Sidang Pleno / Penampilan Ulang)';
        tieBreakLogMap[b.participant.id] = 'Nilai seri identik pada semua bidang (Perlu Sidang Pleno / Penampilan Ulang)';
      }

      // Pertahankan stabilitas nomor undian bila terpaksa
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
        hasUnresolvedTieWithNext: unresolvedMap[item.participant.id] && index < evaluatedItems.length - 1
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
        const firstParticipant = evaluatedParticipants.find((ep) => ep.participant.id === pIds[0]);
        if (firstParticipant && firstParticipant.rank <= 3) {
          podiumTies.push({
            rank: firstParticipant.rank,
            participantIds: pIds,
            score: Number(scoreStr)
          });
        }
      }
    });

    // Cek batas kuota kelulusan
    let boundaryTie = false;
    if (evaluatedParticipants.length > quota && quota > 0) {
      const quotaItem = evaluatedParticipants[quota - 1];
      const nextItem = evaluatedParticipants[quota];
      const isBoundaryOverridden =
        manualOverrides[quotaItem?.participant.id] !== undefined ||
        manualOverrides[nextItem?.participant.id] !== undefined;

      if (
        !isBoundaryOverridden &&
        quotaItem?.displayScore &&
        nextItem?.displayScore &&
        quotaItem.displayScore === nextItem.displayScore &&
        quotaItem.displayScore > 0
      ) {
        boundaryTie = true;
      }
    }

    const unresolvedTiesCount = Object.keys(unresolvedMap).length;

    return {
      evaluatedParticipants,
      allFinalized,
      incompleteCount,
      podiumTies,
      boundaryTie,
      unresolvedTiesCount
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
  }): StageResultSnapshot {
    const {
      tenantId,
      stageId,
      stageName,
      branchName,
      quota,
      finalizedBy,
      evaluatedParticipants
    } = params;

    const ruleConfig = getBranchRuleConfig(branchName, tenantId);

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
