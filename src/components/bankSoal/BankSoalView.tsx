import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Eye,
  X,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  Dice5,
  CheckCircle2,
  Edit2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Users,
  Check,
  RefreshCw,
  Sliders
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Question, Participant } from '../../types/mtq';

export const BankSoalView: React.FC = () => {
  const {
    questions,
    addQuestion,
    updateQuestion,
    participants,
    assignMaqraToParticipant,
    addQuestionToParticipant,
    removeQuestionFromParticipant,
    conductLotteryDraw,
    commitLotteryDrawResults,
    stages
  } = useMtq();

  const [activeTab, setActiveTab] = useState<'daftar_soal' | 'penetapan_soal'>('daftar_soal');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('Semua Cabang');
  const [selectedStage, setSelectedStage] = useState('Semua Babak');

  // Preview Modal
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [previewCurrentPageIndex, setPreviewCurrentPageIndex] = useState<number>(0);
  const [previewViewMode, setPreviewViewMode] = useState<'single' | 'gallery'>('single');
  const [previewZoom, setPreviewZoom] = useState<number>(100);

  // Manual Assign Modal
  const [manualAssignQuestion, setManualAssignQuestion] = useState<Question | null>(null);
  const [targetParticipantId, setTargetParticipantId] = useState('');

  // Lottery Draw Workflow Modal
  const [isLotteryModalOpen, setIsLotteryModalOpen] = useState(false);
  const [lotteryStage, setLotteryStage] = useState('Penyisihan');
  const [lotteryBranch, setLotteryBranch] = useState('Semua Cabang');
  const [lotteryQuestionsPerParticipant, setLotteryQuestionsPerParticipant] = useState<number>(1);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [isDrawingAnimation, setIsDrawingAnimation] = useState(false);
  const [lotteryDrawResults, setLotteryDrawResults] = useState<{
    participantId: string;
    participantName: string;
    questionIds: string[];
    questionTitles: string[];
  }[] | null>(null);
  const [lotteryFeedback, setLotteryFeedback] = useState<string>('');

  // Add / Edit Form Modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSurah, setFormSurah] = useState('Maryam');
  const [formSurahNum, setFormSurahNum] = useState(19);
  const [formStartAyah, setFormStartAyah] = useState(1);
  const [formEndAyah, setFormEndAyah] = useState(15);
  const [formPageStart, setFormPageStart] = useState(305);
  const [formPageEnd, setFormPageEnd] = useState(305);
  const [formBranch, setFormBranch] = useState('Tilawah Dewasa Putra Ulya');
  const [formStage, setFormStage] = useState('Penyisihan');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');

  // Filtered Questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchesSearch =
        q.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.surahName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBranch =
        selectedBranch === 'Semua Cabang' || q.branchAndLevel.includes(selectedBranch);
      const matchesStage =
        selectedStage === 'Semua Babak' || q.stageName === selectedStage;
      return matchesSearch && matchesBranch && matchesStage;
    });
  }, [questions, searchQuery, selectedBranch, selectedStage]);

  // Assigned Maqra Rows for Tab 2 (Setiap satu maqra satu baris)
  const assignedMaqraRows = useMemo(() => {
    interface MaqraRowItem {
      rowKey: string;
      participantId: string;
      participantNo: string;
      participantName: string;
      kafilahName: string;
      branchName: string;
      stageName: string;
      questionId: string;
      questionCode: string;
      questionTitle: string;
      surahDisplay: string;
      pageDisplay: string;
      questionObj?: Question;
    }

    const rows: MaqraRowItem[] = [];

    participants.forEach((p) => {
      if (p.assignedQuestions && p.assignedQuestions.length > 0) {
        p.assignedQuestions.forEach((aq, idx) => {
          const qObj = questions.find((q) => q.id === aq.questionId);
          const code = aq.code || qObj?.code || `MQ-${idx + 1}`;
          const title = aq.title || qObj?.title || 'Maqra Tilawah';
          const surah = aq.surahName
            ? `QS. ${aq.surahName} [${aq.surahNumber || ''}]: ${aq.startAyah || 1} - ${aq.endAyah || 1}`
            : qObj
            ? `QS. ${qObj.surahName} [${qObj.surahNumber}]: ${qObj.startAyah} - ${qObj.endAyah}`
            : '';
          const pStart = aq.pageStart || qObj?.pageStart || aq.pageNumber || qObj?.pageNumber || 1;
          const pEnd = aq.pageEnd || qObj?.pageEnd || aq.pageNumber || qObj?.pageNumber || pStart;
          const pageDisplay = pStart !== pEnd ? `Hal. ${pStart} - ${pEnd}` : `Hal. ${pStart}`;

          rows.push({
            rowKey: `${p.id}-${aq.questionId}-${idx}`,
            participantId: p.id,
            participantNo: p.lotteryNumber || p.participantId,
            participantName: p.name,
            kafilahName: p.kafilahName,
            branchName: p.branchName,
            stageName: aq.stageName || p.stageName,
            questionId: aq.questionId,
            questionCode: code,
            questionTitle: title,
            surahDisplay: surah,
            pageDisplay,
            questionObj: qObj
          });
        });
      } else if (p.questionId) {
        const qObj = questions.find((q) => q.id === p.questionId);
        const code = qObj?.code || 'MQ-01';
        const title = p.assignedMaqra || qObj?.title || 'Maqra Tilawah';
        const surah = qObj
          ? `QS. ${qObj.surahName} [${qObj.surahNumber}]: ${qObj.startAyah} - ${qObj.endAyah}`
          : '';
        const pStart = qObj?.pageStart || p.pageNumber || qObj?.pageNumber || 1;
        const pEnd = qObj?.pageEnd || p.pageNumber || qObj?.pageNumber || pStart;
        const pageDisplay = pStart !== pEnd ? `Hal. ${pStart} - ${pEnd}` : `Hal. ${pStart}`;

        rows.push({
          rowKey: `${p.id}-${p.questionId}-single`,
          participantId: p.id,
          participantNo: p.lotteryNumber || p.participantId,
          participantName: p.name,
          kafilahName: p.kafilahName,
          branchName: p.branchName,
          stageName: p.stageName,
          questionId: p.questionId,
          questionCode: code,
          questionTitle: title,
          surahDisplay: surah,
          pageDisplay,
          questionObj: qObj
        });
      }
    });

    return rows.filter((r) => {
      const matchesSearch =
        r.participantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.participantNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.questionCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.questionTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.kafilahName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBranch =
        selectedBranch === 'Semua Cabang' || r.branchName.includes(selectedBranch);
      const matchesStage =
        selectedStage === 'Semua Babak' || r.stageName === selectedStage;
      return matchesSearch && matchesBranch && matchesStage;
    });
  }, [participants, questions, searchQuery, selectedBranch, selectedStage]);

  // Pages list for active preview question
  const previewPages = useMemo(() => {
    if (!previewQuestion) return [];
    if (previewQuestion.pageNumbers && previewQuestion.pageNumbers.length > 0) {
      return previewQuestion.pageNumbers;
    }
    const start = previewQuestion.pageStart || previewQuestion.pageNumber || 1;
    const end = previewQuestion.pageEnd || previewQuestion.pageNumber || start;
    const pages: number[] = [];
    for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
      pages.push(p);
    }
    return pages.length > 0 ? pages : [previewQuestion.pageNumber];
  }, [previewQuestion]);

  // Participants filtered for lottery
  const eligibleLotteryParticipants = useMemo(() => {
    return participants.filter((p) => {
      const matchStage = !lotteryStage || p.stageName === lotteryStage;
      const matchBranch =
        lotteryBranch === 'Semua Cabang' || p.branchName.includes(lotteryBranch);
      return matchStage && matchBranch;
    });
  }, [participants, lotteryStage, lotteryBranch]);

  // Questions available for lottery
  const eligibleLotteryQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchStage = !lotteryStage || q.stageName === lotteryStage;
      const matchBranch =
        lotteryBranch === 'Semua Cabang' || q.branchAndLevel.includes(lotteryBranch);
      return matchStage && matchBranch && q.status !== 'Nonaktif';
    });
  }, [questions, lotteryStage, lotteryBranch]);

  // Initialize lottery participant selection when criteria change
  const handleOpenLotteryWorkflow = () => {
    const defaultIds = eligibleLotteryParticipants.map((p) => p.id);
    setSelectedParticipantIds(defaultIds);
    setLotteryDrawResults(null);
    setLotteryFeedback('');
    setIsLotteryModalOpen(true);
  };

  const handleToggleSelectAllParticipants = () => {
    if (selectedParticipantIds.length === eligibleLotteryParticipants.length) {
      setSelectedParticipantIds([]);
    } else {
      setSelectedParticipantIds(eligibleLotteryParticipants.map((p) => p.id));
    }
  };

  const handleToggleParticipant = (id: string) => {
    setSelectedParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id]
    );
  };

  // Run draw simulation then generate mappings atomically
  const handleExecuteDraw = () => {
    if (selectedParticipantIds.length === 0) {
      setLotteryFeedback('Pilih setidaknya 1 peserta untuk diundi.');
      return;
    }

    const selectedParts = participants.filter((p) => selectedParticipantIds.includes(p.id));

    // Validate each participant's branch & level pool
    for (const part of selectedParts) {
      const partQuestions = questions.filter((q) => {
        if (q.status !== 'Aktif') return false;
        const matchesStage = !q.stageName || q.stageName === lotteryStage || lotteryStage === 'Semua Babak';
        const matchesBranch = lotteryBranch === 'Semua Cabang'
          ? (!q.branchAndLevel || q.branchAndLevel.includes(part.branchName) || part.branchName.includes(q.branchAndLevel))
          : q.branchAndLevel.includes(lotteryBranch);
        return matchesStage && matchesBranch;
      });

      if (partQuestions.length < lotteryQuestionsPerParticipant) {
        setLotteryFeedback(
          `Tidak dapat melanjutkan: Peserta ${part.name} (${part.branchName}) membutuhkan ${lotteryQuestionsPerParticipant} soal unik, namun hanya tersedia ${partQuestions.length} soal aktif yang sesuai di Babak ${lotteryStage}.`
        );
        return;
      }
    }

    setIsDrawingAnimation(true);
    setLotteryFeedback('');

    setTimeout(() => {
      const results: {
        participantId: string;
        participantName: string;
        questionIds: string[];
        questionTitles: string[];
      }[] = [];

      const batchUsed = new Set<string>();

      selectedParts.forEach((part) => {
        const partQuestions = questions.filter((q) => {
          if (q.status !== 'Aktif') return false;
          const matchesStage = !q.stageName || q.stageName === lotteryStage || lotteryStage === 'Semua Babak';
          const matchesBranch = lotteryBranch === 'Semua Cabang'
            ? (!q.branchAndLevel || q.branchAndLevel.includes(part.branchName) || part.branchName.includes(q.branchAndLevel))
            : q.branchAndLevel.includes(lotteryBranch);
          return matchesStage && matchesBranch;
        });

        // Filter out questions this participant already has in this stage
        const existingQIds = new Set(
          (part.assignedQuestions || [])
            .filter((aq) => !aq.stageName || aq.stageName === lotteryStage)
            .map((aq) => aq.questionId)
        );

        let candidatePool = partQuestions.filter((q) => !existingQIds.has(q.id));
        if (candidatePool.length < lotteryQuestionsPerParticipant) {
          candidatePool = partQuestions;
        }

        // Prioritize questions not yet used in this batch
        const unusedInBatch = candidatePool.filter((q) => !batchUsed.has(q.id));
        const pool = unusedInBatch.length >= lotteryQuestionsPerParticipant ? unusedInBatch : candidatePool;

        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const picked = shuffled.slice(0, lotteryQuestionsPerParticipant);

        picked.forEach((q) => batchUsed.add(q.id));

        results.push({
          participantId: part.id,
          participantName: part.name,
          questionIds: picked.map((q) => q.id),
          questionTitles: picked.map((q) => `${q.code} - ${q.title}`)
        });
      });

      setLotteryDrawResults(results);
      setIsDrawingAnimation(false);
    }, 400);
  };

  // Confirm and persist draw to MTQ Context — 100% IDENTICAL to preview, NO re-randomization!
  const handleConfirmPersistDraw = () => {
    if (!lotteryDrawResults || lotteryDrawResults.length === 0) return;

    const res = commitLotteryDrawResults(lotteryDrawResults, lotteryStage);

    if (res.success) {
      setIsLotteryModalOpen(false);
      setLotteryDrawResults(null);
    } else {
      setLotteryFeedback(res.message);
    }
  };

  // Open Add Question
  const handleOpenAdd = () => {
    setEditingQuestion(null);
    setFormCode(`MQ-TLW-${String(questions.length + 1).padStart(2, '0')}`);
    setFormTitle('Maqra Baru: QS. Maryam [19]: 1 - 15');
    setFormSurah('Maryam');
    setFormSurahNum(19);
    setFormStartAyah(1);
    setFormEndAyah(15);
    setFormPageStart(305);
    setFormPageEnd(305);
    setFormBranch('Tilawah Dewasa Putra Ulya');
    setFormStage('Penyisihan');
    setFormDesc('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Open Edit Question
  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setFormCode(q.code);
    setFormTitle(q.title);
    setFormSurah(q.surahName);
    setFormSurahNum(q.surahNumber);
    setFormStartAyah(q.startAyah);
    setFormEndAyah(q.endAyah);
    setFormPageStart(q.pageStart || q.pageNumber);
    setFormPageEnd(q.pageEnd || q.pageNumber);
    setFormBranch(q.branchAndLevel);
    setFormStage(q.stageName);
    setFormDesc(q.description || '');
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Save Add / Edit
  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formCode || !formTitle) {
      setFormError('Kode dan Judul Maqra wajib diisi.');
      return;
    }
    if (Number(formStartAyah) > Number(formEndAyah)) {
      setFormError('Ayat awal tidak boleh lebih besar dari ayat akhir.');
      return;
    }
    if (Number(formPageStart) < 1 || Number(formPageStart) > 604) {
      setFormError('Nomor halaman awal mushaf harus di antara 1 dan 604.');
      return;
    }
    if (Number(formPageEnd) < Number(formPageStart) || Number(formPageEnd) > 604) {
      setFormError('Halaman akhir mushaf harus >= halaman awal dan <= 604.');
      return;
    }

    const startP = Number(formPageStart);
    const endP = Number(formPageEnd);
    const pageNums: number[] = [];
    for (let p = startP; p <= endP; p++) {
      pageNums.push(p);
    }

    if (editingQuestion) {
      updateQuestion(editingQuestion.id, {
        code: formCode.toUpperCase(),
        title: formTitle,
        surahName: formSurah,
        surahNumber: Number(formSurahNum),
        startAyah: Number(formStartAyah),
        endAyah: Number(formEndAyah),
        pageNumber: startP,
        pageStart: startP,
        pageEnd: endP,
        pageNumbers: pageNums,
        branchAndLevel: formBranch,
        stageName: formStage,
        description: formDesc
      });
    } else {
      addQuestion({
        code: formCode.toUpperCase(),
        title: formTitle,
        surahName: formSurah,
        surahNumber: Number(formSurahNum),
        startAyah: Number(formStartAyah),
        endAyah: Number(formEndAyah),
        pageNumber: startP,
        pageStart: startP,
        pageEnd: endP,
        pageNumbers: pageNums,
        branchAndLevel: formBranch,
        stageName: formStage,
        status: 'Aktif',
        description: formDesc
      });
    }

    setIsAddModalOpen(false);
  };

  // Open Single Question Manual Assignment
  const handleOpenManualAssign = (q: Question) => {
    setManualAssignQuestion(q);
    const defaultP = participants[0]?.id || '';
    setTargetParticipantId(defaultP);
  };

  // Add question to target participant
  const handleAddQuestionToParticipant = () => {
    if (manualAssignQuestion && targetParticipantId) {
      addQuestionToParticipant(targetParticipantId, manualAssignQuestion.id);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Bank Soal & Maqra Tilawah
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola paket maqra, surah, ayat, rentang halaman mushaf, serta pengundian penetapan soal musabaqah
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenLotteryWorkflow}
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-xs px-3.5 py-2.5 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            <Dice5 className="w-4 h-4 text-emerald-700" />
            <span>Undian Penentuan Soal</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Soal / Maqra</span>
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('daftar_soal')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'daftar_soal'
              ? 'border-emerald-800 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Daftar Soal</span>
          <span
            className={`text-[11px] px-2 py-0.2 rounded-full font-semibold ${
              activeTab === 'daftar_soal'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {filteredQuestions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('penetapan_soal')}
          className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'penetapan_soal'
              ? 'border-emerald-800 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Penetapan Soal</span>
          <span
            className={`text-[11px] px-2 py-0.2 rounded-full font-semibold ${
              activeTab === 'penetapan_soal'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {assignedMaqraRows.length}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'daftar_soal'
                ? 'Cari kode soal, nama surah, atau judul maqra...'
                : 'Cari nama santri, nomor undian, atau kode maqra...'
            }
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            <option value="Semua Cabang">Semua Cabang</option>
            <option value="Tilawah Dewasa Putra">Tilawah Dewasa Putra</option>
            <option value="Tilawah Dewasa Putri">Tilawah Dewasa Putri</option>
            <option value="Hifzhil Qur’an">Hifzhil Qur’an</option>
          </select>

          <select
            value={selectedStage}
            onChange={(e) => setSelectedStage(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700 cursor-pointer hover:border-slate-300"
          >
            <option value="Semua Babak">Semua Babak</option>
            <option value="Penyisihan">Penyisihan</option>
            <option value="Semifinal">Semifinal</option>
            <option value="Final">Final</option>
          </select>
        </div>
      </div>

      {/* Tab 1: Questions Table */}
      {activeTab === 'daftar_soal' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                  <th className="px-5 py-3 w-28">Kode Maqra</th>
                  <th className="px-5 py-3">Surah & Ayat</th>
                  <th className="px-4 py-3">Hal. Mushaf</th>
                  <th className="px-4 py-3">Cabang & Babak</th>
                  <th className="px-4 py-3">Status Penetapan</th>
                  <th className="px-5 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredQuestions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Tidak ada soal / maqra yang sesuai kriteria pencarian.
                    </td>
                  </tr>
                ) : (
                  filteredQuestions.map((q) => {
                    // Check all participants assigned to this question
                    const assignedParts = participants.filter((p) => {
                      if (p.questionId === q.id) return true;
                      if (p.assignedQuestions?.some((aq) => aq.questionId === q.id)) return true;
                      return false;
                    });

                    const pageDisplay =
                      q.pageStart && q.pageEnd && q.pageStart !== q.pageEnd
                        ? `Hal. ${q.pageStart} - ${q.pageEnd}`
                        : `Hal. ${q.pageNumber}`;

                    return (
                      <tr key={q.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                          {q.code}
                        </td>
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-slate-900">{q.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            QS. {q.surahName} [{q.surahNumber}]: {q.startAyah} - {q.endAyah}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-slate-700">
                          <span className="inline-flex items-center gap-1">
                            {pageDisplay}
                            {q.pageStart && q.pageEnd && q.pageEnd > q.pageStart && (
                              <span className="text-[10px] text-emerald-800 bg-emerald-50 px-1.5 py-0.2 rounded font-sans">
                                {q.pageEnd - q.pageStart + 1} Hal
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-slate-800">{q.branchAndLevel}</p>
                          <span className="text-[10px] text-slate-500 font-medium">{q.stageName}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          {assignedParts.length > 0 ? (
                            <span className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
                              Sudah
                            </span>
                          ) : (
                            <span className="inline-block bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full text-[11px] font-medium">
                              Belum Ditetapkan
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right space-x-1.5">
                          <button
                            onClick={() => handleOpenManualAssign(q)}
                            className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Tetapkan ke Peserta"
                          >
                            <Dice5 className="w-4 h-4 inline" />
                          </button>
                          <button
                            onClick={() => {
                              setPreviewQuestion(q);
                              setPreviewCurrentPageIndex(0);
                              setPreviewZoom(100);
                            }}
                            className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Pratinjau Mushaf"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(q)}
                            className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Maqra"
                          >
                            <Edit2 className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Penetapan Soal Table (Satu Maqra Satu Baris) */}
      {activeTab === 'penetapan_soal' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider">
                  <th className="px-5 py-3 w-20">Undian</th>
                  <th className="px-5 py-3 min-w-[200px]">Nama Santri</th>
                  <th className="px-4 py-3 w-32">Kode Maqra</th>
                  <th className="px-5 py-3">Maqra</th>
                  <th className="px-4 py-3 w-28">Babak</th>
                  <th className="px-5 py-3 text-right w-24">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {assignedMaqraRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Belum ada maqra yang ditetapkan ke santri / peserta sesuai filter saat ini.
                    </td>
                  </tr>
                ) : (
                  assignedMaqraRows.map((row) => (
                    <tr key={row.rowKey} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                        #{row.participantNo}
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-900">{row.participantName}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {row.kafilahName} · <span className="text-slate-600 font-medium">{row.branchName}</span>
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-mono font-bold text-emerald-900">
                        <span className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-200/70 px-2 py-0.5 rounded text-xs">
                          {row.questionCode}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <p className="font-semibold text-slate-900">{row.questionTitle}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {row.surahDisplay && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              {row.surahDisplay}
                            </span>
                          )}
                          <span className="text-[11px] font-mono text-emerald-700 bg-slate-100 px-1.5 py-0.2 rounded">
                            {row.pageDisplay}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-block bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-medium">
                          {row.stageName}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1.5">
                        {row.questionObj && (
                          <button
                            onClick={() => {
                              setPreviewQuestion(row.questionObj!);
                              setPreviewCurrentPageIndex(0);
                              setPreviewZoom(100);
                            }}
                            className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Pratinjau Mushaf"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (window.confirm(`Lepaskan maqra ${row.questionCode} dari peserta ${row.participantName}?`)) {
                              removeQuestionFromParticipant(row.participantId, row.questionId);
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Hapus / Lepas Penetapan Maqra"
                        >
                          <Trash2 className="w-4 h-4 inline" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Multi-Page Mushaf Preview Modal */}
      {previewQuestion && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded">
                    {previewQuestion.code}
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-900 truncate max-w-sm">
                    {previewQuestion.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  QS. {previewQuestion.surahName} [{previewQuestion.surahNumber}]: {previewQuestion.startAyah} - {previewQuestion.endAyah} · Total {previewPages.length} Halaman Mushaf
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* View Mode Toggle */}
                <div className="hidden sm:flex bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold">
                  <button
                    onClick={() => setPreviewViewMode('single')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      previewViewMode === 'single'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tunggal
                  </button>
                  <button
                    onClick={() => setPreviewViewMode('gallery')}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      previewViewMode === 'gallery'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua Halaman
                  </button>
                </div>

                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
                  <button
                    onClick={() => setPreviewZoom((z) => Math.max(60, z - 15))}
                    className="p-1 rounded hover:bg-slate-100 text-slate-600"
                    title="Perkecil"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-mono text-slate-600 px-1">{previewZoom}%</span>
                  <button
                    onClick={() => setPreviewZoom((z) => Math.min(160, z + 15))}
                    className="p-1 rounded hover:bg-slate-100 text-slate-600"
                    title="Perbesar"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => setPreviewQuestion(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Page navigation bar for multi-page */}
            {previewPages.length > 1 && previewViewMode === 'single' && (
              <div className="bg-emerald-50/70 border-b border-emerald-100 px-4 py-2 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <span className="text-slate-500 font-medium mr-1">Pilih Halaman:</span>
                  {previewPages.map((pageNum, idx) => (
                    <button
                      key={pageNum}
                      onClick={() => setPreviewCurrentPageIndex(idx)}
                      className={`px-2.5 py-0.5 rounded font-mono font-bold transition-all ${
                        previewCurrentPageIndex === idx
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      Hal. {pageNum}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() =>
                      setPreviewCurrentPageIndex((idx) => Math.max(0, idx - 1))
                    }
                    disabled={previewCurrentPageIndex === 0}
                    className="p-1 rounded bg-white border border-slate-200 text-slate-700 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-semibold text-slate-700 px-1 font-mono text-[11px]">
                    {previewCurrentPageIndex + 1} / {previewPages.length}
                  </span>
                  <button
                    onClick={() =>
                      setPreviewCurrentPageIndex((idx) =>
                        Math.min(previewPages.length - 1, idx + 1)
                      )
                    }
                    disabled={previewCurrentPageIndex === previewPages.length - 1}
                    className="p-1 rounded bg-white border border-slate-200 text-slate-700 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Mushaf Viewer Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex flex-col items-center gap-6">
              {previewViewMode === 'single' ? (
                // Single page display
                <div
                  style={{ width: `${Math.round(540 * (previewZoom / 100))}px` }}
                  className="bg-white p-2 shadow-lg rounded-sm border border-slate-300"
                >
                  <div className="text-center pb-1 text-[10px] font-mono text-slate-400">
                    Standar Mushaf Madinah · Halaman {previewPages[previewCurrentPageIndex]}
                  </div>
                  <img
                    src={`https://android.quran.com/data/width_1260/page${String(
                      previewPages[previewCurrentPageIndex] || 305
                    ).padStart(3, '0')}.png`}
                    alt={`Mushaf Halaman ${previewPages[previewCurrentPageIndex]}`}
                    className="w-full h-auto block select-none"
                  />
                </div>
              ) : (
                // Gallery vertical scroll display
                previewPages.map((pageNum, idx) => (
                  <div
                    key={pageNum}
                    style={{ width: `${Math.round(540 * (previewZoom / 100))}px` }}
                    className="bg-white p-2 shadow-lg rounded-sm border border-slate-300"
                  >
                    <div className="flex items-center justify-between pb-1 px-1 text-[10px] font-mono text-slate-400 border-b border-slate-100 mb-1">
                      <span>Bagian {idx + 1} dari {previewPages.length}</span>
                      <span>Mushaf Hal. {pageNum}</span>
                    </div>
                    <img
                      src={`https://android.quran.com/data/width_1260/page${String(
                        pageNum
                      ).padStart(3, '0')}.png`}
                      alt={`Mushaf Halaman ${pageNum}`}
                      className="w-full h-auto block select-none"
                    />
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-200 bg-white flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Pencetakan Mushaf Madinah 15 Baris (Mujamma' Malik Fahd)
              </span>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Multi-Question Assignment Modal */}
      {manualAssignQuestion && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Dice5 className="w-5 h-5 text-emerald-800" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Penetapan Maqra ke Peserta
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {manualAssignQuestion.code} · {manualAssignQuestion.title}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setManualAssignQuestion(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Maqra Details */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs">
              <p className="font-bold text-slate-800">{manualAssignQuestion.title}</p>
              <p className="text-slate-500 mt-0.5">
                QS. {manualAssignQuestion.surahName} [{manualAssignQuestion.surahNumber}]: {manualAssignQuestion.startAyah} - {manualAssignQuestion.endAyah} · Hal. {manualAssignQuestion.pageStart || manualAssignQuestion.pageNumber} s/d {manualAssignQuestion.pageEnd || manualAssignQuestion.pageNumber}
              </p>
            </div>

            {/* Currently assigned participants */}
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Peserta yang Saat Ini Memiliki Soal Ini:
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {participants.filter(
                  (p) =>
                    p.questionId === manualAssignQuestion.id ||
                    p.assignedQuestions?.some((aq) => aq.questionId === manualAssignQuestion.id)
                ).length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    Belum ada peserta yang ditugaskan maqra ini.
                  </p>
                ) : (
                  participants
                    .filter(
                      (p) =>
                        p.questionId === manualAssignQuestion.id ||
                        p.assignedQuestions?.some((aq) => aq.questionId === manualAssignQuestion.id)
                    )
                    .map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs"
                      >
                        <div>
                          <span className="font-bold text-emerald-950 font-mono mr-1.5">
                            #{p.lotteryNumber}
                          </span>
                          <span className="font-semibold text-slate-800">{p.name}</span>
                          <span className="text-[10px] text-slate-500 ml-1.5">
                            ({p.kafilahName})
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            removeQuestionFromParticipant(p.id, manualAssignQuestion.id)
                          }
                          className="p-1 text-rose-600 hover:bg-rose-100 rounded transition-colors"
                          title="Hapus soal ini dari peserta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Target participant select to add */}
            <div className="space-y-2 mb-6">
              <label className="text-xs font-bold text-slate-700 block">
                Tambah Maqra Ini ke Peserta:
              </label>
              <select
                value={targetParticipantId}
                onChange={(e) => setTargetParticipantId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 bg-white"
              >
                {participants.map((p) => {
                  const alreadyHas =
                    p.questionId === manualAssignQuestion.id ||
                    p.assignedQuestions?.some((aq) => aq.questionId === manualAssignQuestion.id);
                  const totalAssignedCount = (p.assignedQuestions?.length || (p.questionId ? 1 : 0));
                  return (
                    <option key={p.id} value={p.id}>
                      #{p.lotteryNumber} - {p.name} ({p.participantId} · {totalAssignedCount} soal) {alreadyHas ? '✓ sudah memiliki' : ''}
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-500">
                Fitur ini mendukung penugasan banyak soal per peserta tanpa menghapus soal sebelumnya.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setManualAssignQuestion(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700"
              >
                Selesai
              </button>
              <button
                onClick={handleAddQuestionToParticipant}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-2xs"
              >
                Tambahkan ke Peserta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undian Penentuan Soal Workflow Modal */}
      {isLotteryModalOpen && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-800">
                  <Dice5 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900">
                    Alur Undian Penentuan Soal / Maqra
                  </h3>
                  <p className="text-xs text-slate-500">
                    Pengundian otomatis berbasis ruang lingkup babak dan penetapan multi-soal
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsLotteryModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* Scope Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">Babak Perlombaan:</label>
                  <select
                    value={lotteryStage}
                    onChange={(e) => {
                      setLotteryStage(e.target.value);
                      setLotteryDrawResults(null);
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Penyisihan">Penyisihan</option>
                    <option value="Semifinal">Semifinal</option>
                    <option value="Final">Final</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Cabang / Golongan:</label>
                  <select
                    value={lotteryBranch}
                    onChange={(e) => {
                      setLotteryBranch(e.target.value);
                      setLotteryDrawResults(null);
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Semua Cabang">Semua Cabang</option>
                    <option value="Tilawah Dewasa Putra">Tilawah Dewasa Putra</option>
                    <option value="Tilawah Dewasa Putri">Tilawah Dewasa Putri</option>
                    <option value="Hifzhil Qur’an">Hifzhil Qur’an</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Soal per Peserta:</label>
                  <select
                    value={lotteryQuestionsPerParticipant}
                    onChange={(e) => {
                      setLotteryQuestionsPerParticipant(Number(e.target.value));
                      setLotteryDrawResults(null);
                    }}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-mono font-bold"
                  >
                    <option value={1}>1 Soal per Peserta</option>
                    <option value={2}>2 Soal per Peserta</option>
                    <option value={3}>3 Soal per Peserta</option>
                  </select>
                </div>
              </div>

              {/* Pool info */}
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-slate-600">
                  Pool Soal Tersedia:{' '}
                  <strong className="text-emerald-800">{eligibleLotteryQuestions.length} Maqra</strong>
                </span>
                <span className="text-slate-600">
                  Peserta Terpilih:{' '}
                  <strong className="text-emerald-800">
                    {selectedParticipantIds.length} dari {eligibleLotteryParticipants.length}
                  </strong>
                </span>
              </div>

              {/* Participant Selection Box */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-700">
                    Pilih Peserta yang Mengikuti Undian Ini:
                  </label>
                  <button
                    type="button"
                    onClick={handleToggleSelectAllParticipants}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline"
                  >
                    {selectedParticipantIds.length === eligibleLotteryParticipants.length
                      ? 'Batalkan Semua'
                      : 'Pilih Semua'}
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto bg-white text-xs">
                  {eligibleLotteryParticipants.length === 0 ? (
                    <div className="p-4 text-center text-slate-400">
                      Tidak ada peserta yang cocok dengan kriteria babak/cabang ini.
                    </div>
                  ) : (
                    eligibleLotteryParticipants.map((p) => {
                      const isSelected = selectedParticipantIds.includes(p.id);
                      const currentQCount = p.assignedQuestions?.length || (p.questionId ? 1 : 0);
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleToggleParticipant(p.id)}
                          className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                            />
                            <div>
                              <span className="font-mono font-bold text-slate-900 mr-2">
                                #{p.lotteryNumber}
                              </span>
                              <span className="font-semibold text-slate-800">{p.name}</span>
                              <span className="text-[11px] text-slate-400 ml-2">
                                ({p.kafilahName})
                              </span>
                            </div>
                          </div>
                          <span className="text-[10px] font-medium text-slate-500">
                            {currentQCount} soal saat ini
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Action Button to Roll */}
              <div className="flex items-center justify-center pt-2">
                <button
                  type="button"
                  onClick={handleExecuteDraw}
                  disabled={isDrawingAnimation || selectedParticipantIds.length === 0}
                  className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isDrawingAnimation ? 'animate-spin' : ''}`} />
                  <span>{isDrawingAnimation ? 'Mengundi Secara Acak...' : 'Mulai Pengundian Acak'}</span>
                </button>
              </div>

              {lotteryFeedback && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{lotteryFeedback}</span>
                </div>
              )}

              {/* Draw Results Preview */}
              {lotteryDrawResults && (
                <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                      Hasil Pratinjau Undian ({lotteryDrawResults.length} Peserta)
                    </h4>
                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Belum Disimpan
                    </span>
                  </div>

                  <div className="space-y-2 max-h-56 overflow-y-auto">
                    {lotteryDrawResults.map((res) => (
                      <div
                        key={res.participantId}
                        className="bg-white p-2.5 rounded-lg border border-emerald-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                      >
                        <span className="font-bold text-slate-900">{res.participantName}</span>
                        <div className="flex flex-wrap items-center gap-1">
                          {res.questionTitles.map((t, idx) => (
                            <span
                              key={idx}
                              className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsLotteryModalOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleConfirmPersistDraw}
                disabled={!lotteryDrawResults || lotteryDrawResults.length === 0}
                className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                Terapkan & Simpan Hasil Undian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Question Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingQuestion ? 'Edit Soal / Maqra' : 'Tambah Soal / Maqra Baru'}
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 mb-4 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Kode Soal
                  </label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                    placeholder="MQ-TLW-05"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Hal. Awal (1-604)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={604}
                    value={formPageStart}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setFormPageStart(v);
                      if (formPageEnd < v) setFormPageEnd(v);
                    }}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Hal. Akhir (1-604)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={604}
                    value={formPageEnd}
                    onChange={(e) => setFormPageEnd(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Judul Maqra
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  placeholder="Maqra 05: QS. Maryam [19]: 16 - 30"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Nama Surah
                  </label>
                  <input
                    type="text"
                    value={formSurah}
                    onChange={(e) => setFormSurah(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Ayat Awal
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formStartAyah}
                    onChange={(e) => setFormStartAyah(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Ayat Akhir
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formEndAyah}
                    onChange={(e) => setFormEndAyah(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Cabang & Jenjang
                  </label>
                  <input
                    type="text"
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-600 block mb-1">
                    Babak
                  </label>
                  <select
                    value={formStage}
                    onChange={(e) => setFormStage(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="Penyisihan">Penyisihan</option>
                    <option value="Semifinal">Semifinal</option>
                    <option value="Final">Final</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Catatan / Keterangan Maqam
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs"
                  placeholder="Instruksi pembacaan atau nada awal..."
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-2xs"
                >
                  {editingQuestion ? 'Simpan Perubahan' : 'Tambah Maqra'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

