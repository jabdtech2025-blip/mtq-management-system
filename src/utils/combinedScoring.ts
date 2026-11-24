import { CombinedScoringConfig, CompetitionStage, StageResultSnapshot } from '../types/mtq';
import { toDeterministicUuid } from './uuid';

/**
 * NILAI JUARA GABUNGAN
 * Babak setelah Penyisihan boleh memakai gabungan nilai beberapa babak, mis. Penyisihan x1 + Final x2.
 * Nilai gabungan = jumlah (nilai babak x bobot) / jumlah bobot, sehingga tetap berskala 100.
 * Nilai babak sebelumnya diambil dari snapshot hasil resmi (sudah disahkan) babak tersebut.
 * Logika ini identik dengan fungsi server compute_stage_rankings (migrasi 20261126).
 */

const sameId = (a?: string, b?: string) =>
  Boolean(a && b) && (a === b || toDeterministicUuid(a!) === toDeterministicUuid(b!));

export const COMBINED_WEIGHT_MAX = 100;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Bobot sah: angka > 0, maksimal 100, paling banyak 2 angka desimal. */
export function isValidCombinedWeight(weight: unknown): boolean {
  const n = Number(weight);
  return Number.isFinite(n) && n > 0 && n <= COMBINED_WEIGHT_MAX && round2(n) === n;
}

