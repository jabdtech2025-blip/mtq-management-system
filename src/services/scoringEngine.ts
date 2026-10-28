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
 * Resolusi pemetaan kategori error ke bidang rubrik aktif secara relasional.
 * Prioritas:
 * 1. Relasi eksplisit ID bidang (category.fieldId === rubricField.id)
 * 2. Pencocokan kode bidang (category.code === rubricField.code atau field code termaktub)
 * 3. Pencocokan nama bidang persis
 * 
 * HAPUS FALLBACK KE TAJWID: Kategori yang tidak terpetakan mengembalikan null
 * dan menghasilkan validation error agar administrator segera memperbaikinya di UI.
 */
export function resolveCategoryField(category: ErrorCategory, rubric: RubricVersion): string | null {
  // 1. Relasi ID eksplisit
  if (category.fieldId) {
    const matchedField = rubric.fields.find((f) => f.id === category.fieldId);
    if (matchedField) return matchedField.name;
  }

  // 2. Pencocokan kode bidang
  const catCode = (category.code || '').trim().toLowerCase();
  const matchedByCode = rubric.fields.find(
    (f) => f.code.trim().toLowerCase() === catCode || f.id.toLowerCase().includes(catCode)
  );
  if (matchedByCode) return matchedByCode.name;

  // 3. Pencocokan nama bidang persis
  const catName = (category.name || '').trim().toLowerCase();
  const matchedByName = rubric.fields.find(
    (f) => f.name.trim().toLowerCase() === catName
  );
  if (matchedByName) return matchedByName.name;

  // 4. Kompatibilitas cerdas untuk rubrik standar Seni Baca bila fieldId belum diset
  if (rubric.code === 'RUBRIC-SENI-BACA-2025' || rubric.id === 'rubric-seni-baca-2025') {
    const scope = (category.scope || '').toLowerCase();
    if (catName.includes('tajwid') || catName.includes('makharij') || catName.includes('idgham') || scope.includes('tajwid') || catCode === 'mkh' || catCode === 'idg' || catCode === 'tjw') {
      const f = rubric.fields.find((rf) => rf.name === 'Tajwid');
      if (f) return f.name;
    }
    if (catName.includes('fasahah') || catName.includes('waqf') || catName.includes('ibtida') || scope.includes('fasahah') || catCode === 'fsh') {
      const f = rubric.fields.find((rf) => rf.name === 'Fashahah');
      if (f) return f.name;
    }
    if (catName.includes('lagu') || catName.includes('irama') || catName.includes('maqam') || scope.includes('lagu') || catCode === 'lag') {
      const f = rubric.fields.find((rf) => rf.name === 'Lagu');
      if (f) return f.name;
    }
    if (catName.includes('suara') || catName.includes('vokal') || scope.includes('suara') || catCode === 'sua') {
      const f = rubric.fields.find((rf) => rf.name === 'Suara');
      if (f) return f.name;
    }
  }

  // JANGAN PERNAH FALLBACK KE TAJWID! Return null jika tidak dapat dipetakan secara sah.
  return null;
}

/**
 * MESIN PENGHITUNG NILAI RESMI TERPUSAT (Scoring Engine)
 * 
 * Satu-satunya sumber perhitungan nilai di seluruh aplikasi.
 * Menjamin:
 * 1. Filter kategori aktif (kategori non-aktif diabaikan).
 * 2. Pemetaan relasional ke bidang rubrik yang aktif (tidak ada fallback sembarangan).
 * 3. Nilai dipisahkan per bidang rubrik dinamis (minScore <= score <= maxScore).
 * 4. Pembulatan standar 2 tempat desimal untuk akurasi MTQ.
 * 5. Pengembalian validasi error eksplisit bila ada kategori yang tidak terpetakan.
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

  // Inisialisasi seluruh bidang dari rubrik aktif
  rubric.fields.forEach((field) => {
    fieldDeductions[field.name] = 0;
    fieldScores[field.name] = field.maxScore;
  });

  // Filter hanya kategori aktif
  const activeCategories = errorCategories.filter((c) => c.status === 'Aktif');

  activeCategories.forEach((cat) => {
    const rawCount = errorCounts[cat.id] ?? 0;

    // P0-B: Validasi ketat jumlah kesalahan (wajib integer non-negatif)
    if (typeof rawCount !== 'number' || isNaN(rawCount) || !isFinite(rawCount) || rawCount < 0) {
      validationErrors.push(
        `Jumlah kesalahan kategori "${cat.name}" (${cat.code}) tidak valid: ${rawCount}. Harus berupa bilangan bulat non-negatif.`
      );
      return;
    }

    if (!Number.isInteger(rawCount)) {
      validationErrors.push(
        `Jumlah kejadian kesalahan kategori "${cat.name}" (${cat.code}) harus berupa bilangan bulat non-negatif (diterima: ${rawCount}). Pengurangan per kejadian (${cat.defaultDeduction}) yang dapat berupa angka desimal.`
      );
      return;
    }

    const count = rawCount;
    // Potongan per kejadian mendukung desimal (misal 0.5, 1.0, 1.5) dengan presisi aritmetika aman
    const rawDeduction = count * cat.defaultDeduction;
    const deductionAmount = Math.round((rawDeduction + Number.EPSILON) * 100) / 100;
    deductions[cat.id] = deductionAmount;

    // Petakan secara relasional ke bidang rubrik
    const fieldName = resolveCategoryField(cat, rubric);

    if (!fieldName) {
      // P0: Kategori tanpa pemetaan valid DILARANG dialihkan ke Tajwid.
      validationErrors.push(
        `Kategori "${cat.name}" (${cat.code}) belum dipetakan ke bidang rubrik yang valid pada rubrik "${rubric.name}". Pemetaan wajib diperbaiki oleh Admin sebelum finalisasi.`
      );
      return;
    }

    if (fieldDeductions[fieldName] === undefined) {
      fieldDeductions[fieldName] = 0;
    }
    fieldDeductions[fieldName] = Math.round(((fieldDeductions[fieldName] || 0) + deductionAmount + Number.EPSILON) * 100) / 100;
  });

  // Hitung nilai per bidang dengan batas minScore dan maxScore dinamis
  let totalCalculatedScore = 0;
  let totalDeductions = 0;

  rubric.fields.forEach((field) => {
    let deduction = fieldDeductions[field.name] || 0;

    // Dukungan batas potongan maksimum per bidang (field maxDeduction atau maxScore - minScore)
    const fieldMaxDeduction = (field as any).maxDeduction ?? (field.maxScore - field.minScore);
    deduction = Math.min(deduction, fieldMaxDeduction);

    totalDeductions += deduction;

    // Batasi nilai bidang: minScore <= score <= maxScore
    const calculatedFieldScore = Math.max(
      field.minScore,
      Math.min(field.maxScore, field.maxScore - deduction)
    );

    fieldScores[field.name] = Math.round((calculatedFieldScore + Number.EPSILON) * 100) / 100;
    totalCalculatedScore += fieldScores[field.name];
  });

  totalDeductions = Math.round((totalDeductions + Number.EPSILON) * 100) / 100;
  const startingScore = customStartingScore ?? rubric.startingScore;
  const finalScore = Math.round((Math.max(0, Math.min(startingScore, totalCalculatedScore)) + Number.EPSILON) * 100) / 100;

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
