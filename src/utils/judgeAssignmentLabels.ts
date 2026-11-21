import { JudgeAssignment } from '../types/mtq';

/** Satu baris penugasan hakim yang siap ditampilkan: bidang, cabang, dan babak. */
export interface JudgeAssignmentLabel {
  key: string;
  field: string;
  branch: string;
  stage: string;
}

/**
 * Mengelompokkan penugasan hakim aktif per hakim untuk satu penyelenggara.
 * Sumbernya tabel penugasan hakim (judge_assignments), bukan profil akun,
 * sehingga yang tampil sama dengan yang dipakai halaman penilaian.
 * Urutan: babak (sesuai urutan babak), lalu cabang, lalu bidang. Duplikat dibuang.
 */
export function buildJudgeAssignmentLabels(
  assignments: JudgeAssignment[],
  tenantId: string,
  stageOrder: Map<string, number>
): Map<string, JudgeAssignmentLabel[]> {
  const byJudge = new Map<string, JudgeAssignmentLabel[]>();
  const orderOf = (a: JudgeAssignment) =>
    (a.stageId && stageOrder.has(a.stageId) ? stageOrder.get(a.stageId) : undefined) ?? 999;

  assignments
    .filter((a) => a.tenantId === tenantId && a.status !== 'Nonaktif' && a.judgeId)
    .slice()
    .sort(
      (a, b) =>
        orderOf(a) - orderOf(b) ||
        (a.branchName || '').localeCompare(b.branchName || '', 'id') ||
        (a.rubricFieldName || a.judgeField || '').localeCompare(b.rubricFieldName || b.judgeField || '', 'id')
    )
    .forEach((a) => {
      const field = (a.rubricFieldName || a.judgeField || '').trim() || 'Bidang belum diatur';
      const branch = (a.branchName || '').trim() || 'Semua Cabang';
      const stage = (a.stageName || '').trim() || 'Semua Babak';
      const key = `${field}|${branch}|${stage}`.toLowerCase();
      const list = byJudge.get(a.judgeId) || [];
      if (!list.some((l) => l.key === key)) {
        list.push({ key, field, branch, stage });
      }
      byJudge.set(a.judgeId, list);
    });

  return byJudge;
}

/** Satu kolom hakim di halaman Rekap Nilai Real-Time. */
export interface RekapJudgeColumn {
  id: string;
  name: string;
  /** Bidang dari penugasan, dipisah koma bila lebih dari satu. */
  field: string;
  category: string;
  /** true bila penugasannya sudah dicabut, tetapi hakim ini sudah sempat menilai. */
  isUnassigned: boolean;
}

interface RekapUserLike {
  id: string;
  name: string;
  judgeCategory?: string;
}

interface RekapParticipantLike {
  id: string;
  tenantId: string;
  stageName: string;
  branchName: string;
}

interface RekapAssessmentLike {
  tenantId: string;
  participantId: string;
  judgeId: string;
  judgeName?: string;
  judgeField?: string;
  stageName: string;
}

const ALL_STAGES = 'Semua Babak';
const ALL_BRANCHES = 'Semua Cabang';

/**
 * Menentukan kolom hakim di Rekap Nilai Real-Time. Sumbernya HANYA penugasan hakim aktif
 * (sesuai filter babak dan cabang), tanpa cadangan "semua akun hakim" atau "akun sembarang".
 * Hakim yang penugasannya sudah dicabut tetap ditampilkan (ditandai) bila ia sudah memiliki
 * lembar penilaian untuk peserta dalam cakupan filter, agar nilainya tidak hilang dari rekap.
 * Hakim yang dicabut dan belum pernah menilai tidak ditampilkan.
 */
export function resolveRekapJudgeColumns(params: {
  tenantId: string;
  selectedStage: string;
  selectedBranch: string;
  assignments: JudgeAssignment[];
  assessments: RekapAssessmentLike[];
  participants: RekapParticipantLike[];
  users: RekapUserLike[];
  rubricFieldNameById?: Map<string, string>;
}): RekapJudgeColumn[] {
  const { tenantId, selectedStage, selectedBranch } = params;
  const stageFilterOn = selectedStage && selectedStage !== ALL_STAGES;
  const branchFilterOn = selectedBranch && selectedBranch !== ALL_BRANCHES;
  const userById = new Map(params.users.map((u) => [u.id, u]));

  const columns: RekapJudgeColumn[] = [];
  const fieldsByJudge = new Map<string, string[]>();

  params.assignments.forEach((a) => {
    if (a.tenantId !== tenantId || a.status === 'Nonaktif' || !a.judgeId) return;
    if (stageFilterOn && a.stageName !== selectedStage) return;
    const branch = (a.branchName || '').trim();
    if (branchFilterOn && branch && branch !== ALL_BRANCHES && branch !== selectedBranch) return;

    const field =
      (a.rubricFieldId && params.rubricFieldNameById?.get(a.rubricFieldId)) ||
      (a.rubricFieldName || a.judgeField || '').trim() ||
      'Bidang belum diatur';

    if (!fieldsByJudge.has(a.judgeId)) {
      fieldsByJudge.set(a.judgeId, []);
      const user = userById.get(a.judgeId);
      columns.push({
        id: a.judgeId,
        name: user?.name || a.judgeName || 'Dewan Hakim',
        field: '',
        category: user?.judgeCategory || 'Hakim',
        isUnassigned: false
      });
    }
    const list = fieldsByJudge.get(a.judgeId)!;
    if (!list.includes(field)) list.push(field);
  });

  columns.forEach((c) => {
    c.field = (fieldsByJudge.get(c.id) || []).join(', ');
  });

  // Peserta dalam cakupan filter babak & cabang (tanpa filter pencarian/status)
  const scopeKeys = new Set(
    params.participants
      .filter(
        (p) =>
          p.tenantId === tenantId &&
          (!stageFilterOn || p.stageName === selectedStage) &&
          (!branchFilterOn || p.branchName === selectedBranch)
      )
      .map((p) => `${p.id}|${p.stageName}`)
  );

  const formerFields = new Map<string, string[]>();
  const formerOrder: string[] = [];
  const formerName = new Map<string, string>();
  params.assessments.forEach((asm) => {
    if (asm.tenantId !== tenantId || !asm.judgeId || fieldsByJudge.has(asm.judgeId)) return;
    if (!scopeKeys.has(`${asm.participantId}|${asm.stageName}`)) return;
    if (!formerFields.has(asm.judgeId)) {
      formerFields.set(asm.judgeId, []);
      formerOrder.push(asm.judgeId);
      if (asm.judgeName) formerName.set(asm.judgeId, asm.judgeName);
    }
    const f = (asm.judgeField || '').trim();
    const list = formerFields.get(asm.judgeId)!;
    if (f && !list.includes(f)) list.push(f);
  });

  formerOrder.forEach((judgeId) => {
    const user = userById.get(judgeId);
    columns.push({
      id: judgeId,
      name: user?.name || formerName.get(judgeId) || 'Dewan Hakim',
      field: (formerFields.get(judgeId) || []).join(', ') || 'Bidang tidak diketahui',
      category: user?.judgeCategory || 'Hakim',
      isUnassigned: true
    });
  });

  return columns;
}
