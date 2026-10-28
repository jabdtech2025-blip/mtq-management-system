import {
  ErrorCategory,
  RubricVersion,
  RubricField,
  RubricCriterion,
  DeductionRule,
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

export function getActiveRubricFields(rubric: RubricVersion): RubricField[] {
  return (rubric.fields || []).filter(
    (f) => f.status !== 'Nonaktif' && f.status !== 'Arsip'
  );
}

/**
 * Resolusi pemetaan kategori error ke bidang rubrik aktif secara relasional.
 * Prioritas:
 * 1. Relasi eksplisit ID bidang (category.fieldId === rubricField.id)
 * 2. Relasi eksplisit ID kriteria (category.criterionId === criterion.id)
 * 3. Pencocokan kode bidang (category.code === rubricField.code atau field code termaktub)
 * 4. Pencocokan nama bidang persis
 *
 * HAPUS FALLBACK KE TAJWID: Kategori yang tidak terpetakan mengembalikan null
 * dan menghasilkan validation error agar administrator segera memperbaikinya di UI.
 */
export function resolveCategoryField(category: ErrorCategory, rubric: RubricVersion): string | null {
  const activeFields = getActiveRubricFields(rubric);

  // 1. Relasi ID eksplisit ke bidang aktif
  if (category.fieldId) {
    const matchedField = activeFields.find((f) => f.id === category.fieldId);
    if (matchedField) return matchedField.name;
    // Jika fieldId mengarah ke bidang yang sudah Nonaktif/Arsip, tolak!
    const inactiveField = (rubric.fields || []).find((f) => f.id === category.fieldId);
    if (inactiveField) return null;
  }

  // 2. Relasi eksplisit ke kriteria di dalam bidang aktif
  if (category.criterionId) {
    for (const f of activeFields) {
      if (f.criteria?.some((cr) => cr.id === category.criterionId)) {
        return f.name;
      }
    }
  }

  // 3. Pencocokan kode bidang aktif
  const catCode = (category.code || '').trim().toLowerCase();
  if (catCode) {
    const matchedByCode = activeFields.find(
      (f) => f.code.trim().toLowerCase() === catCode || f.id.toLowerCase().includes(catCode)
    );
    if (matchedByCode) return matchedByCode.name;

    // Cek kode kriteria pada bidang aktif
    for (const f of activeFields) {
      if (f.criteria?.some((cr) => (cr.code || '').trim().toLowerCase() === catCode)) {
        return f.name;
      }
    }
  }

  // 4. Pencocokan nama bidang persis pada bidang aktif
  const catName = (category.name || '').trim().toLowerCase();
  const matchedByName = activeFields.find(
    (f) => f.name.trim().toLowerCase() === catName
  );
  if (matchedByName) return matchedByName.name;

  // 5. Kompatibilitas cerdas untuk rubrik standar Seni Baca bila fieldId belum diset
  if (rubric.code === 'RUBRIC-SENI-BACA-2025' || rubric.id === 'rubric-seni-baca-2025') {
    const scope = (category.scope || '').toLowerCase();
    if (catName.includes('tajwid') || catName.includes('makharij') || catName.includes('idgham') || scope.includes('tajwid') || catCode === 'mkh' || catCode === 'idg' || catCode === 'tjw') {
      const f = activeFields.find((rf) => rf.name === 'Tajwid');
      if (f) return f.name;
    }
    if (catName.includes('fasahah') || catName.includes('waqf') || catName.includes('ibtida') || scope.includes('fasahah') || catCode === 'fsh') {
      const f = activeFields.find((rf) => rf.name === 'Fashahah');
      if (f) return f.name;
    }
    if (catName.includes('lagu') || catName.includes('irama') || catName.includes('maqam') || scope.includes('lagu') || catCode === 'lag') {
      const f = activeFields.find((rf) => rf.name === 'Lagu');
      if (f) return f.name;
    }
    if (catName.includes('suara') || catName.includes('vokal') || scope.includes('suara') || catCode === 'sua') {
      const f = activeFields.find((rf) => rf.name === 'Suara');
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
 * 1. Filter kategori aktif & bidang rubrik aktif (non-aktif/arsip diabaikan).
 * 2. Pemetaan relasional ke bidang dan kriteria rubrik yang aktif (tanpa fallback sembarangan).
 * 3. Penegakan DeductionRule, RubricCriterion.maxDeduction, dan RubricField.maxDeduction.
 * 4. Penolakan eksplisit metode "Pengurangan berbobot" jika belum didefinisikan rumusnya.
 * 5. Nilai dipisahkan per bidang rubrik dinamis (minScore <= score <= maxScore).
 * 6. Pembulatan standar 2 tempat desimal untuk akurasi MTQ.
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
  const criterionDeductions: Record<string, number> = {};

  if (!rubric || !Array.isArray(rubric.fields) || rubric.fields.length === 0) {
    return {
      deductions: {},
      fieldDeductions: {},
      fieldScores: {},
      totalDeductions: 0,
      finalScore: 0,
      startingScore: customStartingScore ?? 0,
      rubricVersionId: rubric?.id || '',
      validationErrors: ['Konfigurasi rubrik penilaian kosong atau tidak memiliki bidang penilaian.']
    };
  }

  const activeFields = getActiveRubricFields(rubric);
  if (activeFields.length === 0) {
    return {
      deductions: {},
      fieldDeductions: {},
      fieldScores: {},
      totalDeductions: 0,
      finalScore: 0,
      startingScore: customStartingScore ?? rubric.startingScore,
      rubricVersionId: rubric.id,
      validationErrors: [`Rubrik "${rubric.name}" tidak memiliki bidang penilaian yang berstatus Aktif.`]
    };
  }

  // Validasi struktur bidang dan relasi kriteria ke bidang
  activeFields.forEach((field) => {
    fieldDeductions[field.name] = 0;
    fieldScores[field.name] = field.maxScore;

    if (typeof field.maxScore !== 'number' || isNaN(field.maxScore) || field.maxScore <= 0) {
      validationErrors.push(`Batas skor maksimum bidang "${field.name}" tidak valid (${field.maxScore}).`);
    }
    if (typeof field.minScore !== 'number' || isNaN(field.minScore) || field.minScore < 0 || field.minScore > field.maxScore) {
      validationErrors.push(`Batas skor minimum bidang "${field.name}" tidak valid (${field.minScore}).`);
    }

    if (field.criteria && field.criteria.length > 0) {
      field.criteria.forEach((cr) => {
        if (cr.fieldId && cr.fieldId !== field.id) {
          validationErrors.push(
            `Kriteria "${cr.name}" (${cr.code}) memiliki relasi fieldId "${cr.fieldId}" yang tidak sesuai dengan bidang "${field.name}" (${field.id}).`
          );
        }
        cr.deductionRules?.forEach((dr) => {
          if (dr.criterionId && dr.criterionId !== cr.id) {
            validationErrors.push(
              `Aturan potongan "${dr.name}" memiliki criterionId "${dr.criterionId}" yang tidak sesuai dengan kriteria "${cr.name}" (${cr.id}).`
            );
          }
        });
      });
    }
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

    // Petakan secara relasional ke bidang rubrik aktif
    const fieldName = resolveCategoryField(cat, rubric);

    if (!fieldName) {
      // P0: Kategori tanpa pemetaan valid DILARANG dialihkan ke Tajwid.
      validationErrors.push(
        `Kategori "${cat.name}" (${cat.code}) belum dipetakan ke bidang rubrik aktif yang valid pada rubrik "${rubric.name}". Pemetaan wajib diperbaiki oleh Admin sebelum finalisasi.`
      );
      return;
    }

    const targetField = activeFields.find((f) => f.name === fieldName)!;

    // Cari kriteria & DeductionRule terkait jika didefinisikan
    let matchedCriterion: RubricCriterion | undefined;
    let matchedRule: DeductionRule | undefined;

    if (targetField.criteria && targetField.criteria.length > 0) {
      if (cat.criterionId) {
        matchedCriterion = targetField.criteria.find((cr) => cr.id === cat.criterionId);
        if (!matchedCriterion) {
          validationErrors.push(
            `Kategori "${cat.name}" merujuk pada criterionId "${cat.criterionId}" yang tidak ditemukan di bidang "${targetField.name}".`
          );
          return;
        }
      } else {
        const catCodeLower = (cat.code || '').trim().toLowerCase();
        matchedCriterion = targetField.criteria.find(
          (cr) => (cr.code || '').trim().toLowerCase() === catCodeLower
        );
      }

      if (cat.deductionRuleId) {
        for (const cr of targetField.criteria) {
          const r = cr.deductionRules?.find((dr) => dr.id === cat.deductionRuleId);
          if (r) {
            matchedCriterion = cr;
            matchedRule = r;
            break;
          }
        }
        if (!matchedRule) {
          validationErrors.push(
            `Kategori "${cat.name}" merujuk pada deductionRuleId "${cat.deductionRuleId}" yang tidak ditemukan di bidang "${targetField.name}".`
          );
          return;
        }
      } else if (matchedCriterion && matchedCriterion.deductionRules?.length === 1) {
        matchedRule = matchedCriterion.deductionRules[0];
      }
    }

    const effectiveMethod = matchedRule?.methodType || cat.methodType;
    if (effectiveMethod === 'Pengurangan berbobot') {
      validationErrors.push(
        `Metode penilaian "Pengurangan berbobot" pada kategori "${cat.name}" belum memiliki definisi rumus resmi yang disepakati (Blocker Konfigurasi). Gunakan "Pengurangan tetap".`
      );
      return;
    }

    const unitDeduction = matchedRule
      ? (matchedRule.deductionPoints ?? matchedRule.deductionPerError ?? cat.defaultDeduction)
      : cat.defaultDeduction;
    if (typeof unitDeduction !== 'number' || isNaN(unitDeduction) || !isFinite(unitDeduction) || unitDeduction < 0) {
      validationErrors.push(
        `Besaran pengurangan per kejadian pada kategori "${cat.name}" tidak valid (${unitDeduction}).`
      );
      return;
    }

    const count = rawCount;
    // Potongan per kejadian mendukung desimal (misal 0.5, 1.0, 1.5) dengan presisi aritmetika aman
    const rawDeduction = count * unitDeduction;
    let deductionAmount = Math.round((rawDeduction + Number.EPSILON) * 100) / 100;

    // Batas potongan maksimum tingkat aturan pengurangan (DeductionRule.maxDeduction)
    if (matchedRule && matchedRule.maxDeduction !== undefined && matchedRule.maxDeduction >= 0) {
      deductionAmount = Math.min(deductionAmount, matchedRule.maxDeduction);
    }

    // Batas potongan maksimum tingkat kategori
    if (cat.maxDeduction !== undefined && cat.maxDeduction >= 0) {
      deductionAmount = Math.min(deductionAmount, cat.maxDeduction);
    }

    // Batas potongan maksimum tingkat kriteria (RubricCriterion.maxDeduction)
    if (matchedCriterion && matchedCriterion.maxDeduction !== undefined && matchedCriterion.maxDeduction >= 0) {
      const prevCritDed = criterionDeductions[matchedCriterion.id] || 0;
      const allowedRemaining = Math.max(0, matchedCriterion.maxDeduction - prevCritDed);
      deductionAmount = Math.min(deductionAmount, allowedRemaining);
      criterionDeductions[matchedCriterion.id] = Math.round((prevCritDed + deductionAmount + Number.EPSILON) * 100) / 100;
    }

    deductions[cat.id] = deductionAmount;

    if (fieldDeductions[fieldName] === undefined) {
      fieldDeductions[fieldName] = 0;
    }
    fieldDeductions[fieldName] = Math.round(((fieldDeductions[fieldName] || 0) + deductionAmount + Number.EPSILON) * 100) / 100;
  });

  // Hitung nilai per bidang aktif dengan batas minScore dan maxScore dinamis
  let totalCalculatedScore = 0;
  let totalDeductions = 0;
  let totalActiveMaxScore = 0;

  activeFields.forEach((field) => {
    totalActiveMaxScore += field.maxScore;
    let deduction = fieldDeductions[field.name] || 0;

    // Dukungan batas potongan maksimum per bidang (field.maxDeduction atau maxScore - minScore)
    const fieldMaxDeduction = field.maxDeduction ?? (field.maxScore - field.minScore);
    deduction = Math.min(deduction, fieldMaxDeduction);
    fieldDeductions[field.name] = Math.round((deduction + Number.EPSILON) * 100) / 100;

    totalDeductions += fieldDeductions[field.name];

    // Batasi nilai bidang: minScore <= score <= maxScore
    const calculatedFieldScore = Math.max(
      field.minScore,
      Math.min(field.maxScore, field.maxScore - fieldDeductions[field.name])
    );

    fieldScores[field.name] = Math.round((calculatedFieldScore + Number.EPSILON) * 100) / 100;
    totalCalculatedScore += fieldScores[field.name];
  });

  totalDeductions = Math.round((totalDeductions + Number.EPSILON) * 100) / 100;
  totalActiveMaxScore = Math.round((totalActiveMaxScore + Number.EPSILON) * 100) / 100;
  const startingScore = customStartingScore ?? rubric.startingScore;

  if (Math.abs(totalActiveMaxScore - startingScore) > 0.01) {
    validationErrors.push(
      `Ketidaksesuaian konfigurasi rubrik "${rubric.name}": Total skor maksimal bidang aktif (${totalActiveMaxScore}) tidak sama dengan nilai maksimal rubrik (${startingScore}).`
    );
  }

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
 * Mendukung isolasi ketat berdasarkan stageId dan stageParticipationId agar tidak mencampur
 * penilaian dari cabang/babak lain yang memiliki nama babak serupa.
 */
export function aggregateParticipantScores(
  participantId: string,
  stageName: string,
  stageQuestions: AssignedMaqraItem[],
  requiredJudgeIds: string[],
  assessments: JudgeAssessment[],
  stageId?: string,
  stageParticipationId?: string
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
      const match = assessments.find((a) => {
        if (a.participantId !== participantId) return false;
        if (a.judgeId !== judgeId) return false;
        if (a.questionId !== q.questionId) return false;
        if (stageParticipationId && a.stageParticipationId) {
          if (a.stageParticipationId !== stageParticipationId) return false;
        }
        if (stageId && a.stageId) {
          if (a.stageId !== stageId) return false;
        } else if (a.stageName !== stageName) {
          return false;
        }
        return true;
      });

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
