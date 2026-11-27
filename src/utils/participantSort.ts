/**
 * Urutan peserta yang konsisten di seluruh aplikasi.
 *
 * Nomor undian berlaku per cabang, jadi daftar lintas cabang dikelompokkan dulu per
 * cabang dan babak, baru diurutkan dengan nomor undian (sebagai angka: 2 sebelum 10).
 * Peserta tanpa nomor undian ditaruh di akhir kelompoknya; nomor sama diurutkan nama.
 */

export interface SortableParticipant {
  name: string;
  lotteryNumber?: string;
  branchName?: string;
  stageName?: string;
}

const collator = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

/** Nomor undian sebagai angka; undefined bila belum diundi atau bukan angka. */
export function lotteryNumberValue(lotteryNumber?: string): number | undefined {
  const digits = (lotteryNumber || '').trim().match(/\d+/);
  if (!digits) return undefined;
  const value = Number(digits[0]);
  return Number.isFinite(value) ? value : undefined;
}

export function compareByName(a: SortableParticipant, b: SortableParticipant): number {
  return collator.compare(a.name || '', b.name || '');
}

export function compareByLotteryNumber(a: SortableParticipant, b: SortableParticipant): number {
  const left = lotteryNumberValue(a.lotteryNumber);
  const right = lotteryNumberValue(b.lotteryNumber);
  if (left !== undefined && right !== undefined && left !== right) return left - right;
  if (left === undefined && right !== undefined) return 1;
  if (left !== undefined && right === undefined) return -1;
  return compareByName(a, b);
}

/**
 * Urutan tampil: cabang (A–Z), babak (sesuai urutan babak bila diberikan, selain itu A–Z),
 * lalu nomor undian, lalu nama.
 */
export function sortParticipantsForDisplay<T extends SortableParticipant>(
  list: readonly T[],
  options: { stageOrder?: (stageName: string, branchName?: string) => number | undefined } = {}
): T[] {
  return list.slice().sort((a, b) => {
    const branch = collator.compare(a.branchName || '', b.branchName || '');
    if (branch !== 0) return branch;
    if ((a.stageName || '') !== (b.stageName || '')) {
      const orderA = options.stageOrder?.(a.stageName || '', a.branchName);
      const orderB = options.stageOrder?.(b.stageName || '', b.branchName);
      if (orderA !== undefined && orderB !== undefined && orderA !== orderB) return orderA - orderB;
      return collator.compare(a.stageName || '', b.stageName || '');
    }
    return compareByLotteryNumber(a, b);
  });
}

/** Urutan nama A–Z (dipakai saat memilih peserta untuk ditautkan ke soal). */
export function sortParticipantsByName<T extends SortableParticipant>(list: readonly T[]): T[] {
  return list.slice().sort((a, b) => compareByName(a, b) || compareByLotteryNumber(a, b));
}

/** Pembuat fungsi urutan babak dari daftar babak (per cabang bila ada). */
export function buildStageOrderLookup(
  stages: ReadonlyArray<{ name: string; order?: number; branchName?: string }>
): (stageName: string, branchName?: string) => number | undefined {
  return (stageName, branchName) => {
    const specific = stages.find(
      (s) => s.name === stageName && (s.branchName || '').toLowerCase() === (branchName || '').toLowerCase()
    );
    const generic = specific || stages.find((s) => s.name === stageName);
    return generic?.order;
  };
}

/**
 * Nomor undian resmi hasil undian babak (disimpan per babak di stage_participations).
 * Untuk setiap peserta diambil babak dengan urutan tertinggi yang sudah punya nomor.
 */
export function resolveDrawnLotteryNumbers(
  stageParticipations: Array<{ tenantId: string; participantId: string; stageId?: string; stageName: string; lotteryNumber?: string }>,
  stages: Array<{ id: string; name: string; order?: number }>,
  tenantId: string
): Map<string, { number: string; stageName: string; order: number }> {
  const orderOf = (stageId?: string, stageName?: string) =>
    stages.find((st) => (stageId && st.id === stageId) || (!stageId && st.name === stageName))?.order ?? 0;
  const map = new Map<string, { number: string; stageName: string; order: number }>();
  stageParticipations.forEach((sp) => {
    if (sp.tenantId !== tenantId) return;
    const num = (sp.lotteryNumber || '').trim();
    if (!num) return;
    const order = orderOf(sp.stageId, sp.stageName);
    const prev = map.get(sp.participantId);
    if (!prev || order >= prev.order) map.set(sp.participantId, { number: num, stageName: sp.stageName, order });
  });
  return map;
}

/**
 * Salinan peserta untuk tampilan dengan `lotteryNumber` = nomor hasil undian babak peserta saat ini
 * (stage_participations), atau nomor pendaftaran bila babaknya belum diundi.
 *
 * Hanya untuk tampilan baca (Rekap, Monitoring, Penilaian). Jangan dipakai untuk menyimpan peserta:
 * nomor pendaftaran dan nomor hasil undian disimpan di tempat berbeda.
 */
export function applyStageLotteryNumbers<
  P extends { id: string; tenantId: string; lotteryNumber: string; stageId?: string; stageName: string }
>(
  participants: readonly P[],
  stageParticipations: ReadonlyArray<{ tenantId: string; participantId: string; stageId?: string; stageName: string; lotteryNumber?: string }>
): P[] {
  const byKey = new Map<string, string>();
  stageParticipations.forEach((sp) => {
    const num = (sp.lotteryNumber || '').trim();
    if (!num) return;
    if (sp.stageId) byKey.set(`${sp.tenantId}::${sp.participantId}::id::${sp.stageId}`, num);
    byKey.set(`${sp.tenantId}::${sp.participantId}::name::${sp.stageName}`, num);
  });
  if (byKey.size === 0) return participants as P[];
  return participants.map((p) => {
    const drawn =
      (p.stageId && byKey.get(`${p.tenantId}::${p.id}::id::${p.stageId}`)) ||
      byKey.get(`${p.tenantId}::${p.id}::name::${p.stageName}`);
    return drawn && drawn !== p.lotteryNumber ? { ...p, lotteryNumber: drawn } : p;
  });
}
