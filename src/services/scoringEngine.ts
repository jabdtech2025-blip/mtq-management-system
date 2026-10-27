import {
  ErrorCategory,
  RubricVersion,
  JudgeAssessment,
  AssignedMaqraItem
} from '../types/mtq';
import { OFFICIAL_SENI_BACA_RUBRIC } from './competitionRules';

export interface ScoreCalculationResult {
  deductions: Record<string, number>;          // { [categoryId]: deductionPoints }
  fieldDeductions: Record<string, number>;     // { "Tajwid": 1.5, "Lagu": 0.5, ... }
  fieldScores: Record<string, number>;         // { "Tajwid": 28.5, "Lagu": 24.5, ... }
  totalDeductions: number;
  finalScore: number;
  startingScore: number;
  rubricVersionId: string;
  validationErrors: string[];
}

/**
 * Normalisasi pemetaan kategori error aplikasi ke bidang rubrik standar.
 */
function mapCategoryToFieldName(category: ErrorCategory): string {
  const name = (category.name || '').toLowerCase();
  const scope = (category.scope || '').toLowerCase();
  const code = (category.code || '').toLowerCase();

  if (name.includes('tajwid') || name.includes('makharij') || name.includes('idgham') || scope.includes('tajwid') || code === 'mkh' || code === 'idg' || code === 'tjw') {
    return 'Tajwid';
  }
  if (name.includes('fasahah') || name.includes('waqf') || name.includes('ibtida') || scope.includes('fasahah') || code === 'fsh') {
    return 'Fashahah';
  }
  if (name.includes('lagu') || name.includes('irama') || name.includes('maqam') || scope.includes('lagu') || code === 'lag') {
    return 'Lagu';
  }
  if (name.includes('suara') || name.includes('vokal') || scope.includes('suara') || code === 'sua') {
    return 'Suara';
  }
  return 'Tajwid'; // Default fallback
}

/**
 * MESIN PENGHITUNG NILAI RESMI TERPUSAT (Scoring Engine)
 * 
 * Satu-satunya sumber perhitungan nilai di seluruh aplikasi.
 * Menjamin:
 * 1. Filter kategori aktif (kategori non-aktif diabaikan).
 * 2. Nilai dipisahkan per bidang rubrik (Tajwid maks 30, Fashahah maks 30, Lagu maks 25, Suara maks 15).
 * 3. Nilai tiap bidang tidak bisa melebihi batas maksimum atau bernilai negatif.
 * 4. Pembulatan standar 2 tempat desimal untuk akurasi MTQ.
 */
export function calculateAssessmentScore(
  errorCounts: Record<string, number>,
  errorCategories: ErrorCategory[],
  rubric: RubricVersion = OFFICIAL_SENI_BACA_RUBRIC,
  customStartingScore?: number
): ScoreCalculationResult {
  const validationErrors: string[] = [];
  const deductions: Record<string, number> = {};
  const fieldDeductions: Record<string, number> = {};
  const fieldScores: Record<string, number> = {};

  // Inisialisasi bidang dari rubrik
  rubric.fields.forEach((field) => {
    fieldDeductions[field.name] = 0;
    fieldScores[field.name] = field.maxScore;
  });

  // Filter hanya kategori aktif
  const activeCategories = errorCategories.filter((c) => c.status === 'Aktif');

  activeCategories.forEach((cat) => {
    const rawCount = errorCounts[cat.id] ?? 0;
    const count = Math.max(0, Math.floor(rawCount));
    
    // Validasi input
    if (isNaN(rawCount) || rawCount < 0) {
      validationErrors.push(`Jumlah kesalahan kategori "${cat.name}" tidak valid: ${rawCount}`);
    }

    const deductionAmount = Number((count * cat.defaultDeduction).toFixed(2));
    deductions[cat.id] = deductionAmount;

    // Petakan ke bidang rubrik
    const fieldName = mapCategoryToFieldName(cat);
    fieldDeductions[fieldName] = Number(((fieldDeductions[fieldName] || 0) + deductionAmount).toFixed(2));
  });

  // Hitung nilai per bidang dengan batas minScore dan maxScore
  let totalCalculatedScore = 0;
  let totalDeductions = 0;

  rubric.fields.forEach((field) => {
    const deduction = fieldDeductions[field.name] || 0;
    totalDeductions += deduction;

    // Batasi nilai bidang: minScore <= score <= maxScore
    const calculatedFieldScore = Math.max(
      field.minScore,
      Math.min(field.maxScore, field.maxScore - deduction)
    );

    fieldScores[field.name] = Number(calculatedFieldScore.toFixed(2));
    totalCalculatedScore += fieldScores[field.name];
  });

  totalDeductions = Number(totalDeductions.toFixed(2));
  const startingScore = customStartingScore ?? rubric.startingScore;
  const finalScore = Number(Math.max(0, Math.min(startingScore, totalCalculatedScore)).toFixed(2));

  return {
    deductions,
    fieldDeductions,
    fieldScores,
    totalDeductions,
    finalScore,
    startingScore,
    rubricVersionId: rubric.id,
    validationErrors
  };
}

