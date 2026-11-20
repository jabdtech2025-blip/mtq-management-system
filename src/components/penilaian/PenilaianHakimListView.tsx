import { stageBelongsToBranch } from '../../services/stageResolver';
import { buildStageOrderLookup, sortParticipantsForDisplay } from '../../utils/participantSort';
import { buildViewFilterKey, readViewFilters, writeViewFilters } from '../../utils/viewFilterStorage';
import { resolveRequiredJudgeIdsForStage } from '../../services/completion';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  BookmarkCheck,
  Search,
  Lock,
  Clock,
  CheckCircle2,
  Users
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { PageHeader, StatCard, Card, Badge, Button, Input, Select, EmptyState } from '../ui';

const ALLOWED_PENILAIAN_STATUS_FILTERS = [
  'Semua Status',
  'Berlangsung',
  'Final',
  'Menunggu',
  'Belum Dinilai Siapa Pun',
  'Dinilai Juri Lain'
] as const;

const DEFAULT_PENILAIAN_FILTERS = {
  statusFilter: 'Semua Status',
  branchFilter: 'Semua Cabang',
  stageFilter: 'Semua Babak',
  adminSelectedJudgeId: ''
};

export const PenilaianHakimListView: React.FC = () => {
  const {
    currentTenant,
    currentUser,
    users,
    participants,
    judgeAssignments,
    assessments,
    getParticipantStageQuestions,
    setSelectedParticipantId,
    setMonitoringJudgeId,
    setCurrentView,
    cabangList,
    stages,
    getFieldCoverageForStage
  } = useMtq();

  const filterKey = buildViewFilterKey('penilaian_hakim', currentTenant.id, currentUser.id);
  const loadedFilterKeyRef = useRef(filterKey);

  const tenantBranchNames = useMemo(() => {
    const names = (cabangList || [])
      .filter((c) => (!c.tenantId || c.tenantId === currentTenant.id) && c.status !== 'Nonaktif')
      .map((c) => c.name)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [cabangList, currentTenant.id]);

  const tenantStageNames = useMemo(() => {
    const ordered = (stages || [])
      .filter((s) => (!s.tenantId || s.tenantId === currentTenant.id) && s.name)
      .slice()
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
    const names: string[] = [];
    ordered.forEach((s) => {
      if (!names.includes(s.name)) names.push(s.name);
    });
    return names;
  }, [stages, currentTenant.id]);

  const tenantJudges = useMemo(() => {
    return users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id);
  }, [users, currentTenant.id]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const saved = readViewFilters(filterKey, DEFAULT_PENILAIAN_FILTERS).statusFilter;
    return (ALLOWED_PENILAIAN_STATUS_FILTERS as readonly string[]).includes(saved)
      ? saved
      : 'Semua Status';
  });
  const [branchFilter, setBranchFilter] = useState<string>(
    () => readViewFilters(filterKey, DEFAULT_PENILAIAN_FILTERS).branchFilter || 'Semua Cabang'
  );
  const [stageFilter, setStageFilter] = useState<string>(
    () => readViewFilters(filterKey, DEFAULT_PENILAIAN_FILTERS).stageFilter || 'Semua Babak'
  );
  const [adminSelectedJudgeId, setAdminSelectedJudgeId] = useState<string>(() => {
    if (currentUser.role === 'judge') return currentUser.id;
    const savedJudgeId = readViewFilters(filterKey, DEFAULT_PENILAIAN_FILTERS).adminSelectedJudgeId;
    if (savedJudgeId && (tenantJudges.length === 0 || tenantJudges.some((j) => j.id === savedJudgeId))) {
      return savedJudgeId;
    }
    return tenantJudges[0]?.id || '';
  });

  // Muat ulang filter jika tenant atau user berubah; simpan perubahan filter ke sessionStorage tab ini
  useEffect(() => {
    if (loadedFilterKeyRef.current !== filterKey) {
      loadedFilterKeyRef.current = filterKey;
      const saved = readViewFilters(filterKey, DEFAULT_PENILAIAN_FILTERS);
      setStatusFilter(
        (ALLOWED_PENILAIAN_STATUS_FILTERS as readonly string[]).includes(saved.statusFilter)
          ? saved.statusFilter
          : 'Semua Status'
      );
      setBranchFilter(saved.branchFilter || 'Semua Cabang');
      setStageFilter(saved.stageFilter || 'Semua Babak');
      if (currentUser.role === 'judge') {
        setAdminSelectedJudgeId(currentUser.id);
      } else {
        const nextJudgeId =
          saved.adminSelectedJudgeId &&
          (tenantJudges.length === 0 || tenantJudges.some((j) => j.id === saved.adminSelectedJudgeId))
            ? saved.adminSelectedJudgeId
            : tenantJudges[0]?.id || '';
        setAdminSelectedJudgeId(nextJudgeId);
      }
      return;
    }

    writeViewFilters(filterKey, {
      statusFilter,
      branchFilter,
      stageFilter,
      adminSelectedJudgeId: currentUser.role === 'judge' ? '' : adminSelectedJudgeId
    });
  }, [filterKey, statusFilter, branchFilter, stageFilter, adminSelectedJudgeId, currentUser.role, currentUser.id, tenantJudges]);

  // Reset otomatis jika cabang tersimpan sudah tidak aktif/dihapus (hanya setelah daftar cabang termuat)
  useEffect(() => {
    if (
      branchFilter !== 'Semua Cabang' &&
      tenantBranchNames.length > 0 &&
      !tenantBranchNames.includes(branchFilter)
    ) {
      setBranchFilter('Semua Cabang');
    }
  }, [branchFilter, tenantBranchNames]);

  // Reset otomatis jika babak tersimpan sudah tidak tersedia (hanya setelah daftar babak termuat)
  useEffect(() => {
    if (
      stageFilter !== 'Semua Babak' &&
      tenantStageNames.length > 0 &&
      !tenantStageNames.includes(stageFilter)
    ) {
      setStageFilter('Semua Babak');
    }
  }, [stageFilter, tenantStageNames]);

  // Reset otomatis jika hakim monitoring tersimpan sudah tidak ada pada tenant ini
  useEffect(() => {
    if (currentUser.role === 'judge' || tenantJudges.length === 0) return;
    if (!tenantJudges.some((j) => j.id === adminSelectedJudgeId)) {
      setAdminSelectedJudgeId(tenantJudges[0].id);
    }
  }, [currentUser.role, tenantJudges, adminSelectedJudgeId]);

  const activeJudgeId = currentUser.role === 'judge' ? currentUser.id : adminSelectedJudgeId;
  const activeJudge = users.find((u) => u.id === activeJudgeId) || {
    id: activeJudgeId,
    name: 'Dewan Hakim',
    judgeField: 'Dewan Hakim Penilai',
    mimbarLocation: 'Mimbar Utama'
  };

  const myAssignments = useMemo(() => {
    return judgeAssignments.filter(
      (ja) => ja.tenantId === currentTenant.id && ja.judgeId === activeJudgeId
    );
  }, [judgeAssignments, currentTenant.id, activeJudgeId]);

  const assignedParticipants = useMemo(() => {
    const judgeProfile = users.find((u) => u.id === activeJudgeId);
    if (myAssignments.length === 0 && !judgeProfile?.assignedBranch) {
      return [];
    }

    return participants.filter((p) => {
      if (p.tenantId !== currentTenant.id) return false;
      if (myAssignments.length > 0) {
        return myAssignments.some((ja) => {
          const matchesStage = !ja.stageName || ja.stageName === p.stageName;
          if (ja.status === 'Nonaktif') return false;
          // Cocokkan cabang dengan ID, atau nama persis. Potongan nama tidak dipakai agar cabang yang
          // namanya saling memuat ("Tahfizh 1 Juz" vs "Tahfizh 1 Juz dan Tilawah") tidak tertukar.
          const isAllBranches = !ja.branchName || ja.branchName === 'Semua Cabang';
          const matchesBranch =
            isAllBranches ||
            (ja.branchId && p.branchId
              ? stageBelongsToBranch({ id: '', name: '', branchId: ja.branchId }, { branchId: p.branchId })
              : ja.branchName.trim().toLowerCase() === p.branchName.trim().toLowerCase());
          return matchesStage && matchesBranch;
        });
      }
      if (judgeProfile?.assignedBranch) {
        const matchesStage = !judgeProfile.assignedStage || judgeProfile.assignedStage === p.stageName;
        // Nama cabang harus persis sama (cabang bernama mirip tidak boleh tertukar)
        const matchesBranch =
          p.branchName.trim().toLowerCase() === judgeProfile.assignedBranch.trim().toLowerCase();
        return matchesStage && matchesBranch;
      }
      return false;
    });
  }, [participants, myAssignments, users, activeJudgeId, currentTenant.id]);

  const participantsWithJudgeState = useMemo(() => {
    return assignedParticipants.map((p) => {
      const stageQuestions = getParticipantStageQuestions(p.id, p.stageName);
      const judgeQuestionAssessments = stageQuestions.map((q) => {
        return assessments.find(
          (a) =>
            a.tenantId === currentTenant.id &&
            a.participantId === p.id &&
            a.judgeId === activeJudgeId &&
            (a.stageName === p.stageName || !a.stageName) &&
            a.questionId === q.questionId
        );
      });

      const finalizedAsms = judgeQuestionAssessments.filter((a) => a?.status === 'finalized');
      const inProgressAsms = judgeQuestionAssessments.filter((a) => a?.status === 'in_progress');

      const finalizedCount = finalizedAsms.length;
      const totalQuestions = stageQuestions.length;

      let status = 'not_started';
      if (totalQuestions === 0) {
        status = 'no_maqra';
      } else if (finalizedCount === totalQuestions && totalQuestions > 0) {
        status = 'finalized';
      } else if (finalizedCount > 0 || inProgressAsms.length > 0) {
        status = 'in_progress';
      }

      // Penilaian juri lain (mis. tim juri lain) untuk peserta ini pada babak yang sama.
      // "Sudah dinilai juri lain" = semua bidang hakim ini, di setiap maqra, sudah punya lembar final
      // dari juri lain yang memegang bidang itu.
      const stageJudgeIds = resolveRequiredJudgeIdsForStage({
        tenantId: currentTenant.id,
        stageId: p.stageId,
        stageName: p.stageName,
        branchId: p.branchId,
        branchName: p.branchName,
        judgeAssignments
      });
      const coverage = getFieldCoverageForStage({
        stageId: p.stageId,
        stageName: p.stageName,
        branchId: p.branchId,
        branchName: p.branchName,
        requiredJudgeIds: stageJudgeIds
      });
      const myFields: string[] | null = coverage
        ? coverage.judgeFieldScope[activeJudgeId] ?? null
        : null;
      const holdsField = (judgeId: string, field: string) => {
        const scope = coverage?.judgeFieldScope[judgeId];
        return !scope || scope.some((f) => f.trim().toLowerCase() === field.trim().toLowerCase());
      };
      const otherStageAssessments = assessments.filter(
        (a) =>
          a.tenantId === currentTenant.id &&
          a.participantId === p.id &&
          a.judgeId !== activeJudgeId &&
          (a.stageName === p.stageName || !a.stageName)
      );
      const otherFinalized = otherStageAssessments.filter((a) => a.status === 'finalized');
      const fieldsToCheck = myFields || coverage?.fieldNames || [];
      const coveredByOthers =
        totalQuestions > 0 &&
        fieldsToCheck.length > 0 &&
        stageQuestions.every((q) =>
          fieldsToCheck.every((field) =>
            otherFinalized.some((a) => a.questionId === q.questionId && holdsField(a.judgeId, field))
          )
        );
      const otherJudgeNames = Array.from(
        new Set(
          otherFinalized
            .filter((a) => fieldsToCheck.length === 0 || fieldsToCheck.some((field) => holdsField(a.judgeId, field)))
            .map((a) => users.find((u) => u.id === a.judgeId)?.name || a.judgeName || 'Juri lain')
        )
      );
      const assessedByAnyone =
        finalizedCount > 0 || inProgressAsms.length > 0 || otherStageAssessments.length > 0;

      let score = '--';
      if (finalizedCount > 0) {
        const sum = finalizedAsms.reduce((acc, curr) => acc + (curr?.finalScore || 0), 0);
        score = (sum / finalizedCount).toFixed(2);
      }

      return {
        ...p,
        stageQuestions,
        finalizedCount,
        totalQuestions,
        judgeScore: score,
        judgeStatus: status,
        coveredByOthers,
        otherJudgeNames,
        assessedByAnyone
      };
    });
  }, [assignedParticipants, assessments, currentTenant.id, activeJudgeId, getParticipantStageQuestions, judgeAssignments, users, getFieldCoverageForStage]);

  // Urut cabang, babak, lalu nomor undian (urutan tampil) agar sama dengan urutan maju peserta
  const stageOrder = useMemo(() => buildStageOrderLookup(stages), [stages]);
  const sortedParticipants = useMemo(
    () => sortParticipantsForDisplay(participantsWithJudgeState, { stageOrder }),
    [participantsWithJudgeState, stageOrder]
  );

  const filteredParticipants = sortedParticipants.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.participantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.lotteryNumber.includes(searchQuery) ||
      p.kafilahName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'Semua Status' ||
      (statusFilter === 'Final' && p.judgeStatus === 'finalized') ||
      (statusFilter === 'Berlangsung' && p.judgeStatus === 'in_progress') ||
      (statusFilter === 'Menunggu' && (p.judgeStatus === 'not_started' || p.judgeStatus === 'no_maqra')) ||
      (statusFilter === 'Belum Dinilai Siapa Pun' && !p.assessedByAnyone && p.judgeStatus !== 'no_maqra') ||
      (statusFilter === 'Dinilai Juri Lain' && p.coveredByOthers && p.judgeStatus === 'not_started');

    const matchesBranch =
      branchFilter === 'Semua Cabang' || p.branchName === branchFilter;

    const matchesStage =
      stageFilter === 'Semua Babak' || p.stageName === stageFilter;

    return matchesSearch && matchesStatus && matchesBranch && matchesStage;
  });

  const totalAssigned = assignedParticipants.length;
  const totalFinal = participantsWithJudgeState.filter(
    (p) => p.judgeStatus === 'finalized'
  ).length;
  const totalInProgress = participantsWithJudgeState.filter(
    (p) => p.judgeStatus === 'in_progress'
  ).length;
  const totalPending = participantsWithJudgeState.filter(
    (p) => p.judgeStatus === 'not_started' || p.judgeStatus === 'no_maqra'
  ).length;

  const handleOpenScoring = (participantId: string) => {
    setSelectedParticipantId(participantId);
    if (currentUser.role !== 'judge') {
      setMonitoringJudgeId(activeJudgeId);
    }
    setCurrentView('penilaian_dual_panel');
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title={currentUser.role === 'judge' ? 'Daftar Penugasan Penilaian Peserta' : 'Monitoring Penilaian Dewan Hakim'}
        description={
          <>
            {currentUser.role === 'judge' ? 'Dewan Hakim' : 'Menampilkan penugasan hakim'}:{' '}
            <span className="font-semibold text-slate-800">{activeJudge.name}</span> ·{' '}
            {activeJudge.judgeField || 'Bidang Penilaian'} · {activeJudge.mimbarLocation || 'Mimbar Utama'}
          </>
        }
      />

      {/* 4 Summary StatCards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Ditugaskan"
          value={totalAssigned}
          icon={<Users />}
          tone="slate"
        />
        <StatCard
          label="Selesai (Final/Terkunci)"
          value={totalFinal}
          icon={<CheckCircle2 />}
          tone="emerald"
        />
        <StatCard
          label="Sedang Berlangsung"
          value={totalInProgress}
          icon={<Clock />}
          tone="amber"
        />
        <StatCard
          label="Menunggu Tampil"
          value={totalPending}
          icon={<Clock />}
          tone="sky"
        />
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <Input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Cari nomor undian, nama peserta, atau grup..."
          leftIcon={<Search className="w-4 h-4" />}
          containerClassName="flex-[2] min-w-[240px]"
        />

        {currentUser.role !== 'judge' && tenantJudges.length > 0 && (
          <Select
            value={adminSelectedJudgeId}
            onChange={(e) => {
              setAdminSelectedJudgeId(e.target.value);
              setMonitoringJudgeId(e.target.value);
            }}
            aria-label="Pilih Dewan Hakim"
            title="Pilih Dewan Hakim"
            containerClassName="flex-1 min-w-[180px]"
          >
            {tenantJudges.map((j) => (
              <option key={j.id} value={j.id} title={j.name}>
                {j.name}
              </option>
            ))}
          </Select>
        )}

        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Status Penilaian"
          containerClassName="flex-1 min-w-[150px]"
        >
          <option value="Semua Status">Semua Status</option>
          <option value="Berlangsung">Berlangsung</option>
          <option value="Final">Final/Terkunci</option>
          <option value="Menunggu">Menunggu</option>
          <option value="Belum Dinilai Siapa Pun">Belum Dinilai Siapa Pun</option>
          <option value="Dinilai Juri Lain">Sudah Dinilai Juri Lain</option>
        </Select>

        <Select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          aria-label="Cabang"
          containerClassName="flex-1 min-w-[170px]"
        >
          <option value="Semua Cabang">Semua Cabang</option>
          {tenantBranchNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>

        <Select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          aria-label="Babak"
          containerClassName="flex-1 min-w-[150px]"
        >
          <option value="Semua Babak">Semua Babak</option>
          {tenantStageNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </Select>
      </Card>

      {/* Participants Assignment Table (min 14px text-sm for scoring table rows) */}
      <Card noPadding>
        {filteredParticipants.length === 0 ? (
          <EmptyState
            title="Belum ada peserta yang ditugaskan kepada Anda untuk babak dan cabang ini."
            description="Silakan hubungi administrator MTQ untuk konfigurasi penugasan dewan hakim."
            className="border-0 rounded-none"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 text-center">Undian</th>
                  <th className="py-3.5 px-4">ID Peserta</th>
                  <th className="py-3.5 px-4">Nama Lengkap Peserta</th>
                  <th className="py-3.5 px-4">Grup</th>
                  <th className="py-3.5 px-4">Cabang & Babak</th>
                  <th className="py-3.5 px-4">Soal Maqra Ditugaskan</th>
                  <th className="py-3.5 px-4 text-center">{currentUser.role === 'judge' ? 'Status Saya' : 'Status Hakim'}</th>
                  <th className="py-3.5 px-4 text-center">{currentUser.role === 'judge' ? 'Nilai Saya' : 'Nilai Hakim'}</th>
                  <th className="py-3.5 px-4 text-center">Aksi Penilaian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {filteredParticipants.map((p, pIdx) => {
                  const isFinal = p.judgeStatus === 'finalized';
                  const isInProgress = p.judgeStatus === 'in_progress';

                  return (
                    <tr key={`${p.id}-${pIdx}`} className="even:bg-slate-50/40 hover:bg-emerald-50/40 transition-colors">
                      <td className="py-3.5 px-4 text-center font-bold text-slate-900 font-mono tabular-nums text-sm">
                        {p.lotteryNumber}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums font-bold text-emerald-800 text-xs">
                        {p.participantId}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-900 text-sm">
                        {p.name}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 text-sm">{p.kafilahName}</td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-800 text-sm">{p.branchName}</p>
                        <p className="text-xs text-slate-500">{p.stageName}</p>
                      </td>
                      <td className="py-3.5 px-4">
                        {p.totalQuestions === 0 ? (
                          <Badge variant="warning">Maqra Belum Ditetapkan</Badge>
                        ) : (
                          <div className="space-y-1">
                            {p.stageQuestions.map((q, qIdx) => (
                              <div key={`${q.id || q.questionId}-${qIdx}`} className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="font-semibold text-emerald-800">
                                  {q.code ? `${q.code}: ` : ''}{q.title}
                                </span>
                                <span className="text-xs text-slate-500 font-mono tabular-nums">
                                  (Hal. {q.pageStart && q.pageEnd && q.pageStart !== q.pageEnd ? `${q.pageStart}-${q.pageEnd}` : q.pageNumber})
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {p.judgeStatus === 'no_maqra' ? (
                          <Badge variant="neutral">Maqra Belum Ada</Badge>
                        ) : isFinal ? (
                          <Badge variant="success" icon={<Lock className="w-3 h-3" />}>
                            Final ({p.finalizedCount}/{p.totalQuestions} Maqra)
                          </Badge>
                        ) : isInProgress ? (
                          <Badge variant="warning" dot>
                            Berlangsung ({p.finalizedCount}/{p.totalQuestions} Maqra)
                          </Badge>
                        ) : p.coveredByOthers ? (
                          <Badge variant="info" icon={<Lock className="w-3 h-3" />}>
                            Sudah Dinilai Juri Lain
                          </Badge>
                        ) : (
                          <Badge variant="neutral" icon={<Clock className="w-3 h-3" />}>
                            Belum Dimulai (0/{p.totalQuestions} Maqra)
                          </Badge>
                        )}
                        {p.otherJudgeNames.length > 0 && p.judgeStatus !== 'no_maqra' && (
                          <p className="mt-1 text-[11px] text-slate-500" data-testid="other-judges-note">
                            Dinilai juga: {p.otherJudgeNames.join(', ')}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-bold font-mono text-sm tabular-nums text-slate-900">
                        {p.judgeScore}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {p.totalQuestions === 0 ? (
                          <Button size="sm" variant="secondary" disabled title="Peserta belum memiliki maqra pada babak ini">
                            Menunggu Maqra
                          </Button>
                        ) : isInProgress ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => handleOpenScoring(p.id)}
                            leftIcon={<BookmarkCheck className="w-3.5 h-3.5" />}
                          >
                            Lanjut Menilai
                          </Button>
                        ) : isFinal ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenScoring(p.id)}
                            leftIcon={<BookmarkCheck className="w-3.5 h-3.5" />}
                          >
                            Lihat Lembar
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleOpenScoring(p.id)}
                            leftIcon={<BookmarkCheck className="w-3.5 h-3.5" />}
                          >
                            Mulai Menilai
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
