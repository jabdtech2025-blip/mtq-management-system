import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus,
  Search,
  Eye,
  X,
  AlertTriangle,
  Dice5,
  CheckCircle2,
  Edit2,
  Trash2,
  Sparkles,
  RefreshCw,
  Download,
  Upload,
  FileSpreadsheet,
  History,
  ChevronDown
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Question } from '../../types/mtq';
import { AppModal } from '../common/AppModal';
import { validateMaqraAssignmentForParticipant } from '../../services/scoringEngine';
import {
  fisherYatesShuffle,
  downloadQuestionExcelTemplate,
  parseWorkbookToRows,
  validateQuestionImportRows,
  downloadImportErrorReport,
  ImportValidationResult,
  ValidatedQuestionRow
} from '../../utils/excelHelper';

export const BankSoalView: React.FC = () => {
  const {
    questions,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    participants,
    addQuestionToParticipant,
    removeQuestionFromParticipant,
    commitLotteryDrawResults,
    lotteryDrawLogs,
    importQuestionsBatch,
    stages,
    cabangList,
    jenjangList
  } = useMtq();

  const [activeTab, setActiveTab] = useState<'daftar_soal' | 'penetapan_soal' | 'riwayat_undian'>('daftar_soal');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('Semua Cabang');
  const [selectedLevel, setSelectedLevel] = useState('Semua Jenjang');
  const [selectedStage, setSelectedStage] = useState('Semua Babak');

  // Active Master Data lists (exclude Nonaktif for new entries)
  const activeCabangList = useMemo(
    () => cabangList.filter((c) => c.status === 'Aktif'),
    [cabangList]
  );
  const activeJenjangList = useMemo(
    () => jenjangList.filter((j) => j.status === 'Aktif'),
    [jenjangList]
  );
  const activeStages = useMemo(
    () => stages.filter((s) => s.status === 'Aktif' || s.status === 'Menunggu'),
    [stages]
  );

  // Preview Modal
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);

  // Manual Assign Modal
  const [manualAssignQuestion, setManualAssignQuestion] = useState<Question | null>(null);
  const [targetParticipantId, setTargetParticipantId] = useState('');
  const [manualAssignFeedback, setManualAssignFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Lottery Draw Workflow Modal
  const [isLotteryModalOpen, setIsLotteryModalOpen] = useState(false);
  const [lotteryStage, setLotteryStage] = useState('Penyisihan');
  const [lotteryBranch, setLotteryBranch] = useState('Semua Cabang');
  const [lotteryLevel, setLotteryLevel] = useState('Semua Jenjang');
  const [lotteryQuestionsPerParticipant, setLotteryQuestionsPerParticipant] = useState<number>(1);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [selectedQuestionPoolIds, setSelectedQuestionPoolIds] = useState<string[]>([]);
  const [isDrawingAnimation, setIsDrawingAnimation] = useState(false);
  const [lotteryDrawResults, setLotteryDrawResults] = useState<{
    participantId: string;
    participantName: string;
    questionIds: string[];
    questionTitles: string[];
  }[] | null>(null);
  const [lotteryFeedback, setLotteryFeedback] = useState<string>('');

  // Excel Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importValidation, setImportValidation] = useState<ImportValidationResult<ValidatedQuestionRow> | null>(null);
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const importDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (importDropdownRef.current && !importDropdownRef.current.contains(e.target as Node)) {
        setIsImportDropdownOpen(false);
      }
    };
    if (isImportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isImportDropdownOpen]);

  // Add / Edit Form Modal (Separated Cabang, Jenjang, Babak)
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
  const [formBranchName, setFormBranchName] = useState('');
  const [formLevelName, setFormLevelName] = useState('');
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
      const qBranch = q.branchName || q.branchAndLevel || '';
      const qLevel = q.levelName || q.branchAndLevel || '';
      const matchesBranch =
        selectedBranch === 'Semua Cabang' || qBranch.includes(selectedBranch);
      const matchesLevel =
        selectedLevel === 'Semua Jenjang' || qLevel.includes(selectedLevel);
      const matchesStage =
        selectedStage === 'Semua Babak' || q.stageName === selectedStage;
      return matchesSearch && matchesBranch && matchesLevel && matchesStage;
    });
  }, [questions, searchQuery, selectedBranch, selectedLevel, selectedStage]);

  // Assigned Maqra Rows for Tab 2 (Setiap satu maqra satu baris)
  const assignedMaqraRows = useMemo(() => {
    interface MaqraRowItem {
      rowKey: string;
      participantId: string;
      participantNo: string;
      participantName: string;
      kafilahName: string;
      branchName: string;
      levelName: string;
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
            levelName: p.levelName || '',
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
          levelName: p.levelName || '',
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
      const matchesLevel =
        selectedLevel === 'Semua Jenjang' || r.levelName.includes(selectedLevel);
      const matchesStage =
        selectedStage === 'Semua Babak' || r.stageName === selectedStage;
      return matchesSearch && matchesBranch && matchesLevel && matchesStage;
    });
  }, [participants, questions, searchQuery, selectedBranch, selectedLevel, selectedStage]);

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

  // Participants filtered for lottery (by Stage + Branch + Level)
  const eligibleLotteryParticipants = useMemo(() => {
    return participants.filter((p) => {
      const matchStage = !lotteryStage || p.stageName === lotteryStage;
      const matchBranch =
        lotteryBranch === 'Semua Cabang' || p.branchName.includes(lotteryBranch);
      const matchLevel =
        lotteryLevel === 'Semua Jenjang' || (p.levelName || '').includes(lotteryLevel);
      return matchStage && matchBranch && matchLevel;
    });
  }, [participants, lotteryStage, lotteryBranch, lotteryLevel]);

  // Questions available for lottery (by Stage + Branch + Level)
  const eligibleLotteryQuestions = useMemo(() => {
    return questions.filter((q) => {
      const matchStage = !lotteryStage || q.stageName === lotteryStage;
      const qBranch = q.branchName || q.branchAndLevel || '';
      const qLevel = q.levelName || q.branchAndLevel || '';
      const matchBranch =
        lotteryBranch === 'Semua Cabang' || qBranch.includes(lotteryBranch);
      const matchLevel =
        lotteryLevel === 'Semua Jenjang' || qLevel.includes(lotteryLevel);
      return matchStage && matchBranch && matchLevel && q.status !== 'Nonaktif';
    });
  }, [questions, lotteryStage, lotteryBranch, lotteryLevel]);

  // Initialize lottery participant & question pool selection when opening modal
  const handleOpenLotteryWorkflow = () => {
    setSelectedParticipantIds(eligibleLotteryParticipants.map((p) => p.id));
    setSelectedQuestionPoolIds(eligibleLotteryQuestions.map((q) => q.id));
    setLotteryDrawResults(null);
    setLotteryFeedback('');
    setIsLotteryModalOpen(true);
  };

  const syncLotteryPoolsOnFilterChange = (newStage: string, newBranch: string, newLevel: string) => {
    const newParts = participants.filter((p) => {
      const matchStage = !newStage || p.stageName === newStage;
      const matchBranch = newBranch === 'Semua Cabang' || p.branchName.includes(newBranch);
      const matchLevel = newLevel === 'Semua Jenjang' || (p.levelName || '').includes(newLevel);
      return matchStage && matchBranch && matchLevel;
    });
    const newQs = questions.filter((q) => {
      const matchStage = !newStage || q.stageName === newStage;
      const qBranch = q.branchName || q.branchAndLevel || '';
      const qLevel = q.levelName || q.branchAndLevel || '';
      const matchBranch = newBranch === 'Semua Cabang' || qBranch.includes(newBranch);
      const matchLevel = newLevel === 'Semua Jenjang' || qLevel.includes(newLevel);
      return matchStage && matchBranch && matchLevel && q.status !== 'Nonaktif';
    });
    setSelectedParticipantIds(newParts.map((p) => p.id));
    setSelectedQuestionPoolIds(newQs.map((q) => q.id));
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

  const handleToggleSelectAllQuestions = () => {
    if (selectedQuestionPoolIds.length === eligibleLotteryQuestions.length) {
      setSelectedQuestionPoolIds([]);
    } else {
      setSelectedQuestionPoolIds(eligibleLotteryQuestions.map((q) => q.id));
    }
  };

  const handleToggleQuestionPool = (id: string) => {
    setSelectedQuestionPoolIds((prev) =>
      prev.includes(id) ? prev.filter((qId) => qId !== id) : [...prev, id]
    );
  };

  // Run draw simulation using unbiased Fisher-Yates shuffle
  const handleExecuteDraw = () => {
    if (selectedParticipantIds.length === 0) {
      setLotteryFeedback('Pilih setidaknya 1 peserta untuk diundi.');
      return;
    }
    if (selectedQuestionPoolIds.length === 0) {
      setLotteryFeedback('Pilih setidaknya 1 soal (maqra) dalam Pool Soal untuk diundi.');
      return;
    }

    const selectedParts = participants.filter((p) => selectedParticipantIds.includes(p.id));
    const explicitQuestionPool = questions.filter(
      (q) => selectedQuestionPoolIds.includes(q.id) && q.status === 'Aktif'
    );

    // P0-03: Validate each participant's 3D compatibility (branch + level + stage + active status) within the selected question pool
    for (const part of selectedParts) {
      const partQuestions = explicitQuestionPool.filter(
        (q) => validateMaqraAssignmentForParticipant(part, q, lotteryStage, []).valid
      );

      if (partQuestions.length < lotteryQuestionsPerParticipant) {
        setLotteryFeedback(
          `Tidak dapat melanjutkan: Peserta ${part.name} (${part.branchName}${part.levelName ? ` - ${part.levelName}` : ''}) membutuhkan ${lotteryQuestionsPerParticipant} soal unik yang sesuai cabang, jenjang, dan babak, namun hanya tersedia ${partQuestions.length} soal aktif yang cocok di Pool Soal Babak ${lotteryStage}.`
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
        const partQuestions = explicitQuestionPool.filter(
          (q) => validateMaqraAssignmentForParticipant(part, q, lotteryStage, []).valid
        );

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

        // Unbiased Fisher-Yates shuffle
        const shuffled = fisherYatesShuffle(pool);
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
    }, 350);
  };

  // Confirm and persist draw to MTQ Context — 100% IDENTICAL to preview, NO re-randomization!
  const handleConfirmPersistDraw = () => {
    if (!lotteryDrawResults || lotteryDrawResults.length === 0) return;

    const res = commitLotteryDrawResults(lotteryDrawResults, lotteryStage, {
      questionPoolIds: selectedQuestionPoolIds,
      branchName: lotteryBranch !== 'Semua Cabang' ? lotteryBranch : undefined,
      levelName: lotteryLevel !== 'Semua Jenjang' ? lotteryLevel : undefined
    });

    if (res.success) {
      setIsLotteryModalOpen(false);
      setLotteryDrawResults(null);
      setFeedbackMessage({ type: 'success', text: res.message });
    } else {
      setLotteryFeedback(res.message);
    }
  };

  // Open Add Question
  const handleOpenAdd = () => {
    const defaultCabang = activeCabangList[0]?.name || cabangList[0]?.name || 'Tilawah Dewasa Putra';
    const defaultJenjang = activeJenjangList[0]?.name || jenjangList[0]?.name || 'Dewasa';
    const defaultStage = activeStages[0]?.name || stages[0]?.name || 'Penyisihan';

    setEditingQuestion(null);
    setFormCode(`MQ-TLW-${String(questions.length + 1).padStart(2, '0')}`);
    setFormTitle('Maqra Baru: QS. Maryam [19]: 1 - 15');
    setFormSurah('Maryam');
    setFormSurahNum(19);
    setFormStartAyah(1);
    setFormEndAyah(15);
    setFormPageStart(305);
    setFormPageEnd(305);
    setFormBranchName(defaultCabang);
    setFormLevelName(defaultJenjang);
    setFormStage(defaultStage);
    setFormDesc('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  // Open Edit Question
  const handleOpenEdit = (q: Question) => {
    const matchedCabang =
      q.branchName ||
      cabangList.find((c) => q.branchAndLevel.includes(c.name))?.name ||
      q.branchAndLevel ||
      activeCabangList[0]?.name ||
      'Tilawah Dewasa Putra';
    const matchedJenjang =
      q.levelName ||
      jenjangList.find((j) => q.branchAndLevel.includes(j.name))?.name ||
      activeJenjangList[0]?.name ||
      'Dewasa';

    setEditingQuestion(q);
    setFormCode(q.code);
    setFormTitle(q.title);
    setFormSurah(q.surahName);
    setFormSurahNum(q.surahNumber);
    setFormStartAyah(q.startAyah);
    setFormEndAyah(q.endAyah);
    setFormPageStart(q.pageStart || q.pageNumber);
    setFormPageEnd(q.pageEnd || q.pageNumber);
    setFormBranchName(matchedCabang);
    setFormLevelName(matchedJenjang);
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

    const matchedBranch = cabangList.find((c) => c.name === formBranchName);
    const matchedLevel = jenjangList.find((j) => j.name === formLevelName);
    const combinedBranchAndLevel = [formBranchName, formLevelName].filter(Boolean).join(' ');

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
        branchId: matchedBranch?.id,
        branchName: formBranchName,
        levelId: matchedLevel?.id,
        levelName: formLevelName,
        branchAndLevel: combinedBranchAndLevel,
        stageName: formStage,
        description: formDesc
      });
      setFeedbackMessage({ type: 'success', text: `Soal ${formCode.toUpperCase()} berhasil diperbarui.` });
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
        branchId: matchedBranch?.id,
        branchName: formBranchName,
        levelId: matchedLevel?.id,
        levelName: formLevelName,
        branchAndLevel: combinedBranchAndLevel,
        stageName: formStage,
        status: 'Aktif',
        description: formDesc
      });
      setFeedbackMessage({ type: 'success', text: `Soal ${formCode.toUpperCase()} berhasil ditambahkan.` });
    }

    setIsAddModalOpen(false);
  };

  // Excel Import handlers
  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseWorkbookToRows(buffer);
      const validation = validateQuestionImportRows(rows, {
        cabangList,
        jenjangList,
        stages,
        existingQuestions: questions
      });
      setImportValidation(validation);
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membaca file Excel Bank Soal.'
      });
    }
  };

  const handleCommitExcelImport = async () => {
    if (!importValidation || importValidation.validRows.length === 0) return;
    setIsImporting(true);
    try {
      const res = await importQuestionsBatch(importValidation.validRows);
      const errDetail = res.errors.length > 0 ? ` (${res.errors.slice(0, 2).join('; ')})` : '';
      setFeedbackMessage({
        type: res.succeeded > 0 && res.failed === 0 ? 'success' : 'error',
        text: `Berhasil mengimpor ${res.succeeded} dari ${res.total} soal / maqra.${res.failed > 0 ? ` Gagal: ${res.failed}${errDetail}` : ''}`
      });
      if (res.succeeded > 0 && res.failed === 0) {
        setIsImportModalOpen(false);
        setImportValidation(null);
        setImportFileName('');
      }
    } finally {
      setIsImporting(false);
    }
  };

  // Open Single Question Manual Assignment (P0-03: 3D relational filter for candidate participants)
  const handleOpenManualAssign = (q: Question) => {
    setManualAssignQuestion(q);
    const matchingParts = participants.filter((p) => {
      const existingStageQIds = (p.assignedQuestions || [])
        .filter((aq) => !aq.stageName || aq.stageName === q.stageName)
        .map((aq) => aq.questionId);
      return validateMaqraAssignmentForParticipant(p, q, q.stageName, existingStageQIds).valid;
    });

    const defaultP =
      matchingParts[0]?.id ||
      participants.find((p) => !q.stageName || p.stageName === q.stageName)?.id ||
      participants[0]?.id ||
      '';
    setTargetParticipantId(defaultP);
    setManualAssignFeedback(null);
  };

  const handleAddQuestionToParticipant = () => {
    if (!manualAssignQuestion || !targetParticipantId) return;

    const targetPart = participants.find((p) => p.id === targetParticipantId);
    if (!targetPart) return;

    const res = addQuestionToParticipant(
      targetParticipantId,
      manualAssignQuestion.id,
      manualAssignQuestion.stageName
    );

    if (res.success) {
      setManualAssignFeedback({
        type: 'success',
        message: res.message
      });
    } else {
      setManualAssignFeedback({
        type: 'error',
        message: res.message
      });
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Bank Soal & Maqra Tilawah
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola paket maqra terstruktur (Cabang, Jenjang, Babak), import Excel, serta undian acak Fisher-Yates
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Unified Single Import Dropdown Button (Item 11) */}
          <div className="relative" ref={importDropdownRef}>
            <button
              type="button"
              onClick={() => setIsImportDropdownOpen(!isImportDropdownOpen)}
              data-testid="import-dropdown-btn"
              className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-700" />
              <span>Import</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {isImportDropdownOpen && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-40 animate-in fade-in duration-100">
                <button
                  type="button"
                  data-testid="open-question-import-btn"
                  onClick={() => {
                    setIsImportDropdownOpen(false);
                    setImportValidation(null);
                    setImportFileName('');
                    setIsImportModalOpen(true);
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-900 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>Import Excel (.xlsx)</span>
                </button>
                <button
                  type="button"
                  data-testid="download-question-template-btn"
                  onClick={() => {
                    setIsImportDropdownOpen(false);
                    downloadQuestionExcelTemplate({ cabangList, jenjangList, stages });
                  }}
                  className="w-full text-left px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Download className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Download Template</span>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleOpenLotteryWorkflow}
            data-testid="open-lottery-modal-btn"
            className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer"
          >
            <Dice5 className="w-3.5 h-3.5 text-emerald-700" />
            <span>Undian</span>
          </button>

          <button
            onClick={handleOpenAdd}
            data-testid="add-question-btn"
            className="inline-flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-700" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="p-1 hover:opacity-75 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'daftar_soal'
                ? 'Cari kode soal, nama surah, atau judul maqra...'
                : activeTab === 'penetapan_soal'
                ? 'Cari nama santri, nomor undian, atau kode maqra...'
                : 'Cari riwayat undian, babak, cabang, atau nama peserta...'
            }
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 focus:bg-white text-slate-800 placeholder-slate-400 transition-all"
          />
        </div>

        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-slate-50 font-medium text-slate-700 cursor-pointer hover:border-slate-300"
        >
          <option value="Semua Cabang">Semua Cabang</option>
          {cabangList.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>

        <select
          value={selectedLevel}
          onChange={(e) => setSelectedLevel(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-slate-50 font-medium text-slate-700 cursor-pointer hover:border-slate-300"
        >
          <option value="Semua Jenjang">Semua Jenjang</option>
          {jenjangList.map((j) => (
            <option key={j.id} value={j.name}>
              {j.name}
            </option>
          ))}
        </select>

        <select
          value={selectedStage}
          onChange={(e) => setSelectedStage(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-slate-50 font-medium text-slate-700 cursor-pointer hover:border-slate-300"
        >
          <option value="Semua Babak">Semua Babak</option>
          {stages.map((stg) => (
            <option key={stg.id} value={stg.name}>
              Babak {stg.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs Navigation (below filter bar) */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('daftar_soal')}
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
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
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
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
        <button
          onClick={() => setActiveTab('riwayat_undian')}
          data-testid="tab-riwayat-undian"
          className={`pb-3 text-xs sm:text-sm font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'riwayat_undian'
              ? 'border-emerald-800 text-emerald-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Riwayat & Audit Undian</span>
          <span
            className={`text-[11px] px-2 py-0.2 rounded-full font-semibold ${
              activeTab === 'riwayat_undian'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {lotteryDrawLogs.length}
          </span>
        </button>
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
                  <th className="px-4 py-3">Cabang · Jenjang · Babak</th>
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
                  filteredQuestions.map((q, idx) => {
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
                      <tr key={`${q.id}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
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
                          <p className="font-semibold text-slate-800">
                            {q.branchName || q.branchAndLevel}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {q.levelName && (
                              <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                                {q.levelName}
                              </span>
                            )}
                            <span className="text-[10px] text-emerald-800 font-mono font-semibold">
                              {q.stageName}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          {assignedParts.length > 0 ? (
                            <span className="inline-block bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
                              Sudah ({assignedParts.length})
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
                            onClick={() => setPreviewQuestion(q)}
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
                          <button
                            onClick={() => {
                              const res = deleteQuestion(q.id);
                              setFeedbackMessage({
                                type: res.success ? 'success' : 'error',
                                text: res.message
                              });
                            }}
                            className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Hapus Maqra"
                          >
                            <Trash2 className="w-4 h-4 inline" />
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
                            onClick={() => setPreviewQuestion(row.questionObj!)}
                            className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                            title="Pratinjau Mushaf"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            removeQuestionFromParticipant(row.participantId, row.questionId);
                            setFeedbackMessage({
                              type: 'success',
                              text: `Penetapan maqra ${row.questionCode} telah dilepaskan dari peserta ${row.participantName}.`
                            });
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

      {/* Tab 3: Riwayat & Audit Undian Maqra */}
      {activeTab === 'riwayat_undian' && (
        <div className="space-y-4">
          {lotteryDrawLogs.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs p-10 text-center text-slate-400 text-xs">
              Belum ada riwayat eksekusi undian maqra pada penyelenggaraan ini.
            </div>
          ) : (
            lotteryDrawLogs
              .filter((log) => {
                if (selectedBranch !== 'Semua Cabang' && log.branchName && log.branchName !== selectedBranch) {
                  return false;
                }
                if (selectedLevel !== 'Semua Jenjang' && log.levelName && log.levelName !== selectedLevel) {
                  return false;
                }
                if (selectedStage !== 'Semua Babak' && log.stageName !== selectedStage) {
                  return false;
                }
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  log.stageName.toLowerCase().includes(q) ||
                  (log.branchName || '').toLowerCase().includes(q) ||
                  (log.levelName || '').toLowerCase().includes(q) ||
                  log.actorName.toLowerCase().includes(q) ||
                  log.drawResults.some(
                    (r) =>
                      r.participantName.toLowerCase().includes(q) ||
                      r.assignedQuestionCodes.some((c) => c.toLowerCase().includes(q))
                  )
                );
              })
              .map((log) => (
                <div
                  key={log.id}
                  className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden"
                >
                  {/* Header Card */}
                  <div className="px-5 py-3.5 bg-slate-50/70 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 font-mono text-xs font-bold">
                        Undian v{log.drawVersion}
                      </span>
                      <span className="font-bold text-xs text-slate-900">
                        Babak {log.stageName}
                      </span>
                      {log.branchName && (
                        <span className="text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700 font-medium">
                          {log.branchName}
                        </span>
                      )}
                      {log.levelName && (
                        <span className="text-xs px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-medium">
                          {log.levelName}
                        </span>
                      )}
                      <span className="text-[11px] text-slate-500">
                        · {log.participantIds.length} Peserta · Pool {log.questionPoolIds.length} Soal
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono">
                      Oleh <span className="font-semibold text-slate-800">{log.actorName}</span> ·{' '}
                      {new Date(log.createdAt).toLocaleString('id-ID')}
                    </div>
                  </div>

                  {/* Structured Results Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-100 text-slate-500 bg-white text-[11px] font-semibold">
                          <th className="px-5 py-2.5 w-14">No</th>
                          <th className="px-5 py-2.5">Nama Peserta</th>
                          <th className="px-5 py-2.5">Kode Maqra Ditugaskan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {log.drawResults.map((r, i) => (
                          <tr
                            key={`${log.id}-${r.participantId}-${i}`}
                            className="hover:bg-slate-50/50 transition-colors"
                          >
                            <td className="px-5 py-2.5 font-mono text-slate-400">
                              {i + 1}
                            </td>
                            <td className="px-5 py-2.5 font-semibold text-slate-900">
                              {r.participantName}
                            </td>
                            <td className="px-5 py-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                {r.assignedQuestionCodes.map((qt, qi) => (
                                  <span
                                    key={qi}
                                    className="text-[11px] font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/80 px-2 py-0.5 rounded"
                                  >
                                    {qt}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {/* Mushaf Preview Modal */}
      {previewQuestion && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-xs text-emerald-800 bg-emerald-100/70 px-2 py-0.5 rounded shrink-0">
                    {previewQuestion.code}
                  </span>
                  <h3 className="font-extrabold text-sm text-slate-900 truncate">
                    {previewQuestion.title}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  QS. {previewQuestion.surahName} [{previewQuestion.surahNumber}]: {previewQuestion.startAyah} - {previewQuestion.endAyah} · {previewPages.length} Halaman Mushaf
                </p>
              </div>

              <button
                onClick={() => setPreviewQuestion(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 rounded-lg shrink-0 transition-colors cursor-pointer"
                title="Tutup Pratinjau"
                aria-label="Tutup Pratinjau"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-0 m-0 bg-white flex flex-col items-stretch">
              {previewPages.map((pageNum) => (
                <div key={pageNum} className="w-full p-0 m-0 bg-white">
                  <img
                    src={`https://android.quran.com/data/width_1260/page${String(
                      pageNum
                    ).padStart(3, '0')}.png`}
                    alt={`Mushaf Halaman ${pageNum}`}
                    className="w-full h-auto block select-none m-0 p-0"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manual Multi-Question Assignment Modal */}
      {manualAssignQuestion && (
        <AppModal
          isOpen={Boolean(manualAssignQuestion)}
          onClose={() => setManualAssignQuestion(null)}
          title="Penetapan Maqra ke Peserta"
          subtitle={`${manualAssignQuestion.code} · ${manualAssignQuestion.title}`}
          maxWidthClass="max-w-lg"
          footer={
            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setManualAssignQuestion(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Selesai
              </button>
              <button
                onClick={handleAddQuestionToParticipant}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
              >
                Tambahkan ke Peserta
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-xs space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-extrabold text-slate-900 text-sm">{manualAssignQuestion.title}</span>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                    Babak: {manualAssignQuestion.stageName}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-semibold">
                    {manualAssignQuestion.branchAndLevel}
                  </span>
                </div>
              </div>
              <p className="text-slate-600">
                QS. {manualAssignQuestion.surahName} [{manualAssignQuestion.surahNumber}]: {manualAssignQuestion.startAyah} - {manualAssignQuestion.endAyah} · Rentang Halaman: Hal. {manualAssignQuestion.pageStart || manualAssignQuestion.pageNumber} s/d {manualAssignQuestion.pageEnd || manualAssignQuestion.pageNumber}
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1.5">
                Peserta yang Saat Ini Memiliki Soal Ini di Babak {manualAssignQuestion.stageName}:
              </label>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {participants.filter(
                  (p) =>
                    (p.stageName === manualAssignQuestion.stageName || !p.stageName) &&
                    (p.questionId === manualAssignQuestion.id ||
                      p.assignedQuestions?.some(
                        (aq) => aq.questionId === manualAssignQuestion.id && (!aq.stageName || aq.stageName === manualAssignQuestion.stageName)
                      ))
                ).length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    Belum ada peserta yang ditugaskan maqra ini pada Babak {manualAssignQuestion.stageName}.
                  </p>
                ) : (
                  participants
                    .filter(
                      (p) =>
                        (p.stageName === manualAssignQuestion.stageName || !p.stageName) &&
                        (p.questionId === manualAssignQuestion.id ||
                          p.assignedQuestions?.some(
                            (aq) => aq.questionId === manualAssignQuestion.id && (!aq.stageName || aq.stageName === manualAssignQuestion.stageName)
                          ))
                    )
                    .map((p, idx) => (
                      <div
                        key={`${p.id}-${idx}`}
                        className="flex items-center justify-between p-2 rounded-lg bg-emerald-50/60 border border-emerald-200 text-xs"
                      >
                        <div>
                          <span className="font-bold text-emerald-950 font-mono mr-1.5">
                            #{p.lotteryNumber}
                          </span>
                          <span className="font-semibold text-slate-800">{p.name}</span>
                          <span className="text-[10px] text-slate-500 ml-1.5">
                            ({p.kafilahName} · Babak {p.stageName})
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            removeQuestionFromParticipant(p.id, manualAssignQuestion.id, manualAssignQuestion.stageName)
                          }
                          className="p-1 text-rose-600 hover:bg-rose-100 rounded transition-colors cursor-pointer"
                          title="Hapus soal ini dari peserta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                Pilih Peserta untuk Diberikan Maqra Ini:
              </label>
              <select
                value={targetParticipantId}
                onChange={(e) => setTargetParticipantId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 bg-white"
              >
                {participants.map((p, idx) => {
                  const matchesStage = !manualAssignQuestion.stageName || p.stageName === manualAssignQuestion.stageName;
                  const alreadyHas =
                    (p.questionId === manualAssignQuestion.id && (!p.stageName || p.stageName === manualAssignQuestion.stageName)) ||
                    p.assignedQuestions?.some(
                      (aq) => aq.questionId === manualAssignQuestion.id && (!aq.stageName || aq.stageName === manualAssignQuestion.stageName)
                    );
                  const totalAssignedCount =
                    p.assignedQuestions?.filter((aq) => !aq.stageName || aq.stageName === manualAssignQuestion.stageName).length ||
                    (p.questionId && p.questionId !== '' && p.stageName === manualAssignQuestion.stageName ? 1 : 0);

                  const note = alreadyHas
                    ? '✓ Sudah Memiliki Soal Ini'
                    : totalAssignedCount === 0
                    ? '★ Belum Memiliki Maqra'
                    : `${totalAssignedCount} soal aktif`;

                  const stageNote = !matchesStage ? ` [BEDA BABAK: ${p.stageName}]` : '';

                  return (
                    <option
                      key={`${p.id}-${idx}`}
                      value={p.id}
                      disabled={alreadyHas || !matchesStage}
                    >
                      #{p.lotteryNumber} - {p.name} ({p.participantId} · {p.branchName}) · {note}{stageNote}
                    </option>
                  );
                })}
              </select>

              {manualAssignFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                    manualAssignFeedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border border-rose-200'
                  }`}
                >
                  {manualAssignFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span>{manualAssignFeedback.message}</span>
                </div>
              )}
            </div>
          </div>
        </AppModal>
      )}

      {/* Undian Penentuan Soal Workflow Modal (With Dual Checklists: Peserta + Pool Soal) */}
      {isLotteryModalOpen && (
        <AppModal
          isOpen={isLotteryModalOpen}
          onClose={() => setIsLotteryModalOpen(false)}
          isBusy={isDrawingAnimation}
          title="Alur Undian Penentuan Soal / Maqra"
          subtitle="Pengundian acak Fisher-Yates berbasis Checklist Peserta dan Checklist Pool Soal (Maqra)"
          maxWidthClass="max-w-3xl"
          footer={
            <div className="flex items-center justify-between">
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
                data-testid="commit-lottery-draw-btn"
                className="px-5 py-2 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-40 text-white text-xs font-bold rounded-lg shadow-2xs"
              >
                Terapkan & Simpan Hasil Undian
              </button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Scope Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Babak Perlombaan:</label>
                <select
                  value={lotteryStage}
                  onChange={(e) => {
                    const newStg = e.target.value;
                    setLotteryStage(newStg);
                    setLotteryDrawResults(null);
                    setLotteryFeedback('');
                    syncLotteryPoolsOnFilterChange(newStg, lotteryBranch, lotteryLevel);
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  {stages.map((stg) => (
                    <option key={stg.id} value={stg.name}>
                      {stg.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Cabang Lomba:</label>
                <select
                  value={lotteryBranch}
                  onChange={(e) => {
                    const newBr = e.target.value;
                    setLotteryBranch(newBr);
                    setLotteryDrawResults(null);
                    setLotteryFeedback('');
                    syncLotteryPoolsOnFilterChange(lotteryStage, newBr, lotteryLevel);
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Semua Cabang">Semua Cabang</option>
                  {cabangList.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Jenjang Lomba:</label>
                <select
                  value={lotteryLevel}
                  onChange={(e) => {
                    const newLv = e.target.value;
                    setLotteryLevel(newLv);
                    setLotteryDrawResults(null);
                    setLotteryFeedback('');
                    syncLotteryPoolsOnFilterChange(lotteryStage, lotteryBranch, newLv);
                  }}
                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Semua Jenjang">Semua Jenjang</option>
                  {jenjangList.map((j) => (
                    <option key={j.id} value={j.name}>
                      {j.name}
                    </option>
                  ))}
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

            {/* Dual Checklists: Left = Checklist Peserta, Right = Checklist Pool Soal (Maqra) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Checklist Peserta */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    1. Checklist Peserta ({selectedParticipantIds.length}/{eligibleLotteryParticipants.length})
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
                      Tidak ada peserta sesuai filter ini.
                    </div>
                  ) : (
                    eligibleLotteryParticipants.map((p, idx) => {
                      const isSelected = selectedParticipantIds.includes(p.id);
                      return (
                        <div
                          key={`${p.id}-${idx}`}
                          onClick={() => handleToggleParticipant(p.id)}
                          className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer"
                            />
                            <div>
                              <span className="font-mono font-bold text-slate-900 mr-1.5">
                                #{p.lotteryNumber}
                              </span>
                              <span className="font-semibold text-slate-800">{p.name}</span>
                              <span className="text-[10px] text-slate-400 block">
                                {p.branchName} · {p.levelName || 'Umum'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Checklist Pool Soal (Maqra) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    2. Checklist Pool Soal ({selectedQuestionPoolIds.length}/{eligibleLotteryQuestions.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleToggleSelectAllQuestions}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline"
                  >
                    {selectedQuestionPoolIds.length === eligibleLotteryQuestions.length
                      ? 'Batalkan Semua'
                      : 'Pilih Semua'}
                  </button>
                </div>

                <div
                  data-testid="lottery-question-pool-list"
                  className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto bg-white text-xs"
                >
                  {eligibleLotteryQuestions.length === 0 ? (
                    <div className="p-4 text-center text-slate-400">
                      Tidak ada soal aktif sesuai filter ini.
                    </div>
                  ) : (
                    eligibleLotteryQuestions.map((q, idx) => {
                      const isSelected = selectedQuestionPoolIds.includes(q.id);
                      return (
                        <div
                          key={`${q.id}-${idx}`}
                          onClick={() => handleToggleQuestionPool(q.id)}
                          className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected ? 'bg-emerald-50/50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded text-emerald-700 focus:ring-emerald-600 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0">
                              <span className="font-mono font-bold text-emerald-800 mr-1.5">
                                {q.code}
                              </span>
                              <span className="font-semibold text-slate-800 truncate">
                                {q.title}
                              </span>
                              <span className="text-[10px] text-slate-400 block">
                                Hal. {q.pageStart || q.pageNumber} · {q.branchName || q.branchAndLevel}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Action Button to Roll */}
            <div className="flex items-center justify-center pt-1">
              <button
                type="button"
                onClick={handleExecuteDraw}
                disabled={
                  isDrawingAnimation ||
                  selectedParticipantIds.length === 0 ||
                  selectedQuestionPoolIds.length === 0
                }
                data-testid="execute-lottery-draw-btn"
                className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isDrawingAnimation ? 'animate-spin' : ''}`} />
                <span>
                  {isDrawingAnimation ? 'Mengundi Secara Acak (Fisher-Yates)...' : 'Mulai Pengundian Acak'}
                </span>
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
                    Siap Diterapkan
                  </span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {lotteryDrawResults.map((res, idx) => (
                    <div
                      key={`${res.participantId}-${idx}`}
                      className="bg-white p-2.5 rounded-lg border border-emerald-100 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5"
                    >
                      <span className="font-bold text-slate-900">{res.participantName}</span>
                      <div className="flex flex-wrap items-center gap-1">
                        {res.questionTitles.map((t, i) => (
                          <span
                            key={i}
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
        </AppModal>
      )}

      {/* Add / Edit Question Modal (Separated Cabang, Jenjang, Babak) */}
      {isAddModalOpen && (
        <AppModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          title={editingQuestion ? 'Edit Soal / Maqra' : 'Tambah Soal / Maqra Baru'}
          subtitle="Pilih Cabang, Jenjang, dan Babak secara terpisah sesuai Master Data"
          maxWidthClass="max-w-xl"
          footer={
            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                type="submit"
                form="question-form"
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-2xs"
              >
                {editingQuestion ? 'Simpan Perubahan' : 'Tambah Maqra'}
              </button>
            </div>
          }
        >
          <form id="question-form" onSubmit={handleSaveQuestion} className="space-y-4">
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Kode Soal *
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
                  Hal. Awal (1-604) *
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
                  Hal. Akhir (1-604) *
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
                Judul Maqra *
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

            <div className="grid grid-cols-4 gap-3">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Nama Surah *
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
                  Ayat Awal *
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
                  Ayat Akhir *
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Cabang Lomba (Master Data) *
                </label>
                <select
                  value={formBranchName}
                  onChange={(e) => setFormBranchName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  {activeCabangList.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {editingQuestion &&
                    formBranchName &&
                    !activeCabangList.some((c) => c.name === formBranchName) && (
                      <option value={formBranchName}>{formBranchName} (Historis)</option>
                    )}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Jenjang Lomba (Master Data) *
                </label>
                <select
                  value={formLevelName}
                  onChange={(e) => setFormLevelName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  {activeJenjangList.map((j) => (
                    <option key={j.id} value={j.name}>
                      {j.name}
                    </option>
                  ))}
                  {editingQuestion &&
                    formLevelName &&
                    !activeJenjangList.some((j) => j.name === formLevelName) && (
                      <option value={formLevelName}>{formLevelName} (Historis)</option>
                    )}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 block mb-1">
                  Babak (Master Data) *
                </label>
                <select
                  value={formStage}
                  onChange={(e) => setFormStage(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                >
                  {activeStages.map((stg) => (
                    <option key={stg.id} value={stg.name}>
                      {stg.name}
                    </option>
                  ))}
                  {editingQuestion &&
                    formStage &&
                    !activeStages.some((s) => s.name === formStage) && (
                      <option value={formStage}>{formStage} (Historis)</option>
                    )}
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
          </form>
        </AppModal>
      )}

      {/* Modal Import Excel Bank Soal */}
      {isImportModalOpen && (
        <AppModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          isBusy={isImporting}
          title="Import Bank Soal / Maqra dari Excel (.xlsx)"
          subtitle="Validasi otomatis terhadap Cabang, Jenjang, Babak, dan rentang halaman Mushaf Madinah (1-604)"
          maxWidthClass="max-w-3xl"
          footer={
            <div className="flex items-center justify-between">
              <div>
                {importValidation && importValidation.errors.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadImportErrorReport(importValidation.errors, 'Error_Import_Bank_Soal_MTQ.xlsx')
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Laporan Baris Error ({importValidation.errors.length})</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!importValidation || importValidation.validRows.length === 0 || isImporting}
                  onClick={handleCommitExcelImport}
                  data-testid="commit-question-import-btn"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-300 rounded-lg"
                >
                  {isImporting
                    ? 'Mengimpor...'
                    : `Impor ${importValidation?.validRows.length || 0} Soal Valid`}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {importFileName || 'Pilih file Excel (.xlsx / .xls) sesuai Template Bank Soal'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Pastikan nama Cabang, Jenjang, dan Babak sesuai dengan sheet Referensi Master Data.
                  </p>
                </div>
              </div>
              <label className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0">
                Pilih File Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelFileChange}
                  data-testid="question-excel-file-input"
                  className="hidden"
                />
              </label>
            </div>

            {importValidation && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block">Total Baris Dibaca</span>
                    <span className="text-base font-extrabold text-slate-900 font-mono">
                      {importValidation.totalRows}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-emerald-700 block">Soal Valid (Siap Impor)</span>
                    <span className="text-base font-extrabold text-emerald-900 font-mono">
                      {importValidation.validRows.length}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-rose-700 block">Baris Ditolak / Error</span>
                    <span className="text-base font-extrabold text-rose-900 font-mono">
                      {importValidation.errors.length}
                    </span>
                  </div>
                </div>

                {importValidation.errors.length > 0 && (
                  <div className="border border-rose-200 rounded-xl overflow-hidden">
                    <div className="bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900 border-b border-rose-200">
                      Detail Baris Ditolak ({importValidation.errors.length})
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-rose-100 text-xs">
                      {importValidation.errors.map((err, i) => (
                        <div key={i} className="px-3 py-2 flex items-start gap-2 text-rose-800">
                          <span className="font-mono font-bold shrink-0">Baris #{err.rowNumber}:</span>
                          <span>
                            <strong>{err.identifier}</strong> — {err.reasons.join(' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importValidation.validRows.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 border-b border-slate-200">
                      Pratinjau Soal Valid ({importValidation.validRows.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <tr>
                            <th className="py-1.5 px-3">Kode</th>
                            <th className="py-1.5 px-3">Judul Maqra</th>
                            <th className="py-1.5 px-3">Halaman</th>
                            <th className="py-1.5 px-3">Cabang & Jenjang</th>
                            <th className="py-1.5 px-3">Babak</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importValidation.validRows.slice(0, 20).map((r, i) => (
                            <tr key={i}>
                              <td className="py-1.5 px-3 font-mono font-bold text-emerald-700">
                                {r.code}
                              </td>
                              <td className="py-1.5 px-3 font-semibold text-slate-900">{r.title}</td>
                              <td className="py-1.5 px-3 font-mono">
                                {r.pageStart}-{r.pageEnd}
                              </td>
                              <td className="py-1.5 px-3">
                                {r.branchName} ({r.levelName})
                              </td>
                              <td className="py-1.5 px-3 font-mono">{r.stageName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </AppModal>
      )}
    </div>
  );
};
