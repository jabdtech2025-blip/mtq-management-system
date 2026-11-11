import React, { useState, useMemo } from 'react';
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
    cabangList
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Semua Status');
  const [branchFilter, setBranchFilter] = useState('Semua Cabang');

  const tenantBranchNames = useMemo(() => {
    const names = (cabangList || [])
      .filter((c) => (!c.tenantId || c.tenantId === currentTenant.id) && c.status !== 'Nonaktif')
      .map((c) => c.name)
      .filter(Boolean);
    return Array.from(new Set(names));
  }, [cabangList, currentTenant.id]);

  const tenantJudges = useMemo(() => {
    return users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id);
  }, [users, currentTenant.id]);

  const [adminSelectedJudgeId, setAdminSelectedJudgeId] = useState<string>(
    currentUser.role === 'judge' ? currentUser.id : tenantJudges[0]?.id || ''
  );

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
          const matchesBranch =
            !ja.branchName ||
            p.branchName.toLowerCase().includes(ja.branchName.toLowerCase()) ||
            ja.branchName.toLowerCase().includes(p.branchName.toLowerCase());
          return matchesStage && matchesBranch;
        });
      }
      if (judgeProfile?.assignedBranch) {
        const matchesStage = !judgeProfile.assignedStage || judgeProfile.assignedStage === p.stageName;
        const matchesBranch =
          p.branchName.toLowerCase().includes(judgeProfile.assignedBranch.toLowerCase()) ||
          judgeProfile.assignedBranch.toLowerCase().includes(p.branchName.toLowerCase());
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
        judgeStatus: status
      };
    });
  }, [assignedParticipants, assessments, currentTenant.id, activeJudgeId, getParticipantStageQuestions]);

  const filteredParticipants = participantsWithJudgeState.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.participantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.lotteryNumber.includes(searchQuery) ||
      p.kafilahName.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'Semua Status' ||
      (statusFilter === 'Final' && p.judgeStatus === 'finalized') ||
      (statusFilter === 'Berlangsung' && p.judgeStatus === 'in_progress') ||
      (statusFilter === 'Menunggu' && (p.judgeStatus === 'not_started' || p.judgeStatus === 'no_maqra'));

    const matchesBranch =
      branchFilter === 'Semua Cabang' || p.branchName.includes(branchFilter);

    return matchesSearch && matchesStatus && matchesBranch;
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
                        ) : (
                          <Badge variant="neutral" icon={<Clock className="w-3 h-3" />}>
                            Belum Dimulai (0/{p.totalQuestions} Maqra)
                          </Badge>
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
