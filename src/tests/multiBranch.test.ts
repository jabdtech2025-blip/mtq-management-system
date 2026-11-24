import {
  aggregateParticipantScores,
  calculateAssessmentScore,
  findUncoveredRubricFields,
  getActiveRubricFields,
  resolveJudgeFieldScope
} from '../services/scoringEngine';
import { RankingService } from '../services/rankingService';
import { OFFICIAL_SENI_BACA_RUBRIC, OFFICIAL_TAHFIZH_RUBRIC } from '../services/competitionRules';
import {
  resolveSnapshotForStage,
  resolveStageForBranch,
  resolveStageWithLegacyFallback,
  stageBelongsToBranch
} from '../services/stageResolver';
import {
  buildStageOrderLookup,
  sortParticipantsByName,
  sortParticipantsForDisplay
} from '../utils/participantSort';
import {
  buildViewFilterKey,
  readViewFilters,
  writeViewFilters,
  FilterStorageLike
} from '../utils/viewFilterStorage';
import { buildJudgeAssignmentLabels, resolveRekapJudgeColumns } from '../utils/judgeAssignmentLabels';
import { applyStageParticipationRealtimeUpdate } from '../utils/realtimeRowApply';
import { carryOverLoadedAnnotations } from '../utils/annotationCarryOver';
import {
  canSuperviseTenant,
  filterTenantsForManagement,
  resolveSuperadminTargetTenant
} from '../utils/superadminGuard';
import { getParticipantStageCompletion } from '../services/completion';
import { ErrorCategory, JudgeAssessment, JudgeAssignment, Participant, StageParticipation } from '../types/mtq';

type TestResult = { name: string; success: boolean; details?: string };

/**
 * Pengujian multi-cabang (babak bernama sama per cabang, rubrik per cabang) dan hakim multi-bidang.
 */
