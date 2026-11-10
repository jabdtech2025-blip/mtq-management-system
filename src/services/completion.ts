import {
  AssignedMaqraItem,
  JudgeAssessment,
  JudgeAssignment,
  Participant,
  ParticipantProgressStatus,
  StageParticipation,
} from '../types/mtq';

export type StageBlockingCode =
  | 'NO_PARTICIPANTS'
  | 'NO_JUDGES'
  | 'NO_MAQRA'
  | 'INCOMPLETE_ASSESSMENTS'
  | 'UNRESOLVED_TIE'
  | 'INVALID_TIE_BREAK_CONFIG'
  | 'INVALID_RULE_CONFIG'
  | 'QUOTA_INVALID'
  | 'QUOTA_EXCEEDED'
  | 'MISSING_OVERRIDE_REASON'
  | 'MULTI_BRANCH_SELECTION';

export interface StructuredBlockingReason {
  code: StageBlockingCode;
  message: string;
}

export interface ParticipantStageCompletion {
  participantId: string;
  participantName: string;
  stageParticipationId?: string;
  stageId?: string;
  stageName: string;
  branchId?: string;
  branchName: string;
  assignedMaqraCount: number;
  requiredJudgeCount: number;
  totalRequiredUnits: number;
  finalizedAssessmentCount: number;
  inProgressAssessmentCount: number;
  isComplete: boolean;
  progressStatus: ParticipantProgressStatus;
  incompleteReasonCode?: 'NO_MAQRA' | 'NO_JUDGES' | 'INCOMPLETE_ASSESSMENTS';
  incompleteReasonMessage?: string;
}

export interface StageCompletionSummary {
  tenantId: string;
  stageId?: string;
  stageName: string;
  branchId?: string;
  branchName?: string;
  totalParticipantsCount: number;
  completedParticipantsCount: number;
  incompleteParticipantsCount: number;
  missingMaqraParticipantsCount: number;
  requiredJudgeCount: number;
  requiredJudgeIds: string[];
  totalRequiredUnits: number;
  finalizedUnitsCount: number;
  allComplete: boolean;
  participants: ParticipantStageCompletion[];
  blockingReason: StructuredBlockingReason | null;
}

function matchesBranchAssignment(
  ja: JudgeAssignment,
  branchId?: string,
  branchName?: string
): boolean {
  if (ja.branchName === 'Semua Cabang' || (!ja.branchId && !ja.branchName)) {
    return true;
  }
  if (branchId && ja.branchId) {
    return ja.branchId === branchId;
  }
  if (branchName && branchName !== 'Semua Cabang' && ja.branchName) {
    const jaBr = ja.branchName.toLowerCase();
    const tBr = branchName.toLowerCase();
    return jaBr === tBr || tBr.includes(jaBr) || jaBr.includes(tBr);
  }
  return true;
}

/**
 * Resolves the official list of required judge IDs for a given tenant, stage, and branch.
 * Does NOT fabricate assignments from ad-hoc assessment rows when judgeAssignments is empty.
 */
export function resolveRequiredJudgeIdsForStage(params: {
  tenantId: string;
  stageId?: string;
  stageName: string;
  branchId?: string;
  branchName?: string;
  judgeAssignments: JudgeAssignment[];
}): string[] {
  const { tenantId, stageId, stageName, branchId, branchName, judgeAssignments } = params;

  let relevant = judgeAssignments.filter((ja) => {
    if (ja.tenantId !== tenantId) return false;
    if (stageId && ja.stageId) {
      if (ja.stageId !== stageId) return false;
    } else if (ja.stageName !== stageName) {
      return false;
    }
    return matchesBranchAssignment(ja, branchId, branchName);
  });

  if (relevant.length === 0) {
    relevant = judgeAssignments.filter((ja) => {
      if (ja.tenantId !== tenantId) return false;
      if (ja.stageName !== stageName) return false;
      return matchesBranchAssignment(ja, branchId, branchName);
    });
  }

  return Array.from(new Set(relevant.map((ja) => ja.judgeId)));
}