/** Membaca konfigurasi dari database (snake_case) atau state (camelCase). null = tidak memakai nilai gabungan. */
export function normalizeCombinedScoring(raw: unknown): CombinedScoringConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const rawSources = Array.isArray(obj.sources) ? (obj.sources as Array<Record<string, unknown>>) : [];
  const seen = new Set<string>();
  const sources = rawSources
    .map((s) => ({
      stageId: String(s?.stageId ?? s?.stage_id ?? '').trim(),
      weight: Number(s?.weight)
    }))
    .filter((s) => {
      if (!s.stageId || !isValidCombinedWeight(s.weight)) return false;
      const key = toDeterministicUuid(s.stageId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (sources.length === 0) return null;
  const selfWeightRaw = Number(obj.selfWeight ?? obj.self_weight ?? 1);
  const selfWeight = isValidCombinedWeight(selfWeightRaw) ? selfWeightRaw : 1;
  return { selfWeight, sources };
}

/** Bentuk yang disimpan di kolom stages.combined_scoring. */
export function toDbCombinedScoring(
  config: CombinedScoringConfig | null | undefined,
  mapId: (id: string) => string = (id) => id
): Record<string, unknown> | null {
  const norm = normalizeCombinedScoring(config);
  if (!norm) return null;
  return {
    self_weight: norm.selfWeight,
    sources: norm.sources.map((s) => ({ stage_id: mapId(s.stageId), weight: s.weight }))
  };
}

/** Babak yang boleh dipilih sebagai sumber nilai: cabang sama, urutan lebih awal. */
export function eligibleCombinedSourceStages(
  stage: Pick<CompetitionStage, 'id' | 'tenantId' | 'order' | 'branchId' | 'branchName'>,
  stages: CompetitionStage[]
): CompetitionStage[] {
  const isGeneric = (s: Pick<CompetitionStage, 'branchId' | 'branchName'>) =>
    !s.branchId && (!s.branchName || s.branchName === 'Semua Cabang');
  return stages
    .filter((s) => {
      if (s.tenantId !== stage.tenantId || sameId(s.id, stage.id)) return false;
      if ((s.order || 0) >= (stage.order || 0)) return false;
      if (isGeneric(stage)) return isGeneric(s);
      if (stage.branchId && s.branchId) return sameId(s.branchId, stage.branchId);
      return Boolean(stage.branchName) && s.branchName === stage.branchName;
    })
    .sort((a, b) => a.order - b.order);
}

const formatWeight = (n: number) => String(round2(n)).replace('.', ',');

/** Teks rumus, mis. "(Penyisihan×1 + Final×2) ÷ 3". */
export function formatCombinedFormula(
  parts: Array<{ stageName: string; weight: number }>
): string {
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  return `(${parts.map((p) => `${p.stageName}×${formatWeight(p.weight)}`).join(' + ')}) ÷ ${formatWeight(total)}`;
}

export interface CombinedScoringSource {
  stageId: string;
  stageName: string;
  order: number;
  weight: number;
  /** Babak sumber sudah disahkan (ada snapshot resmi). */
  ratified: boolean;
  /** Snapshot ada tetapi daftar peringkatnya belum diunduh (hemat egress). */
  snapshotId?: string;
  rankingsLoaded: boolean;
  /** participantId (dan bentuk uuid-nya) -> nilai babak itu sendiri */
  scores: Map<string, number>;
}

export interface CombinedScoringContext {
  stageId: string;
  stageName: string;
  selfWeight: number;
  sources: CombinedScoringSource[];
  /** Nama babak sumber yang belum disahkan: pengesahan babak ini diblokir. */
  pendingStageNames: string[];
  /** Snapshot sumber yang daftar peringkatnya masih perlu diunduh. */
  snapshotIdsToLoad: string[];
  formula: string;
}

export interface CombinedScoreComponent {
  stageId: string;
  stageName: string;
  weight: number;
  score: number | null;
  /** Peserta tidak punya nilai di babak sumber (dihitung 0). */
  missing: boolean;
  isCurrent?: boolean;
}

/** Nilai babak itu sendiri di snapshot (snapshot lama tanpa stageScore memakai totalScore). */
function snapshotOwnScore(entry: Record<string, unknown>): number | null {
  const candidates = [entry.stageScore, entry.stage_score, entry.totalScore, entry.final_score];
  for (const c of candidates) {
    if (c === null || c === undefined || c === '') continue;
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Menyiapkan konteks nilai gabungan untuk satu babak. Mengembalikan null bila babak tidak memakai nilai gabungan.
 */
export function buildCombinedScoringContext(params: {
  stage: CompetitionStage | undefined | null;
  stages: CompetitionStage[];
  snapshots: StageResultSnapshot[];
}): CombinedScoringContext | null {
  const { stage, stages, snapshots } = params;
  if (!stage) return null;
  const config = normalizeCombinedScoring(stage.combinedScoring);
  if (!config) return null;

  const sources: CombinedScoringSource[] = [];
  config.sources.forEach((src) => {
    const srcStage = stages.find((s) => s.tenantId === stage.tenantId && sameId(s.id, src.stageId));
    if (!srcStage) return; // babak sumber sudah dihapus: diabaikan (sama dengan server)
    const snap = snapshots.find((s) => s.tenantId === stage.tenantId && sameId(s.stageId, srcStage.id));
    const scores = new Map<string, number>();
    const rankingsLoaded = Boolean(snap) && snap!.rankingsLoaded !== false;
    if (snap && rankingsLoaded) {
      (snap.rankings || []).forEach((entry) => {
        const raw = entry as unknown as Record<string, unknown>;
        const pid = String(raw.participantId ?? raw.participant_id ?? '');
        const score = snapshotOwnScore(raw);
        if (!pid || score === null) return;
        scores.set(pid, score);
        scores.set(toDeterministicUuid(pid), score);
      });
    }
    sources.push({
      stageId: srcStage.id,
      stageName: srcStage.name,
      order: srcStage.order,
      weight: src.weight,
      ratified: Boolean(snap),
      snapshotId: snap?.id,
      rankingsLoaded: Boolean(snap) && rankingsLoaded,
      scores
    });
  });
  if (sources.length === 0) return null;
  sources.sort((a, b) => a.order - b.order);

  return {
    stageId: stage.id,
    stageName: stage.name,
    selfWeight: config.selfWeight,
    sources,
    pendingStageNames: sources.filter((s) => !s.ratified).map((s) => s.stageName),
    snapshotIdsToLoad: sources
      .filter((s) => s.snapshotId && !s.rankingsLoaded)
      .map((s) => s.snapshotId as string),
    formula: formatCombinedFormula([
      ...sources.map((s) => ({ stageName: s.stageName, weight: s.weight })),
      { stageName: stage.name, weight: config.selfWeight }
    ])
  };
}

/** true bila daftar peringkat babak sumber belum lengkap diunduh (nilai gabungan belum bisa dihitung). */
export function isCombinedContextLoading(ctx: CombinedScoringContext | null | undefined): boolean {
  return Boolean(ctx && ctx.sources.some((s) => s.ratified && !s.rankingsLoaded));
}

/**
 * Nilai gabungan satu peserta. Peserta tanpa nilai di babak sumber dihitung 0 dan ditandai `missing`.
 * Bila nilai babak ini belum ada, nilai gabungan juga belum ada.
 */
export function computeCombinedScore(
  ctx: CombinedScoringContext,
  participantId: string,
  stageScore: number | null
): { combined: number | null; components: CombinedScoreComponent[]; missing: boolean } {
  let weighted = 0;
  let totalWeight = 0;
  let missing = false;
  const components: CombinedScoreComponent[] = ctx.sources.map((src) => {
    const score = src.scores.get(participantId) ?? src.scores.get(toDeterministicUuid(participantId)) ?? null;
    if (score === null) missing = true;
    weighted += (score ?? 0) * src.weight;
    totalWeight += src.weight;
    return { stageId: src.stageId, stageName: src.stageName, weight: src.weight, score, missing: score === null };
  });
  components.push({
    stageId: ctx.stageId,
    stageName: ctx.stageName,
    weight: ctx.selfWeight,
    score: stageScore,
    missing: stageScore === null,
    isCurrent: true
  });
  if (stageScore === null) return { combined: null, components, missing };
  weighted += stageScore * ctx.selfWeight;
  totalWeight += ctx.selfWeight;
  return { combined: round2(weighted / totalWeight), components, missing };
}
