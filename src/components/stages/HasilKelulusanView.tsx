import React, { useState, useMemo, useEffect } from 'react';
import {
  Award,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Check,
  Lock,
  ChevronRight,
  Users,
  Trophy,
  X,
  FileCheck2,
  RefreshCw,
  Search
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Participant } from '../../types/mtq';
import { RankingService } from '../../services/rankingService';
import { supabaseDataService } from '../../services/supabaseDataService';
import { ConfirmDialog, Modal, Badge, Button, Select, Textarea, Input, Card } from '../ui';

export const HasilKelulusanView: React.FC = () => {
  const {
    currentTenant,
    participants,
    stageParticipations,
    assessments,
    stages,
    stageSnapshots,
    judgeAssignments,
    competitionRules,
    rubricVersions,
    users,
    getParticipantProgress,
    getParticipantStageQuestions,
    advanceQualifiers,
    setCurrentView,
    setSelectedParticipantId,
    refreshSupabaseConnection
  } = useMtq();

  // Sekali muat ulang saat halaman Hasil & Kelulusan dibuka (data pengesahan harus paling mutakhir).
  // Pembaruan selanjutnya datang lewat realtime Supabase; tidak ada polling berkala.
  useEffect(() => {
    void refreshSupabaseConnection();
  }, []);

  // Deduplikasi nama babak untuk pilihan dropdown babak, namun resolusi objek babak tetap spesifik per cabang (P0-02)
  const tenantStages = useMemo(
    () => stages.filter((s) => s.tenantId === currentTenant.id),
    [stages, currentTenant.id]
  );

  const uniqueStages = useMemo(() => {
    const map = new Map<string, (typeof tenantStages)[number]>();
    tenantStages.forEach((stg) => {
      const existing = map.get(stg.name);
      if (!existing) {
        map.set(stg.name, stg);
        return;
      }
      const existingHasSp = stageParticipations.some(
        (sp) => sp.tenantId === currentTenant.id && sp.stageId === existing.id
      );
      const candidateHasSp = stageParticipations.some(
        (sp) => sp.tenantId === currentTenant.id && sp.stageId === stg.id
      );
      if ((candidateHasSp && !existingHasSp) || (stg.status === 'Aktif' && existing.status !== 'Aktif')) {
        map.set(stg.name, stg);
      }
    });
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  }, [tenantStages, stageParticipations, currentTenant.id]);

  // Active stage selector - otomatis memilih babak yang sedang berjalan (status 'Aktif'),
  // atau babak paling terakhir apabila semua babak telah selesai
  const defaultRunningStage = useMemo(() => {
    if (uniqueStages.length === 0) return undefined;
    const activeStage = uniqueStages.find((s) => s.status === 'Aktif' && !s.isFinalized);
    if (activeStage) return activeStage;
    const anyActive = uniqueStages.find((s) => s.status === 'Aktif');
    if (anyActive) return anyActive;
    const allFinished = uniqueStages.every((s) => s.status === 'Selesai' || s.isFinalized);
    if (allFinished) return uniqueStages[uniqueStages.length - 1];
    return uniqueStages[0];
  }, [uniqueStages]);

  const [selectedStageName, setSelectedStageName] = useState<string>(
    () => defaultRunningStage?.name || 'Penyisihan'
  );

  useEffect(() => {
    if (defaultRunningStage?.name) {
      setSelectedStageName(defaultRunningStage.name);
    }
  }, [defaultRunningStage?.name]);

  // Selected branch filter for multi-branch isolation & participant search query
  const [selectedBranch, setSelectedBranch] = useState<string>('Semua Cabang');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Active stage participations for current tenant & stage
  const currentStageParticipations = useMemo(() => {
    return stageParticipations.filter(
      (sp) => sp.tenantId === currentTenant.id && sp.stageName === selectedStageName
    );
  }, [stageParticipations, currentTenant.id, selectedStageName]);

  const branchOptions = useMemo(() => {
    const branchSet = new Set<string>();
    currentStageParticipations.forEach((sp) => {
      if (sp.branchName && sp.branchName !== 'Semua Cabang') {
        branchSet.add(sp.branchName);
      }
      const partObj = participants.find(
        (p) => p.id === sp.participantId && p.tenantId === currentTenant.id
      );
      if (partObj?.branchName && partObj.branchName !== 'Semua Cabang') {
        branchSet.add(partObj.branchName);
      }
    });
    participants.forEach((p) => {
      if (
        p.tenantId === currentTenant.id &&
        p.stageName === selectedStageName &&
        p.branchName &&
        p.branchName !== 'Semua Cabang'
      ) {
        branchSet.add(p.branchName);
      }
    });
    tenantStages.forEach((s) => {
      if (s.name === selectedStageName && s.branchName && s.branchName !== 'Semua Cabang') {
        branchSet.add(s.branchName);
      }
    });
    return ['Semua Cabang', ...Array.from(branchSet)];
  }, [currentStageParticipations, participants, tenantStages, currentTenant.id, selectedStageName]);

  // Default ke cabang pertama agar pengesahan (yang wajib per cabang) langsung dapat dilakukan
  useEffect(() => {
    if (!branchOptions.includes(selectedBranch)) {
      setSelectedBranch(branchOptions[1] || 'Semua Cabang');
    } else if (selectedBranch === 'Semua Cabang' && branchOptions.length > 2) {
      setSelectedBranch(branchOptions[1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchOptions.join('|')]);

  // Effective branch when only 1 active branch exists or specific branch is selected
  const effectiveBranchName = useMemo(() => {
    if (selectedBranch !== 'Semua Cabang') return selectedBranch;
    if (branchOptions.length === 2) return branchOptions[1];
    return undefined;
  }, [selectedBranch, branchOptions]);

  // P0-02: Resolve currentStage and nextStage strictly scoped to the active branch
  // Prioritize stages that actually have participations or assessments over unused duplicate stage rows
  const currentStage = useMemo(() => {
    const candidates = tenantStages.filter((s) => s.name === selectedStageName);
    const activeStageIds = new Set<string>();
    currentStageParticipations.forEach((sp) => {
      if (!effectiveBranchName) {
        if (sp.stageId) activeStageIds.add(sp.stageId);
        return;
      }
      const partObj = participants.find(
        (p) => p.id === sp.participantId && p.tenantId === currentTenant.id
      );
      const pBr =
        (sp.branchName && sp.branchName !== 'Semua Cabang' ? sp.branchName : partObj?.branchName) ||
        sp.branchName;
      if (!pBr || pBr === effectiveBranchName) {
        if (sp.stageId) activeStageIds.add(sp.stageId);
      }
    });
    assessments.forEach((a) => {
      if (a.tenantId === currentTenant.id && a.stageName === selectedStageName && a.stageId) {
        activeStageIds.add(a.stageId);
      }
    });

    if (effectiveBranchName) {
      const activeBranchSpecific = candidates.find(
        (s) => s.branchName === effectiveBranchName && activeStageIds.has(s.id)
      );
      if (activeBranchSpecific) return activeBranchSpecific;

      const activeShared = candidates.find(
        (s) =>
          (!s.branchName || s.branchName === 'Semua Cabang') &&
          activeStageIds.has(s.id)
      );
      if (activeShared) return activeShared;

      const anyActive = candidates.find((s) => activeStageIds.has(s.id));
      if (anyActive) return anyActive;

      const branchSpecific = candidates.find(
        (s) => s.branchName === effectiveBranchName
      );
      if (branchSpecific) return branchSpecific;
    }

    return (
      candidates.find((s) => activeStageIds.has(s.id)) ||
      uniqueStages.find((s) => s.name === selectedStageName) ||
      candidates[0] ||
      uniqueStages[0] ||
      stages[0]
    );
  }, [
    tenantStages,
    uniqueStages,
    stages,
    selectedStageName,
    effectiveBranchName,
    currentStageParticipations,
    participants,
    assessments,
    currentTenant.id
  ]);

  const nextStage = useMemo(() => {
    if (!currentStage) return null;
    const candidateStages = tenantStages.filter((s) => {
      if (s.order <= currentStage.order || s.name === currentStage.name) return false;
      if (effectiveBranchName) {
        return (
          s.branchName === effectiveBranchName ||
          (currentStage.branchId && s.branchId === currentStage.branchId) ||
          !s.branchName ||
          s.branchName === 'Semua Cabang'
        );
      }
      if (currentStage.branchId && s.branchId) {
        return s.branchId === currentStage.branchId;
      }
      if (currentStage.branchName && currentStage.branchName !== 'Semua Cabang' && s.branchName && s.branchName !== 'Semua Cabang') {
        return s.branchName === currentStage.branchName;
      }
      return true;
    });
    // Utamakan babak yang spesifik pada cabang yang sama terlebih dahulu
    return (
      candidateStages.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        const aExact = effectiveBranchName && a.branchName === effectiveBranchName ? 0 : 1;
        const bExact = effectiveBranchName && b.branchName === effectiveBranchName ? 0 : 1;
        return aExact - bExact;
      })[0] || null
    );
  }, [tenantStages, currentStage, effectiveBranchName]);

  const currentStageSnapshot = useMemo(() => {
    if (!currentStage) return undefined;
    return stageSnapshots.find(
      (s) => s.tenantId === currentTenant.id && (s.stageId === currentStage.id || s.stageName === currentStage.name)
    );
  }, [stageSnapshots, currentTenant.id, currentStage]);

  // Manual overrides state: { [participantId]: boolean } and reasons { [participantId]: string }
  const [manualOverrides, setManualOverrides] = useState<Record<string, boolean>>({});
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [overrideModalParticipant, setOverrideModalParticipant] = useState<Participant | null>(null);
  const [tempReasonText, setTempReasonText] = useState('');
  const [tempOverrideValue, setTempOverrideValue] = useState(true);

  // Confirmation modal & feedback
  const [isConfirmAdvancementOpen, setIsConfirmAdvancementOpen] = useState(false);
  const [advancementSuccessMessage, setAdvancementSuccessMessage] = useState('');
  const [advancementErrorMessage, setAdvancementErrorMessage] = useState('');

  // Quota configuration (P1-04: Centralized from branch-specific CompetitionStage)
  const quota = currentStage?.qualificationQuota || 3;

  // P0-01: Per-branch grouped evaluation when "Semua Cabang" is selected across multiple branches
  const branchGroups = useMemo(() => {
    return RankingService.evaluateStageByBranches({
      tenantId: currentTenant.id,
      stageName: selectedStageName,
      stages,
      participations: stageParticipations,
      participants,
      assessments,
      judgeAssignments,
      stageQuestionsGetter: getParticipantStageQuestions,
      manualOverrides,
      overrideReasons,
      customRuleConfigs: competitionRules,
      customRubricVersions: rubricVersions
    });
  }, [
    currentTenant.id,
    selectedStageName,
    stageParticipations,
    participants,
    assessments,
    judgeAssignments,
    stages,
    getParticipantStageQuestions,
    manualOverrides,
    overrideReasons,
    competitionRules,
    rubricVersions
  ]);

  // Use centralized RankingService for scoring, multi-maqra aggregation, and official tie-break resolution
  const {
    evaluatedParticipants,
    allFinalized: allAssessmentsFinalized,
    incompleteCount,
    podiumTies,
    boundaryTie: hasBoundaryTie,
    unresolvedTiesCount,
    canFinalize,
    blockingReason,
    blockingReasonDetail
  } = useMemo(() => {
    return RankingService.evaluateStageParticipants({
      tenantId: currentTenant.id,
      stageId: effectiveBranchName ? currentStage?.id : undefined,
      stageName: selectedStageName,
      branchId: effectiveBranchName ? currentStage?.branchId : undefined,
      branchName: effectiveBranchName,
      participations: stageParticipations,
      participants,
      assessments,
      judgeAssignments,
      stageQuestionsGetter: getParticipantStageQuestions,
      quota,
      manualOverrides,
      overrideReasons,
      customRuleConfigs: competitionRules,
      customRubricVersions: rubricVersions,
      isFinalStage: Boolean(currentStage) && !nextStage,
      championCount: currentStage?.championCount || 3
    });
  }, [
    nextStage,
    currentStage,
    currentTenant.id,
    currentStage?.id,
    currentStage?.branchId,
    selectedStageName,
    effectiveBranchName,
    stageParticipations,
    participants,
    assessments,
    judgeAssignments,
    getParticipantStageQuestions,
    quota,
    manualOverrides,
    overrideReasons,
    competitionRules,
    rubricVersions
  ]);

  const incompleteParticipants = useMemo(() => {
    return evaluatedParticipants.filter((item) => !item.isFullyFinalized);
  }, [evaluatedParticipants]);

  const rankedParticipants = evaluatedParticipants;

  // ===========================================================================
  // Peringkat resmi dari server (compute_stage_rankings) & resolusi seri pleno.
  // Server adalah sumber kebenaran: seri penuh pada batas kuota / podium juara
  // wajib diputuskan admin (urutan + alasan) dan dikirim sebagai p_tie_resolution.
  // ===========================================================================
  type ServerRankRow = {
    participantId: string;
    rank: number | null;
    displayOrder: number;
    isTied: boolean;
    score: number | null;
  };
  const isLiveRanking = supabaseDataService.isLive();
  const [serverRankings, setServerRankings] = useState<ServerRankRow[] | null>(null);
  const [serverRankingError, setServerRankingError] = useState('');
  const finalizedAssessmentKey = useMemo(
    () =>
      `${assessments.filter((a) => a.status === 'finalized').length}:${stageParticipations.length}`,
    [assessments, stageParticipations]
  );

  useEffect(() => {
    let cancelled = false;
    if (!isLiveRanking || !currentStage?.id || !effectiveBranchName || currentStage.isFinalized) {
      setServerRankings(null);
      setServerRankingError('');
      return;
    }
    void supabaseDataService.computeStageRankingsRpc(currentStage.id).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        setServerRankings(null);
        setServerRankingError(res.message);
        return;
      }
      const raw = (res.data as { rankings?: Array<Record<string, unknown>> } | null)?.rankings;
      setServerRankings(
        Array.isArray(raw)
          ? raw.map((r) => ({
              participantId: String(r.participant_id),
              rank: r.rank === null || r.rank === undefined ? null : Number(r.rank),
              displayOrder: Number(r.display_order),
              isTied: Boolean(r.is_tied),
              score:
                r.computed_score === null || r.computed_score === undefined ? null : Number(r.computed_score)
            }))
          : []
      );
      setServerRankingError('');
    });
    return () => {
      cancelled = true;
    };
  }, [isLiveRanking, currentStage?.id, currentStage?.isFinalized, effectiveBranchName, finalizedAssessmentKey]);

  const serverRankMap = useMemo(() => {
    const map = new Map<string, ServerRankRow>();
    (serverRankings || []).forEach((r) => map.set(r.participantId, r));
    return map;
  }, [serverRankings]);

  const championCount = currentStage?.championCount || 3;

  // S4: nomor undian yang berlaku di babak ini (hasil undian babak), bukan nomor pendaftaran awal
  const stageLotteryOf = (participantId: string) =>
    evaluatedParticipants.find((e) => e.participant.id === participantId)?.participation?.lotteryNumber;

  const criticalTieGroups = useMemo(() => {
    if (!serverRankings) return [];
    const groups = new Map<number, ServerRankRow[]>();
    serverRankings
      .filter((r) => r.isTied && r.rank !== null)
      .forEach((r) => {
        const list = groups.get(r.rank as number) || [];
        list.push(r);
        groups.set(r.rank as number, list);
      });
    return Array.from(groups.entries())
      .map(([rank, rows]) => {
        const sorted = rows.slice().sort((a, b) => a.displayOrder - b.displayOrder);
        return {
          rank,
          rows: sorted,
          minOrder: sorted[0].displayOrder,
          maxOrder: sorted[sorted.length - 1].displayOrder
        };
      })
      .filter((g) => (nextStage ? g.minOrder <= quota && g.maxOrder > quota : g.rank <= championCount))
      .sort((a, b) => a.rank - b.rank);
  }, [serverRankings, nextStage, quota, championCount]);

  // Peserta yang berada dalam kelompok seri yang MENENTUKAN (butuh keputusan sidang pleno).
  // Sumber utama: peringkat server; cadangan: evaluasi di layar.
  const decisiveTieIds = useMemo(() => {
    const ids = new Set<string>();
    if (serverRankings) {
      criticalTieGroups.forEach((g) => g.rows.forEach((r) => ids.add(r.participantId)));
    } else {
      evaluatedParticipants.forEach((ep) => {
        if (ep.isDecisiveTie) ids.add(ep.participant.id);
      });
    }
    return ids;
  }, [serverRankings, criticalTieGroups, evaluatedParticipants]);

  const [tieOrder, setTieOrder] = useState<Record<string, number>>({});
  const [tieReasons, setTieReasons] = useState<Record<number, string>>({});
  const [appliedTieGroups, setAppliedTieGroups] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setTieOrder({});
    setTieReasons({});
    setAppliedTieGroups({});
  }, [currentStage?.id]);

  const isTieGroupValid = (group: { rank: number; rows: ServerRankRow[] }) => {
    const positions = group.rows.map((r) => tieOrder[r.participantId]);
    const allSet = positions.every((pos) => Number.isInteger(pos) && pos >= 1 && pos <= group.rows.length);
    const distinct = new Set(positions).size === group.rows.length;
    return allSet && distinct && (tieReasons[group.rank] || '').trim().length >= 5;
  };

  const unresolvedCriticalTies = criticalTieGroups.filter((g) => !appliedTieGroups[g.rank]);

  const handleApplyTieResolution = (group: { rank: number; rows: ServerRankRow[]; minOrder: number }) => {
    if (!isTieGroupValid(group)) return;
    const reason = `Keputusan pleno seri peringkat #${group.rank}: ${(tieReasons[group.rank] || '').trim()}`;
    const winnersInGroup = nextStage ? Math.max(0, quota - (group.minOrder - 1)) : 0;
    const nextOverrides: Record<string, boolean> = {};
    const nextReasons: Record<string, string> = {};
    group.rows.forEach((r) => {
      const position = tieOrder[r.participantId];
      const evaluated = evaluatedParticipants.find((e) => e.participant.id === r.participantId);
      nextOverrides[r.participantId] = nextStage ? position <= winnersInGroup : Boolean(evaluated?.isQualified);
      nextReasons[r.participantId] = reason;
    });
    setManualOverrides((prev) => ({ ...prev, ...nextOverrides }));
    setOverrideReasons((prev) => ({ ...prev, ...nextReasons }));
    setAppliedTieGroups((prev) => ({ ...prev, [group.rank]: true }));
  };

  const buildTieResolutionPayload = (): Record<string, number> => {
    const payload: Record<string, number> = {};
    criticalTieGroups
      .filter((g) => appliedTieGroups[g.rank])
      .forEach((g) => {
        g.rows.forEach((r) => {
          payload[r.participantId] = tieOrder[r.participantId];
        });
      });
    return payload;
  };

  // Stage overall progress status
  const stageStatusBadge = useMemo(() => {
    if (currentStage?.isFinalized) {
      return {
        label: 'Hasil Babak Difinalisasi & Lolos',
        variant: 'emerald',
        description: 'Kelulusan babak ini telah ditetapkan secara resmi.'
      };
    }
    if (!allAssessmentsFinalized) {
      return {
        label: 'Penilaian Belum Lengkap (Peringkat Sementara)',
        variant: 'amber',
        description:
          blockingReasonDetail?.message ||
          blockingReason ||
          `Terdapat ${incompleteCount} peserta yang penilaiannya belum difinalisasi seluruh juri.`
      };
    }
    if (hasBoundaryTie) {
      return {
        label: 'Siap Diverifikasi (Perlu Putusan Seri)',
        variant: 'rose',
        description: 'Penilaian lengkap, namun ada nilai kembar pada batas kuota Top-' + quota + '.'
      };
    }
    return {
      label: 'Siap Diverifikasi & Difinalisasi',
      variant: 'blue',
      description: 'Seluruh peserta telah dinilai lengkap oleh dewan hakim dan siap diverifikasi.'
    };
  }, [
    currentStage?.isFinalized,
    allAssessmentsFinalized,
    blockingReasonDetail,
    blockingReason,
    incompleteCount,
    hasBoundaryTie,
    quota
  ]);

  const qualifiedParticipants = evaluatedParticipants.filter((p) => p.isQualified);

  const filteredEvaluatedParticipants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return evaluatedParticipants;
    return evaluatedParticipants.filter((item) => {
      const p = item.participant;
      const lottery = String(item.participation?.lotteryNumber || p.lotteryNumber || '').toLowerCase();
      return (
        p.name.toLowerCase().includes(q) ||
        p.participantId.toLowerCase().includes(q) ||
        p.kafilahName.toLowerCase().includes(q) ||
        lottery.includes(q)
      );
    });
  }, [evaluatedParticipants, searchQuery]);

  // Manual Override Handler
  const handleOpenOverride = (p: Participant, currentQualified: boolean) => {
    setOverrideModalParticipant(p);
    setTempOverrideValue(!currentQualified);
    setTempReasonText(overrideReasons[p.id] || '');
  };

  const handleSaveOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModalParticipant || !tempReasonText.trim()) return;

    setManualOverrides((prev) => ({
      ...prev,
      [overrideModalParticipant.id]: tempOverrideValue
    }));
    setOverrideReasons((prev) => ({
      ...prev,
      [overrideModalParticipant.id]: tempReasonText.trim()
    }));

    setOverrideModalParticipant(null);
  };

  const handleResetOverride = (participantId: string) => {
    setManualOverrides((prev) => {
      const copy = { ...prev };
      delete copy[participantId];
      return copy;
    });
    setOverrideReasons((prev) => {
      const copy = { ...prev };
      delete copy[participantId];
      return copy;
    });
  };

  // P0-02 & P1-05: Confirm Advancement to Next Stage OR Finalize Championship with explicit stageId, nextStageId, branchId, branchName, and manualOverrides
  const handleConfirmAdvancement = async () => {
    const qualifiedIds = qualifiedParticipants.map((item) => item.participant.id);
    const targetNextStage = nextStage ? nextStage.name : '';
    const result = await advanceQualifiers({
      currentStageId: currentStage?.id,
      currentStageName: selectedStageName,
      nextStageId: nextStage?.id,
      nextStageName: targetNextStage,
      branchId: currentStage?.branchId,
      branchName: effectiveBranchName || currentStage?.branchName,
      qualifiedParticipantIds: qualifiedIds,
      manualOverrides,
      overrideReasons,
      tieResolution: buildTieResolutionPayload()
    });

    setIsConfirmAdvancementOpen(false);
    if (result.success) {
      setAdvancementSuccessMessage(result.message);
      setAdvancementErrorMessage('');
    } else {
      setAdvancementErrorMessage(result.message);
      setAdvancementSuccessMessage('');
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
          Hasil Babak & Kelulusan (Kualifikasi)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          {currentTenant.name} · Verifikasi penilaian juri, penetapan peringkat, dan pelolosan peserta ke babak berikutnya
        </p>
      </div>

      {/* Alerts for feedback */}
      {advancementSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900 shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <p className="font-semibold">{advancementSuccessMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setAdvancementSuccessMessage('')}
            aria-label="Tutup pesan sukses"
            className="p-1 text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {advancementErrorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-xs text-rose-900 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" />
            <p className="font-semibold">{advancementErrorMessage}</p>
          </div>
          <button
            type="button"
            onClick={() => setAdvancementErrorMessage('')}
            aria-label="Tutup pesan kesalahan"
            className="p-1 text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Three KPI Summary Cards at the Top */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Status Penilaian Babak</span>
            <ShieldCheck className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {rankedParticipants.filter((item) => item.isFullyFinalized).length} / {evaluatedParticipants.length}
            </span>
            <span className="text-xs text-slate-500">Peserta Lengkap</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {allAssessmentsFinalized ? (
              <span className="text-slate-500">Seluruh penilaian dewan juri lengkap</span>
            ) : blockingReasonDetail?.code === 'NO_JUDGES' ? (
              <span className="text-amber-700 font-medium">{blockingReasonDetail.message}</span>
            ) : blockingReasonDetail?.code === 'NO_MAQRA' ? (
              <span className="text-amber-700 font-medium">{blockingReasonDetail.message}</span>
            ) : blockingReasonDetail?.code === 'NO_PARTICIPANTS' ? (
              <span className="text-slate-500">{blockingReasonDetail.message}</span>
            ) : (
              <span className="text-slate-500">
                {incompleteCount} peserta belum lengkap dinilai
              </span>
            )}
          </p>
        </div>

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Kuota Kelulusan Babak</span>
            <Trophy className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              Top {quota}
            </span>
            <span className="text-xs text-slate-500">Peserta Terbaik</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Target melaju ke: <strong className="text-slate-700">{nextStage ? `Babak ${nextStage.name}` : 'Juara Akhir'}</strong>
          </p>
        </div>

        <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium text-slate-500">Calon Peserta Lolos</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-3">
            <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
              {qualifiedParticipants.length}
            </span>
            <span className="text-xs text-slate-500">Peserta Terpilih</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {Object.keys(manualOverrides).length > 0
              ? `${Object.keys(manualOverrides).length} peserta disesuaikan (override)`
              : allAssessmentsFinalized
              ? 'Sesuai peringkat resmi'
              : 'Menunggu penilaian selesai'}
          </p>
        </div>
      </div>

      {/* 2. Dedicated Filter Section Below KPI Cards: Search Bar Nama -> Cabang -> Babak */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari nama peserta, nomor undian, atau grup..."
          leftIcon={<Search className="w-4 h-4" />}
          containerClassName="flex-[2] min-w-[240px]"
        />

        <Select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          aria-label="Pilih Cabang Lomba"
          containerClassName="flex-1 min-w-[180px]"
        >
          {branchOptions.map((br) => (
            <option key={br} value={br}>
              {br}
            </option>
          ))}
        </Select>

        <Select
          value={selectedStageName}
          onChange={(e) => {
            setSelectedStageName(e.target.value);
            setAdvancementSuccessMessage('');
          }}
          aria-label="Pilih Babak"
          containerClassName="flex-1 min-w-[160px]"
        >
          {uniqueStages.map((stg) => (
            <option key={stg.id} value={stg.name}>
              Babak {stg.name}
            </option>
          ))}
        </Select>
      </Card>

      {/* Tie Alert Notice */}
      {hasBoundaryTie && (
        <div className="bg-rose-50 border border-rose-300 rounded-lg p-4 flex items-start gap-3 text-xs text-rose-900 shadow-sm">
          <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold text-sm">Perhatian: Nilai Seri pada Batas Kuota Kelulusan (Top {quota})!</p>
            <p className="mt-1 leading-relaxed">
              Terdapat nilai yang sama persis antara peserta di batas peringkat kelulusan. Sistem memblokir pelolosan otomatis agar tidak memotong peserta secara sepihak. Silakan gunakan tombol <strong>Aksi Override</strong> dengan mencantumkan Berita Acara Dewan Hakim resmi.
            </p>
          </div>
        </div>
      )}

      {/* Championship Podium for Final Round when finalized */}
      {!nextStage && currentStage?.isFinalized && rankedParticipants.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-900 rounded-xl p-6 text-white shadow-lg space-y-5 border border-emerald-700/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-800/80 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-md bg-amber-400 text-slate-950 flex items-center justify-center font-bold text-xl shadow-md">
                🏆
              </div>
              <div>
                <h3 className="font-extrabold text-base text-white">Podium Pemenang & Juara Resmi MTQ</h3>
                <p className="text-xs text-emerald-200">
                  Keputusan Dewan Hakim telah disahkan secara resmi untuk Babak {selectedStageName} · Cabang {currentStage?.branchName}
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-800/80 text-emerald-200 border border-emerald-600/40 text-xs font-mono">
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              <span>Final & Mengikat (Snapshot Resmi)</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
            {(() => {
              const maxChamp = currentStage?.championCount || 3;
              const snapRankings = currentStageSnapshot?.rankings || [];
              const podiumItems =
                snapRankings.length > 0
                  ? snapRankings
                      .slice()
                      .sort((a, b) => a.rank - b.rank)
                      .slice(0, maxChamp)
                      .map((sr) => {
                        const partMatch = participants.find((p) => p.id === sr.participantId);
                        return {
                          id: sr.participantId,
                          name: sr.participantName || partMatch?.name || 'Peserta',
                          kafilahName: sr.kafilahName || partMatch?.kafilahName || '-',
                          lotteryNumber: sr.lotteryNumber || partMatch?.lotteryNumber || '-',
                          participantCode: partMatch?.participantId || sr.participantId,
                          score: sr.totalScore,
                          rank: sr.championRank || sr.rank,
                          title: sr.championTitle || `Juara ${sr.rank}`
                        };
                      })
                  : rankedParticipants.slice(0, maxChamp).map((item, idx) => ({
                      id: item.participant.id,
                      name: item.participant.name,
                      kafilahName: item.participant.kafilahName,
                      lotteryNumber: item.participation?.lotteryNumber || item.participant.lotteryNumber,
                      participantCode: item.participant.participantId,
                      score: item.displayScore,
                      rank: item.championRank || idx + 1,
                      title: item.championTitle || `Juara ${idx + 1}`
                    }));

              const romanLabels = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
              const medals = ['🥇', '🥈', '🥉'];

              return podiumItems.map((item, idx) => {
                const roman = romanLabels[idx] || String(idx + 1);
                const displayTitle = `${item.title} (Terbaik ${roman})`;
                const medal = medals[idx] || '🏅';
                const cardBg =
                  idx === 0
                    ? 'bg-amber-500/20 border-amber-400/60'
                    : idx === 1
                    ? 'bg-slate-500/20 border-slate-300/40'
                    : 'bg-amber-700/20 border-amber-600/40';
                return (
                  <div
                    key={`${item.id}-${idx}`}
                    className={`rounded-lg border p-4 ${cardBg} flex flex-col items-center text-center space-y-2 shadow-sm`}
                  >
                    <span className="text-2xl">{medal}</span>
                    <span className="font-bold text-xs uppercase tracking-wider text-amber-300">{displayTitle}</span>
                    <div className="font-extrabold text-base text-white">{item.name}</div>
                    <div className="text-xs text-emerald-200">{item.kafilahName}</div>
                    <div className="text-xs font-mono tabular-nums text-emerald-300">
                      Undian #{item.lotteryNumber} · {item.participantCode}
                    </div>
                    <div className="mt-2 px-3 py-1 rounded-md bg-emerald-950/80 border border-emerald-600/50 text-sm font-black font-mono tabular-nums text-amber-300">
                      Skor Akhir: {item.score !== null && item.score !== undefined ? Number(item.score).toFixed(2) : '—'}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* P0-01: Per-Branch Isolated Group Cards when "Semua Cabang" has >1 branch */}
      {selectedBranch === 'Semua Cabang' && branchGroups.length > 1 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                Isolasi Ranking Per Cabang Lomba ({branchGroups.length} Cabang Aktif)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Setiap cabang dievaluasi terpisah dengan dewan hakim, rubrik, aturan tie-break, dan kuota kelulusan masing-masing. Pilih cabang spesifik untuk melakukan pengesahan babak.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {branchGroups.map((grp) => (
              <div
                key={`${grp.branchId || grp.branchName}`}
                className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between gap-3 shadow-sm"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-xs text-slate-900 truncate">{grp.branchName}</span>
                    <Badge variant="neutral">Kuota Top {grp.quota}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 font-mono tabular-nums">
                    {grp.evaluation.evaluatedParticipants.filter((p) => p.isFullyFinalized).length} /{' '}
                    {grp.evaluation.evaluatedParticipants.length} Peserta Lengkap ·{' '}
                    {grp.evaluation.evaluatedParticipants.filter((p) => p.isQualified).length} Calon Lolos
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  fullWidth
                  onClick={() => setSelectedBranch(grp.branchName)}
                >
                  Pilih & Kelola Cabang Ini →
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Qualification Results Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50">
          <div>
            <h3 className="font-extrabold text-sm md:text-base text-slate-900">
              Peringkat & Kualifikasi Peserta Babak {selectedStageName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Urutan berdasarkan rata-rata nilai dewan juri cabang {effectiveBranchName || (branchGroups.length > 1 ? 'Masing-Masing Cabang (Terisolasi)' : currentStage?.branchName)}
            </p>
          </div>

          {/* Unified Action Button to confirm advancement OR finalize championship */}
          <div>
            {currentStage?.isFinalized ? (
              <Badge variant="success" icon={<CheckCircle2 className="w-3.5 h-3.5" />} className="py-1.5 px-3">
                {nextStage ? 'Babak Ini Telah Difinalisasi' : 'Musabaqah & Juara Resmi Disahkan'}
              </Badge>
            ) : (() => {
              const isMultiBranchBlocked = selectedBranch === 'Semua Cabang' && branchOptions.length > 2;
              const isButtonDisabled =
                !allAssessmentsFinalized || !canFinalize || isMultiBranchBlocked || unresolvedCriticalTies.length > 0;
              const buttonLabel = nextStage
                ? `Konfirmasi & Loloskan ke Babak ${nextStage.name}`
                : 'Sahkan Juara & Selesaikan Musabaqah';
              const helperReason = isMultiBranchBlocked
                ? 'Pilih cabang spesifik pada dropdown sebelum pengesahan'
                : !allAssessmentsFinalized
                ? blockingReasonDetail?.message || blockingReason || `Belum dapat disahkan (${incompleteCount} peserta belum lengkap)`
                : unresolvedCriticalTies.length > 0
                ? `Terdapat ${unresolvedCriticalTies.length} kelompok nilai seri yang wajib diputuskan sidang pleno (lihat panel di atas tabel).`
                : !canFinalize
                ? blockingReason || 'Selesaikan nilai seri atau kelengkapan juri terlebih dahulu'
                : undefined;

              return (
                <div className="flex flex-col items-end gap-1">
                  <Button
                    variant="primary"
                    size="md"
                    disabled={isButtonDisabled}
                    onClick={() => !isButtonDisabled && setIsConfirmAdvancementOpen(true)}
                    title={helperReason || buttonLabel}
                    leftIcon={
                      isButtonDisabled ? (
                        <Lock className="w-4 h-4" />
                      ) : nextStage ? (
                        <FileCheck2 className="w-4 h-4" />
                      ) : (
                        <Trophy className="w-4 h-4" />
                      )
                    }
                  >
                    {buttonLabel}
                  </Button>
                  {helperReason && (
                    <span
                      className={`text-xs font-medium max-w-[320px] text-right ${
                        !allAssessmentsFinalized || isMultiBranchBlocked ? 'text-amber-700' : 'text-rose-700'
                      }`}
                    >
                      {helperReason}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {!currentStage?.isFinalized && effectiveBranchName && (
          <div className="px-5 py-2 border-b border-slate-100 text-xs text-slate-600 bg-white">
            {serverRankings
              ? 'Peringkat dihitung resmi oleh server (sumber kebenaran pengesahan).'
              : isLiveRanking
              ? `Peringkat server belum tersedia${serverRankingError ? `: ${serverRankingError}` : ''}. Tampilan di bawah adalah perkiraan.`
              : 'Mode demo: peringkat di bawah adalah perkiraan yang dihitung di perangkat ini.'}
          </div>
        )}

        {/* Prominent Panel Keputusan Sidang Pleno: Nilai Seri */}
        {!currentStage?.isFinalized && criticalTieGroups.length > 0 && (
          <div className="m-4 rounded-lg border-2 border-rose-300 bg-rose-50/90 p-4 md:p-5 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="danger">Wajib Diputuskan Sidang Pleno</Badge>
                  <h4 className="text-sm md:text-base font-extrabold text-rose-950">
                    Keputusan Sidang Pleno: Nilai Seri
                  </h4>
                </div>
                <p className="text-xs text-rose-900 mt-1 leading-relaxed">
                  Peserta berikut memiliki nilai identik pada seluruh kriteria tie-break
                  {nextStage ? ' di batas kuota kelulusan' : ' di posisi juara'}. Tentukan urutan hasil keputusan
                  pleno dan tuliskan alasannya (minimal 5 karakter). Keputusan dicatat di log audit server.
                </p>
              </div>
            </div>
            {criticalTieGroups.map((group) => {
              const valid = isTieGroupValid(group);
              const applied = Boolean(appliedTieGroups[group.rank]);
              return (
                <div key={group.rank} className="rounded-md border border-rose-200 bg-white p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900">
                      Seri pada peringkat #{group.rank} ({group.rows.length} peserta, nilai{' '}
                      <span className="font-mono tabular-nums">
                        {group.rows[0]?.score !== null && group.rows[0]?.score !== undefined
                          ? group.rows[0].score.toFixed(2)
                          : '—'}
                      </span>
                      )
                    </p>
                    {applied && <Badge variant="success">Keputusan Diterapkan</Badge>}
                  </div>
                  <div className="space-y-2">
                    {group.rows.map((r) => {
                      const part = participants.find((pp) => pp.id === r.participantId);
                      return (
                        <label key={r.participantId} className="flex items-center justify-between gap-3 text-sm p-2 rounded-sm bg-slate-50 border border-slate-200/70">
                          <span className="font-medium text-slate-800">
                            <span className="font-mono tabular-nums font-bold">
                              #{stageLotteryOf(r.participantId) || part?.lotteryNumber || '-'}
                            </span>{' '}
                            {part?.name || r.participantId}
                          </span>
                          <select
                            value={tieOrder[r.participantId] ?? ''}
                            disabled={applied}
                            onChange={(e) =>
                              setTieOrder((prev) => ({ ...prev, [r.participantId]: Number(e.target.value) }))
                            }
                            aria-label={`Urutan keputusan pleno untuk ${part?.name || r.participantId}`}
                            className="h-9 px-2.5 border border-slate-300 rounded-sm text-sm bg-white font-medium"
                          >
                            <option value="">Pilih urutan</option>
                            {group.rows.map((_, i) => (
                              <option key={i + 1} value={i + 1}>
                                Urutan {i + 1} (peringkat #{group.rank + i})
                              </option>
                            ))}
                          </select>
                        </label>
                      );
                    })}
                  </div>
                  <Textarea
                    value={tieReasons[group.rank] || ''}
                    disabled={applied}
                    onChange={(e) => setTieReasons((prev) => ({ ...prev, [group.rank]: e.target.value }))}
                    placeholder="Alasan / dasar keputusan sidang pleno (mis. hasil penampilan ulang)"
                    rows={2}
                  />
                  <div className="flex items-center justify-end gap-2">
                    {applied ? (
                      <>
                        <span className="text-xs font-bold text-emerald-700">Keputusan diterapkan</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAppliedTieGroups((prev) => ({ ...prev, [group.rank]: false }))}
                        >
                          Ubah
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={!valid}
                        onClick={() => handleApplyTieResolution(group)}
                      >
                        Terapkan Keputusan Pleno
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-xs tracking-wider">
              <tr>
                <th className="px-5 py-3 w-16 text-center">Rank</th>
                <th className="px-4 py-3 w-20">Undian</th>
                <th className="px-5 py-3">Nama Peserta & Grup</th>
                <th className="px-4 py-3 text-right">Nilai Akhir</th>
                <th className="px-4 py-3 text-center">Kelengkapan Juri</th>
                <th className="px-4 py-3 text-center">Status Kelulusan</th>
                <th className="px-5 py-3 text-right">Aksi Override</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEvaluatedParticipants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                    {searchQuery.trim()
                      ? 'Tidak ada peserta yang sesuai dengan pencarian.'
                      : `Belum ada peserta di babak ${selectedStageName}.`}
                  </td>
                </tr>
              ) : (
                filteredEvaluatedParticipants.map((item, idx) => {
                  const p = item.participant;

                  return (
                    <tr
                      key={`${p.id}-${idx}`}
                      className="even:bg-slate-50/40 hover:bg-emerald-50/40 transition-colors"
                    >
                      {/* Rank */}
                      <td className="px-5 py-3.5 text-center font-mono tabular-nums font-bold text-sm text-slate-800">
                        {item.isFullyFinalized
                          ? `#${serverRankMap.get(p.id)?.rank ?? item.rank}`
                          : '—'}
                        {serverRankMap.get(p.id)?.isTied && (
                          <span
                            className={`block text-xs font-bold ${decisiveTieIds.has(p.id) ? 'text-rose-700' : 'text-slate-500'}`}
                          >
                            Seri
                          </span>
                        )}
                      </td>

                      {/* Lottery */}
                      <td className="px-4 py-3.5 font-mono tabular-nums font-bold text-slate-900 text-sm">
                        #{item.participation?.lotteryNumber || p.lotteryNumber}
                      </td>

                      {/* Participant identity */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 text-sm">{p.name}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedParticipantId(p.id);
                              setCurrentView('penilaian_dual_panel');
                            }}
                            className="text-xs text-emerald-800 hover:text-emerald-950 hover:underline font-semibold cursor-pointer"
                            title="Buka Lembar Penilaian Peserta Ini"
                          >
                            [Buka]
                          </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">
                          <span className="font-mono tabular-nums">{p.participantId}</span> · {p.kafilahName}
                        </p>
                        {item.hasUnresolvedTie ? (
                          decisiveTieIds.has(p.id) && !item.isOverridden ? (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                              <Badge variant="danger">Nilai Seri Identik</Badge>
                              <span className="text-xs font-semibold text-rose-700">
                                Perlu keputusan sidang pleno
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {decisiveTieIds.has(p.id)
                                ? 'Seri — sudah diputuskan melalui override'
                                : 'Seri — berbagi peringkat, tidak memengaruhi kelulusan'}
                            </p>
                          )
                        ) : (
                          item.tieBreakResolvedBy && (
                            <p className="text-xs text-emerald-800 font-semibold mt-0.5 flex items-center gap-1">
                              <span>⚖️</span>
                              <span>{item.tieBreakResolvedBy}</span>
                            </p>
                          )
                        )}
                        {item.isOverridden && (
                          <p className="text-xs text-slate-600 mt-0.5 italic">
                            Catatan Override: {item.overrideReason}
                          </p>
                        )}
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">
                        {item.isFullyFinalized && item.averageFinalScore !== null ? (
                          <div>
                            <span className="font-extrabold text-sm text-slate-900">
                              {item.averageFinalScore.toFixed(2)}
                            </span>
                            <span className="block text-xs font-medium text-emerald-700">Resmi</span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-600 font-bold text-sm">
                              {item.provisionalScore !== null
                                ? item.provisionalScore.toFixed(2)
                                : '—'}
                            </span>
                            <span className="block text-xs font-medium text-slate-400">
                              (Sementara)
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Completeness */}
                      <td className="px-4 py-3.5 text-center">
                        <span className="text-xs font-mono tabular-nums font-medium text-slate-700">
                          {item.finalizedJudgeCount} / {item.totalAssignedJudges} Juri Final
                        </span>
                      </td>

                      {/* Qualification status with semantic Badge */}
                      <td className="px-4 py-3.5 text-center">
                        {item.isOverridden ? (
                          item.isQualified ? (
                            <Badge variant="success">Override (Lolos)</Badge>
                          ) : (
                            <Badge variant="danger">Override (Gugur)</Badge>
                          )
                        ) : !allAssessmentsFinalized ? (
                          <Badge variant="warning">Menunggu Penilaian</Badge>
                        ) : item.isQualified ? (
                          <Badge variant="success">Lolos</Badge>
                        ) : (
                          <Badge variant="neutral">Tidak Lolos</Badge>
                        )}
                      </td>

                      {/* Manual Override Action */}
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleOpenOverride(p, item.isQualified)}
                        >
                          {item.isQualified ? 'Gugurkan' : 'Loloskan'}
                        </Button>
                        {item.isOverridden && (
                          <button
                            type="button"
                            onClick={() => handleResetOverride(p.id)}
                            aria-label="Reset override ke peringkat asli"
                            className="p-1.5 text-slate-400 hover:text-rose-700 rounded-sm cursor-pointer"
                            title="Reset Override ke Peringkat Asli"
                          >
                            <RefreshCw className="w-3.5 h-3.5 inline" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Manual Override Dialog with Mandatory Reason */}
      <Modal
        isOpen={Boolean(overrideModalParticipant)}
        onClose={() => setOverrideModalParticipant(null)}
        title="Penyesuaian Kualifikasi (Manual Override)"
        subtitle="Alasan resmi keputusan dewan juri wajib diisi"
      >
        {overrideModalParticipant && (
          <form onSubmit={handleSaveOverride} className="space-y-4 text-xs">
            <p className="text-xs text-slate-600 leading-relaxed">
              Ubah status kelulusan peserta <strong>{overrideModalParticipant.name}</strong> secara manual.
            </p>
            <div>
              <label className="font-bold text-slate-700 block mb-1.5">
                Status Kelulusan Baru:
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setTempOverrideValue(true)}
                  className={`flex-1 h-10 rounded-md font-bold border cursor-pointer transition-colors ${
                    tempOverrideValue
                      ? 'bg-emerald-800 text-white border-emerald-800'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Lolos ke Babak Berikutnya
                </button>
                <button
                  type="button"
                  onClick={() => setTempOverrideValue(false)}
                  className={`flex-1 h-10 rounded-md font-bold border cursor-pointer transition-colors ${
                    !tempOverrideValue
                      ? 'bg-rose-700 text-white border-rose-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  Tidak Lolos
                </button>
              </div>
            </div>

            <Textarea
              label="Alasan / Berita Acara Dewan Hakim (Wajib):"
              value={tempReasonText}
              onChange={(e) => setTempReasonText(e.target.value)}
              required
              rows={3}
              placeholder="Contoh: Keputusan sidang pleno dewan hakim memenangkan tajwid jali pada poin seri..."
            />

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <Button variant="secondary" onClick={() => setOverrideModalParticipant(null)}>
                Batal
              </Button>
              <Button type="submit" variant="primary">
                Simpan Override
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ConfirmDialog for Stage Advancement OR Championship Finalization */}
      <ConfirmDialog
        isOpen={isConfirmAdvancementOpen}
        onClose={() => setIsConfirmAdvancementOpen(false)}
        onConfirm={handleConfirmAdvancement}
        variant="primary"
        title={
          nextStage
            ? 'Konfirmasi Pelolosan Babak'
            : 'Pengesahan Juara & Selesaikan Musabaqah'
        }
        description={
          nextStage ? (
            <>
              Sebanyak <strong>{qualifiedParticipants.length} peserta</strong> di bawah ini akan diloloskan ke{' '}
              <strong>Babak {nextStage.name}</strong>:
            </>
          ) : (
            <>
              Dewan Hakim akan mengesahkan secara resmi hasil penilaian Babak {selectedStageName} dan menetapkan juara podium berikut:
            </>
          )
        }
        confirmLabel={nextStage ? 'Ya, Loloskan Peserta' : 'Sahkan Juara Sekarang'}
        cancelLabel="Batal"
      >
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 max-h-48 overflow-y-auto space-y-1 text-xs">
          {(nextStage ? qualifiedParticipants : evaluatedParticipants).map((item, idx) => (
            <div
              key={`${item.participant.id}-${idx}`}
              className="flex justify-between py-1 border-b border-slate-100 last:border-0"
            >
              <span className="font-semibold text-slate-900">
                {idx + 1}. #{item.participation?.lotteryNumber || item.participant.lotteryNumber} {item.participant.name}
                {!nextStage && idx < 3 ? ` (${idx === 0 ? 'Juara 1' : idx === 1 ? 'Juara 2' : 'Juara 3'})` : ''}
              </span>
              <span className="font-mono tabular-nums text-emerald-800 font-bold">
                {item.displayScore !== null ? item.displayScore.toFixed(2) : '—'}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          {nextStage
            ? `Peserta yang lolos akan memasuki Babak ${nextStage.name} dengan paket maqra dan lembar penilaian baru. Rekam jejak babak sebelumnya tetap tersimpan rapi.`
            : 'Pengesahan ini bersifat final dan mengikat. Rekam jejak nilai, peringkat podium, dan riwayat seluruh babak akan dibekukan secara permanen.'}
        </p>
      </ConfirmDialog>
    </div>
  );
};