/**
 * Resolves the assigned maqras for a participant on a specific stage.
 */
export function resolveParticipantAssignedMaqras(params: {
  participant?: Participant;
  participation?: StageParticipation;
  stageName: string;
  stageQuestionsGetter?: (participantId: string, stageName: string) => AssignedMaqraItem[];
}): AssignedMaqraItem[] {
  const { participant, participation, stageName, stageQuestionsGetter } = params;
  const participantId = participation?.participantId || participant?.id || '';

  if (stageQuestionsGetter && participantId) {
    const fromGetter = stageQuestionsGetter(participantId, stageName);
    if (fromGetter && fromGetter.length > 0) {
      return fromGetter;
    }
  }

  if (participation?.assignedQuestions && participation.assignedQuestions.length > 0) {
    const matched = participation.assignedQuestions.filter(
      (aq) => !aq.stageName || aq.stageName === stageName
    );
    if (matched.length > 0) return matched;
  }

  if (participant?.assignedQuestions && participant.assignedQuestions.length > 0) {
    const matched = participant.assignedQuestions.filter(
      (aq) => !aq.stageName || aq.stageName === stageName
    );
    if (matched.length > 0) return matched;
  }

  if (participation?.questionId && participation.questionId.trim() !== '') {
    return [
      {
        questionId: participation.questionId,
        title: participation.assignedMaqra || 'Maqra',
        pageNumber: participation.pageNumber || 1,
        stageName,
      },
    ];
  }

  if (
    participant?.questionId &&
    participant.questionId.trim() !== '' &&
    participant.stageName === stageName
  ) {
    return [
      {
        questionId: participant.questionId,
        title: participant.assignedMaqra || 'Maqra',
        pageNumber: participant.pageNumber || 1,
        stageName,
      },
    ];
  }

  return [];
}

/**
 * Computes completion for a single participant on a specific stage.
 * A participant is complete IFF:
 *   1. assignedMaqraCount >= 1
 *   2. requiredJudgeCount >= 1
 *   3. finalizedAssessmentCount === assignedMaqraCount * requiredJudgeCount
 */
