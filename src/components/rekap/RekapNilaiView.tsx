import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Download,
  Search,
  AlertCircle,
  Eye,
  X,
  Lock,
  Layers,
  CheckCircle2,
  Clock
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { buildStageOrderLookup, sortParticipantsForDisplay } from '../../utils/participantSort';
import { buildViewFilterKey, readViewFilters, writeViewFilters } from '../../utils/viewFilterStorage';
import { Participant, JudgeAssessment, AssignedMaqraItem } from '../../types/mtq';
import { aggregateParticipantScores, getActiveRubricFields } from '../../services/scoringEngine';
import { resolveRequiredJudgeIdsForStage } from '../../services/completion';

const ALLOWED_REKAP_STATUSES = [
  'Semua Status',
  'Belum Dimulai',
  'Berlangsung',
  'Menunggu Hakim Lain',
  'Lengkap'
] as const;

const DEFAULT_REKAP_FILTERS = {
  selectedStage: 'Semua Babak',
  selectedBranch: 'Semua Cabang',
  selectedKafilah: 'Semua Grup',
  selectedStatus: 'Semua Status'
};

export const RekapNilaiView: React.FC = () => {
  const {
    currentTenant,
    participants,
    assessments,
    users,
    stages,
    judgeAssignments,
    kafilahs,
    errorCategories,
    currentUser,
    reopenAssessment,
    getJudgeAssessment: getJudgeAssessmentFromContext,
    getParticipantProgress,
    getParticipantStageQuestions,
    setSelectedParticipantId,
    setCurrentView,
    getActiveRubricForBranch,
    getFieldCoverageForStage,
    getStageParticipation
  } = useMtq();

  /**
   * Nilai peserta dihitung sama dengan Hasil & Kelulusan dan server (compute_stage_rankings):
   * nilai tiap bidang dirata-rata dari hakim pemegang bidang itu, lalu dijumlah. Dipakai saat
   * hakim memegang bidang berbeda (mis. Tajwid vs Itqon) atau dewan hakim dibagi beberapa tim.
   * value = nilai final bila lengkap, selain itu nilai sementara.
   */
  const computeParticipantScore = (
    p: Participant,
    questions: AssignedMaqraItem[]
  ): { value: number | null; isFinal: boolean; inProgress: boolean } => {
    const sp = getStageParticipation(p.id, p.stageName);
    const requiredJudgeIds = resolveRequiredJudgeIdsForStage({
      tenantId: currentTenant.id,
      stageId: sp?.stageId || p.stageId,
      stageName: p.stageName,
      branchId: p.branchId,
      branchName: p.branchName,
      judgeAssignments
    });
    const coverage = getFieldCoverageForStage({
      stageId: sp?.stageId || p.stageId,
      stageName: p.stageName,
      branchId: p.branchId,
      branchName: p.branchName,
      requiredJudgeIds
    });
    const rubric = getActiveRubricForBranch(p.branchName, p.branchId);
    const fieldScope =
      coverage && rubric
        ? {
            judgeFieldScope: coverage.judgeFieldScope,
            rubricFields: getActiveRubricFields(rubric).map((f) => ({ name: f.name, maxScore: f.maxScore, weight: f.weight })),
            startingScore: rubric.startingScore ?? 100
          }
        : undefined;
    const tenantAssessments = assessments.filter((a) => a.tenantId === currentTenant.id && a.participantId === p.id);
    const agg = aggregateParticipantScores(
      p.id,
      p.stageName,
      questions,
      requiredJudgeIds,
      tenantAssessments,
      sp?.stageId || p.stageId,
      sp?.id,
      fieldScope
    );
    return {
      value: agg.isFullyFinalized ? agg.averageFinalScore : agg.provisionalScore,
      isFinal: agg.isFullyFinalized,
      inProgress: tenantAssessments.some(
        (a) => a.status === 'in_progress' && questions.some((q) => q.questionId === a.questionId)
      )
    };
  };

  // Data rekap diperbarui otomatis lewat realtime Supabase (lihat MtqContext): setiap lembar nilai yang berubah
  // langsung diterapkan per baris. Tidak ada lagi polling 3 detik yang memuat ulang seluruh data.

  const filterKey = buildViewFilterKey('rekap_nilai', currentTenant.id, currentUser.id);
  const loadedFilterKeyRef = useRef(filterKey);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStage, setSelectedStage] = useState<string>(
    () => readViewFilters(filterKey, DEFAULT_REKAP_FILTERS).selectedStage || 'Semua Babak'
  );
  const [selectedBranch, setSelectedBranch] = useState<string>(
    () => readViewFilters(filterKey, DEFAULT_REKAP_FILTERS).selectedBranch || 'Semua Cabang'
  );
  const [selectedKafilah, setSelectedKafilah] = useState<string>(
    () => readViewFilters(filterKey, DEFAULT_REKAP_FILTERS).selectedKafilah || 'Semua Grup'
  );
  const [selectedStatus, setSelectedStatus] = useState<string>(() => {
    const saved = readViewFilters(filterKey, DEFAULT_REKAP_FILTERS).selectedStatus;
    return (ALLOWED_REKAP_STATUSES as readonly string[]).includes(saved) ? saved : 'Semua Status';
  });
  const [inspectedParticipant, setInspectedParticipant] = useState<Participant | null>(null);
  const [modalSelectedQuestionId, setModalSelectedQuestionId] = useState<string>('');
  const tableCardRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const prevTableScrollTopRef = useRef(0);
  const [tableViewportMaxHeight, setTableViewportMaxHeight] = useState<number | null>(null);

  // Ukur tinggi area <main> agar saat bagian judul & filter tergulir ke atas, tabel mengisi penuh viewport
  useEffect(() => {
    const tableEl = tableScrollRef.current;
    const mainEl = tableEl?.closest('main') as HTMLElement | null;
    if (!mainEl) return;

    const updateHeight = () => {
      const h = mainEl.clientHeight;
      if (h > 0) {
        setTableViewportMaxHeight(Math.max(240, h - 26));
      }
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(mainEl);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Scroll chaining: saat pengguna menggulir tabel ke bawah, gulir halaman (<main>) terlebih dahulu
  // hingga bagian judul, tombol Ekspor CSV, dan filter tergulir ke atas, baru gulir isi tabel
  useEffect(() => {
    const tableEl = tableScrollRef.current;
    if (!tableEl) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.deltaY === 0) return;

      const mainEl = tableEl.closest('main') as HTMLElement | null;
      const cardEl = tableCardRef.current;
      if (!mainEl || !cardEl) return;

      let deltaY = e.deltaY;
      if (e.deltaMode === 1) deltaY *= 32;
      else if (e.deltaMode === 2) deltaY *= mainEl.clientHeight;

      const maxMainScroll = mainEl.scrollHeight - mainEl.clientHeight;
      if (maxMainScroll <= 1) return;

      const mainRect = mainEl.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const dockGap = 12;
      const dockScrollTop = Math.max(
        0,
        Math.min(maxMainScroll, mainEl.scrollTop + (cardRect.top - mainRect.top) - dockGap)
      );

      if (deltaY > 0) {
        const remainingMainDown = dockScrollTop - mainEl.scrollTop;
        if (remainingMainDown > 0.5) {
          e.preventDefault();
          const consumedByMain = Math.min(deltaY, remainingMainDown);
          mainEl.scrollTop += consumedByMain;
          const leftover = deltaY - consumedByMain;
          if (leftover > 0.5 && tableEl.scrollHeight > tableEl.clientHeight + 1) {
            tableEl.scrollTop += leftover;
          }
        }
      } else {
        const canScrollTableUp = tableEl.scrollTop > 0.5;
        if (canScrollTableUp) {
          const nextTableTop = tableEl.scrollTop + deltaY;
          if (nextTableTop < 0 && mainEl.scrollTop > 0.5) {
            e.preventDefault();
            tableEl.scrollTop = 0;
            mainEl.scrollTop = Math.max(0, mainEl.scrollTop + nextTableTop);
          }
        } else if (mainEl.scrollTop > 0.5) {
          e.preventDefault();
          mainEl.scrollTop = Math.max(0, mainEl.scrollTop + deltaY);
        }
      }
    };

    tableEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      tableEl.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const tableEl = e.currentTarget;
    const prevTop = prevTableScrollTopRef.current;
    const currTop = tableEl.scrollTop;
    prevTableScrollTopRef.current = currTop;

    // Fallback saat pengguna menyeret scrollbar tabel atau menggeser layar sentuh ke bawah
    if (currTop > prevTop && currTop > 2) {
      const mainEl = tableEl.closest('main') as HTMLElement | null;
      const cardEl = tableCardRef.current;
      if (!mainEl || !cardEl) return;

      const maxMainScroll = mainEl.scrollHeight - mainEl.clientHeight;
      if (maxMainScroll <= 1) return;

      const mainRect = mainEl.getBoundingClientRect();
      const cardRect = cardEl.getBoundingClientRect();
      const dockGap = 12;
      const remainingMainDown = cardRect.top - mainRect.top - dockGap;

      if (remainingMainDown > 8 && mainEl.scrollTop < maxMainScroll - 1) {
        const targetMainTop = Math.max(
          0,
          Math.min(maxMainScroll, mainEl.scrollTop + remainingMainDown)
        );
        mainEl.scrollTo({ top: targetMainTop, behavior: 'smooth' });
      }
    }
  };

  useEffect(() => {
    if (loadedFilterKeyRef.current !== filterKey) {
      loadedFilterKeyRef.current = filterKey;
      const saved = readViewFilters(filterKey, DEFAULT_REKAP_FILTERS);
      setSelectedStage(saved.selectedStage || 'Semua Babak');
      setSelectedBranch(saved.selectedBranch || 'Semua Cabang');
      setSelectedKafilah(saved.selectedKafilah || 'Semua Grup');
      setSelectedStatus(
        (ALLOWED_REKAP_STATUSES as readonly string[]).includes(saved.selectedStatus)
          ? saved.selectedStatus
          : 'Semua Status'
      );
      return;
    }

    writeViewFilters(filterKey, {
      selectedStage,
      selectedBranch,
      selectedKafilah,
      selectedStatus
    });
  }, [filterKey, selectedStage, selectedBranch, selectedKafilah, selectedStatus]);

  // Reopen Assessment Modal State (Audit Correction Policy)
  const [reopenTarget, setReopenTarget] = useState<{
    participantId: string;
    judgeId: string;
    judgeName: string;
    stageName: string;
    questionId?: string;
  } | null>(null);
  const [reopenReason, setReopenReason] = useState<string>('');
  const [reopenAlert, setReopenAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleConfirmReopen = async () => {
    if (!reopenTarget || !reopenReason.trim()) return;
    const res = await reopenAssessment(
      reopenTarget.participantId,
      reopenTarget.judgeId,
      reopenReason.trim(),
      reopenTarget.stageName,
      reopenTarget.questionId
    );
    if (res.success) {
      setReopenAlert({ type: 'success', message: res.message });
      setReopenTarget(null);
      setReopenReason('');
    } else {
      setReopenAlert({ type: 'error', message: res.message });
    }
  };

  // Available stages from configured stages
  const stageOptions = useMemo(() => {
    const list = stages.map((s) => s.name);
    return ['Semua Babak', ...Array.from(new Set(list))];
  }, [stages]);

  // Cabang lomba yang benar-benar punya peserta pada tenant ini
  const branchOptions = useMemo(() => {
    const list = participants
      .filter((p) => p.tenantId === currentTenant.id)
      .map((p) => p.branchName)
      .filter(Boolean);
    return ['Semua Cabang', ...Array.from(new Set(list)).sort((a, b) => a.localeCompare(b, 'id'))];
  }, [participants, currentTenant.id]);

  // Available kafilahs from active records
  const kafilahOptions = useMemo(() => {
    const list = kafilahs.map((k) => k.name);
    return ['Semua Grup', ...Array.from(new Set(list))];
  }, [kafilahs]);

  // Reset nilai tersimpan jika opsi sudah tidak tersedia (hanya setelah daftar opsi termuat)
  useEffect(() => {
    if (selectedStage !== 'Semua Babak' && stageOptions.length > 1 && !stageOptions.includes(selectedStage)) {
      setSelectedStage('Semua Babak');
    }
  }, [selectedStage, stageOptions]);

  useEffect(() => {
    if (selectedBranch !== 'Semua Cabang' && branchOptions.length > 1 && !branchOptions.includes(selectedBranch)) {
      setSelectedBranch('Semua Cabang');
    }
  }, [selectedBranch, branchOptions]);

  useEffect(() => {
    if (selectedKafilah !== 'Semua Grup' && kafilahOptions.length > 1 && !kafilahOptions.includes(selectedKafilah)) {
      setSelectedKafilah('Semua Grup');
    }
  }, [selectedKafilah, kafilahOptions]);

  // Dynamic judges assigned to the competition stage / tenant
  const activeJudges = useMemo(() => {
    // If specific stage is selected, filter judge assignments for that stage
    if (selectedStage !== 'Semua Babak') {
      // Hanya hakim babak ini pada cabang terpilih. Satu hakim dengan beberapa bidang tampil satu kolom.
      const seenJudgeIds = new Set<string>();
      const assigned = judgeAssignments.filter((ja) => {
        if (ja.tenantId !== currentTenant.id || ja.status === 'Nonaktif') return false;
        if (ja.stageName !== selectedStage) return false;
        if (
          selectedBranch !== 'Semua Cabang' &&
          ja.branchName &&
          ja.branchName !== 'Semua Cabang' &&
          ja.branchName !== selectedBranch
        ) {
          return false;
        }
        if (seenJudgeIds.has(ja.judgeId)) return false;
        seenJudgeIds.add(ja.judgeId);
        return true;
      });
      if (assigned.length > 0) {
        return assigned.map((ja) => {
          const userObj = users.find((u) => u.id === ja.judgeId);
          return {
            id: ja.judgeId,
            name: ja.judgeName,
            field: ja.judgeField,
            category: userObj?.judgeCategory || 'Hakim'
          };
        });
      }
    }

    // Default to all judges in current tenant
    const judgesInTenant = users.filter((u) => u.role === 'judge' && u.tenantId === currentTenant.id);
    if (judgesInTenant.length > 0) {
      return judgesInTenant.map((u) => ({
        id: u.id,
        name: u.name,
        field: u.judgeField || 'Dewan Hakim',
        category: u.judgeCategory || 'Hakim'
      }));
    }

    // Fallback if none defined
    return users.slice(1, 4).map((u) => ({
      id: u.id,
      name: u.name,
      field: u.judgeField || 'Dewan Hakim',
      category: u.judgeCategory || 'Hakim'
    }));
  }, [selectedStage, selectedBranch, judgeAssignments, users, currentTenant.id]);

  // Filter participants
  // Urut cabang, babak, lalu nomor undian (urutan tampil); dipakai juga untuk ekspor CSV
  const stageOrder = useMemo(() => buildStageOrderLookup(stages), [stages]);
  const filteredParticipants = useMemo(() => {
    return sortParticipantsForDisplay(participants, { stageOrder }).filter((p) => {
      const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.participantId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.lotteryNumber.includes(searchQuery) ||
        p.kafilahName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStage = selectedStage === 'Semua Babak' || p.stageName === selectedStage;
      const matchesBranch = selectedBranch === 'Semua Cabang' || p.branchName === selectedBranch;
      const matchesKafilah = selectedKafilah === 'Semua Grup' || p.kafilahName === selectedKafilah;

      const progress = getParticipantProgress(p.id, p.stageName);
      const matchesStatus =
        selectedStatus === 'Semua Status' ||
        progress === selectedStatus ||
        p.status === selectedStatus;

      return matchesSearch && matchesStage && matchesBranch && matchesKafilah && matchesStatus;
    });
  }, [participants, stageOrder, searchQuery, selectedStage, selectedBranch, selectedKafilah, selectedStatus, getParticipantProgress, assessments]);

  const getJudgeAssessment = (
    participantId: string,
    judgeId: string,
    stageName?: string,
    questionId?: string
  ) => {
    return getJudgeAssessmentFromContext(participantId, judgeId, stageName, questionId);
  };

  // Export CSV dynamically including all assigned maqras per participant
  const handleExportCSV = () => {
    const headers = [
      'No Undian',
      'ID Peserta',
      'Nama Peserta',
      'Grup',
      'Babak',
      'Kode Maqra',
      'Judul Maqra',
      ...activeJudges.map((j) => `Pengurangan ${j.name} (${j.field})`),
      ...activeJudges.map((j) => `Nilai ${j.name} (${j.field})`),
      'Rata-rata Maqra',
      'Status Maqra',
      'Rata-rata Keseluruhan',
      'Status Kelengkapan'
    ];

    const rows: string[] = [];

    filteredParticipants.forEach((p) => {
      const stageQuestions = getParticipantStageQuestions(p.id, p.stageName);
      const overallProgress = getParticipantProgress(p.id, p.stageName);

      // Compute participant overall average across all maqras
      let allScoresSum = 0;
      let allScoresCount = 0;
      let allUnitsFinalized = true;

      stageQuestions.forEach((q) => {
        activeJudges.forEach((j) => {
          const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
          if (asm && asm.status === 'finalized') {
            allScoresSum += asm.finalScore;
            allScoresCount++;
          } else {
            allUnitsFinalized = false;
            if (asm) {
              allScoresSum += asm.finalScore;
              allScoresCount++;
            }
          }
        });
      });

      const overallScore = computeParticipantScore(p, stageQuestions);
      const participantOverallAvg =
        overallScore.value !== null
          ? `${overallScore.value.toFixed(2)}${!overallScore.isFinal ? ' (Sementara)' : ''}`
          : '-';
      void allScoresSum;
      void allScoresCount;
      void allUnitsFinalized;

      if (stageQuestions.length === 0) {
        rows.push([
          `"${p.lotteryNumber}"`,
          `"${p.participantId}"`,
          `"${p.name.replace(/"/g, '""')}"`,
          `"${p.kafilahName.replace(/"/g, '""')}"`,
          `"${p.stageName}"`,
          `"-"`,
          `"Maqra Belum Ditetapkan"`,
          ...activeJudges.map(() => `"-"`),
          ...activeJudges.map(() => `"-"`),
          `"-"`,
          `"Belum Ditetapkan"`,
          `"-"`,
          `"${overallProgress}"`
        ].join(','));
      } else {
        stageQuestions.forEach((q) => {
          const judgeAssessments = activeJudges.map((j) =>
            getJudgeAssessment(p.id, j.id, p.stageName, q.questionId)
          );
          const deductions = judgeAssessments.map((a) => (a ? `-${a.totalDeductions.toFixed(2)}` : `"-"`));
          const scores = judgeAssessments.map((a) => (a ? `"${a.finalScore.toFixed(2)}"` : `"-"`));
          const validScores = judgeAssessments
            .map((a) => (a ? a.finalScore : null))
            .filter((s): s is number => s !== null);

          const maqraScore = computeParticipantScore(p, [q]);
          const isMaqraFinalized = maqraScore.isFinal;
          void validScores;

          const maqraAvg =
            maqraScore.value !== null
              ? `${maqraScore.value.toFixed(2)}${!isMaqraFinalized ? ' (Sementara)' : ''}`
              : '-';

          const maqraStatus = isMaqraFinalized
            ? 'Selesai'
            : judgeAssessments.some((a) => a?.status === 'in_progress')
            ? 'Berlangsung'
            : 'Menunggu';

          rows.push([
            `"${p.lotteryNumber}"`,
            `"${p.participantId}"`,
            `"${p.name.replace(/"/g, '""')}"`,
            `"${p.kafilahName.replace(/"/g, '""')}"`,
            `"${p.stageName}"`,
            `"${q.code}"`,
            `"${q.title.replace(/"/g, '""')}"`,
            ...deductions,
            ...scores,
            `"${maqraAvg}"`,
            `"${maqraStatus}"`,
            `"${participantOverallAvg}"`,
            `"${overallProgress}"`
          ].join(','));
        });
      }
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rekap_mtq_${currentTenant.code}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="px-4 pt-4 pb-3 sm:px-8 sm:pt-6 sm:pb-3 max-w-7xl mx-auto space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Rekap Nilai Real-Time
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.eventName} · {selectedStage === 'Semua Babak' ? 'Seluruh Babak' : `Babak ${selectedStage}`}
            {selectedBranch !== 'Semua Cabang' ? ` · ${selectedBranch}` : ''}
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Ekspor CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-[2] min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor undian, nama peserta, atau grup..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        <select
          value={selectedStage}
          onChange={(e) => setSelectedStage(e.target.value)}
          className="flex-1 min-w-[150px] px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
        >
          {stageOptions.map((stg) => (
            <option key={stg} value={stg}>
              {stg === 'Semua Babak' ? 'Semua Babak' : `Babak ${stg}`}
            </option>
          ))}
        </select>

        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          aria-label="Saring cabang lomba"
          className="flex-1 min-w-[150px] px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
        >
          {branchOptions.map((br) => (
            <option key={br} value={br}>
              {br}
            </option>
          ))}
        </select>

        <select
          value={selectedKafilah}
          onChange={(e) => setSelectedKafilah(e.target.value)}
          className="flex-1 min-w-[170px] px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
        >
          {kafilahOptions.map((kaf) => (
            <option key={kaf} value={kaf}>
              {kaf}
            </option>
          ))}
        </select>

        <select
          value={selectedStatus}
          onChange={(e) => setSelectedStatus(e.target.value)}
          className="flex-1 min-w-[160px] px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
        >
          <option value="Semua Status">Semua Status</option>
          <option value="Belum Dimulai">Belum Dimulai</option>
          <option value="Berlangsung">Berlangsung</option>
          <option value="Menunggu Hakim Lain">Menunggu Hakim Lain</option>
          <option value="Lengkap">Lengkap (Final)</option>
        </select>
      </div>

      {/* Dynamic Grouped-Header Table with Sticky Header, Sticky Identification & 2-Axis Scrolling */}
      <div
        ref={tableCardRef}
        className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden"
      >
        <div
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          style={tableViewportMaxHeight ? { maxHeight: `${tableViewportMaxHeight}px` } : undefined}
          className="overflow-auto max-w-full max-h-[calc(100dvh-92px)]"
        >
          <table className="w-full text-left border-separate border-spacing-0 min-w-[950px]">
            <thead className="sticky top-0 z-30 bg-slate-100 shadow-[0_-2px_0_0_#f1f5f9,0_1px_0_0_#cbd5e1]">
              {/* Top Grouped Header */}
              <tr className="bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider">
                <th
                  colSpan={2}
                  className="sticky left-0 z-40 bg-slate-100 px-4 py-2.5 border-b border-slate-200 sticky-col-divider shadow-[0_1px_0_0_#e2e8f0]"
                >
                  Identitas Peserta
                </th>
                <th className="px-1.5 py-2.5 border-b border-r border-slate-200 text-center bg-slate-50 text-slate-700 w-20 max-w-[80px] shadow-[0_1px_0_0_#e2e8f0]">
                  Maqra / Soal
                </th>
                {activeJudges.map((j, jIdx) => (
                  <th
                    key={`${j.id}-${jIdx}`}
                    colSpan={2}
                    className="px-3 py-2.5 border-b border-r border-slate-200 text-center bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]"
                  >
                    <span className="block text-slate-800">{j.name.split(',')[0]}</span>
                    <span className="text-xs text-slate-400 font-normal lowercase tracking-normal">
                      {j.field}
                    </span>
                  </th>
                ))}
                <th
                  colSpan={2}
                  className="px-4 py-2.5 text-center bg-slate-100 text-slate-700 border-b border-r border-slate-200 shadow-[0_1px_0_0_#e2e8f0]"
                >
                  Hasil Rekap
                </th>
                <th className="px-3 py-2.5 text-center bg-slate-50 text-slate-700 border-b border-slate-200 w-16 shadow-[0_1px_0_0_#e2e8f0]">
                  Aksi
                </th>
              </tr>

              {/* Secondary Subheaders with Centered Text */}
              <tr className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase">
                <th className="sticky left-0 z-40 bg-slate-50 px-3 py-2 w-[84px] min-w-[84px] max-w-[84px] border-b border-r border-slate-200 shadow-[1px_0_0_0_#f8fafc]">
                  Undian
                </th>
                <th className="sticky left-[84px] z-40 bg-slate-50 px-4 py-2 min-w-[170px] border-b border-slate-200 sticky-col-divider">
                  Nama & Grup
                </th>
                <th className="px-1.5 py-2 border-b border-r border-slate-200 bg-slate-50 text-center w-20 max-w-[80px]">
                  Maqra / Soal
                </th>

                {activeJudges.map((j, jIdx) => (
                  <React.Fragment key={`${j.id}-${jIdx}`}>
                    <th className="px-2.5 py-2 text-center w-24 min-w-[96px] border-b border-r border-slate-200 bg-slate-50 whitespace-nowrap">
                      Pengurangan
                    </th>
                    <th className="px-2.5 py-2 text-center w-24 min-w-[96px] border-b border-r border-slate-200 bg-slate-50 whitespace-nowrap">
                      Nilai Hakim
                    </th>
                  </React.Fragment>
                ))}

                <th className="px-3 py-2 text-center w-24 border-b border-slate-200 bg-slate-50 text-slate-600">
                  Rata-Rata
                </th>
                <th className="px-4 py-2 text-center w-28 border-b border-r border-slate-200 bg-slate-50 text-slate-600">
                  Status
                </th>
                <th className="px-3 py-2 text-center w-16 border-b border-slate-200 bg-slate-50 text-slate-600">
                  Rincian
                </th>
              </tr>
            </thead>

            <tbody className="text-sm">
              {filteredParticipants.length === 0 ? (
                <tr>
                  <td
                    colSpan={6 + activeJudges.length * 2}
                    className="p-8 text-center text-slate-400"
                  >
                    Tidak ada data peserta yang cocok dengan filter.
                  </td>
                </tr>
              ) : (
                filteredParticipants.map((p, pIdx) => {
                  const stageQuestions = getParticipantStageQuestions(p.id, p.stageName);
                  const rawProgress = getParticipantProgress(p.id, p.stageName);

                  // Calculate overall average across all questions for this participant
                  let totalScoreSum = 0;
                  let totalScoreCount = 0;
                  let finalizedScoreCount = 0;
                  let allFinalized = stageQuestions.length > 0 && activeJudges.length > 0;

                  stageQuestions.forEach((q) => {
                    activeJudges.forEach((j) => {
                      const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
                      if (asm && asm.status === 'finalized') {
                        totalScoreSum += asm.finalScore;
                        totalScoreCount++;
                        finalizedScoreCount++;
                      } else {
                        allFinalized = false;
                        if (asm) {
                          totalScoreSum += asm.finalScore;
                          totalScoreCount++;
                        }
                      }
                    });
                  });

                  const overallProgress =
                    stageQuestions.length === 0
                      ? 'Maqra Belum Ditetapkan'
                      : allFinalized || rawProgress === 'Lengkap'
                      ? 'Lengkap' // kelengkapan per bidang (mis. dua tim juri): tidak harus semua kolom hakim terisi
                      : rawProgress !== 'Belum Dimulai'
                      ? rawProgress
                      : finalizedScoreCount > 0
                      ? 'Menunggu Hakim Lain'
                      : totalScoreCount > 0
                      ? 'Berlangsung'
                      : rawProgress;

                  const overallAvg = computeParticipantScore(p, stageQuestions).value;

                  // Case 1: Participant has NO assigned questions for this stage
                  if (stageQuestions.length === 0) {
                    return (
                      <tr
                        key={`${p.id}-${pIdx}`}
                        className="hover:bg-slate-50/80 transition-colors group [&>td]:border-b [&>td]:border-slate-100"
                      >
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-3 w-[84px] min-w-[84px] max-w-[84px] font-mono font-bold text-slate-900 border-r border-slate-100 shadow-[1px_0_0_0_#ffffff] group-hover:shadow-[1px_0_0_0_#f8fafc]">
                          #{p.lotteryNumber}
                        </td>
                        <td className="sticky left-[84px] z-10 bg-white group-hover:bg-slate-50 px-4 py-3 min-w-[170px] sticky-col-divider">
                          <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {p.participantId} · {p.kafilahName}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {p.branchName} · {p.stageName}
                          </p>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-200 text-center">
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Maqra Belum Ditetapkan
                          </span>
                        </td>
                        {activeJudges.map((j, jIdx) => (
                          <React.Fragment key={`${j.id}-${jIdx}`}>
                            <td className="px-2.5 py-3 text-center font-mono text-xs text-slate-400 border-r border-slate-200">
                              -
                            </td>
                            <td className="px-2.5 py-3 text-center font-mono text-slate-300 border-r border-slate-200">
                              --
                            </td>
                          </React.Fragment>
                        ))}
                        <td className="px-3 py-3 text-center font-mono text-slate-300">
                          --
                        </td>
                        <td className="px-4 py-3 text-center border-r border-slate-100">
                          <span className="text-xs font-medium text-amber-700">
                            {overallProgress}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-slate-300">-</span>
                        </td>
                      </tr>
                    );
                  }

                  // Case 2: Participant has exactly 1 assigned question
                  if (stageQuestions.length === 1) {
                    const q = stageQuestions[0];
                    const judgeAssessments = activeJudges.map((j) =>
                      getJudgeAssessment(p.id, j.id, p.stageName, q.questionId)
                    );
                    const validScores = judgeAssessments
                      .map((a) => (a ? a.finalScore : null))
                      .filter((s): s is number => s !== null);
                    const singleScore = computeParticipantScore(p, stageQuestions);
                    const isSingleFinalized = singleScore.isFinal;
                    const avgScore = validScores.length > 0 ? singleScore.value : null;

                    return (
                      <tr
                        key={`${p.id}-${pIdx}`}
                        className="hover:bg-slate-50/80 transition-colors group [&>td]:border-b [&>td]:border-slate-100"
                      >
                        <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-3 w-[84px] min-w-[84px] max-w-[84px] font-mono font-bold text-slate-900 border-r border-slate-100 shadow-[1px_0_0_0_#ffffff] group-hover:shadow-[1px_0_0_0_#f8fafc]">
                          #{p.lotteryNumber}
                        </td>
                        <td className="sticky left-[84px] z-10 bg-white group-hover:bg-slate-50 px-4 py-3 min-w-[170px] sticky-col-divider">
                          <p className="font-bold text-slate-900 leading-tight">{p.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {p.participantId} · {p.kafilahName}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {p.branchName} · {p.stageName}
                          </p>
                        </td>
                        <td className="px-3 py-3 border-r border-slate-200 text-center">
                          <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                            {q.code}
                          </span>
                        </td>
                        {activeJudges.map((j, jIdx) => {
                          const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
                          return (
                            <React.Fragment key={`${j.id}-${jIdx}`}>
                              <td className="px-2.5 py-3 text-center font-mono text-xs text-slate-500 tabular-nums border-r border-slate-200 w-24 min-w-[96px]">
                                {asm ? `-${asm.totalDeductions.toFixed(2)}` : '-'}
                              </td>
                              <td className="px-2.5 py-3 text-center font-mono font-bold border-r border-slate-200 tabular-nums w-24 min-w-[96px] whitespace-nowrap">
                                {asm ? (
                                  <span className="text-slate-900">{asm.finalScore.toFixed(2)}</span>
                                ) : (
                                  <span className="text-slate-300 font-normal">--</span>
                                )}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-3 text-center font-mono font-extrabold text-slate-900">
                          {avgScore !== null ? (
                            <div>
                              <span className="text-sm">{avgScore.toFixed(2)}</span>
                              {!isSingleFinalized && (
                                <span className="block text-xs text-slate-500 font-normal">
                                  Sementara
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center border-r border-slate-100">
                          <span className="text-xs font-medium text-slate-700">
                            {overallProgress}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => {
                              setModalSelectedQuestionId(q.questionId);
                              setInspectedParticipant(p);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-emerald-800 hover:bg-slate-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                            title="Lihat Rincian Pengurangan Nilai"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  }

                  // Case 3: Participant has MULTIPLE assigned questions (Setiap satu maqra satu baris + baris akumulasi)
                  return (
                    <React.Fragment key={`${p.id}-${pIdx}`}>
                      {stageQuestions.map((q, qIdx) => {
                        const judgeAssessments = activeJudges.map((j) =>
                          getJudgeAssessment(p.id, j.id, p.stageName, q.questionId)
                        );
                        const validScores = judgeAssessments
                          .map((a) => (a ? a.finalScore : null))
                          .filter((s): s is number => s !== null);
                        const maqraScore = computeParticipantScore(p, [q]);
                        const isMaqraFinalized = maqraScore.isFinal;
                        const maqraAvg = validScores.length > 0 ? maqraScore.value : null;
                        const maqraStatus = isMaqraFinalized
                          ? 'Selesai'
                          : judgeAssessments.some((a) => a?.status === 'in_progress')
                          ? 'Berlangsung'
                          : 'Menunggu';

                        return (
                          <tr
                            key={`${p.id}-${q.id || q.questionId}-${qIdx}`}
                            className={`hover:bg-slate-50/80 transition-colors group [&>td]:border-b [&>td]:border-b-slate-100 ${
                              qIdx === 0 ? '[&>td]:border-t-2 [&>td]:border-t-slate-200' : ''
                            }`}
                          >
                            {/* Sticky Participant columns for first question row, or empty continuation */}
                            <td className="sticky left-0 z-10 bg-white group-hover:bg-slate-50 px-3 py-2.5 w-[84px] min-w-[84px] max-w-[84px] font-mono font-bold text-slate-900 border-r border-slate-100 shadow-[1px_0_0_0_#ffffff] group-hover:shadow-[1px_0_0_0_#f8fafc]">
                              #{p.lotteryNumber}
                            </td>
                            <td className="sticky left-[84px] z-10 bg-white group-hover:bg-slate-50 px-4 py-2.5 min-w-[170px] sticky-col-divider">
                              <p className="font-bold text-slate-900 leading-tight">
                                {p.name}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {p.participantId} · {p.kafilahName}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {p.branchName} · {p.stageName}
                              </p>
                            </td>

                            {/* Maqra Specific Column */}
                            <td className="px-3 py-2.5 border-r border-slate-200 text-center bg-slate-50/30">
                              <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded-sm border border-emerald-200 inline-block">
                                {q.code}
                              </span>
                            </td>

                            {/* Scores for this specific maqra */}
                            {activeJudges.map((j, jIdx) => {
                              const asm = getJudgeAssessment(p.id, j.id, p.stageName, q.questionId);
                              return (
                                <React.Fragment key={`${j.id}-${jIdx}`}>
                                  <td className="px-2.5 py-2.5 text-center font-mono text-xs text-slate-500 tabular-nums border-r border-slate-200 w-24 min-w-[96px]">
                                    {asm ? `-${asm.totalDeductions.toFixed(2)}` : '-'}
                                  </td>
                                  <td className="px-2.5 py-2.5 text-center font-mono font-bold border-r border-slate-200 tabular-nums w-24 min-w-[96px] whitespace-nowrap">
                                    {asm ? (
                                      <span className="text-slate-900">{asm.finalScore.toFixed(2)}</span>
                                    ) : (
                                      <span className="text-slate-300 font-normal">--</span>
                                    )}
                                  </td>
                                </React.Fragment>
                              );
                            })}

                            {/* Rata-Rata Maqra */}
                            <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-800">
                              {maqraAvg !== null ? (
                                <div>
                                  <span className="text-xs">{maqraAvg.toFixed(2)}</span>
                                  {!isMaqraFinalized && (
                                    <span className="block text-xs text-slate-400 font-normal">
                                      Sementara
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-300">--</span>
                              )}
                            </td>

                            {/* Status Maqra */}
                            <td className="px-4 py-2.5 text-center border-r border-slate-100">
                              <span
                                className={`text-xs font-semibold ${
                                  isMaqraFinalized
                                    ? 'text-emerald-700'
                                    : maqraStatus === 'Berlangsung'
                                    ? 'text-amber-700'
                                    : 'text-slate-400'
                                }`}
                              >
                                {maqraStatus}
                              </span>
                            </td>

                            {/* Aksi Per Maqra */}
                            <td className="px-3 py-2.5 text-center">
                              <button
                                onClick={() => {
                                  setModalSelectedQuestionId(q.questionId);
                                  setInspectedParticipant(p);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-emerald-800 hover:bg-slate-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                                title={`Rincian Maqra ${qIdx + 1}`}
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* Participant Aggregate Summary Row */}
                      <tr className="bg-emerald-50/40 [&>td]:border-b-2 [&>td]:border-b-slate-300 text-xs font-semibold">
                        <td
                          colSpan={2}
                          className="sticky left-0 z-10 bg-emerald-50 px-4 py-2 text-slate-700 font-bold text-xs uppercase tracking-wide sticky-col-divider"
                        >
                          Akumulasi Peserta #{p.lotteryNumber}
                        </td>
                        <td className="px-3 py-2 text-center text-emerald-950 font-bold text-xs border-r border-slate-200">
                          Total Maqra {stageQuestions.length}
                        </td>
                        {activeJudges.map((j, jIdx) => {
                          const judgeScores = stageQuestions
                            .map((q) => getJudgeAssessment(p.id, j.id, p.stageName, q.questionId))
                            .map((a) => (a ? a.finalScore : null))
                            .filter((s): s is number => s !== null);
                          const jAvg =
                            judgeScores.length > 0
                              ? judgeScores.reduce((a, b) => a + b, 0) / judgeScores.length
                              : null;

                          return (
                            <React.Fragment key={`${j.id}-${jIdx}`}>
                              <td className="px-2.5 py-2 text-center text-slate-400 font-mono text-xs border-r border-slate-200">
                                Σ Maqra
                              </td>
                              <td className="px-2.5 py-2 text-center font-mono font-extrabold text-emerald-950 border-r border-slate-200">
                                {jAvg !== null ? jAvg.toFixed(2) : '--'}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-2 text-center font-mono font-extrabold text-emerald-950 text-sm">
                          {overallAvg !== null ? (
                            <div>
                              <span>{overallAvg.toFixed(2)}</span>
                              {!allFinalized && (
                                <span className="block text-xs text-amber-700 font-normal">
                                  Sementara
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-300">--</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center border-r border-slate-200">
                          <span className="text-xs font-bold text-emerald-900">
                            {overallProgress}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => {
                              setModalSelectedQuestionId(stageQuestions[0]?.questionId || '');
                              setInspectedParticipant(p);
                            }}
                            className="p-1 rounded text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center justify-center"
                            title="Buka Rincian Lengkap"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Breakdown Modal per Judge & Maqra for Inspected Participant */}
      {inspectedParticipant && (() => {
        const participantQuestions = getParticipantStageQuestions(
          inspectedParticipant.id,
          inspectedParticipant.stageName
        );
        const activeQuestionId =
          modalSelectedQuestionId || participantQuestions[0]?.questionId || '';
        const activeQuestion =
          participantQuestions.find((q) => q.questionId === activeQuestionId) ||
          participantQuestions[0];

        const participantAssessments = activeJudges.map((j) =>
          getJudgeAssessment(
            inspectedParticipant.id,
            j.id,
            inspectedParticipant.stageName,
            activeQuestionId
          )
        );
        const finalizedJudges = participantAssessments.filter((a) => a?.status === 'finalized').length;
        const validJudgeScores = participantAssessments
          .map((a) => (a ? a.finalScore : null))
          .filter((s): s is number => s !== null);
        const inspectedScore = activeQuestion ? computeParticipantScore(inspectedParticipant, [activeQuestion]) : null;
        const avgScore =
          validJudgeScores.length > 0 && inspectedScore?.value != null ? inspectedScore.value.toFixed(2) : '—';

        return (
          <div className="fixed inset-0 bg-slate-950/75 flex items-center justify-center p-3 sm:p-5 z-50">
            <div className="bg-white rounded-xl max-w-3xl w-full shadow-lg border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-emerald-800 bg-emerald-100/70 px-2.5 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider">
                      Rincian Penilaian Juri
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-semibold text-slate-600">
                      Babak {inspectedParticipant.stageName}
                    </span>
                  </div>
                  <h3 className="font-extrabold text-lg text-slate-900 leading-tight">
                    #{inspectedParticipant.lotteryNumber} {inspectedParticipant.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {inspectedParticipant.participantId} · {inspectedParticipant.kafilahName} · {inspectedParticipant.branchName}
                  </p>
                </div>
                <button
                  onClick={() => setInspectedParticipant(null)}
                  aria-label="Tutup rincian penilaian"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Maqra Navigation Tabs if Multi-Maqra */}
              {participantQuestions.length > 1 && (
                <div className="flex items-center gap-2 px-4 sm:px-5 py-2.5 bg-slate-100/80 border-b border-slate-200 overflow-x-auto">
                  <span className="text-xs font-bold text-slate-600 uppercase tracking-wider shrink-0 mr-1">
                    Pilih Maqra:
                  </span>
                  {participantQuestions.map((q, idx) => {
                    const isSelected = q.questionId === activeQuestionId;
                    return (
                      <button
                        key={`${q.id || q.questionId}-${idx}`}
                        onClick={() => setModalSelectedQuestionId(q.questionId)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-800 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        <span className="font-mono text-xs opacity-75">Maqra {idx + 1}:</span>
                        <span>[{q.code}] {q.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Active Maqra Context Banner */}
              {activeQuestion && (
                <div className="px-4 sm:px-5 py-2.5 bg-emerald-50/50 border-b border-emerald-100 flex flex-wrap items-center justify-between text-xs gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-900 bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {activeQuestion.code}
                    </span>
                    <span className="font-semibold text-slate-800">{activeQuestion.title}</span>
                  </div>
                  <span className="text-slate-600 text-xs font-medium">
                    {activeQuestion.surahName ? `QS. ${activeQuestion.surahName}: ${activeQuestion.startAyah || 1} - ${activeQuestion.endAyah || 1}` : ''}
                    {activeQuestion.pageStart ? ` · Halaman ${activeQuestion.pageStart}` : ''}
                  </span>
                </div>
              )}

              {/* Summary Metrics Cards */}
              <div className="grid grid-cols-3 gap-3 p-4 sm:p-5 bg-white border-b border-slate-100">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-xs text-slate-500 block font-medium">Hakim Bertugas</span>
                  <span className="font-mono font-bold text-base text-slate-900 mt-0.5 block tabular-nums">
                    {activeJudges.length} Dewan Hakim
                  </span>
                </div>
                <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80">
                  <span className="text-xs text-emerald-800 block font-medium">Status Penilaian Maqra</span>
                  <span className="font-mono font-bold text-base text-emerald-900 mt-0.5 block tabular-nums">
                    {finalizedJudges} dari {activeJudges.length} Selesai
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-xs text-slate-500 block font-medium">Nilai Maqra Ini</span>
                  <span className="font-mono font-bold text-base text-emerald-900 mt-0.5 block tabular-nums">
                    {avgScore} {inspectedScore && !inspectedScore.isFinal && validJudgeScores.length > 0 ? '(Sementara)' : ''}
                  </span>
                </div>
              </div>

              {/* Structured Judges Breakdown Table */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold uppercase text-xs tracking-wider">
                        <th className="px-4 py-2.5">Dewan Hakim & Bidang</th>
                        <th className="px-4 py-2.5">Rincian Kesalahan</th>
                        <th className="px-3 py-2.5 text-center">Pengurangan</th>
                        <th className="px-3 py-2.5 text-center">Nilai Akhir</th>
                        <th className="px-4 py-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeJudges.map((j, jIdx) => {
                        const asm = getJudgeAssessment(
                          inspectedParticipant.id,
                          j.id,
                          inspectedParticipant.stageName,
                          activeQuestionId
                        );
                        const isFinal = asm?.status === 'finalized';
                        const inProgress = asm?.status === 'in_progress';
                        const activeErrors = Object.entries(asm?.errorCounts || {}).filter(
                          ([_, count]) => count > 0
                        );

                        return (
                          <tr key={`${j.id}-${jIdx}`} className="hover:bg-slate-50/70 transition-colors">
                            <td className="px-4 py-3 align-top">
                              <p className="font-bold text-slate-900">{j.name}</p>
                              <p className="text-xs text-slate-500 mt-0.5">{j.field}</p>
                              {asm?.annotations && asm.annotations.length > 0 && (
                                <span className="inline-block text-xs text-slate-400 mt-1 font-mono">
                                  {asm.annotations.length} anotasi mushaf
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 align-top">
                              {!asm ? (
                                <span className="text-slate-400 italic">Belum mulai menilai</span>
                              ) : activeErrors.length === 0 ? (
                                <span className="text-emerald-700 font-medium">
                                  Sempurna (0 kesalahan tercatat)
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {activeErrors.map(([catId, count], catIdx) => {
                                    const deduction = asm.deductions?.[catId] || 0;
                                    const categoryObj = errorCategories.find((c) => c.id === catId);
                                    const categoryName = categoryObj
                                      ? categoryObj.name
                                      : catId.replace('cat-', '').replace(/-/g, ' ');
                                    return (
                                      <div
                                        key={`${catId}-${catIdx}`}
                                        className="flex items-center justify-between text-xs gap-2"
                                      >
                                        <span className="text-slate-700 font-medium">
                                          {categoryName}:
                                        </span>
                                        <span className="font-mono text-slate-500 tabular-nums">
                                          {count}x (-{deduction.toFixed(2)})
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>

                            <td className="px-3 py-3 align-top text-center font-mono font-bold text-rose-600 tabular-nums">
                              {asm ? `-${asm.totalDeductions.toFixed(2)}` : '—'}
                            </td>

                            <td className="px-3 py-3 align-top text-center font-mono font-bold text-slate-900 text-sm tabular-nums">
                              {asm ? asm.finalScore.toFixed(2) : '—'}
                            </td>

                            <td className="px-4 py-3 align-top text-center">
                              {isFinal ? (
                                <div>
                                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>Terkunci</span>
                                  </span>
                                  {currentUser.role !== 'judge' && (
                                    <button
                                      onClick={() =>
                                        setReopenTarget({
                                          participantId: inspectedParticipant.id,
                                          judgeId: j.id,
                                          judgeName: j.name,
                                          stageName: inspectedParticipant.stageName,
                                          questionId: activeQuestionId
                                        })
                                      }
                                      className="mt-1.5 block mx-auto text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-md cursor-pointer transition-colors shadow-sm"
                                      title="Buka kembali lembar nilai untuk koreksi dewan hakim"
                                    >
                                      Buka Kunci
                                    </button>
                                  )}
                                </div>
                              ) : inProgress ? (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                  <Clock className="w-3 h-3 text-amber-600" />
                                  <span>Menilai</span>
                                </span>
                              ) : (
                                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                  Menunggu
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Tersimpan di browser (Lokal Prototipe)
                </span>
                <button
                  onClick={() => setInspectedParticipant(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Tutup Rincian
                </button>
              </div>
            </div>

            {/* Reopen Assessment Confirmation Modal */}
            {reopenTarget && (
              <div className="fixed inset-0 z-60 bg-slate-900/60 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-lg border border-slate-200">
                  <div className="flex items-center gap-3 text-amber-800">
                    <div className="p-2 bg-amber-100 rounded-xl">
                      <Clock className="w-5 h-5 text-amber-700" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-sm text-slate-900">Buka Kunci Lembar Penilaian</h4>
                      <p className="text-xs text-slate-500">Kebijakan Koreksi & Rekam Jejak Audit</p>
                    </div>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Anda akan membuka kembali lembar penilaian <strong>{reopenTarget.judgeName}</strong> untuk peserta ini pada Babak {reopenTarget.stageName}. Tindakan ini akan dicatat secara permanen di Audit Log.
                  </p>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Alasan Pembukaan Kembali (Wajib untuk Audit):
                    </label>
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="Contoh: Kesalahan input salah satu kategori, permohonan resmi dewan hakim..."
                      rows={3}
                      className="w-full p-2.5 text-xs border border-slate-300 rounded-xl focus:border-emerald-600 outline-none"
                    />
                  </div>
                  {reopenAlert && reopenAlert.type === 'error' && (
                    <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                      {reopenAlert.message}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        setReopenTarget(null);
                        setReopenReason('');
                        setReopenAlert(null);
                      }}
                      className="px-3 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleConfirmReopen}
                      disabled={reopenReason.trim().length < 5}
                      className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer transition-all"
                    >
                      Buka Kunci Lembar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};