/**
 * Agregasi penilaian multi-hakim dan multi-maqra untuk satu peserta pada satu babak.
 */
export function aggregateParticipantScores(
  participantId: string,
  stageName: string,
  stageQuestions: AssignedMaqraItem[],
  requiredJudgeIds: string[],
  assessments: JudgeAssessment[]
): {
  isFullyFinalized: boolean;
  finalizedCount: number;
  totalRequiredUnits: number;
  averageFinalScore: number | null;
  provisionalScore: number | null;
  fieldAverages: Record<string, number>;
  perMaqraSummary: Array<{
    questionId: string;
    maqraTitle: string;
    averageScore: number | null;
    isFinalized: boolean;
  }>;
} {
  const totalRequiredUnits = requiredJudgeIds.length * stageQuestions.length;
  if (totalRequiredUnits === 0) {
    return {
      isFullyFinalized: false,
      finalizedCount: 0,
      totalRequiredUnits: 0,
      averageFinalScore: null,
      provisionalScore: null,
      fieldAverages: {},
      perMaqraSummary: []
    };
  }

  const validFinalizedScores: number[] = [];
  const allAvailableScores: number[] = [];
  const fieldTotals: Record<string, { sum: number; count: number }> = {};

  const perMaqraSummary = stageQuestions.map((q) => {
    const maqraFinalizedScores: number[] = [];
    const maqraAvailableScores: number[] = [];

    requiredJudgeIds.forEach((judgeId) => {
      const match = assessments.find(
        (a) =>
          a.participantId === participantId &&
          a.judgeId === judgeId &&
          a.stageName === stageName &&
          a.questionId === q.questionId
      );

      if (match) {
        allAvailableScores.push(match.finalScore);
        maqraAvailableScores.push(match.finalScore);

        if (match.status === 'finalized') {
          validFinalizedScores.push(match.finalScore);
          maqraFinalizedScores.push(match.finalScore);

          // Akumulasi skor bidang
          if (match.fieldScores) {
            Object.entries(match.fieldScores).forEach(([fieldName, score]) => {
              if (!fieldTotals[fieldName]) fieldTotals[fieldName] = { sum: 0, count: 0 };
              fieldTotals[fieldName].sum += score;
              fieldTotals[fieldName].count += 1;
            });
          }
        }
      }
    });

    const isMaqraFinalized =
      requiredJudgeIds.length > 0 &&
      maqraFinalizedScores.length === requiredJudgeIds.length;

    const avgMaqraScore =
      maqraFinalizedScores.length > 0
        ? Number((maqraFinalizedScores.reduce((a, b) => a + b, 0) / maqraFinalizedScores.length).toFixed(2))
        : maqraAvailableScores.length > 0
        ? Number((maqraAvailableScores.reduce((a, b) => a + b, 0) / maqraAvailableScores.length).toFixed(2))
        : null;

    return {
      questionId: q.questionId,
      maqraTitle: q.title,
      averageScore: avgMaqraScore,
      isFinalized: isMaqraFinalized
    };
  });

  const isFullyFinalized = validFinalizedScores.length === totalRequiredUnits;

  const averageFinalScore =
    isFullyFinalized && validFinalizedScores.length > 0
      ? Number((validFinalizedScores.reduce((a, b) => a + b, 0) / validFinalizedScores.length).toFixed(2))
      : null;

  const provisionalScore =
    allAvailableScores.length > 0
      ? Number((allAvailableScores.reduce((a, b) => a + b, 0) / allAvailableScores.length).toFixed(2))
      : null;

  const fieldAverages: Record<string, number> = {};
  Object.entries(fieldTotals).forEach(([fieldName, data]) => {
    if (data.count > 0) {
      fieldAverages[fieldName] = Number((data.sum / data.count).toFixed(2));
    }
  });

  return {
    isFullyFinalized,
    finalizedCount: validFinalizedScores.length,
    totalRequiredUnits,
    averageFinalScore,
    provisionalScore,
    fieldAverages,
    perMaqraSummary
  };
}