export function getParticipantStageCompletion(params: {
  tenantId: string;
  participant: Participant;
  participation?: StageParticipation;
  stageId?: string;
  stageName: string;
  assignedMaqras: AssignedMaqraItem[];
  requiredJudgeIds: string[];
  assessments: JudgeAssessment[];
}): ParticipantStageCompletion {
  const {
    tenantId,
    participant,
    participation,
    stageId,
    stageName,
    assignedMaqras,
    requiredJudgeIds,
    assessments,
  } = params;

  const effectiveStageId = participation?.stageId || stageId || participant.stageId;
  const effectiveBranchId = participation?.branchId || participant.branchId;
  const effectiveBranchName =
    (participation?.branchName && participation.branchName !== 'Semua Cabang'
      ? participation.branchName
      : participant.branchName) || 'Cabang Umum';

  const assignedMaqraCount = assignedMaqras.length;
  const requiredJudgeCount = requiredJudgeIds.length;
  const totalRequiredUnits = assignedMaqraCount * requiredJudgeCount;

  let finalizedAssessmentCount = 0;
  let inProgressAssessmentCount = 0;

  if (assignedMaqraCount > 0 && requiredJudgeCount > 0) {
    for (const maqra of assignedMaqras) {
      for (const judgeId of requiredJudgeIds) {
        const matchedAsm = assessments.find((a) => {
          if (a.tenantId !== tenantId) return false;
          if (a.participantId !== participant.id) return false;
          if (a.judgeId !== judgeId) return false;
          if (
            participation?.id &&
            !participation.id.startsWith('sp-synth-') &&
            a.stageParticipationId &&
            a.stageParticipationId !== participation.id
          ) {
            return false;
          }
          if (effectiveStageId && a.stageId && a.stageId !== effectiveStageId) {
            if (a.stageName !== stageName) return false;
          } else if (a.stageName && a.stageName !== stageName) {
            return false;
          }
          if (maqra.id && a.assignedMaqraId) {
            if (a.assignedMaqraId === maqra.id) return true;
          }
          return a.questionId === maqra.questionId;
        });

        if (matchedAsm?.status === 'finalized') {
          finalizedAssessmentCount++;
        } else if (matchedAsm?.status === 'in_progress') {
          inProgressAssessmentCount++;
        }
      }
    }
  } else if (assignedMaqraCount > 0 && requiredJudgeCount === 0) {
    // Check if there are any in-progress assessments even before official judge assignment
    const anyInProg = assessments.some(
      (a) =>
        a.tenantId === tenantId &&
        a.participantId === participant.id &&
        a.stageName === stageName &&
        a.status === 'in_progress'
    );
    if (anyInProg) {
      inProgressAssessmentCount = 1;
    }
  }

  const isComplete =
    assignedMaqraCount >= 1 &&
    requiredJudgeCount >= 1 &&
    totalRequiredUnits > 0 &&
    finalizedAssessmentCount === totalRequiredUnits;

  let progressStatus: ParticipantProgressStatus;
  let incompleteReasonCode: 'NO_MAQRA' | 'NO_JUDGES' | 'INCOMPLETE_ASSESSMENTS' | undefined;
  let incompleteReasonMessage: string | undefined;

  if (assignedMaqraCount === 0) {
    progressStatus = 'Maqra Belum Ditetapkan';
    incompleteReasonCode = 'NO_MAQRA';
    incompleteReasonMessage = `Peserta ${participant.name} belum memiliki maqra pada babak ${stageName}.`;
  } else if (requiredJudgeCount === 0) {
    progressStatus = inProgressAssessmentCount > 0 ? 'Berlangsung' : 'Belum Dimulai';
    incompleteReasonCode = 'NO_JUDGES';
    incompleteReasonMessage = `Belum ada penugasan dewan hakim resmi untuk cabang ${effectiveBranchName} pada babak ${stageName}.`;
  } else if (isComplete) {
    progressStatus = 'Lengkap';
  } else if (finalizedAssessmentCount > 0) {
    progressStatus = 'Menunggu Hakim Lain';
    incompleteReasonCode = 'INCOMPLETE_ASSESSMENTS';
    incompleteReasonMessage = `Baru ${finalizedAssessmentCount} dari ${totalRequiredUnits} lembar penilaian difinalisasi.`;
  } else if (inProgressAssessmentCount > 0) {
    progressStatus = 'Berlangsung';
    incompleteReasonCode = 'INCOMPLETE_ASSESSMENTS';
    incompleteReasonMessage = `Penilaian sedang berlangsung (${finalizedAssessmentCount}/${totalRequiredUnits} final).`;
  } else {
    progressStatus = 'Belum Dimulai';
    incompleteReasonCode = 'INCOMPLETE_ASSESSMENTS';
    incompleteReasonMessage = `Belum ada lembar penilaian yang difinalisasi (0/${totalRequiredUnits}).`;
  }

  return {
    participantId: participant.id,
    participantName: participant.name,
    stageParticipationId: participation?.id,
    stageId: effectiveStageId,
    stageName,
    branchId: effectiveBranchId,
    branchName: effectiveBranchName,
    assignedMaqraCount,
    requiredJudgeCount,
    totalRequiredUnits,
    finalizedAssessmentCount,
    inProgressAssessmentCount,
    isComplete,
    progressStatus,
    incompleteReasonCode,
    incompleteReasonMessage,
  };
}

/**
 * Pure single source of truth for stage completion across the entire application.
 * Matches SQL server-authoritative completion rules in `advance_stage_qualifiers` and `get_stage_completion_sql`.
 */
