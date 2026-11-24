import { JudgeAssessment, StageResultSnapshot } from '../types/mtq';
import { toDeterministicUuid } from './uuid';

const sameId = (a: string, b: string) => a === b || toDeterministicUuid(a) === b || a === toDeterministicUuid(b);

/**
 * Hemat egress: muat penuh workspace tidak lagi membawa coretan mushaf. Agar coretan yang SUDAH diunduh di
 * perangkat ini tidak hilang setiap kali data dimuat ulang, coretan lama dibawa ke data baru selama jumlahnya
 * masih sama dengan jumlah di database (annotation_count). Bila jumlahnya berbeda (lembar diubah di perangkat
 * lain), lembar tetap ditandai "belum termuat" sehingga coretan terbaru diunduh ulang saat lembar dibuka.
 */
export function carryOverLoadedAnnotations(
  incoming: JudgeAssessment[],
  previous: JudgeAssessment[]
): JudgeAssessment[] {
  if (previous.length === 0) return incoming;
  return incoming.map((a) => {
    if (a.annotationsLoaded !== false) return a;
    const prev = previous.find((p) => sameId(p.id, a.id));
    if (!prev || prev.annotationsLoaded === false) return a;
    const prevList = prev.annotations || [];
    // Jumlah di database tidak diketahui: pakai coretan yang sudah ada di perangkat
    if (a.annotationCount !== undefined && prevList.length !== a.annotationCount) return a;
    return { ...a, annotations: prevList, annotationCount: prevList.length, annotationsLoaded: true };
  });
}

/** Snapshot hasil babak bersifat permanen: daftar peringkat yang sudah diunduh dibawa ke data baru. */
export function carryOverSnapshotRankings(
  incoming: StageResultSnapshot[],
  previous: StageResultSnapshot[]
): StageResultSnapshot[] {
  if (previous.length === 0) return incoming;
  return incoming.map((s) => {
    if (s.rankingsLoaded !== false) return s;
    const prev = previous.find((p) => p.id === s.id);
    if (!prev || prev.rankingsLoaded === false || (prev.rankings || []).length === 0) return s;
    return { ...s, rankings: prev.rankings, rankingsLoaded: true };
  });
}
