import { toDeterministicUuid } from '../utils/uuid';

/**
 * Resolusi babak yang sadar cabang.
 *
 * Setiap cabang lomba memiliki babaknya sendiri, dan nama babak ("Penyisihan",
 * "Final") berulang di tiap cabang. Mencari babak hanya dari nama akan selalu
 * mengembalikan babak milik cabang pertama, sehingga peserta dan hakim cabang lain
 * tersimpan ke babak yang salah. Semua pencarian babak wajib lewat fungsi ini.
 */

export interface StageLike {
  id: string;
  tenantId?: string;
  name: string;
  branchId?: string;
  branchName?: string;
}

export interface StageLookup {
  tenantId: string;
  stageName?: string;
  stageId?: string;
  branchId?: string;
  branchName?: string;
}

const GENERIC_BRANCH_LABEL = 'semua cabang';

const clean = (value?: string | null): string => (value || '').trim();

function sameId(a?: string, b?: string): boolean {
  const left = clean(a);
  const right = clean(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return toDeterministicUuid(left) === toDeterministicUuid(right);
}

/** Babak tanpa cabang berlaku untuk semua cabang. */
export function isGenericStage(stage: StageLike): boolean {
  const branchName = clean(stage.branchName).toLowerCase();
  return !clean(stage.branchId) && (!branchName || branchName === GENERIC_BRANCH_LABEL);
}

/** Benar bila babak memang milik cabang yang dimaksud (cocok ID, atau nama persis). */
export function stageBelongsToBranch(
  stage: StageLike,
  branch: { branchId?: string; branchName?: string }
): boolean {
  if (clean(stage.branchId) && clean(branch.branchId)) {
    return sameId(stage.branchId, branch.branchId);
  }
  const stageBranch = clean(stage.branchName).toLowerCase();
  const targetBranch = clean(branch.branchName).toLowerCase();
  return Boolean(stageBranch && targetBranch && stageBranch === targetBranch);
}

/**
 * Mengembalikan babak yang sah untuk cabang tersebut, atau undefined bila cabang itu
 * belum punya babak dengan nama yang diminta.
 *
 * Urutan: (1) stageId, asalkan babaknya milik cabang itu atau babak umum;
 * (2) nama babak + cabang yang sama; (3) babak umum tanpa cabang bernama sama.
 * Tidak pernah jatuh ke babak milik cabang lain.
 */
export function resolveStageForBranch<T extends StageLike>(stages: T[], lookup: StageLookup): T | undefined {
  const tenantStages = stages.filter((s) => !s.tenantId || s.tenantId === lookup.tenantId);
  const branch = { branchId: lookup.branchId, branchName: lookup.branchName };
  const hasBranch = Boolean(clean(lookup.branchId) || clean(lookup.branchName));

  if (clean(lookup.stageId)) {
    const byId = tenantStages.find((s) => sameId(s.id, lookup.stageId));
    const nameAgrees = !clean(lookup.stageName) || clean(byId?.name) === clean(lookup.stageName);
    if (byId && nameAgrees && (!hasBranch || isGenericStage(byId) || stageBelongsToBranch(byId, branch))) {
      return byId;
    }
  }

  const stageName = clean(lookup.stageName);
  if (!stageName) return undefined;
  const named = tenantStages.filter((s) => clean(s.name) === stageName);

  if (hasBranch) {
    const sameBranch = named.find((s) => stageBelongsToBranch(s, branch));
    if (sameBranch) return sameBranch;
  }

  const generic = named.find((s) => isGenericStage(s));
  if (generic) return generic;

  // Tanpa informasi cabang sama sekali, nama hanya boleh dipakai bila tidak ambigu.
  if (!hasBranch && named.length === 1) return named[0];

  return undefined;
}

/**
 * Sama seperti resolveStageForBranch, tetapi bila tidak ada babak yang sah dan
 * `allowLegacyFallback` aktif, mengembalikan babak pertama bernama sama. Hanya untuk
 * Mode Demo/lokal yang datanya memang hanya punya babak di satu cabang. Mode live
 * tidak boleh memakai fallback ini.
 */
export function resolveStageWithLegacyFallback<T extends StageLike>(
  stages: T[],
  lookup: StageLookup,
  allowLegacyFallback: boolean
): T | undefined {
  const exact = resolveStageForBranch(stages, lookup);
  if (exact || !allowLegacyFallback) return exact;
  const stageName = clean(lookup.stageName);
  return stages.find((s) => (!s.tenantId || s.tenantId === lookup.tenantId) && clean(s.name) === stageName);
}

export function missingStageMessage(stageName: string, branchName?: string): string {
  const branchLabel = clean(branchName) ? `Cabang "${clean(branchName)}"` : 'Cabang ini';
  return `${branchLabel} belum memiliki babak "${stageName}". Buat babak tersebut untuk cabang ini di menu Babak & Kelulusan terlebih dahulu.`;
}
