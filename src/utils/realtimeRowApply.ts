import { StageParticipation } from '../types/mtq';
import { toDeterministicUuid } from './uuid';

/**
 * Hemat egress: perubahan baris stage_participations dari realtime diterapkan langsung ke data di perangkat,
 * TANPA memuat ulang seluruh workspace di semua perangkat.
 *
 * Hanya perubahan "ringan" yang sering terjadi selama penilaian yang diterapkan per baris:
 *   - status (mis. Belum Dimulai -> Berlangsung -> Lengkap)
 *   - provisional_score (nilai sementara)
 *
 * Perubahan lain yang jarang tetapi menyentuh data turunan di tabel lain (undian nomor tampil, pindah babak,
 * peringkat/kelulusan/juara hasil pengesahan, nilai final) TETAP memakai muat ulang penuh agar semua tampilan
 * ikut benar. INSERT/DELETE juga tetap muat ulang penuh.
 */
export function applyStageParticipationRealtimeUpdate(
  list: StageParticipation[],
  eventType: string,
  row: Record<string, unknown> | undefined
): { applied: boolean; next: StageParticipation[] } {
  if (eventType !== 'UPDATE' || !row || !row.id) return { applied: false, next: list };
  const rowId = String(row.id);
  const matches = list.filter((sp) => sp.id === rowId || toDeterministicUuid(sp.id) === rowId);
  if (matches.length === 0) return { applied: false, next: list };

  const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const numOrUndef = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Number(v));

  for (const sp of matches) {
    // Kolom berat: bila berbeda dari yang ada di perangkat, serahkan ke muat ulang penuh
    if (row.participant_id !== undefined && str(row.participant_id) !== sp.participantId && str(row.participant_id) !== toDeterministicUuid(sp.participantId)) {
      return { applied: false, next: list };
    }
    if (row.stage_id !== undefined && str(row.stage_id) !== sp.stageId && str(row.stage_id) !== toDeterministicUuid(sp.stageId)) {
      return { applied: false, next: list };
    }
    if (row.lottery_number !== undefined && str(row.lottery_number) !== str(sp.lotteryNumber)) {
      return { applied: false, next: list };
    }
    if (row.rank !== undefined && numOrUndef(row.rank) !== sp.rank) return { applied: false, next: list };
    if (row.champion_rank !== undefined && numOrUndef(row.champion_rank) !== sp.championRank) {
      return { applied: false, next: list };
    }
    if (row.champion_title !== undefined && (str(row.champion_title) || undefined) !== sp.championTitle) {
      return { applied: false, next: list };
    }
    if (row.is_qualified !== undefined && Boolean(row.is_qualified) !== Boolean(sp.isQualified)) {
      return { applied: false, next: list };
    }
    if (row.final_score !== undefined && numOrUndef(row.final_score) !== sp.finalScore) {
      return { applied: false, next: list };
    }
    if (row.finalized_at !== undefined && (str(row.finalized_at) || undefined) !== sp.finalizedAt) {
      return { applied: false, next: list };
    }
  }

  const nextStatus = row.status !== undefined && row.status !== null ? (String(row.status) as StageParticipation['status']) : undefined;
  const nextProvisional = row.provisional_score !== undefined ? numOrUndef(row.provisional_score) : undefined;
  const hasProvisional = row.provisional_score !== undefined;

  const next = list.map((sp) => {
    if (!(sp.id === rowId || toDeterministicUuid(sp.id) === rowId)) return sp;
    return {
      ...sp,
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(hasProvisional ? { provisionalScore: nextProvisional } : {})
    };
  });
  return { applied: true, next };
}
