import {
  Participant,
  StageParticipation,
  JudgeAssessment,
  JudgeAssignment,
  ParticipantRankingItem,
  StageResultSnapshot,
  AssignedMaqraItem,
  CompetitionRuleConfig,
  RubricVersion,
  CompetitionStage
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

export interface StageEvaluationResult {
  evaluatedParticipants: EvaluatedParticipantStage[];
  allFinalized: boolean;
  incompleteCount: number;
  podiumTies: Array<{ rank: number; participantIds: string[]; score: number }>;
  boundaryTie: boolean;
  unresolvedTiesCount: number;
  isTieBreakConfigValid: boolean;
  canFinalize: boolean;
  blockingReason?: string;
}

export interface BranchStageEvaluationGroup {
  branchKey: string;
  branchId?: string;
  branchName: string;
  stageId?: string;
  stageName: string;
  nextStageId?: string;
  nextStageName?: string;
  isStageFinalized: boolean;
  quota: number;
  evaluation: StageEvaluationResult;
}

/**
 * LAYANAN PENENTUAN PERINGKAT, TIE-BREAK, DAN KELULUSAN (Ranking & Qualification Service)
 *
 * Menjamin:
 * 1. Isolasi Cabang & Tahap Berbasis ID: Peserta antar-cabang/tahap tidak pernah dicampur (P0-01).
 * 2. Penugasan Hakim Wajib: Menolak finalisasi jika belum ada penugasan hakim yang sah.
 * 3. Penegakan Tie-Break Resmi & Dinamis: Divalidasi terhadap bidang rubrik aktif.
 * 4. Deteksi Nilai Seri Menyeluruh: Memeriksa podium Juara 1, 2, 3 serta batas kuota kelulusan.
 * 5. Override Manual True & False & Batas Kuota: Mendeteksi konflik terhadap kuota otomatis, mewajibkan alasan sah, dan menolak jumlah lolos > kuota (P1-04).
 */
export class RankingService {
  /**
   * Mengevaluasi hasil babak yang dikelompokkan secara ketat per cabang lomba (branchId / branchName).
   * Digunakan ketika pengguna memilih tampilan "Semua Cabang" agar hakim, rubrik, aturan tie-break,
   * kuota kelulusan, dan peringkat antar-cabang tidak pernah tercampur (P0-01).
   */
  static evaluateStageByBranches(params: {
    tenantId: string;
    stageId?: string;
    stageName: string;
    stages?: CompetitionStage[];
    participations: StageParticipation[];
    participants: Participant[];
    assessments: JudgeAssessment[];
    judgeAssignments: JudgeAssignment[];
    stageQuestionsGetter: (participantId: string, stageName: string) => AssignedMaqraItem[];
    defaultQuota?: number;
    manualOverrides?: Record<string, boolean>;
    overrideReasons?: Record<string, string>;
    customRuleConfigs?: CompetitionRuleConfig[];
    customRubricVersions?: RubricVersion[];
  }): BranchStageEvaluationGroup[] {
    const {
      tenantId,
      stageName,
      stages = [],
      participations,
      participants,
      assessments,
      judgeAssignments,
      stageQuestionsGetter,
      defaultQuota = 3,
      manualOverrides = {},
      overrideReasons = {},
      customRuleConfigs,
      customRubricVersions = INITIAL_RUBRIC_VERSIONS
    } = params;

    const tenantStages = stages.filter((s) => s.tenantId === tenantId);

    // Kumpulkan cabang unik yang memiliki peserta pada babak ini
    const branchGroupsMap = new Map<
      string,
      { branchId?: string; branchName: string }
    >();

    participations.forEach((sp) => {
      if (sp.tenantId !== tenantId) return;
      if (sp.stageName !== stageName) return;

      const partObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
      const bId = sp.branchId || partObj?.branchId;
      const bName =
        (sp.branchName && sp.branchName !== 'Semua Cabang' ? sp.branchName : partObj?.branchName) ||
        sp.branchName ||
        'Cabang Umum';

      const key = bId ? `id:${bId}` : `name:${bName.toLowerCase()}`;
      if (!branchGroupsMap.has(key)) {
        branchGroupsMap.set(key, { branchId: bId, branchName: bName });
      }
    });

    participants.forEach((p) => {
      if (p.tenantId !== tenantId) return;
      if (p.stageName !== stageName) return;
      const bId = p.branchId;
      const bName = p.branchName && p.branchName !== 'Semua Cabang' ? p.branchName : 'Cabang Umum';
      const key = bId ? `id:${bId}` : `name:${bName.toLowerCase()}`;
      if (!branchGroupsMap.has(key)) {
        branchGroupsMap.set(key, { branchId: bId, branchName: bName });
      }
    });

    const groups: BranchStageEvaluationGroup[] = [];

    branchGroupsMap.forEach((branchInfo, key) => {
      // Cari definisi babak (CompetitionStage) spesifik untuk cabang ini, utamakan yang memiliki partisipasi/penilaian aktif (P0-02 & P1-04)
      const activeStageIdsForBranch = new Set<string>();
      participations.forEach((sp) => {
        if (sp.tenantId !== tenantId || sp.stageName !== stageName || !sp.stageId) return;
        const pObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
        const effBId = sp.branchId || pObj?.branchId;
        const effBName =
          (sp.branchName && sp.branchName !== 'Semua Cabang' ? sp.branchName : pObj?.branchName) ||
          sp.branchName ||
          'Cabang Umum';
        if (
          (branchInfo.branchId && effBId === branchInfo.branchId) ||
          effBName.toLowerCase() === branchInfo.branchName.toLowerCase()
        ) {
          activeStageIdsForBranch.add(sp.stageId);
        }
      });

      const branchStage =
        tenantStages.find(
          (s) =>
            s.name === stageName &&
            activeStageIdsForBranch.has(s.id) &&
            ((branchInfo.branchId && s.branchId === branchInfo.branchId) ||
              (s.branchName && s.branchName.toLowerCase() === branchInfo.branchName.toLowerCase()))
        ) ||
        tenantStages.find((s) => s.name === stageName && activeStageIdsForBranch.has(s.id)) ||
        tenantStages.find(
          (s) =>
            s.name === stageName &&
            ((branchInfo.branchId && s.branchId === branchInfo.branchId) ||
              (s.branchName && s.branchName.toLowerCase() === branchInfo.branchName.toLowerCase()))
        ) ||
        tenantStages.find(
          (s) =>
            s.name === stageName &&
            (!s.branchId && (!s.branchName || s.branchName === 'Semua Cabang'))
        ) ||
        tenantStages.find((s) => s.name === stageName);

      // Cari babak berikutnya hanya di dalam cabang yang sama (P0-02)
      const branchNextStage = branchStage
        ? tenantStages
            .filter((s) => {
              if (s.order <= branchStage.order || s.name === branchStage.name) return false;
              if (branchInfo.branchId && s.branchId) {
                return s.branchId === branchInfo.branchId;
              }
              if (s.branchName && s.branchName !== 'Semua Cabang') {
                return s.branchName.toLowerCase() === branchInfo.branchName.toLowerCase();
              }
              return true;
            })
            .sort((a, b) => a.order - b.order)[0]
        : undefined;

      // Kuota terpusat dari CompetitionStage milik cabang ini (P1-04)
      const branchQuota = branchStage?.qualificationQuota || defaultQuota;

      const evaluation = RankingService.evaluateStageParticipants({
        tenantId,
        stageId: branchStage?.id,
        stageName,
        branchId: branchInfo.branchId,
        branchName: branchInfo.branchName,
        participations,
        participants,
        assessments,
        judgeAssignments,
        stageQuestionsGetter,
        quota: branchQuota,
        manualOverrides,
        overrideReasons,
        customRuleConfigs,
        customRubricVersions
      });

      if (evaluation.evaluatedParticipants.length > 0) {
        groups.push({
          branchKey: key,
          branchId: branchInfo.branchId || branchStage?.branchId,
          branchName: branchInfo.branchName,
          stageId: branchStage?.id,
          stageName,
          nextStageId: branchNextStage?.id,
          nextStageName: branchNextStage?.name,
          isStageFinalized: Boolean(branchStage?.isFinalized),
          quota: branchQuota,
          evaluation
        });
      }
    });

    return groups;
  }

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
  }): StageEvaluationResult {
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

    const hasExplicitBranchFilter = Boolean(branchId || (branchName && branchName !== 'Semua Cabang'));

    // 1. Filter partisipasi babak dengan isolasi ketat tenantId, stageId, dan branchId (P0-8)
    let rawFilteredParticipations = participations.filter((sp) => {
      if (sp.tenantId !== tenantId) return false;

      if (stageId) {
        if (hasExplicitBranchFilter) {
          if (sp.stageId !== stageId && sp.stageName !== stageName) return false;
        } else {
          if (!sp.stageId || sp.stageId !== stageId) return false;
        }
      } else if (sp.stageName !== stageName) {
        return false;
      }

      const partObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
      const effectiveBranchId = sp.branchId || partObj?.branchId;
      const effectiveBranchName =
        (sp.branchName && sp.branchName !== 'Semua Cabang' ? sp.branchName : partObj?.branchName) ||
        sp.branchName;

      if (branchId && effectiveBranchId) {
        if (effectiveBranchId !== branchId) return false;
      } else if (branchName && branchName !== 'Semua Cabang' && effectiveBranchName && effectiveBranchName !== 'Semua Cabang') {
        if (effectiveBranchName.toLowerCase() !== branchName.toLowerCase()) return false;
      } else if (branchId && !effectiveBranchId) {
        if (branchName && branchName !== 'Semua Cabang' && effectiveBranchName) {
          if (effectiveBranchName.toLowerCase() !== branchName.toLowerCase()) return false;
        } else {
          return false;
        }
      }

      return true;
    });

    // Jika duplikat baris babak menyebabkan filter stageId kosong, fallback ke stageName pada cabang yang sama
    if (rawFilteredParticipations.length === 0 && stageId) {
      rawFilteredParticipations = participations.filter((sp) => {
        if (sp.tenantId !== tenantId) return false;
        if (sp.stageName !== stageName) return false;
        const partObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
        const effectiveBranchId = sp.branchId || partObj?.branchId;
        const effectiveBranchName =
          (sp.branchName && sp.branchName !== 'Semua Cabang' ? sp.branchName : partObj?.branchName) ||
          sp.branchName;
        if (branchId && effectiveBranchId) return effectiveBranchId === branchId;
        if (branchName && branchName !== 'Semua Cabang' && effectiveBranchName && effectiveBranchName !== 'Semua Cabang') {
          return effectiveBranchName.toLowerCase() === branchName.toLowerCase();
        }
        return true;
      });
    }

    // Deduplikasi StageParticipation per participantId (jika ada duplikat baris babak, prioritaskan yang memiliki penilaian/maqra & gabungkan assignedQuestions)
    const tenantAssessments = assessments.filter((a) => a.tenantId === tenantId);
    const dedupedParticipationMap = new Map<string, StageParticipation>();
    rawFilteredParticipations.forEach((sp) => {
      const existing = dedupedParticipationMap.get(sp.participantId);
      if (!existing) {
        dedupedParticipationMap.set(sp.participantId, sp);
        return;
      }
      const mergedQuestions = [...(existing.assignedQuestions || [])];
      (sp.assignedQuestions || []).forEach((aq) => {
        if (!mergedQuestions.some((item) => item.questionId === aq.questionId)) {
          mergedQuestions.push(aq);
        }
      });
      const existingHasAsm = tenantAssessments.some(
        (a) => a.participantId === existing.participantId && a.stageParticipationId === existing.id
      );
      const candidateHasAsm = tenantAssessments.some(
        (a) => a.participantId === sp.participantId && a.stageParticipationId === sp.id
      );
      const existingQCount = existing.assignedQuestions?.length || (existing.questionId ? 1 : 0);
      const candidateQCount = sp.assignedQuestions?.length || (sp.questionId ? 1 : 0);
      const winner =
        (candidateHasAsm && !existingHasAsm) || (candidateQCount > existingQCount && !existingHasAsm)
          ? sp
          : existing;
      dedupedParticipationMap.set(sp.participantId, {
        ...winner,
        questionId: winner.questionId || existing.questionId || sp.questionId,
        assignedMaqra:
          winner.assignedMaqra && winner.assignedMaqra !== 'Belum Ditetapkan'
            ? winner.assignedMaqra
            : existing.assignedMaqra || sp.assignedMaqra,
        assignedQuestions: mergedQuestions.length > 0 ? mergedQuestions : winner.assignedQuestions
      });
    });

    // Sertakan pula peserta di cabang & babak ini yang terdaftar pada stageName namun belum masuk dedupedParticipationMap
    participants.forEach((p) => {
      if (p.tenantId !== tenantId) return;
      if (dedupedParticipationMap.has(p.id)) return;
      if (branchId && p.branchId && p.branchId !== branchId) return;
      if (branchName && branchName !== 'Semua Cabang' && p.branchName !== branchName) return;
      if (stageId && !hasExplicitBranchFilter && p.stageId && p.stageId !== stageId) return;

      const hasStageAssessment = tenantAssessments.some(
        (a) => a.participantId === p.id && a.stageName === stageName
      );
      if (p.stageName === stageName || hasStageAssessment) {
        dedupedParticipationMap.set(p.id, {
          id: `sp-synth-${p.id}-${stageName}`,
          tenantId,
          participantId: p.id,
          stageId: p.stageId || stageId || '',
          stageName,
          branchId: p.branchId,
          branchName: p.branchName,
          lotteryNumber: p.lotteryNumber,
          questionId: p.questionId,
          assignedMaqra: p.assignedMaqra,
          pageNumber: p.pageNumber,
          assignedQuestions: p.assignedQuestions,
          status: 'Belum Dimulai'
        });
      }
    });

    const filteredParticipations = Array.from(dedupedParticipationMap.values());

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

    // P0-01: Jika pemanggil tidak menentukan branchId / branchName spesifik (misal mode "Semua Cabang")
    // dan terdapat lebih dari 1 cabang berbeda pada filteredParticipations,
    // WAJIB pisahkan evaluasi per cabang agar hakim, rubrik, tie-break, kuota, dan ranking tidak pernah tercampur!
    if (!branchId && (!branchName || branchName === 'Semua Cabang')) {
      const distinctBranches = new Map<string, { branchId?: string; branchName: string }>();
      filteredParticipations.forEach((sp) => {
        const pObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
        const effBranchId = sp.branchId || pObj?.branchId;
        const effBranchName =
          (sp.branchName && sp.branchName !== 'Semua Cabang' ? sp.branchName : pObj?.branchName) ||
          sp.branchName ||
          'Cabang Umum';
        const bKey = effBranchId ? `id:${effBranchId}` : `name:${effBranchName.toLowerCase()}`;
        if (!distinctBranches.has(bKey)) {
          distinctBranches.set(bKey, { branchId: effBranchId, branchName: effBranchName });
        }
      });

      if (distinctBranches.size > 1) {
        const combinedEvaluated: EvaluatedParticipantStage[] = [];
        let allBranchesFinalized = true;
        let totalIncomplete = 0;
        const combinedPodiumTies: Array<{ rank: number; participantIds: string[]; score: number }> = [];
        let anyBoundaryTie = false;
        let totalUnresolvedTies = 0;
        let allTieBreakConfigsValid = true;

        distinctBranches.forEach((bInfo) => {
          const branchRes = RankingService.evaluateStageParticipants({
            ...params,
            stageId: undefined,
            branchId: bInfo.branchId,
            branchName: bInfo.branchName
          });
          combinedEvaluated.push(...branchRes.evaluatedParticipants);
          if (!branchRes.allFinalized) allBranchesFinalized = false;
          totalIncomplete += branchRes.incompleteCount;
          combinedPodiumTies.push(...branchRes.podiumTies);
          if (branchRes.boundaryTie) anyBoundaryTie = true;
          totalUnresolvedTies += branchRes.unresolvedTiesCount;
          if (!branchRes.isTieBreakConfigValid) allTieBreakConfigsValid = false;
        });

        return {
          evaluatedParticipants: combinedEvaluated,
          allFinalized: allBranchesFinalized,
          incompleteCount: totalIncomplete,
          podiumTies: combinedPodiumTies,
          boundaryTie: anyBoundaryTie,
          unresolvedTiesCount: totalUnresolvedTies,
          isTieBreakConfigValid: allTieBreakConfigsValid,
          canFinalize: false,
          blockingReason:
            'Terdapat beberapa cabang lomba pada babak ini. Pengesahan dan pelolosan babak wajib dilakukan per cabang.'
        };
      }
    }

    // 2. Kumpulkan dewan hakim yang ditugaskan khusus untuk cabang dan babak ini
    const firstPartObj = participants.find(
      (p) => p.id === filteredParticipations[0]?.participantId && p.tenantId === tenantId
    );
    const firstSpBranchName =
      filteredParticipations[0]?.branchName && filteredParticipations[0]?.branchName !== 'Semua Cabang'
        ? filteredParticipations[0]?.branchName
        : firstPartObj?.branchName;

    const targetBranch =
      branchName && branchName !== 'Semua Cabang'
        ? branchName
        : firstSpBranchName || filteredParticipations[0]?.branchName || '';
    const targetBranchId = branchId || filteredParticipations[0]?.branchId || firstPartObj?.branchId;

    const matchesBranchAssignment = (ja: JudgeAssignment, bId?: string, bName?: string): boolean => {
      if (ja.branchName === 'Semua Cabang' || (!ja.branchId && !ja.branchName)) {
        return true;
      }
      if (bId && ja.branchId) {
        return ja.branchId === bId;
      }
      if (bName && bName !== 'Semua Cabang' && ja.branchName) {
        const jaBr = ja.branchName.toLowerCase();
        const tBr = bName.toLowerCase();
        return jaBr === tBr || tBr.includes(jaBr) || jaBr.includes(tBr);
      }
      return true;
    };

    let relevantAssignments = judgeAssignments.filter((ja) => {
      if (ja.tenantId !== tenantId) return false;

      if (stageId && ja.stageId) {
        if (ja.stageId !== stageId) return false;
      } else if (ja.stageName !== stageName) {
        return false;
      }

      return matchesBranchAssignment(ja, targetBranchId, targetBranch);
    });

    // Jika duplikat babak membuat ja.stageId berbeda dengan stageId namun ja.stageName sama pada cabang yang sama
    if (relevantAssignments.length === 0) {
      relevantAssignments = judgeAssignments.filter((ja) => {
        if (ja.tenantId !== tenantId) return false;
        if (ja.stageName !== stageName) return false;
        return matchesBranchAssignment(ja, targetBranchId, targetBranch);
      });
    }

    // Jika penugasan hakim pada babak ini disimpan pada nama cabang default (atau belum memiliki cabang spesifik),
    // gunakan penugasan hakim yang ada di judgeAssignments untuk babak ini
    const partIdsInGroup = new Set(filteredParticipations.map((fp) => fp.participantId));
    const assessedJudgeIdsInGroup = Array.from(
      new Set(
        tenantAssessments
          .filter((a) => partIdsInGroup.has(a.participantId) && a.stageName === stageName)
          .map((a) => a.judgeId)
      )
    );

    if (relevantAssignments.length === 0) {
      if (assessedJudgeIdsInGroup.length > 0) {
        relevantAssignments = judgeAssignments.filter(
          (ja) =>
            ja.tenantId === tenantId &&
            (ja.stageName === stageName || assessedJudgeIdsInGroup.includes(ja.judgeId))
        );
      }
      if (relevantAssignments.length === 0) {
        relevantAssignments = judgeAssignments.filter(
          (ja) => ja.tenantId === tenantId && ja.stageName === stageName
        );
      }
    }

    const requiredJudgeIds = Array.from(new Set(relevantAssignments.map((ja) => ja.judgeId)));
    const effectiveJudgeIdsForScoring =
      requiredJudgeIds.length > 0 ? requiredJudgeIds : assessedJudgeIdsInGroup;

    // 3. Hitung skor tiap peserta menggunakan Scoring Engine terpusat dengan isolasi stageId & stageParticipationId
    const evaluatedItems = filteredParticipations.map((sp) => {
      const partObj = participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId);
      let stageQuestions = stageQuestionsGetter(sp.participantId, stageName);

      // P0-04: Resolusi maqra dari penetapan resmi pada StageParticipation / Participant
      if (stageQuestions.length === 0) {
        if (sp.assignedQuestions && sp.assignedQuestions.length > 0) {
          stageQuestions = sp.assignedQuestions.filter(
            (aq) => !aq.stageName || aq.stageName === stageName
          );
        } else if (partObj?.assignedQuestions && partObj.assignedQuestions.length > 0) {
          const matchedQ = partObj.assignedQuestions.filter(
            (aq) => !aq.stageName || aq.stageName === stageName
          );
          if (matchedQ.length > 0) stageQuestions = matchedQ;
        } else if (sp.questionId && sp.questionId.trim() !== '') {
          stageQuestions = [
            {
              questionId: sp.questionId,
              title: sp.assignedMaqra || 'Maqra',
              pageNumber: sp.pageNumber || 1,
              stageName
            }
          ];
        } else if (partObj?.questionId && partObj.questionId.trim() !== '' && partObj.stageName === stageName) {
          stageQuestions = [
            {
              questionId: partObj.questionId,
              title: partObj.assignedMaqra || 'Maqra',
              pageNumber: partObj.pageNumber || 1,
              stageName
            }
          ];
        }
      }

      const agg = aggregateParticipantScores(
        sp.participantId,
        stageName,
        stageQuestions,
        effectiveJudgeIdsForScoring,
        tenantAssessments,
        sp.stageId || stageId,
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
    const combinedRubrics = Array.from(
      new Map(
        [...customRubricVersions, ...INITIAL_RUBRIC_VERSIONS].map((r) => [r.id, r])
      ).values()
    );
    const effectiveRuleBranch =
      targetBranch && targetBranch !== 'Semua Cabang'
        ? targetBranch
        : firstPartObj?.branchName || 'Tilawah Dewasa Putra';
    const ruleConfig = getBranchRuleConfig(effectiveRuleBranch, tenantId, customRuleConfigs, targetBranchId);
    const rubricRes = resolveActiveRubricForBranch({
      branchName: effectiveRuleBranch,
      branchId: targetBranchId,
      tenantId,
      competitionRules: customRuleConfigs,
      rubricVersions: combinedRubrics
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

    const qualifiedCount = evaluatedParticipants.filter((ep) => ep.isQualified).length;

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
    } else if (qualifiedCount > quota) {
      // P1-04: Cegah jumlah peserta lolos melebihi kuota babak akibat override manual
      canFinalize = false;
      blockingReason = `Jumlah peserta yang diloloskan (${qualifiedCount}) melebihi kuota kelulusan babak (${quota}). Sesuaikan kembali override manual.`;
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
