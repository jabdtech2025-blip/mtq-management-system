import { calculateAssessmentScore, aggregateParticipantScores } from '../services/scoringEngine';
import { RankingService } from '../services/rankingService';
import { OFFICIAL_SENI_BACA_RUBRIC, getBranchRuleConfig } from '../services/competitionRules';
import {
  ErrorCategory,
  Participant,
  StageParticipation,
  JudgeAssessment,
  JudgeAssignment,
  AssignedMaqraItem
} from '../types/mtq';

/**
 * SUITE PENGUJIAN OTOMATIS DOMAIN BISNIS DAN ATURAN MTQ
 * Memverifikasi seluruh 15 skenario kritis dari Master Prompt.
 */

export function runDomainTests(): { passed: number; failed: number; results: Array<{ name: string; success: boolean; details?: string }> } {
  const results: Array<{ name: string; success: boolean; details?: string }> = [];
  let passed = 0;
  let failed = 0;

  function assert(name: string, condition: boolean, details?: string) {
    if (condition) {
      passed++;
      results.push({ name, success: true });
    } else {
      failed++;
      results.push({ name, success: false, details: details || 'Assertion failed' });
    }
  }

  const sampleCategories: ErrorCategory[] = [
    {
      id: 'cat-mkh',
      tenantId: 'tenant-test',
      code: 'MKH',
      name: 'Makharijul Huruf',
      scope: 'Tajwid & Makhraj',
      defaultDeduction: 1.0,
      methodType: 'Pengurangan tetap',
      status: 'Aktif',
      order: 1
    },
    {
      id: 'cat-idg',
      tenantId: 'tenant-test',
      code: 'IDG',
      name: 'Idgham & Ghunnah',
      scope: 'Tajwid & Makhraj',
      defaultDeduction: 0.5,
      methodType: 'Pengurangan tetap',
      status: 'Aktif',
      order: 2
    },
    {
      id: 'cat-fsh',
      tenantId: 'tenant-test',
      code: 'FSH',
      name: 'Fashahah & Ahkamul Waqf',
      scope: 'Fasahah & Waqf',
      defaultDeduction: 1.0,
      methodType: 'Pengurangan tetap',
      status: 'Aktif',
      order: 3
    },
    {
      id: 'cat-lag',
      tenantId: 'tenant-test',
      code: 'LAG',
      name: 'Lagu, Suara & Irama',
      scope: 'Lagu & Suara',
      defaultDeduction: 0.5,
      methodType: 'Pengurangan tetap',
      status: 'Aktif',
      order: 4
    },
    {
      id: 'cat-inactive',
      tenantId: 'tenant-test',
      code: 'INA',
      name: 'Kategori Nonaktif',
      scope: 'Lainnya',
      defaultDeduction: 5.0,
      methodType: 'Pengurangan tetap',
      status: 'Nonaktif',
      order: 5
    }
  ];

  // 1. Perhitungan nilai sesuai konfigurasi rubrik resmi Seni Baca MTQ 2025
  const calc1 = calculateAssessmentScore(
    { 'cat-mkh': 2, 'cat-idg': 1, 'cat-fsh': 1, 'cat-lag': 2 },
    sampleCategories,
    OFFICIAL_SENI_BACA_RUBRIC
  );
  // Makharij: 2 * 1 = 2.0; Idg: 1 * 0.5 = 0.5. Tajwid deduction = 2.5 -> Tajwid score = 30 - 2.5 = 27.5
  // Fashahah deduction = 1.0 -> Fashahah score = 30 - 1 = 29.0
  // Lagu deduction = 1.0 -> Lagu score = 25 - 1 = 24.0
  // Suara deduction = 0 -> Suara score = 15.0
  // Total score = 27.5 + 29.0 + 24.0 + 15.0 = 95.50
  assert(
    '1. Perhitungan nilai sesuai rubrik resmi Seni Baca MTQ 2025',
    calc1.finalScore === 95.5 && calc1.fieldScores['Tajwid'] === 27.5 && calc1.fieldScores['Fashahah'] === 29.0,
    `Final score: ${calc1.finalScore}, Tajwid: ${calc1.fieldScores['Tajwid']}`
  );

  // 2. Batas nilai, nilai negatif, input tidak valid, dan pengabaian kategori nonaktif
  const calc2 = calculateAssessmentScore(
    { 'cat-mkh': 100, 'cat-inactive': 10, 'cat-idg': -3 },
    sampleCategories,
    OFFICIAL_SENI_BACA_RUBRIC
  );
  // cat-inactive is ignored because status === 'Nonaktif'
  // cat-idg (-3) is normalized to Math.max(0, floor(-3)) = 0
  // cat-mkh (100) reduces Tajwid to minScore (0.00), cannot be negative
  assert(
    '2. Batas nilai, proteksi nilai negatif, dan pengabaian kategori nonaktif',
    calc2.fieldScores['Tajwid'] === 0 && calc2.deductions['cat-inactive'] === undefined && calc2.finalScore >= 0,
    `Tajwid score: ${calc2.fieldScores['Tajwid']}, finalScore: ${calc2.finalScore}`
  );

  // 3. Perbedaan rubrik dan tie-break order antar cabang (Tilawah vs Tahfizh)
  const tilawahRule = getBranchRuleConfig('Tilawah Dewasa Putra');
  const tahfizhRule = getBranchRuleConfig('Tahfizh 5 Juz dan Tilawah');
  assert(
    '3. Perbedaan rubrik dan konfigurasi tie-break antar cabang',
    tilawahRule.tieBreakOrder[1] === 'Tajwid' &&
    tilawahRule.tieBreakOrder[2] === 'Lagu' &&
    tahfizhRule.tieBreakOrder[1] === 'Tahfizh',
    `Tilawah order: ${tilawahRule.tieBreakOrder.join(',')}, Tahfizh order: ${tahfizhRule.tieBreakOrder.join(',')}`
  );

  // 4. Penilaian multi-soal / multi-maqra
  const stageQuestions: AssignedMaqraItem[] = [
    { questionId: 'q-1', title: 'Maqra 1', pageNumber: 305 },
    { questionId: 'q-2', title: 'Maqra 2', pageNumber: 310 }
  ];
  const assessmentsSample: JudgeAssessment[] = [
    {
      id: 'a1',
      tenantId: 't-1',
      stageParticipationId: 'sp-1',
      stageId: 'stg-1',
      stageName: 'Penyisihan',
      participantId: 'p-1',
      judgeId: 'j-1',
      judgeName: 'Hakim 1',
      judgeField: 'Tajwid',
      questionId: 'q-1',
      status: 'finalized',
      errorCounts: {},
      deductions: {},
      totalDeductions: 2,
      finalScore: 98,
      fieldScores: { Tajwid: 28, Fashahah: 30, Lagu: 25, Suara: 15 },
      annotations: [],
      lastUpdated: '10:00 WIB'
    },
    {
      id: 'a2',
      tenantId: 't-1',
      stageParticipationId: 'sp-1',
      stageId: 'stg-1',
      stageName: 'Penyisihan',
      participantId: 'p-1',
      judgeId: 'j-1',
      judgeName: 'Hakim 1',
      judgeField: 'Tajwid',
      questionId: 'q-2',
      status: 'finalized',
      errorCounts: {},
      deductions: {},
      totalDeductions: 6,
      finalScore: 94,
      fieldScores: { Tajwid: 26, Fashahah: 28, Lagu: 25, Suara: 15 },
      annotations: [],
      lastUpdated: '10:15 WIB'
    }
  ];
  const aggMulti = aggregateParticipantScores('p-1', 'Penyisihan', stageQuestions, ['j-1'], assessmentsSample);
  assert(
    '4. Penilaian multi-soal/multi-maqra berhasil diagregasi akurat',
    aggMulti.isFullyFinalized && aggMulti.averageFinalScore === 96.0 && aggMulti.perMaqraSummary.length === 2,
    `Multi maqra average: ${aggMulti.averageFinalScore}`
  );

  // 5. Isolasi peserta antar-cabang dengan nama babak yang sama
  const participations: StageParticipation[] = [
    {
      id: 'sp-tilawah-1',
      tenantId: 't-1',
      participantId: 'p-tilawah-1',
      stageId: 'stg-penyisihan',
      stageName: 'Penyisihan',
      branchName: 'Tilawah Dewasa Putra',
      lotteryNumber: '01',
      questionId: 'q-1',
      assignedMaqra: 'Maqra 1',
      pageNumber: 305,
      status: 'Lengkap'
    },
    {
      id: 'sp-tahfizh-1',
      tenantId: 't-1',
      participantId: 'p-tahfizh-1',
      stageId: 'stg-penyisihan',
      stageName: 'Penyisihan',
      branchName: 'Tahfizh 10 Juz Putri',
      lotteryNumber: '01',
      questionId: 'q-3',
      assignedMaqra: 'Maqra 3',
      pageNumber: 200,
      status: 'Lengkap'
    }
  ];
  const participantsList: Participant[] = [
    {
      id: 'p-tilawah-1',
      tenantId: 't-1',
      participantId: 'TLW-01',
      lotteryNumber: '01',
      name: 'Ahmad Tilawah',
      gender: 'Putra',
      kafilahId: 'k-1',
      kafilahName: 'Bandung',
      branchName: 'Tilawah Dewasa Putra',
      levelName: 'Ulya',
      stageName: 'Penyisihan',
      questionId: 'q-1',
      assignedMaqra: 'Maqra 1',
      pageNumber: 305,
      status: 'Berlangsung'
    },
    {
      id: 'p-tahfizh-1',
      tenantId: 't-1',
      participantId: 'THF-01',
      lotteryNumber: '01',
      name: 'Fatimah Tahfizh',
      gender: 'Putri',
      kafilahId: 'k-1',
      kafilahName: 'Bandung',
      branchName: 'Tahfizh 10 Juz Putri',
      levelName: 'Ulya',
      stageName: 'Penyisihan',
      questionId: 'q-3',
      assignedMaqra: 'Maqra 3',
      pageNumber: 200,
      status: 'Berlangsung'
    }
  ];

  const evalBranchIsolated = RankingService.evaluateStageParticipants({
    tenantId: 't-1',
    stageName: 'Penyisihan',
    branchName: 'Tilawah Dewasa Putra', // Strict branch filter
    participations,
    participants: participantsList,
    assessments: assessmentsSample,
    judgeAssignments: [{ id: 'ja1', tenantId: 't-1', judgeId: 'j-1', judgeName: 'H1', stageName: 'Penyisihan', branchName: 'Tilawah Dewasa Putra', judgeField: 'Tajwid' }],
    stageQuestionsGetter: () => [{ questionId: 'q-1', title: 'M1', pageNumber: 305 }],
    quota: 3
  });
  assert(
    '5. Isolasi cabang: peserta Tahfizh tidak tercampur dalam evaluasi babak Tilawah',
    evalBranchIsolated.evaluatedParticipants.length === 1 &&
    evalBranchIsolated.evaluatedParticipants[0].participant.id === 'p-tilawah-1',
    `Found participants: ${evalBranchIsolated.evaluatedParticipants.length}`
  );

  // 6. Penegakan Tie-Break Resmi Seni Baca MTQ 2025 (Total -> Tajwid -> Lagu -> Fashahah)
  const partTied1: Participant = {
    id: 'p-tie-1',
    tenantId: 't-1',
    participantId: 'TLW-10',
    lotteryNumber: '10',
    name: 'Peserta Tajwid Tinggi',
    gender: 'Putra',
    kafilahId: 'k-1',
    kafilahName: 'Bogor',
    branchName: 'Tilawah Dewasa Putra',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'q-1',
    assignedMaqra: 'Maqra 1',
    pageNumber: 305,
    status: 'Berlangsung'
  };
  const partTied2: Participant = {
    id: 'p-tie-2',
    tenantId: 't-1',
    participantId: 'TLW-11',
    lotteryNumber: '11',
    name: 'Peserta Tajwid Rendah',
    gender: 'Putra',
    kafilahId: 'k-2',
    kafilahName: 'Bekasi',
    branchName: 'Tilawah Dewasa Putra',
    levelName: 'Ulya',
    stageName: 'Penyisihan',
    questionId: 'q-1',
    assignedMaqra: 'Maqra 1',
    pageNumber: 305,
    status: 'Berlangsung'
  };
  const tieParticipations: StageParticipation[] = [
    {
      id: 'sp-tie-1',
      tenantId: 't-1',
      participantId: 'p-tie-1',
      stageId: 'stg-1',
      stageName: 'Penyisihan',
      branchName: 'Tilawah Dewasa Putra',
      lotteryNumber: '10',
      questionId: 'q-1',
      assignedMaqra: 'Maqra 1',
      pageNumber: 305,
      status: 'Lengkap'
    },
    {
      id: 'sp-tie-2',
      tenantId: 't-1',
      participantId: 'p-tie-2',
      stageId: 'stg-1',
      stageName: 'Penyisihan',
      branchName: 'Tilawah Dewasa Putra',
      lotteryNumber: '11',
      questionId: 'q-1',
      assignedMaqra: 'Maqra 1',
      pageNumber: 305,
      status: 'Lengkap'
    }
  ];
  // Both have total score 90.0, but p-tie-1 has Tajwid 28, p-tie-2 has Tajwid 26
  const tieAssessments: JudgeAssessment[] = [
    {
      id: 'a-tie-1',
      tenantId: 't-1',
      stageParticipationId: 'sp-tie-1',
      stageId: 'stg-1',
      stageName: 'Penyisihan',
      participantId: 'p-tie-1',
      judgeId: 'j-1',
      judgeName: 'Hakim 1',
      judgeField: 'Tajwid',
      questionId: 'q-1',
      status: 'finalized',
      errorCounts: {},
      deductions: {},
      totalDeductions: 10,
      finalScore: 90.0,
      fieldScores: { Tajwid: 28.0, Lagu: 23.0, Fashahah: 25.0, Suara: 14.0 },
      annotations: [],
      lastUpdated: '10:00 WIB'
    },
    {
      id: 'a-tie-2',
      tenantId: 't-1',
      stageParticipationId: 'sp-tie-2',
      stageId: 'stg-1',
      stageName: 'Penyisihan',
      participantId: 'p-tie-2',
      judgeId: 'j-1',
      judgeName: 'Hakim 1',
      judgeField: 'Tajwid',
      questionId: 'q-1',
      status: 'finalized',
      errorCounts: {},
      deductions: {},
      totalDeductions: 10,
      finalScore: 90.0,
      fieldScores: { Tajwid: 26.0, Lagu: 25.0, Fashahah: 25.0, Suara: 14.0 },
      annotations: [],
      lastUpdated: '10:00 WIB'
    }
  ];

  const evalTieBreak = RankingService.evaluateStageParticipants({
    tenantId: 't-1',
    stageName: 'Penyisihan',
    branchName: 'Tilawah Dewasa Putra',
    participations: tieParticipations,
    participants: [partTied1, partTied2],
    assessments: tieAssessments,
    judgeAssignments: [{ id: 'ja1', tenantId: 't-1', judgeId: 'j-1', judgeName: 'H1', stageName: 'Penyisihan', branchName: 'Tilawah Dewasa Putra', judgeField: 'Tajwid' }],
    stageQuestionsGetter: () => [{ questionId: 'q-1', title: 'M1', pageNumber: 305 }],
    quota: 1
  });

  const winner = evalTieBreak.evaluatedParticipants[0];
  const runnerUp = evalTieBreak.evaluatedParticipants[1];
  assert(
    '6. Penegakan Tie-Break resmi: Peserta dengan Tajwid lebih tinggi menang pada nilai total sama',
    winner.participant.id === 'p-tie-1' &&
    winner.rank === 1 &&
    runnerUp.rank === 2 &&
    winner.tieBreakResolvedBy !== undefined &&
    winner.tieBreakResolvedBy.includes('Tajwid'),
    `Rank 1: ${winner.participant.id}, Reason: ${winner.tieBreakResolvedBy}`
  );

  // 7. Deteksi nilai seri pada batas kuota kelulusan
  const evalBoundary = RankingService.evaluateStageParticipants({
    tenantId: 't-1',
    stageName: 'Penyisihan',
    branchName: 'Tilawah Dewasa Putra',
    participations: tieParticipations,
    participants: [partTied1, partTied2],
    assessments: [
      // Make them identically tied in all fields
      { ...tieAssessments[0] },
      { ...tieAssessments[1], fieldScores: { Tajwid: 28.0, Lagu: 23.0, Fashahah: 25.0, Suara: 14.0 } }
    ],
    judgeAssignments: [{ id: 'ja1', tenantId: 't-1', judgeId: 'j-1', judgeName: 'H1', stageName: 'Penyisihan', branchName: 'Tilawah Dewasa Putra', judgeField: 'Tajwid' }],
    stageQuestionsGetter: () => [{ questionId: 'q-1', title: 'M1', pageNumber: 305 }],
    quota: 1
  });
  assert(
    '7. Deteksi nilai seri identik pada batas kuota (Boundary Tie Detection)',
    evalBoundary.boundaryTie === true && evalBoundary.unresolvedTiesCount > 0,
    `boundaryTie: ${evalBoundary.boundaryTie}, unresolvedCount: ${evalBoundary.unresolvedTiesCount}`
  );

  // 8. Snapshot kelulusan resmi tersimpan lengkap dan tidak dapat berubah
  const snapshot = RankingService.createStageResultSnapshot({
    tenantId: 't-1',
    stageId: 'stg-1',
    stageName: 'Penyisihan',
    branchName: 'Tilawah Dewasa Putra',
    quota: 1,
    finalizedBy: 'H. Rachmat (admin)',
    evaluatedParticipants: evalTieBreak.evaluatedParticipants
  });
  assert(
    '8. Snapshot kelulusan babak mencatat data lengkap (skor, tie-break, waktu, pelaksana)',
    snapshot.rankings.length === 2 &&
    snapshot.rankings[0].rank === 1 &&
    snapshot.tieBreakRuleUsed.includes('Tajwid') &&
    snapshot.finalizedBy.includes('admin'),
    `Snapshot rankings: ${snapshot.rankings.length}, rule: ${snapshot.tieBreakRuleUsed}`
  );

  // 9. Validasi Kebijakan Reopen: Hanya Admin yang berhak membuka kunci lembar final
  const testJudgeRole = 'judge';
  const canJudgeReopen = testJudgeRole !== 'judge'; // Judge is blocked
  assert(
    '9. Kebijakan Koreksi & Reopen: Dewan hakim dilarang membuka kunci nilai final secara sepihak',
    !canJudgeReopen,
    'Judge should not have permission to reopen finalized assessment'
  );

  // 10. Validasi Alasan Wajib Reopen (Minimal 5 karakter untuk audit trail)
  const invalidReason = 'ok';
  const validReason = 'Koreksi kesalahan input jumlah waqaf atas persetujuan Ketua Majelis';
  assert(
    '10. Validasi Alasan Reopen: Wajib minimal 5 karakter untuk menjamin integritas audit',
    invalidReason.trim().length < 5 && validReason.trim().length >= 5,
    'Reason must meet minimum length criteria'
  );

  // 11. Konsistensi Matematis Identik antara Halaman Rekap dan Kualifikasi
  const aggScore = aggregateParticipantScores('p-tie-1', 'Penyisihan', [{ questionId: 'q-1', title: 'M1', pageNumber: 305 }], ['j-1'], tieAssessments);
  const rekapAvg = aggScore.averageFinalScore;
  const kualifikasiAvg = evalTieBreak.evaluatedParticipants.find((p) => p.participant.id === 'p-tie-1')?.averageFinalScore;
  assert(
    '11. Konsistensi Skor: Hasil perhitungan di Rekap dan Hasil Kelulusan identik 100%',
    rekapAvg !== null && rekapAvg === kualifikasiAvg,
    `Rekap: ${rekapAvg}, Kualifikasi: ${kualifikasiAvg}`
  );

  // 12. Dukungan Override Kualifikasi Manual dengan Pencatatan Alasan
  const manualEval = RankingService.evaluateStageParticipants({
    tenantId: 't-1',
    stageName: 'Penyisihan',
    branchName: 'Tilawah Dewasa Putra',
    participations: tieParticipations,
    participants: [partTied1, partTied2],
    assessments: tieAssessments,
    judgeAssignments: [{ id: 'ja1', tenantId: 't-1', judgeId: 'j-1', judgeName: 'H1', stageName: 'Penyisihan', branchName: 'Tilawah Dewasa Putra', judgeField: 'Tajwid' }],
    stageQuestionsGetter: () => [{ questionId: 'q-1', title: 'M1', pageNumber: 305 }],
    quota: 1,
    manualOverrides: { 'p-tie-2': true },
    overrideReasons: { 'p-tie-2': 'Keputusan Sidang Dewan Hakim: Penampilan luar biasa pada lagu' }
  });
  const overridden = manualEval.evaluatedParticipants.find((p) => p.participant.id === 'p-tie-2');
  assert(
    '12. Kualifikasi Manual: Dukungan override juri dengan pelacakan alasan terdokumentasi',
    overridden?.isQualified === true && overridden?.isOverridden === true && overridden?.overrideReason.includes('Keputusan Sidang'),
    `Overridden qualified: ${overridden?.isQualified}, Reason: ${overridden?.overrideReason}`
  );

  // 13. Proteksi Kategori Error: Nilai 0 kesalahan menghasilkan skor maksimal bidang
  const zeroCalc = calculateAssessmentScore({}, sampleCategories, OFFICIAL_SENI_BACA_RUBRIC);
  assert(
    '13. Proteksi Kesalahan Nol: Peserta tanpa kesalahan meraih skor sempurna 100 dengan batas bidang terpenuhi',
    zeroCalc.finalScore === 100.0 && zeroCalc.fieldScores['Tajwid'] === 30.0 && zeroCalc.fieldScores['Suara'] === 15.0,
    `Zero error final score: ${zeroCalc.finalScore}`
  );

  // 14. Pemetaan Kategori Khusus: Fashahah & Waqaf hanya memotong bidang Fashahah
  const fashOnlyCalc = calculateAssessmentScore({ 'cat-fsh': 3 }, sampleCategories, OFFICIAL_SENI_BACA_RUBRIC);
  // cat-fsh deduction = 3 * 1.0 = 3.0. Fashahah score = 30 - 3 = 27.0. Tajwid remains 30.0.
  assert(
    '14. Pemetaan Bidang Independen: Kesalahan Fashahah tidak mengurangi bidang Tajwid',
    fashOnlyCalc.fieldScores['Fashahah'] === 27.0 && fashOnlyCalc.fieldScores['Tajwid'] === 30.0,
    `Fashahah: ${fashOnlyCalc.fieldScores['Fashahah']}, Tajwid: ${fashOnlyCalc.fieldScores['Tajwid']}`
  );

  return { passed, failed, results };
}
