import { JudgeAssessment, JudgeAssignment, Participant, StageParticipation, User } from '../types/mtq';
import { toDeterministicUuid } from './uuid';

/** Satu lembar penilaian yang sudah dibuka/diisi hakim tetapi belum dikunci (belum "Simpan Penilaian"). */
export interface UnsavedSheetItem {
  assessmentId: string;
  participantId: string;
  participantName: string;
  lotteryNumber: string;
  /** true bila lembar belum berisi catatan kesalahan maupun coretan mushaf. */
  isEmpty: boolean;
}

/** Lembar yang belum disimpan, dikelompokkan per hakim. */
export interface UnsavedSheetsByJudge {
  judgeId: string;
  judgeName: string;
  judgeField: string;
  items: UnsavedSheetItem[];
}

export interface UnsavedSheetsSummary {
  groups: UnsavedSheetsByJudge[];
  /** Jumlah peserta unik yang punya minimal satu lembar belum disimpan. */
  participantCount: number;
  /** Jumlah lembar yang belum disimpan. */
  sheetCount: number;
}

const sameId = (a?: string, b?: string) =>
  Boolean(a && b) && (a === b || toDeterministicUuid(a!) === b || a === toDeterministicUuid(b!));

/**
 * Mencari lembar penilaian peserta di babak ini yang SUDAH dibuka hakim tetapi BELUM dikunci.
 * Nilai dari lembar seperti ini tidak ikut dihitung dalam hasil resmi, jadi admin wajib tahu sebelum mengesahkan.
 * Lembar yang tidak pernah dibuka (mis. peserta tim juri lain) tidak dihitung di sini.
 */
export function collectUnsavedSheets(params: {
  tenantId: string;
  stageId?: string;
  stageName: string;
  entries: Array<{ participant: Participant; participation?: StageParticipation }>;
  assessments: JudgeAssessment[];
  users: User[];
  judgeAssignments: JudgeAssignment[];
}): UnsavedSheetsSummary {
  const { tenantId, stageId, stageName, entries, assessments, users, judgeAssignments } = params;

  const groupsById = new Map<string, UnsavedSheetsByJudge>();
  const participantIds = new Set<string>();
  let sheetCount = 0;

  const fieldOf = (judgeId: string, fallback?: string) => {
    const fields = Array.from(
      new Set(
        judgeAssignments
          .filter(
            (ja) =>
              ja.tenantId === tenantId &&
              ja.judgeId === judgeId &&
              ja.status !== 'Nonaktif' &&
              (stageId && ja.stageId ? sameId(ja.stageId, stageId) : ja.stageName === stageName)
          )
          .map((ja) => (ja.rubricFieldName || ja.judgeField || '').trim())
          .filter(Boolean)
      )
    );
    return fields.length > 0 ? fields.join(', ') : (fallback || '').trim() || 'Bidang tidak diketahui';
  };

  entries.forEach(({ participant, participation }) => {
    const sheets = assessments.filter((a) => {
      if (a.tenantId !== tenantId) return false;
      if (a.status === 'finalized' || a.isLocked) return false;
      if (participation?.id && a.stageParticipationId) {
        return sameId(a.stageParticipationId, participation.id);
      }
      if (a.participantId !== participant.id) return false;
      if (stageId && a.stageId) return sameId(a.stageId, stageId);
      return a.stageName === stageName;
    });

    sheets.forEach((a) => {
      const user = users.find((u) => u.id === a.judgeId);
      const group =
        groupsById.get(a.judgeId) ||
        ({
          judgeId: a.judgeId,
          judgeName: user?.name || a.judgeName || 'Dewan Hakim',
          judgeField: fieldOf(a.judgeId, a.judgeField),
          items: []
        } as UnsavedSheetsByJudge);
      const hasErrors = Object.values(a.errorCounts || {}).some((n) => Number(n) > 0);
      const strokeCount = a.annotationCount ?? (a.annotations || []).length;
      group.items.push({
        assessmentId: a.id,
        participantId: participant.id,
        participantName: participant.name,
        lotteryNumber: participation?.lotteryNumber || participant.lotteryNumber || '-',
        isEmpty: !hasErrors && strokeCount === 0
      });
      groupsById.set(a.judgeId, group);
      participantIds.add(participant.id);
      sheetCount += 1;
    });
  });

  const lotteryValue = (v: string) => {
    const n = Number(String(v).replace(/[^0-9]/g, ''));
    return Number.isFinite(n) && String(v).trim() !== '' ? n : Number.MAX_SAFE_INTEGER;
  };
  const groups = Array.from(groupsById.values())
    .map((g) => ({ ...g, items: g.items.slice().sort((x, y) => lotteryValue(x.lotteryNumber) - lotteryValue(y.lotteryNumber)) }))
    .sort((a, b) => a.judgeName.localeCompare(b.judgeName, 'id'));

  return { groups, participantCount: participantIds.size, sheetCount };
}

/** Ringkasan teks untuk Log Aktivitas, mis. "Ust. A (Tajwid): #3 Ahmad, #5 Hasan; Ust. B (Itqon): #2 Zaid". */
export function formatUnsavedSheetsForLog(summary: UnsavedSheetsSummary): string {
  return summary.groups
    .map(
      (g) =>
        `${g.judgeName} (${g.judgeField}): ` +
        g.items.map((i) => `#${i.lotteryNumber} ${i.participantName}${i.isEmpty ? ' [kosong]' : ''}`).join(', ')
    )
    .join('; ');
}