export function runMultiBranchTests(): { passed: number; failed: number; results: TestResult[] } {
  const results: TestResult[] = [];
  const check = (name: string, fn: () => void) => {
    try {
      fn();
      results.push({ name, success: true });
    } catch (err) {
      results.push({ name, success: false, details: err instanceof Error ? err.message : String(err) });
    }
  };
  const expect = (condition: boolean, message: string) => {
    if (!condition) throw new Error(message);
  };

  const TENANT = 'tenant-a';
  const stages = [
    { id: 'st-pa-1', tenantId: TENANT, name: 'Penyisihan', branchId: 'br-pa', branchName: 'Tilawah Dewasa Putra' },
    { id: 'st-pa-2', tenantId: TENANT, name: 'Final', branchId: 'br-pa', branchName: 'Tilawah Dewasa Putra' },
    { id: 'st-pi-1', tenantId: TENANT, name: 'Penyisihan', branchId: 'br-pi', branchName: 'Tilawah Dewasa Putri' },
    { id: 'st-th-1', tenantId: TENANT, name: 'Penyisihan', branchId: 'br-th', branchName: 'Tahfizh 1 Juz' },
    { id: 'st-other', tenantId: 'tenant-b', name: 'Penyisihan', branchId: 'br-x', branchName: 'Tilawah Dewasa Putri' }
  ];

  check('MC-1. Babak dicari per cabang: "Penyisihan" cabang Putri bukan babak cabang Putra', () => {
    const s = resolveStageForBranch(stages, { tenantId: TENANT, stageName: 'Penyisihan', branchId: 'br-pi' });
    expect(s?.id === 'st-pi-1', `harus st-pi-1, dapat ${s?.id}`);
    const byName = resolveStageForBranch(stages, {
      tenantId: TENANT,
      stageName: 'Penyisihan',
      branchName: 'Tahfizh 1 Juz'
    });
    expect(byName?.id === 'st-th-1', `harus st-th-1, dapat ${byName?.id}`);
  });

  check('MC-2. Cabang tanpa babak bernama itu tidak dialihkan ke babak cabang lain', () => {
    const s = resolveStageForBranch(stages, { tenantId: TENANT, stageName: 'Final', branchId: 'br-pi' });
    expect(s === undefined, `harus undefined, dapat ${s?.id}`);
    const unknownBranch = resolveStageForBranch(stages, {
      tenantId: TENANT,
      stageName: 'Penyisihan',
      branchId: 'br-baru',
      branchName: 'Cabang Baru'
    });
    expect(unknownBranch === undefined, 'cabang baru tidak boleh mendapat babak cabang lain');
  });

  check('MC-3. stageId dari formulir diabaikan bila babaknya milik cabang lain', () => {
    const s = resolveStageForBranch(stages, {
      tenantId: TENANT,
      stageId: 'st-pa-1',
      stageName: 'Penyisihan',
      branchId: 'br-pi'
    });
    expect(s?.id === 'st-pi-1', `harus st-pi-1, dapat ${s?.id}`);
  });

  check('MC-4. Nama cabang yang saling memuat tidak tertukar (cocok persis, bukan potongan)', () => {
    const similar = [
      ...stages,
      { id: 'st-thtl-1', tenantId: TENANT, name: 'Penyisihan', branchId: 'br-thtl', branchName: 'Tahfizh 1 Juz dan Tilawah' }
    ];
    const s = resolveStageForBranch(similar, {
      tenantId: TENANT,
      stageName: 'Penyisihan',
      branchName: 'Tahfizh 1 Juz dan Tilawah'
    });
    expect(s?.id === 'st-thtl-1', `harus st-thtl-1, dapat ${s?.id}`);
    expect(
      !stageBelongsToBranch(similar[3], { branchName: 'Tahfizh 1 Juz dan Tilawah' }),
      'babak "Tahfizh 1 Juz" tidak boleh dianggap milik "Tahfizh 1 Juz dan Tilawah"'
    );
  });

  check('MC-5. Babak umum (tanpa cabang) berlaku untuk semua cabang; babak tenant lain tidak pernah dipakai', () => {
    const withGeneric = [...stages, { id: 'st-gen', tenantId: TENANT, name: 'Semifinal', branchName: 'Semua Cabang' }];
    const s = resolveStageForBranch(withGeneric, { tenantId: TENANT, stageName: 'Semifinal', branchId: 'br-pi' });
    expect(s?.id === 'st-gen', `harus st-gen, dapat ${s?.id}`);
    const otherTenant = resolveStageForBranch(stages, { tenantId: 'tenant-c', stageName: 'Penyisihan', branchId: 'br-x' });
    expect(otherTenant === undefined, 'babak tenant lain tidak boleh terpilih');
  });

  check('MC-6. Fallback lama hanya aktif di Mode Demo, tidak di mode live', () => {
    const lookup = { tenantId: TENANT, stageName: 'Final', branchId: 'br-pi' };
    expect(resolveStageWithLegacyFallback(stages, lookup, false) === undefined, 'mode live tidak boleh fallback');
    expect(resolveStageWithLegacyFallback(stages, lookup, true)?.id === 'st-pa-2', 'mode demo memakai babak bernama sama');
  });

  const tilawahField = OFFICIAL_SENI_BACA_RUBRIC.fields.find((f) => f.name === 'Tajwid')!;
  const tahfizhField = OFFICIAL_TAHFIZH_RUBRIC.fields[0];
  const makeCategory = (id: string, code: string, fieldId: string): ErrorCategory =>
    ({
      id,
      tenantId: TENANT,
      code,
      name: `Kategori ${code}`,
      fieldId,
      scope: '',
      defaultDeduction: 1,
      methodType: 'Pengurangan tetap',
      status: 'Aktif'
    }) as ErrorCategory;
  const mixedCategories = [
    makeCategory('cat-tlw', 'UJI-TLW', tilawahField.id),
    makeCategory('cat-thf', 'UJI-THF', tahfizhField.id)
  ];

  check('MC-7. Tenant dengan kategori dua rubrik: lembar Tilawah tanpa kesalahan Tahfizh tetap sah', () => {
    const res = calculateAssessmentScore({ 'cat-tlw': 2 }, mixedCategories, OFFICIAL_SENI_BACA_RUBRIC);
    expect(res.validationErrors.length === 0, `tidak boleh ada galat: ${res.validationErrors.join(' | ')}`);
    expect(res.totalDeductions === 2, `potongan harus 2, dapat ${res.totalDeductions}`);
  });

  check('MC-8. Tenant dengan kategori dua rubrik: lembar Tahfizh tanpa kesalahan Tilawah tetap sah', () => {
    const res = calculateAssessmentScore({ 'cat-thf': 3 }, mixedCategories, OFFICIAL_TAHFIZH_RUBRIC);
    expect(res.validationErrors.length === 0, `tidak boleh ada galat: ${res.validationErrors.join(' | ')}`);
    expect(res.fieldDeductions[tahfizhField.name] === 3, 'potongan harus masuk bidang rubrik Tahfizh');
  });

  check('MC-9. Kesalahan pada kategori rubrik lain tetap ditolak (tidak dialihkan ke bidang lain)', () => {
    const res = calculateAssessmentScore({ 'cat-thf': 1 }, mixedCategories, OFFICIAL_SENI_BACA_RUBRIC);
    expect(res.validationErrors.length === 1, `harus tepat 1 galat, dapat ${res.validationErrors.length}`);
  });


  // ---------------------------------------------------------------------------
  // Hakim multi-bidang
  // ---------------------------------------------------------------------------
  const seniBacaFields = getActiveRubricFields(OFFICIAL_SENI_BACA_RUBRIC);
  const fieldNameById = new Map(OFFICIAL_SENI_BACA_RUBRIC.fields.map((f) => [f.id, f.name] as [string, string]));
  const byName = (name: string) => seniBacaFields.find((f) => f.name === name)!;

  check('MC-10. Cakupan hakim: satu bidang, dua bidang, dan semua bidang', () => {
    const one = resolveJudgeFieldScope([{ rubricFieldId: byName('Tajwid').id }], seniBacaFields, fieldNameById);
    const two = resolveJudgeFieldScope(
      [{ rubricFieldId: byName('Lagu').id }, { judgeField: 'Bidang Suara' }],
      seniBacaFields,
      fieldNameById
    );
    const all = resolveJudgeFieldScope([{ judgeField: 'Semua Bidang' }], seniBacaFields, fieldNameById);
    const mixed = resolveJudgeFieldScope(
      [{ rubricFieldId: byName('Tajwid').id }, { judgeField: 'Semua Bidang' }],
      seniBacaFields,
      fieldNameById
    );
    expect(JSON.stringify(one) === '["Tajwid"]', `satu bidang: ${JSON.stringify(one)}`);
    expect(JSON.stringify(two) === '["Lagu","Suara"]', `dua bidang: ${JSON.stringify(two)}`);
    expect(all === null, 'penugasan tanpa bidang dikenal = semua bidang');
    expect(mixed === null, 'gabungan dengan "Semua Bidang" = semua bidang');
  });

  check('MC-11. Bidang tanpa hakim terdeteksi; tidak ada bila ada hakim semua bidang', () => {
    const uncovered = findUncoveredRubricFields([['Tajwid', 'Fashahah'], ['Lagu']], seniBacaFields);
    expect(JSON.stringify(uncovered) === '["Suara"]', `harus ["Suara"], dapat ${JSON.stringify(uncovered)}`);
    expect(findUncoveredRubricFields([['Tajwid'], null], seniBacaFields).length === 0, 'hakim semua bidang menutup semua');
  });

  const sheet = (judgeId: string, fieldScores: Record<string, number>): JudgeAssessment =>
    ({
      id: `a-${judgeId}`,
      tenantId: TENANT,
      stageParticipationId: 'sp-1',
      stageId: 'st-pa-1',
      stageName: 'Penyisihan',
      participantId: 'p-1',
      judgeId,
      judgeName: judgeId,
      judgeField: '',
      questionId: 'q-1',
      status: 'finalized',
      errorCounts: {},
      deductions: {},
      totalDeductions: 0,
      finalScore: Object.values(fieldScores).reduce((a, b) => a + b, 0),
      fieldScores,
      annotations: [],
      lastUpdated: '10:00 WIB'
    }) as JudgeAssessment;
  // Hakim A: Tajwid + Fashahah, Hakim B: Lagu + Suara, Hakim C: Tajwid
  const sheets = [
    sheet('j-a', { Tajwid: 28, Fashahah: 29, Lagu: 25, Suara: 15 }),
    sheet('j-b', { Tajwid: 30, Fashahah: 30, Lagu: 24, Suara: 14.5 }),
    sheet('j-c', { Tajwid: 26, Fashahah: 30, Lagu: 25, Suara: 15 })
  ];
  const scope = {
    judgeFieldScope: { 'j-a': ['Tajwid', 'Fashahah'], 'j-b': ['Lagu', 'Suara'], 'j-c': ['Tajwid'] },
    rubricFields: seniBacaFields.map((f) => ({ name: f.name, maxScore: f.maxScore, weight: f.weight })),
    startingScore: 100
  };

  check('MC-12. Nilai bidang dirata-rata hanya dari hakim pemegang bidang (sama dengan server: 94.50)', () => {
    const agg = aggregateParticipantScores(
      'p-1',
      'Penyisihan',
      [{ questionId: 'q-1', title: 'M1', pageNumber: 1 }],
      ['j-a', 'j-b', 'j-c'],
      sheets,
      'st-pa-1',
      'sp-1',
      scope
    );
    expect(agg.fieldAverages.Tajwid === 27, `Tajwid harus 27 (A & C), dapat ${agg.fieldAverages.Tajwid}`);
    expect(agg.fieldAverages.Fashahah === 29, `Fashahah harus 29 (hanya A), dapat ${agg.fieldAverages.Fashahah}`);
    expect(agg.fieldAverages.Lagu === 24, `Lagu harus 24 (hanya B), dapat ${agg.fieldAverages.Lagu}`);
    expect(agg.fieldAverages.Suara === 14.5, `Suara harus 14.5 (hanya B), dapat ${agg.fieldAverages.Suara}`);
    expect(agg.averageFinalScore === 94.5, `total harus 94.5, dapat ${agg.averageFinalScore}`);
    const oldWay = aggregateParticipantScores(
      'p-1',
      'Penyisihan',
      [{ questionId: 'q-1', title: 'M1', pageNumber: 1 }],
      ['j-a', 'j-b', 'j-c'],
      sheets,
      'st-pa-1',
      'sp-1'
    );
    expect(oldWay.averageFinalScore !== 94.5, 'tanpa cakupan bidang, nilai lama (rata-rata lembar) berbeda');
  });

  check('MC-13. Peringkat memblokir pengesahan bila ada bidang tanpa hakim, dan lolos setelah tercakup', () => {
    const participant = {
      id: 'p-1',
      tenantId: TENANT,
      participantId: 'P-1',
      lotteryNumber: '01',
      name: 'Peserta 1',
      gender: 'Putra',
      kafilahId: 'k',
      kafilahName: 'K',
      branchId: 'br-pa',
      branchName: 'Tilawah Dewasa Putra',
      levelName: 'Ulya',
      stageName: 'Penyisihan',
      questionId: 'q-1',
      assignedMaqra: 'M1',
      pageNumber: 1,
      status: 'Berlangsung'
    } as Participant;
    const participation = {
      id: 'sp-1',
      tenantId: TENANT,
      participantId: 'p-1',
      stageId: 'st-pa-1',
      stageName: 'Penyisihan',
      branchId: 'br-pa',
      branchName: 'Tilawah Dewasa Putra',
      lotteryNumber: '01',
      questionId: 'q-1',
      assignedMaqra: 'M1',
      pageNumber: 1,
      status: 'Lengkap'
    } as StageParticipation;
    const asg = (id: string, judgeId: string, fieldName: string): JudgeAssignment => ({
      id,
      tenantId: TENANT,
      judgeId,
      judgeName: judgeId,
      stageId: 'st-pa-1',
      stageName: 'Penyisihan',
      branchId: 'br-pa',
      branchName: 'Tilawah Dewasa Putra',
      judgeField: fieldName,
      rubricFieldId: byName(fieldName).id
    });
    const baseAssignments = [
      asg('1', 'j-a', 'Tajwid'),
      asg('2', 'j-a', 'Fashahah'),
      asg('3', 'j-b', 'Lagu'),
      asg('4', 'j-c', 'Tajwid')
    ];
    const run = (judgeAssignments: JudgeAssignment[]) =>
      RankingService.evaluateStageParticipants({
        tenantId: TENANT,
        stageId: 'st-pa-1',
        stageName: 'Penyisihan',
        branchId: 'br-pa',
        branchName: 'Tilawah Dewasa Putra',
        participations: [participation],
        participants: [participant],
        assessments: sheets.map((a) => ({ ...a, tenantId: TENANT })),
        judgeAssignments,
        stageQuestionsGetter: () => [{ questionId: 'q-1', title: 'M1', pageNumber: 1 }],
        quota: 1
      });
    const blocked = run(baseAssignments);
    expect(blocked.canFinalize === false, 'harus diblokir');
    expect(blocked.blockingReasonDetail?.code === 'FIELD_WITHOUT_JUDGE', `kode: ${blocked.blockingReasonDetail?.code}`);
    const covered = run([...baseAssignments, asg('5', 'j-b', 'Suara')]);
    expect(covered.blockingReasonDetail?.code !== 'FIELD_WITHOUT_JUDGE', `masih diblokir: ${covered.blockingReason}`);
    const score = covered.evaluatedParticipants[0]?.displayScore;
    expect(score === 94.5, `skor peringkat harus 94.5, dapat ${score}`);
  });

  // ---------------------------------------------------------------------------
  // Dua tim juri dalam satu babak: kelengkapan per bidang, bukan per hakim
  // Tim A: a1 (Tajwid+Fashahah), a2 (Lagu+Suara). Tim B: b1 (Tajwid+Fashahah), b2 (Lagu+Suara).
  // ---------------------------------------------------------------------------
  const teamScope = {
    judgeFieldScope: {
      'a1': ['Tajwid', 'Fashahah'],
      'a2': ['Lagu', 'Suara'],
      'b1': ['Tajwid', 'Fashahah'],
      'b2': ['Lagu', 'Suara']
    } as Record<string, string[] | null>,
    rubricFields: seniBacaFields.map((f) => ({ name: f.name, maxScore: f.maxScore, weight: f.weight })),
    startingScore: 100
  };
  const teamJudges = ['a1', 'a2', 'b1', 'b2'];
  const maqra = [{ questionId: 'q-1', title: 'M1', pageNumber: 1 }];

  check('TIM-01. Peserta dinilai Tim A saja (2 dari 4 hakim) dianggap lengkap: semua bidang sudah dinilai pemegangnya', () => {
    const agg = aggregateParticipantScores(
      'p-1', 'Penyisihan', maqra, teamJudges,
      [sheet('a1', { Tajwid: 29, Fashahah: 30, Lagu: 25, Suara: 15 }), sheet('a2', { Tajwid: 30, Fashahah: 30, Lagu: 24, Suara: 15 })],
      'st-pa-1', 'sp-1', teamScope
    );
    expect(agg.isFullyFinalized === true, 'harus lengkap');
    expect(agg.coveredFieldUnits === 4 && agg.requiredFieldUnits === 4, `satuan ${agg.coveredFieldUnits}/${agg.requiredFieldUnits}`);
    expect(agg.averageFinalScore === 98, `total harus 98 (29+30+24+15), dapat ${agg.averageFinalScore}`);
  });

  check('TIM-02. Bidang Lagu/Suara belum dinilai siapa pun: belum lengkap dan tidak ada nilai akhir', () => {
    const agg = aggregateParticipantScores(
      'p-1', 'Penyisihan', maqra, teamJudges,
      [sheet('b1', { Tajwid: 29, Fashahah: 30, Lagu: 25, Suara: 15 })],
      'st-pa-1', 'sp-1', teamScope
    );
    expect(agg.isFullyFinalized === false, 'harus belum lengkap');
    expect(agg.coveredFieldUnits === 2 && agg.requiredFieldUnits === 4, `satuan ${agg.coveredFieldUnits}/${agg.requiredFieldUnits}`);
    expect(agg.averageFinalScore === null, 'nilai akhir harus kosong');
  });

  check('TIM-03. Status peserta di aplikasi: "Lengkap" dengan dua juri satu tim, "Menunggu Hakim Lain" bila bidang belum dinilai', () => {
    const participant = {
      id: 'p-1', tenantId: TENANT, participantId: 'TLW-01', name: 'Peserta Satu', kafilahId: 'k', kafilahName: 'K',
      branchId: 'br-pa', branchName: 'Tilawah Dewasa Putra', gender: 'Putra', lotteryNumber: '01', questionId: 'q-1',
      assignedMaqra: 'M1', pageNumber: 1, stageName: 'Penyisihan', status: 'Menunggu'
    } as unknown as Participant;
    const fieldCoverage = { fieldNames: seniBacaFields.map((f) => f.name), judgeFieldScope: teamScope.judgeFieldScope };
    const done = getParticipantStageCompletion({
      tenantId: TENANT, participant, stageId: 'st-pa-1', stageName: 'Penyisihan', assignedMaqras: maqra,
      requiredJudgeIds: teamJudges,
      assessments: [sheet('a1', { Tajwid: 29, Fashahah: 30, Lagu: 25, Suara: 15 }), sheet('a2', { Tajwid: 30, Fashahah: 30, Lagu: 24, Suara: 15 })],
      fieldCoverage
    });
    const partial = getParticipantStageCompletion({
      tenantId: TENANT, participant, stageId: 'st-pa-1', stageName: 'Penyisihan', assignedMaqras: maqra,
      requiredJudgeIds: teamJudges,
      assessments: [sheet('a1', { Tajwid: 29, Fashahah: 30, Lagu: 25, Suara: 15 })],
      fieldCoverage
    });
    const legacy = getParticipantStageCompletion({
      tenantId: TENANT, participant, stageId: 'st-pa-1', stageName: 'Penyisihan', assignedMaqras: maqra,
      requiredJudgeIds: teamJudges,
      assessments: [sheet('a1', { Tajwid: 29, Fashahah: 30, Lagu: 25, Suara: 15 }), sheet('a2', { Tajwid: 30, Fashahah: 30, Lagu: 24, Suara: 15 })]
    });
    expect(done.isComplete && done.progressStatus === 'Lengkap', `harus Lengkap, dapat ${done.progressStatus}`);
    expect(!partial.isComplete && partial.progressStatus === 'Menunggu Hakim Lain', `harus Menunggu Hakim Lain, dapat ${partial.progressStatus}`);
    expect(!legacy.isComplete, 'tanpa rubrik bidang tetap wajib semua hakim');
  });

  // ---------------------------------------------------------------------------
  // Urutan peserta (nomor undian per cabang, nama A–Z)
  // ---------------------------------------------------------------------------
  const sortSample = [
    { name: 'Zaid', lotteryNumber: '10', branchName: 'Tilawah Dewasa Putra', stageName: 'Penyisihan' },
    { name: 'Budi', lotteryNumber: '2', branchName: 'Tilawah Dewasa Putra', stageName: 'Penyisihan' },
    { name: 'Ahmad', lotteryNumber: '', branchName: 'Tilawah Dewasa Putra', stageName: 'Penyisihan' },
    { name: 'Fatimah', lotteryNumber: '01', branchName: 'Tilawah Dewasa Putri', stageName: 'Penyisihan' },
    { name: 'Umar', lotteryNumber: '01', branchName: 'Tilawah Dewasa Putra', stageName: 'Final' },
    { name: 'Hasan', lotteryNumber: '01', branchName: 'Tilawah Dewasa Putra', stageName: 'Penyisihan' }
  ];

  check('SORT-01. Urutan tampil: per cabang, babak sesuai urutan, lalu nomor undian sebagai angka; tanpa nomor di akhir', () => {
    const order = buildStageOrderLookup([
      { name: 'Penyisihan', order: 1, branchName: 'Tilawah Dewasa Putra' },
      { name: 'Final', order: 2, branchName: 'Tilawah Dewasa Putra' },
      { name: 'Penyisihan', order: 1, branchName: 'Tilawah Dewasa Putri' }
    ]);
    const names = sortParticipantsForDisplay(sortSample, { stageOrder: order }).map((p) => p.name);
    expect(
      JSON.stringify(names) === JSON.stringify(['Hasan', 'Budi', 'Zaid', 'Ahmad', 'Umar', 'Fatimah']),
      `urutan: ${names.join(', ')}`
    );
  });

  check('SORT-02. Urutan nama A–Z untuk memilih peserta di Bank Soal (tidak peka huruf besar)', () => {
    const names = sortParticipantsByName([
      { name: 'zaid' },
      { name: 'Ahmad' },
      { name: 'budi' }
    ]).map((p) => p.name);
    expect(JSON.stringify(names) === JSON.stringify(['Ahmad', 'budi', 'zaid']), `urutan: ${names.join(', ')}`);
  });

  // ---------------------------------------------------------------------------
  // Persistensi filter tampilan per halaman + tenant + pengguna (sessionStorage)
  // ---------------------------------------------------------------------------
  const createMemoryStorage = (): FilterStorageLike => {
    const map = new Map<string, string>();
    return {
      getItem: (k) => (map.has(k) ? map.get(k)! : null),
      setItem: (k, v) => {
        map.set(k, v);
      }
    };
  };

  check('FLT-01. Filter tersimpan terisolasi per halaman, tenant, dan pengguna', () => {
    const store = createMemoryStorage();
    const defaults = { branchFilter: 'Semua Cabang', statusFilter: 'Semua Status' };
    const keyJudge1 = buildViewFilterKey('penilaian_hakim', 'tenant-a', 'judge-1');
    const keyJudge2 = buildViewFilterKey('penilaian_hakim', 'tenant-a', 'judge-2');
    const keyTenantB = buildViewFilterKey('penilaian_hakim', 'tenant-b', 'judge-1');

    writeViewFilters(keyJudge1, { branchFilter: 'Marhalah Mutawassithah', statusFilter: 'Menunggu' }, store);
    writeViewFilters(keyTenantB, { branchFilter: 'Tilawah Dewasa Putra', statusFilter: 'Final' }, store);

    const read1 = readViewFilters(keyJudge1, defaults, store);
    const read2 = readViewFilters(keyJudge2, defaults, store);
    const readB = readViewFilters(keyTenantB, defaults, store);

    expect(
      read1.branchFilter === 'Marhalah Mutawassithah' && read1.statusFilter === 'Menunggu',
      `judge-1 harus membaca filternya sendiri: ${JSON.stringify(read1)}`
    );
    expect(
      read2.branchFilter === 'Semua Cabang' && read2.statusFilter === 'Semua Status',
      `judge-2 harus tetap default: ${JSON.stringify(read2)}`
    );
    expect(
      readB.branchFilter === 'Tilawah Dewasa Putra' && readB.statusFilter === 'Final',
      `tenant-b tidak boleh tertukar dengan tenant-a: ${JSON.stringify(readB)}`
    );
  });

  check('FLT-02. JSON rusak atau field asing diabaikan dengan aman dan fallback ke default', () => {
    const store = createMemoryStorage();
    const defaults = { selectedStage: 'Semua Babak', selectedBranch: 'Semua Cabang' };
    const keyCorrupt = buildViewFilterKey('rekap_nilai', 'tenant-a', 'admin-1');
    const keyExtra = buildViewFilterKey('rekap_nilai', 'tenant-a', 'admin-2');

    store.setItem(keyCorrupt, '{not-valid-json');
    store.setItem(
      keyExtra,
      JSON.stringify({ selectedBranch: 'Marhalah Ibtidaiyyah', selectedStage: 123, searchQuery: 'harus-diabaikan' })
    );

    const corruptRes = readViewFilters(keyCorrupt, defaults, store);
    const extraRes = readViewFilters(keyExtra, defaults, store);

    expect(
      corruptRes.selectedStage === 'Semua Babak' && corruptRes.selectedBranch === 'Semua Cabang',
      `JSON rusak harus fallback ke default: ${JSON.stringify(corruptRes)}`
    );
    expect(
      extraRes.selectedBranch === 'Marhalah Ibtidaiyyah' &&
        extraRes.selectedStage === 'Semua Babak' &&
        !('searchQuery' in extraRes),
      `field asing & tipe salah harus disaring: ${JSON.stringify(extraRes)}`
    );
  });

  // ---------------------------------------------------------------------------
  // Isolasi snapshot juara/podium antar cabang dengan nama babak sama ("Final")
  // ---------------------------------------------------------------------------
  check('MC-14. Snapshot podium Final Cabang 2 tidak pernah meminjam snapshot Final Cabang 1', () => {
    const snapshots = [
      {
        id: 'snap-cab1',
        tenantId: TENANT,
        stageId: 'st-final-cab1',
        stageName: 'Final',
        branchId: 'br-cab1',
        branchName: 'Marhalah Ibtidaiyyah',
        rankings: [{ participantName: 'Juara Cabang 1' }]
      },
      {
        id: 'snap-cab2',
        tenantId: TENANT,
        stageId: 'st-final-cab2',
        stageName: 'Final',
        branchId: 'br-cab2',
        branchName: 'Marhalah Mutawassithah',
        rankings: [{ participantName: 'Juara Cabang 2' }]
      }
    ];

    const stageCab2 = {
      id: 'st-final-cab2',
      tenantId: TENANT,
      name: 'Final',
      branchId: 'br-cab2',
      branchName: 'Marhalah Mutawassithah'
    };

    const resolved = resolveSnapshotForStage(snapshots, {
      tenantId: TENANT,
      stage: stageCab2,
      branchName: 'Marhalah Mutawassithah'
    });
    expect(resolved?.id === 'snap-cab2', `harus snap-cab2, dapat ${resolved?.id}`);
  });

  check('MC-15. Jika snapshot Final Cabang 2 belum termuat, tetap undefined (tidak bocor ke Cabang 1)', () => {
    const onlyBranch1Snapshot = [
      {
        id: 'snap-cab1',
        tenantId: TENANT,
        stageId: 'st-final-cab1',
        stageName: 'Final',
        branchId: 'br-cab1',
        branchName: 'Marhalah Ibtidaiyyah'
      }
    ];
    const stageCab2 = {
      id: 'st-final-cab2',
      tenantId: TENANT,
      name: 'Final',
      branchId: 'br-cab2',
      branchName: 'Marhalah Mutawassithah'
    };

    const resolved = resolveSnapshotForStage(onlyBranch1Snapshot, {
      tenantId: TENANT,
      stage: stageCab2,
      branchName: 'Marhalah Mutawassithah'
    });
    expect(resolved === undefined, `harus undefined agar podium fallback ke ranking cabang 2, dapat ${resolved?.id}`);
  });

  // ---------------------------------------------------------------------------
  // Guard Superadmin: mendarat di platform saat login & blokir tenant Nonaktif
  // ---------------------------------------------------------------------------
  check('SA-01. Superadmin tanpa sesi supervisi sah selalu diarahkan ke platform, bukan tenant sisa sesi sebelumnya', () => {
    const staleTenantId = '11111111-1111-4111-8111-111111111111';
    const afterAdminLogout = resolveSuperadminTargetTenant({
      currentTenantId: staleTenantId,
      activeSupervisedTenantId: null
    });
    expect(afterAdminLogout === 'platform', `harus 'platform', dapat ${afterAdminLogout}`);

    const legitimateSupervision = resolveSuperadminTargetTenant({
      currentTenantId: staleTenantId,
      activeSupervisedTenantId: staleTenantId
    });
    expect(
      legitimateSupervision === staleTenantId,
      `supervisi sah harus dipertahankan, dapat ${legitimateSupervision}`
    );
  });

  check('SA-02. Tenant Nonaktif (Arsip) ditolak supervisi & tersembunyi pada filter default Aktif', () => {
    const sampleTenants = [
      { id: 't-1', name: 'LPTQ Jabar', code: 'JBR', eventName: 'MTQ 2026', region: 'Jawa Barat', status: 'Aktif' as const },
      { id: 't-2', name: 'LPTQ Arsip', code: 'ARS', eventName: 'MTQ 2024', region: 'Jawa Tengah', status: 'Nonaktif' as const }
    ];

    expect(canSuperviseTenant(sampleTenants[0]).allowed === true, 'tenant Aktif harus boleh disupervisi');
    expect(canSuperviseTenant(sampleTenants[1]).allowed === false, 'tenant Nonaktif harus ditolak supervisi');

    const activeOnly = filterTenantsForManagement(sampleTenants, { statusFilter: 'Aktif' });
    const archivedOnly = filterTenantsForManagement(sampleTenants, { statusFilter: 'Nonaktif' });
    const allTenants = filterTenantsForManagement(sampleTenants, { statusFilter: 'Semua' });

    expect(activeOnly.length === 1 && activeOnly[0].id === 't-1', `filter Aktif salah: ${JSON.stringify(activeOnly)}`);
    expect(archivedOnly.length === 1 && archivedOnly[0].id === 't-2', `filter Nonaktif salah: ${JSON.stringify(archivedOnly)}`);
    expect(allTenants.length === 2, `filter Semua harus 2, dapat ${allTenants.length}`);
  });

  check('UA-01. Kolom Penugasan di Manajemen Akun memakai penugasan hakim sebenarnya, bukan teks bawaan', () => {
    const base = { tenantId: 't-1', judgeName: 'Hakim A', judgeField: 'Tajwid' };
    const assignments = [
      { ...base, id: 'a1', judgeId: 'j-1', stageId: 's-final', stageName: 'Final', branchName: 'Marhalah Ibtidaiyyah Karawang', rubricFieldName: 'Tajwid' },
      { ...base, id: 'a2', judgeId: 'j-1', stageId: 's-pen', stageName: 'Penyisihan', branchName: 'Marhalah Ibtidaiyyah Karawang', rubricFieldName: 'Tajwid' },
      // duplikat persis harus dibuang
      { ...base, id: 'a3', judgeId: 'j-1', stageId: 's-pen', stageName: 'Penyisihan', branchName: 'Marhalah Ibtidaiyyah Karawang', rubricFieldName: 'Tajwid' },
      // penugasan Nonaktif dan milik penyelenggara lain tidak ikut
      { ...base, id: 'a4', judgeId: 'j-1', stageName: 'Final', branchName: 'Tilawah Dewasa', status: 'Nonaktif' as const },
      { ...base, id: 'a5', judgeId: 'j-1', tenantId: 't-2', stageName: 'Final', branchName: 'Tilawah Dewasa' },
      // tanpa cabang/babak = semua
      { ...base, id: 'a6', judgeId: 'j-2', stageName: '', branchName: '', judgeField: 'Lagu' }
    ];
    const order = new Map<string, number>([['s-pen', 1], ['s-final', 2]]);
    const labels = buildJudgeAssignmentLabels(assignments, 't-1', order);

    const j1 = labels.get('j-1') || [];
    expect(j1.length === 2, `hakim j-1 harus punya 2 penugasan unik, dapat ${JSON.stringify(j1)}`);
    expect(j1[0].stage === 'Penyisihan' && j1[1].stage === 'Final', `urutan babak salah: ${JSON.stringify(j1)}`);
    expect(j1.every((l) => l.branch === 'Marhalah Ibtidaiyyah Karawang'), 'cabang harus dari penugasan, bukan "Tilawah Dewasa"');

    const j2 = labels.get('j-2') || [];
    expect(j2.length === 1 && j2[0].branch === 'Semua Cabang' && j2[0].stage === 'Semua Babak' && j2[0].field === 'Lagu',
      `penugasan tanpa cabang/babak salah: ${JSON.stringify(j2)}`);

    expect(!labels.has('j-3'), 'hakim tanpa penugasan tidak boleh mendapat cabang palsu');
  });

  check('RK-01. Kolom hakim Rekap Nilai hanya dari penugasan aktif (tanpa admin, hakim tak ditugaskan, atau bidang akun)', () => {
    const users = [
      { id: 'adm', name: 'Admin Satu', role: 'admin' },
      { id: 'j-itqon', name: 'Hakim Itqon', role: 'judge', judgeField: 'Tajwid' },
      { id: 'j-dua', name: 'Hakim Dua Bidang', role: 'judge', judgeField: 'Tajwid' },
      { id: 'j-free1', name: 'Hakim Belum Tugas 1', role: 'judge', judgeField: 'Tajwid' },
      { id: 'j-free2', name: 'Hakim Belum Tugas 2', role: 'judge', judgeField: 'Tajwid' }
    ];
    const participants = [
      { id: 'p1', tenantId: 't-1', stageName: 'Penyisihan', branchName: 'Marhalah Ibtidaiyyah Karawang' }
    ];
    const base = { tenantId: 't-1', stageName: 'Penyisihan', branchName: 'Marhalah Ibtidaiyyah Karawang' };

    // Kasus 1: belum ada penugasan sama sekali -> tidak ada kolom (bukan admin / akun sembarang)
    const none = resolveRekapJudgeColumns({
      tenantId: 't-1', selectedStage: 'Semua Babak', selectedBranch: 'Semua Cabang',
      assignments: [], assessments: [], participants, users
    });
    expect(none.length === 0, `tanpa penugasan harus 0 kolom, dapat ${JSON.stringify(none)}`);

    // Kasus 3 & 4: hanya hakim yang ditugaskan; bidang dari penugasan (Itqon), bukan bidang akun (Tajwid)
    const assignments = [
      { ...base, id: 'a1', judgeId: 'j-itqon', judgeName: 'Hakim Itqon', judgeField: 'Itqon', rubricFieldId: 'f-itqon' },
      { ...base, id: 'a2', judgeId: 'j-dua', judgeName: 'Hakim Dua Bidang', judgeField: 'Tajwid' },
      { ...base, id: 'a3', judgeId: 'j-dua', judgeName: 'Hakim Dua Bidang', judgeField: 'Lagu' },
      { ...base, id: 'a4', judgeId: 'j-free1', judgeName: 'Hakim Belum Tugas 1', judgeField: 'Tajwid', status: 'Nonaktif' as const },
      { ...base, id: 'a5', judgeId: 'j-free2', judgeName: 'x', judgeField: 'Tajwid', tenantId: 't-2' }
    ];
    const cols = resolveRekapJudgeColumns({
      tenantId: 't-1', selectedStage: 'Semua Babak', selectedBranch: 'Semua Cabang',
      assignments, assessments: [], participants, users,
      rubricFieldNameById: new Map([['f-itqon', 'Itqon']])
    });
    expect(cols.map((c) => c.id).join(',') === 'j-itqon,j-dua', `kolom salah: ${JSON.stringify(cols)}`);
    expect(cols[0].field === 'Itqon', `bidang hakim Itqon salah: ${cols[0].field}`);
    expect(cols[1].field === 'Tajwid, Lagu', `hakim dua bidang harus "Tajwid, Lagu", dapat ${cols[1].field}`);
    expect(cols.every((c) => !c.isUnassigned), 'hakim aktif tidak boleh bertanda dicabut');

    // Filter babak lain tanpa penugasan -> tidak ada kolom (tidak jatuh ke semua hakim)
    const otherStage = resolveRekapJudgeColumns({
      tenantId: 't-1', selectedStage: 'Final', selectedBranch: 'Semua Cabang',
      assignments, assessments: [], participants, users
    });
    expect(otherStage.length === 0, `babak tanpa penugasan harus 0 kolom, dapat ${JSON.stringify(otherStage)}`);
  });

  check('RK-02. Hakim yang dicabut: tetap tampil (ditandai) bila sudah menilai, hilang bila belum menilai', () => {
    const users = [
      { id: 'j-a', name: 'Hakim Aktif', role: 'judge' },
      { id: 'j-dicabut-nilai', name: 'Hakim Dicabut Sudah Menilai', role: 'judge' },
      { id: 'j-dicabut-kosong', name: 'Hakim Dicabut Belum Menilai', role: 'judge' }
    ];
    const participants = [
      { id: 'p1', tenantId: 't-1', stageName: 'Penyisihan', branchName: 'Cabang A' },
      { id: 'p2', tenantId: 't-1', stageName: 'Penyisihan', branchName: 'Cabang B' }
    ];
    const assignments = [
      { id: 'a1', tenantId: 't-1', judgeId: 'j-a', judgeName: 'Hakim Aktif', stageName: 'Penyisihan', branchName: 'Cabang A', judgeField: 'Tajwid' }
    ];
    const assessments = [
      { tenantId: 't-1', participantId: 'p1', judgeId: 'j-dicabut-nilai', judgeName: 'Hakim Dicabut Sudah Menilai', judgeField: 'Lagu', stageName: 'Penyisihan' }
    ];

    const colsA = resolveRekapJudgeColumns({
      tenantId: 't-1', selectedStage: 'Penyisihan', selectedBranch: 'Cabang A',
      assignments, assessments, participants, users
    });
    expect(colsA.map((c) => c.id).join(',') === 'j-a,j-dicabut-nilai', `kolom Cabang A salah: ${JSON.stringify(colsA)}`);
    const former = colsA[1];
    expect(former.isUnassigned === true && former.field === 'Lagu', `hakim dicabut harus ditandai dengan bidang Lagu: ${JSON.stringify(former)}`);
    expect(!colsA.some((c) => c.id === 'j-dicabut-kosong'), 'hakim dicabut yang belum menilai tidak boleh tampil');

    // Di Cabang B, hakim dicabut tidak punya nilai -> tidak tampil
    const colsB = resolveRekapJudgeColumns({
      tenantId: 't-1', selectedStage: 'Penyisihan', selectedBranch: 'Cabang B',
      assignments, assessments, participants, users
    });
    expect(!colsB.some((c) => c.id === 'j-dicabut-nilai'), `hakim dicabut tidak boleh tampil di cabang tanpa nilainya: ${JSON.stringify(colsB)}`);
  });

  check('EG-01. Realtime status peserta diterapkan per baris; perubahan berat tetap muat ulang penuh', () => {
    const base = {
      tenantId: 't-1', stageName: 'Penyisihan', branchName: 'Cabang A', questionId: '', assignedMaqra: 'MQ',
      pageNumber: 1, assignedQuestions: [{ id: 'am-1', questionId: 'q-1', title: 'MQ', pageNumber: 1 }]
    };
    const sps = [
      { ...base, id: '11111111-1111-4111-8111-000000000001', participantId: 'p-1', stageId: 's-1', lotteryNumber: '3', status: 'Belum Dimulai' as const },
      { ...base, id: '11111111-1111-4111-8111-000000000002', participantId: 'p-2', stageId: 's-1', lotteryNumber: '4', status: 'Belum Dimulai' as const }
    ] as any[];
    const row = {
      id: '11111111-1111-4111-8111-000000000001', participant_id: 'p-1', stage_id: 's-1', lottery_number: '3',
      status: 'Berlangsung', provisional_score: 88.5, rank: null, champion_rank: null, champion_title: null,
      is_qualified: false, final_score: null, finalized_at: null
    };

    const ok = applyStageParticipationRealtimeUpdate(sps, 'UPDATE', row);
    expect(ok.applied === true, 'perubahan status harus diterapkan per baris');
    expect(ok.next[0].status === 'Berlangsung' && ok.next[0].provisionalScore === 88.5, `baris tidak berubah: ${JSON.stringify(ok.next[0])}`);
    expect((ok.next[0].assignedQuestions?.length ?? 0) === 1, 'maqra peserta tidak boleh hilang');
    expect(ok.next[1] === sps[1], 'peserta lain tidak boleh tersentuh');

    const undian = applyStageParticipationRealtimeUpdate(sps, 'UPDATE', { ...row, lottery_number: '9' });
    expect(undian.applied === false, 'perubahan nomor undian harus memicu muat ulang penuh');
    const lolos = applyStageParticipationRealtimeUpdate(sps, 'UPDATE', { ...row, is_qualified: true, rank: 1 });
    expect(lolos.applied === false, 'perubahan kelulusan/peringkat harus memicu muat ulang penuh');
    const baru = applyStageParticipationRealtimeUpdate(sps, 'INSERT', row);
    expect(baru.applied === false, 'baris baru harus memicu muat ulang penuh');
    const asing = applyStageParticipationRealtimeUpdate(sps, 'UPDATE', { ...row, id: '11111111-1111-4111-8111-000000000099' });
    expect(asing.applied === false, 'baris yang belum dikenal perangkat harus memicu muat ulang penuh');
  });

  check('EG-02. Coretan yang sudah diunduh tidak hilang saat data dimuat ulang tanpa coretan', () => {
    const stroke = { id: 's-1', tool: 'pen' as const, color: '#f00', size: 2, page: 1, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] };
    const base: any = { tenantId: 't', stageParticipationId: 'sp', stageId: 's', stageName: 'P', participantId: 'p', judgeId: 'j', judgeName: 'J', judgeField: 'Tajwid', status: 'in_progress', errorCounts: {}, deductions: {}, totalDeductions: 0, finalScore: 100, lastUpdated: '' };
    const prev = [{ ...base, id: 'a-1', annotations: [stroke], annotationCount: 1, annotationsLoaded: true }];

    const sama = carryOverLoadedAnnotations([{ ...base, id: 'a-1', annotations: [], annotationCount: 1, annotationsLoaded: false }], prev);
    expect(sama[0].annotationsLoaded === true && sama[0].annotations.length === 1, 'coretan dengan jumlah sama harus dibawa');

    const berubah = carryOverLoadedAnnotations([{ ...base, id: 'a-1', annotations: [], annotationCount: 3, annotationsLoaded: false }], prev);
    expect(berubah[0].annotationsLoaded === false, 'jumlah coretan berbeda (diubah di perangkat lain) harus diunduh ulang');

    const tanpaJumlah = carryOverLoadedAnnotations([{ ...base, id: 'a-1', annotations: [], annotationCount: undefined, annotationsLoaded: false }], prev);
    expect(tanpaJumlah[0].annotationsLoaded === true && tanpaJumlah[0].annotations.length === 1, 'jumlah tidak diketahui: pakai coretan di perangkat');

    const baru = carryOverLoadedAnnotations([{ ...base, id: 'a-2', annotations: [], annotationCount: 2, annotationsLoaded: false }], prev);
    expect(baru[0].annotationsLoaded === false, 'lembar yang belum pernah diunduh tetap ditandai belum termuat');
  });

  const passed = results.filter((r) => r.success).length;
  return { passed, failed: results.length - passed, results };
}