export function getStageCompletion(params: {
  tenantId: string;
  stageId?: string;
  stageName: string;
  branchId?: string;
  branchName?: string;
  participations: StageParticipation[];
  participants: Participant[];
  assessments: JudgeAssessment[];
  judgeAssignments: JudgeAssignment[];
  stageQuestionsGetter?: (participantId: string, stageName: string) => AssignedMaqraItem[];
}): StageCompletionSummary {
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
  } = params;

  const hasExplicitBranchFilter = Boolean(
    branchId || (branchName && branchName !== 'Semua Cabang')
  );

  // 1. Filter stage participations
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

    const partObj = participants.find(
      (p) => p.id === sp.participantId && p.tenantId === tenantId
    );
    const effectiveBranchId = sp.branchId || partObj?.branchId;
    const effectiveBranchName =
      (sp.branchName && sp.branchName !== 'Semua Cabang'
        ? sp.branchName
        : partObj?.branchName) || sp.branchName;

    if (branchId && effectiveBranchId) {
      if (effectiveBranchId !== branchId) return false;
    } else if (
      branchName &&
      branchName !== 'Semua Cabang' &&
      effectiveBranchName &&
      effectiveBranchName !== 'Semua Cabang'
    ) {
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

  if (rawFilteredParticipations.length === 0 && stageId) {
    rawFilteredParticipations = participations.filter((sp) => {
      if (sp.tenantId !== tenantId) return false;
      if (sp.stageName !== stageName) return false;
      const partObj = participants.find(
        (p) => p.id === sp.participantId && p.tenantId === tenantId
      );
      const effectiveBranchId = sp.branchId || partObj?.branchId;
      const effectiveBranchName =
        (sp.branchName && sp.branchName !== 'Semua Cabang'
          ? sp.branchName
          : partObj?.branchName) || sp.branchName;
      if (branchId && effectiveBranchId) return effectiveBranchId === branchId;
      if (
        branchName &&
        branchName !== 'Semua Cabang' &&
        effectiveBranchName &&
        effectiveBranchName !== 'Semua Cabang'
      ) {
        return effectiveBranchName.toLowerCase() === branchName.toLowerCase();
      }
      return true;
    });
  }

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
      (a) =>
        a.participantId === existing.participantId &&
        a.stageParticipationId === existing.id
    );
    const candidateHasAsm = tenantAssessments.some(
      (a) => a.participantId === sp.participantId && a.stageParticipationId === sp.id
    );
    const existingQCount =
      existing.assignedQuestions?.length || (existing.questionId ? 1 : 0);
    const candidateQCount =
      sp.assignedQuestions?.length || (sp.questionId ? 1 : 0);
    const winner =
      (candidateHasAsm && !existingHasAsm) ||
      (candidateQCount > existingQCount && !existingHasAsm)
        ? sp
        : existing;
    dedupedParticipationMap.set(sp.participantId, {
      ...winner,
      questionId: winner.questionId || existing.questionId || sp.questionId,
      assignedMaqra:
        winner.assignedMaqra && winner.assignedMaqra !== 'Belum Ditetapkan'
          ? winner.assignedMaqra
          : existing.assignedMaqra || sp.assignedMaqra,
      assignedQuestions:
        mergedQuestions.length > 0 ? mergedQuestions : winner.assignedQuestions,
    });
  });

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
        status: 'Belum Dimulai',
      });
    }
  });

  const filteredParticipations = Array.from(dedupedParticipationMap.values());
  const firstPartObj = participants.find(
    (p) => p.id === filteredParticipations[0]?.participantId && p.tenantId === tenantId
  );
  const firstSpBranchName =
    filteredParticipations[0]?.branchName &&
    filteredParticipations[0]?.branchName !== 'Semua Cabang'
      ? filteredParticipations[0]?.branchName
      : firstPartObj?.branchName;

  const targetBranchName =
    branchName && branchName !== 'Semua Cabang'
      ? branchName
      : firstSpBranchName || filteredParticipations[0]?.branchName || '';
  const targetBranchId =
    branchId || filteredParticipations[0]?.branchId || firstPartObj?.branchId;

  const stageLevelRequiredJudgeIds = resolveRequiredJudgeIdsForStage({
    tenantId,
    stageId,
    stageName,
    branchId: targetBranchId,
    branchName: targetBranchName,
    judgeAssignments,
  });

  const participantCompletions: ParticipantStageCompletion[] = filteredParticipations.map(
    (sp) => {
      const partObj: Participant =
        participants.find((p) => p.id === sp.participantId && p.tenantId === tenantId) || {
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
          status: 'Menunggu',
        };

      const partBranchId = sp.branchId || partObj.branchId || targetBranchId;
      const partBranchName =
        (sp.branchName && sp.branchName !== 'Semua Cabang'
          ? sp.branchName
          : partObj.branchName) || targetBranchName;

      const partRequiredJudges = resolveRequiredJudgeIdsForStage({
        tenantId,
        stageId: sp.stageId || stageId,
        stageName,
        branchId: partBranchId,
        branchName: partBranchName,
        judgeAssignments,
      });

      const assignedMaqras = resolveParticipantAssignedMaqras({
        participant: partObj,
        participation: sp,
        stageName,
        stageQuestionsGetter,
      });

      return getParticipantStageCompletion({
        tenantId,
        participant: partObj,
        participation: sp,
        stageId: sp.stageId || stageId,
        stageName,
        assignedMaqras,
        requiredJudgeIds:
          partRequiredJudges.length > 0 ? partRequiredJudges : stageLevelRequiredJudgeIds,
        assessments: tenantAssessments,
      });
    }
  );

  const totalParticipantsCount = participantCompletions.length;
  const completedParticipantsCount = participantCompletions.filter((c) => c.isComplete).length;
  const incompleteParticipantsCount = totalParticipantsCount - completedParticipantsCount;
  const missingMaqraParticipantsCount = participantCompletions.filter(
    (c) => c.assignedMaqraCount === 0
  ).length;
  const totalRequiredUnits = participantCompletions.reduce(
    (acc, c) => acc + c.totalRequiredUnits,
    0
  );
  const finalizedUnitsCount = participantCompletions.reduce(
    (acc, c) => acc + c.finalizedAssessmentCount,
    0
  );
  const requiredJudgeCount = stageLevelRequiredJudgeIds.length;

  const allComplete =
    totalParticipantsCount > 0 &&
    requiredJudgeCount > 0 &&
    missingMaqraParticipantsCount === 0 &&
    incompleteParticipantsCount === 0 &&
    completedParticipantsCount === totalParticipantsCount;

  let blockingReason: StructuredBlockingReason | null = null;
  if (totalParticipantsCount === 0) {
    blockingReason = {
      code: 'NO_PARTICIPANTS',
      message: 'Tidak ada peserta terdaftar pada babak dan cabang ini.',
    };
  } else if (requiredJudgeCount === 0) {
    blockingReason = {
      code: 'NO_JUDGES',
      message: `Belum ada penugasan dewan hakim resmi untuk cabang "${targetBranchName || 'ini'}" pada babak "${stageName}".`,
    };
  } else if (missingMaqraParticipantsCount > 0) {
    blockingReason = {
      code: 'NO_MAQRA',
      message: `Terdapat ${missingMaqraParticipantsCount} peserta yang belum memiliki penetapan maqra pada babak "${stageName}".`,
    };
  } else if (incompleteParticipantsCount > 0) {
    blockingReason = {
      code: 'INCOMPLETE_ASSESSMENTS',
      message: `Terdapat ${incompleteParticipantsCount} peserta yang penilaiannya belum lengkap dari seluruh dewan hakim (${finalizedUnitsCount}/${totalRequiredUnits} lembar final).`,
    };
  }

  return {
    tenantId,
    stageId,
    stageName,
    branchId: targetBranchId,
    branchName: targetBranchName,
    totalParticipantsCount,
    completedParticipantsCount,
    incompleteParticipantsCount,
    missingMaqraParticipantsCount,
    requiredJudgeCount,
    requiredJudgeIds: stageLevelRequiredJudgeIds,
    totalRequiredUnits,
    finalizedUnitsCount,
    allComplete,
    participants: participantCompletions,
    blockingReason,
  };
}
