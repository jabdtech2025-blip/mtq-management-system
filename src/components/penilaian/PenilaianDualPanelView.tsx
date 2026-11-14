import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  PenTool,
  Highlighter,
  Eraser,
  Undo2,
  Trash2,
  Lock,
  Save,
  ChevronDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  Minus,
  Plus,
  RotateCcw,
  Menu,
  ShieldCheck,
  Check,
  RefreshCw,
  Hand
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { CanvasStroke, NormalizedPoint, AssignedMaqraItem } from '../../types/mtq';
import { calculateAssessmentScore } from '../../services/scoringEngine';
import {
  detectLocalMushaf,
  getKnownLocalMushafAvailability,
  getMushafPageSources,
  prefetchMushafPages
} from '../../services/mushafSource';

export const PenilaianDualPanelView: React.FC = () => {
  const {
    currentTenant,
    participants,
    selectedParticipantId,
    setSelectedParticipantId,
    setCurrentView,
    currentUser,
    users,
    monitoringJudgeId,
    errorCategories,
    assessments,
    initializeAssessment,
    updateErrorCount,
    saveAnnotations,
    finalizeAssessment,
    getJudgeAssessment,
    getParticipantStageQuestions,
    syncStatus,
    lastSyncTime,
    toggleSidebar,
    judgeAssignments,
    getActiveRubricForBranch,
    stages
  } = useMtq();

  // Find current participant (handle empty state gracefully)
  const currentParticipant =
    participants.find((p) => p.id === selectedParticipantId) || participants[0] || null;
  const activeRubric = currentParticipant
    ? getActiveRubricForBranch(
        currentParticipant.branchName,
        currentParticipant.branchId,
        currentParticipant.levelId,
        currentParticipant.levelName
      )
    : null;

  const activeStageName = currentParticipant?.stageName || 'Penyisihan';

  // Multi-Question support: strictly retrieved per stage via getParticipantStageQuestions (NO cross-stage fallback!)
  const participantAssignedQuestions = useMemo<AssignedMaqraItem[]>(() => {
    if (!currentParticipant) return [];
    return getParticipantStageQuestions(currentParticipant.id, activeStageName);
  }, [currentParticipant, activeStageName, getParticipantStageQuestions]);

  const [activeQuestionId, setActiveQuestionId] = useState<string>('');

  // Synchronize activeQuestionId when participant changes
  useEffect(() => {
    if (participantAssignedQuestions.length > 0) {
      if (!participantAssignedQuestions.some((q: AssignedMaqraItem) => q.questionId === activeQuestionId)) {
        const first = participantAssignedQuestions[0];
        setActiveQuestionId(first.questionId);
        const startP = first.pageStart || first.pageNumber || 305;
        setCurrentPage(startP);
      }
    } else {
      setActiveQuestionId('');
    }
  }, [participantAssignedQuestions, activeQuestionId]);

  // Active question object
  const activeQuestionObj = useMemo(() => {
    return (
      participantAssignedQuestions.find((q: AssignedMaqraItem) => q.questionId === activeQuestionId) ||
      participantAssignedQuestions[0]
    );
  }, [participantAssignedQuestions, activeQuestionId]);

  // Active judge ID & Name with Admin Monitoring support
  const isAdminMode = currentUser.role !== 'judge';
  const activeJudgeId = isAdminMode
    ? (monitoringJudgeId || users.find((u) => u.role === 'judge' && u.tenantId === currentTenant.id)?.id || '')
    : currentUser.id;
  const inspectedJudge = users.find((u) => u.id === activeJudgeId);
  const activeJudgeName =
    inspectedJudge?.name || (currentUser.role === 'judge' ? currentUser.name : 'Dewan Hakim');

  // Find active assessment scoped strictly by participant, judge, stage, and activeQuestionId
  const currentAssessment = currentParticipant
    ? getJudgeAssessment(currentParticipant.id, activeJudgeId, activeStageName, activeQuestionId)
    : undefined;

  const isFinalized = currentAssessment?.status === 'finalized';

  // Canvas & Image refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const prevPageRef = useRef<number | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(
    activeQuestionObj?.pageStart || activeQuestionObj?.pageNumber || currentParticipant?.pageNumber || 305
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // High-Res Scanned Mushaf Madinah state
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);

  // Default tool is 'scroll' (bukan pena coretan) agar hakim dapat scroll mushaf dengan bebas kecuali memilih mode coretan
  const [activeTool, setActiveTool] = useState<'scroll' | 'pen' | 'marker' | 'eraser'>('scroll');
  const [activeColor, setActiveColor] = useState<string>('#dc2626'); // Red for Tajwid Jali
  const [strokeSize, setStrokeSize] = useState<number>(3);
  const [strokes, setStrokes] = useState<CanvasStroke[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<NormalizedPoint[]>([]);

  // Tabloid portrait view mode ('mushaf' vs 'scoring') for narrow/portrait tablets
  const [tabletActiveTab, setTabletActiveTab] = useState<'mushaf' | 'scoring'>('mushaf');

  // Confirmation Modals
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isClearPageModalOpen, setIsClearPageModalOpen] = useState(false);

  // Sumber gambar mushaf: file lokal public/mushaf/*.webp BILA tersedia, selain itu pihak ketiga
  const [hasLocalMushaf, setHasLocalMushaf] = useState<boolean | null>(() => getKnownLocalMushafAvailability());
  useEffect(() => {
    if (hasLocalMushaf !== null) return;
    let cancelled = false;
    void detectLocalMushaf().then((available) => {
      if (!cancelled) setHasLocalMushaf(available);
    });
    return () => {
      cancelled = true;
    };
  }, [hasLocalMushaf]);
  const imageSources = getMushafPageSources(currentPage, Boolean(hasLocalMushaf));
  const [imageSourceIndex, setImageSourceIndex] = useState<number>(0);
  // Tunggu hasil pemeriksaan sumber lokal (sekali per sesi) agar gambar tidak dimuat dua kali
  const currentImageUrl =
    hasLocalMushaf === null ? undefined : imageSources[imageSourceIndex] || imageSources[0];

  // Reset drawing state when switching participant, judge, stage, or question (TANPA mereset imageLoaded agar mushaf tidak loading terus!)
  useEffect(() => {
    setIsDrawing(false);
    setCurrentStroke([]);
  }, [currentParticipant?.id, activeJudgeId, activeStageName, activeQuestionId]);

  // Synchronize strokes from assessment state when not actively drawing (TANPA mereset imageLoaded!)
  useEffect(() => {
    if (!currentParticipant) {
      setStrokes([]);
      return;
    }
    if (!isDrawing) {
      const asm = getJudgeAssessment(
        currentParticipant.id,
        activeJudgeId,
        activeStageName,
        activeQuestionId
      );
      setStrokes(asm?.annotations || []);
    }
  }, [currentParticipant?.id, activeJudgeId, activeStageName, activeQuestionId, assessments, isDrawing, getJudgeAssessment]);

  // Handler to switch question
  const handleSelectQuestion = (qId: string) => {
    setActiveQuestionId(qId);
    const q = participantAssignedQuestions.find((item: AssignedMaqraItem) => item.questionId === qId);
    if (q) {
      const targetPage = q.pageStart || q.pageNumber || 305;
      setCurrentPage(targetPage);
    }
  };

  // Unduh lebih dulu halaman maqra aktif (+1 halaman) agar tersimpan di cache tablet untuk kondisi offline
  useEffect(() => {
    if (hasLocalMushaf === null || !activeQuestionObj) return;
    const start = activeQuestionObj.pageStart || activeQuestionObj.pageNumber;
    const end = activeQuestionObj.pageEnd || start;
    const pages = activeQuestionObj.pageNumbers?.length
      ? activeQuestionObj.pageNumbers
      : Array.from({ length: Math.max(0, end - start) + 1 }, (_, i) => start + i);
    prefetchMushafPages([...pages, end + 1], hasLocalMushaf);
  }, [activeQuestionObj, hasLocalMushaf]);

  // Reset image state ONLY when currentPage actually changes
  useEffect(() => {
    if (prevPageRef.current !== currentPage) {
      prevPageRef.current = currentPage;
      setImageLoadError(false);
      setImageSourceIndex(0);
      if (imgRef.current && imgRef.current.complete && imgRef.current.naturalWidth > 0) {
        setImageLoaded(true);
      } else {
        setImageLoaded(false);
      }
    }
  }, [currentPage]);

  // Redraw canvas with normalized coordinates
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pageStrokes = strokes.filter((s) => s.page === currentPage);
    pageStrokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length < 2) return;

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
      }

      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.size * (canvas.width / 600);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'marker') {
        ctx.globalAlpha = 0.45;
      } else {
        ctx.globalAlpha = 0.95;
      }

      ctx.stroke();
      ctx.globalAlpha = 1.0;
    });

    // Draw active drawing stroke if in progress
    if (currentStroke.length > 1 && activeTool !== 'eraser' && activeTool !== 'scroll') {
      ctx.beginPath();
      ctx.moveTo(currentStroke[0].x * canvas.width, currentStroke[0].y * canvas.height);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x * canvas.width, currentStroke[i].y * canvas.height);
      }
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = strokeSize * (canvas.width / 600);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = activeTool === 'marker' ? 0.45 : 0.95;
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }
  }, [strokes, currentPage, currentStroke, activeTool, activeColor, strokeSize]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Helper to get normalized coordinates from pointer event
  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): NormalizedPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Erase stroke near point without white paint!
  const eraseStrokesNear = (point: NormalizedPoint) => {
    if (!currentParticipant || isFinalized || isEditLocked) return;
    const ERASE_RADIUS = 0.035; // Normalized radius

    const remainingStrokes = strokes.filter((s) => {
      if (s.page !== currentPage) return true; // Keep other pages untouched
      const isNear = s.points.some((p) => {
        const dx = p.x - point.x;
        const dy = p.y - point.y;
        return Math.sqrt(dx * dx + dy * dy) < ERASE_RADIUS;
      });
      return !isNear;
    });

    if (remainingStrokes.length !== strokes.length) {
      setStrokes(remainingStrokes);
      saveAnnotations(currentParticipant.id, activeJudgeId, remainingStrokes, activeStageName, activeQuestionId);
    }
  };

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentParticipant || isFinalized || isEditLocked || activeTool === 'scroll') return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (activeTool === 'eraser') {
      eraseStrokesNear(pt);
      setIsDrawing(true);
      return;
    }

    setIsDrawing(true);
    setCurrentStroke([pt]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentParticipant || isFinalized || isEditLocked || activeTool === 'scroll') return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (activeTool === 'eraser') {
      eraseStrokesNear(pt);
      return;
    }

    setCurrentStroke((prev) => [...prev, pt]);
  };

  const handlePointerUp = () => {
    if (!isDrawing || !currentParticipant || isFinalized || isEditLocked || activeTool === 'scroll') {
      setIsDrawing(false);
      setCurrentStroke([]);
      return;
    }

    setIsDrawing(false);

    if (activeTool !== 'eraser' && currentStroke.length > 1) {
      const newStroke: CanvasStroke = {
        id: 'stroke-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        page: currentPage,
        tool: activeTool === 'marker' ? 'marker' : 'pen',
        color: activeColor,
        size: strokeSize,
        points: currentStroke
      };
      const updated = [...strokes, newStroke];
      setStrokes(updated);
      saveAnnotations(currentParticipant.id, activeJudgeId, updated, activeStageName, activeQuestionId);
    }
    setCurrentStroke([]);
  };

  // Undo stroke on current page
  const handleUndo = () => {
    if (!currentParticipant || isFinalized || isEditLocked) return;
    const pageStrokes = strokes.filter((s) => s.page === currentPage);
    if (pageStrokes.length === 0) return;

    const lastStroke = pageStrokes[pageStrokes.length - 1];
    const updated = strokes.filter((s) => s.id !== lastStroke.id);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated, activeStageName, activeQuestionId);
  };

  // Clear current page strokes only
  const handleConfirmClearPage = () => {
    if (!currentParticipant || isFinalized || isEditLocked) return;
    const updated = strokes.filter((s) => s.page !== currentPage);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated, activeStageName, activeQuestionId);
    setIsClearPageModalOpen(false);
  };

  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [isFlawlessConfirmed, setIsFlawlessConfirmed] = useState<boolean>(false);
  const [isFinalizing, setIsFinalizing] = useState<boolean>(false);

  // Babak (stage) milik peserta pada cabangnya — dipakai untuk cek "sudah disahkan" & penugasan
  const activeStage = useMemo(() => {
    if (!currentParticipant) return undefined;
    const sameName = stages.filter((s) => s.name === activeStageName);
    return (
      (currentParticipant.stageId && stages.find((s) => s.id === currentParticipant.stageId)) ||
      sameName.find((s) => currentParticipant.branchId && s.branchId === currentParticipant.branchId) ||
      sameName.find((s) => s.branchName === currentParticipant.branchName) ||
      sameName.find((s) => !s.branchId && (!s.branchName || s.branchName === 'Semua Cabang'))
    );
  }, [stages, activeStageName, currentParticipant]);

  // SELURUH penugasan aktif hakim ini di babak & cabang peserta (satu hakim bisa memegang beberapa rubrik/bidang).
  // Aturan ini disamakan dengan fungsi database is_assigned_judge.
  const activeJudgeAssignments = useMemo(() => {
    if (!currentParticipant) return [];
    return judgeAssignments.filter((ja) => {
      if (ja.judgeId !== activeJudgeId) return false;
      if (ja.status === 'Nonaktif') return false;
      const stageMatches =
        ja.stageId && activeStage?.id ? ja.stageId === activeStage.id : ja.stageName === activeStageName;
      if (!stageMatches) return false;
      if (ja.branchId && currentParticipant.branchId) {
        return ja.branchId === currentParticipant.branchId || ja.branchId === activeStage?.branchId;
      }
      return !ja.branchName || ja.branchName === 'Semua Cabang' || ja.branchName === currentParticipant.branchName;
    });
  }, [judgeAssignments, activeJudgeId, activeStageName, activeStage, currentParticipant]);
  const currentJudgeAssignment = activeJudgeAssignments[0] || null;

  // Pencegahan di sumbernya: hakim hanya boleh mengisi lembar bila ditugaskan dan babak belum disahkan
  const judgeLockReason: string | null = (() => {
    if (isAdminMode || !currentParticipant || isFinalized) return null;
    if (activeStage?.isFinalized) {
      return `Babak ${activeStageName} sudah disahkan. Lembar penilaian hanya dapat dilihat.`;
    }
    if (activeJudgeAssignments.length === 0) {
      return `Anda tidak ditugaskan menilai babak ${activeStageName} untuk cabang ${currentParticipant.branchName}. Hubungi panitia bila ini keliru.`;
    }
    return null;
  })();
  const isEditLocked = isAdminMode || Boolean(judgeLockReason);

  const assignedFieldName =
    currentJudgeAssignment?.judgeField ||
    inspectedJudge?.judgeField ||
    (currentUser.role === 'judge' ? currentUser.judgeField : '');
  const assignedFieldId = currentJudgeAssignment?.judgeFieldId;

  // Error counting values from active assessment
  // Restrict judges to accessing and scoring error categories for their assigned field, with flexible field/scope matching
  const activeErrorCategories = useMemo(() => {
    const activeOnly = errorCategories.filter((cat) => cat.status !== 'Nonaktif');

    const categoriesForField = (fieldId?: string, fieldName?: string) => {
      const lowerAssigned = (fieldName || '').toLowerCase();
      const cleanedAssigned = lowerAssigned.replace(/^bidang\s+/i, '').trim();

      const matchingRubricField = activeRubric?.fields?.find((f) => {
        if (fieldId && f.id === fieldId) return true;
        if (!lowerAssigned) return false;
        const fName = f.name.toLowerCase();
        const fCode = f.code.toLowerCase();
        const cleanedFName = fName.replace(/^bidang\s+/i, '').trim();
        return (
          fName === lowerAssigned ||
          fCode === lowerAssigned ||
          lowerAssigned.includes(fName) ||
          fName.includes(lowerAssigned) ||
          (cleanedAssigned && (cleanedFName.includes(cleanedAssigned) || cleanedAssigned.includes(cleanedFName)))
        );
      });

      const targetFieldId = fieldId || matchingRubricField?.id;
      const targetFieldName = (matchingRubricField?.name || fieldName || '').toLowerCase();
      const cleanedTargetField = targetFieldName.replace(/^bidang\s+/i, '').trim();

      return activeOnly.filter((cat) => {
        if (targetFieldId && cat.fieldId === targetFieldId) return true;
        const catScope = (cat.scope || '').toLowerCase();
        const catName = (cat.name || '').toLowerCase();
        if (targetFieldName && (catScope.includes(targetFieldName) || targetFieldName.includes(catScope))) return true;
        if (targetFieldName && (catName.includes(targetFieldName) || targetFieldName.includes(catName))) return true;
        if (cleanedTargetField && (catScope.includes(cleanedTargetField) || catName.includes(cleanedTargetField))) return true;
        return false;
      });
    };

    // Satu hakim dapat ditugaskan pada beberapa rubrik/bidang di babak yang sama: gabungkan kategorinya
    const fieldTargets =
      activeJudgeAssignments.length > 0
        ? activeJudgeAssignments.map((ja) => ({
            id: ja.judgeFieldId || ja.rubricFieldId,
            name: ja.rubricFieldName || ja.judgeField
          }))
        : assignedFieldId || assignedFieldName
          ? [{ id: assignedFieldId, name: assignedFieldName }]
          : [];

    if (fieldTargets.length > 0) {
      const seen = new Set<string>();
      const merged = fieldTargets
        .flatMap((t) => categoriesForField(t.id, t.name))
        .filter((cat) => {
          if (seen.has(cat.id)) return false;
          seen.add(cat.id);
          return true;
        });
      if (merged.length > 0) return merged;
    }

    return activeOnly;
  }, [errorCategories, activeJudgeAssignments, assignedFieldId, assignedFieldName, activeRubric]);
  const errorCounts = currentAssessment?.errorCounts || {};
  const startingScore = activeRubric?.startingScore ?? 100.0;
  const liveScoreCalc = useMemo(() => {
    if (!activeRubric) return null;
    return calculateAssessmentScore(errorCounts, errorCategories, activeRubric, startingScore);
  }, [errorCounts, errorCategories, activeRubric, startingScore]);
  const totalDeductions = currentAssessment?.totalDeductions ?? liveScoreCalc?.totalDeductions ?? 0;
  const currentScore = currentAssessment ? currentAssessment.finalScore : (liveScoreCalc?.finalScore ?? startingScore);
  const pageAnnotationCount = strokes.filter((s) => s.page === currentPage).length;
  const isZeroErrorSheet = !currentAssessment || totalDeductions === 0;

  // Finalize action
  const handleConfirmFinalize = async () => {
    if (!currentParticipant || isFinalizing || isEditLocked) return;
    if (isZeroErrorSheet && !isFlawlessConfirmed) {
      setFinalizeError(
        'Lembar penilaian memiliki 0 kesalahan. Centang konfirmasi penampilan sempurna (0 kesalahan) terlebih dahulu sebelum mengunci nilai.'
      );
      return;
    }

    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      if (!currentAssessment) {
        const initRes = initializeAssessment(
          currentParticipant.id,
          activeJudgeId,
          activeStageName,
          activeQuestionId
        );
        if (!initRes.success) {
          setFinalizeError(initRes.message);
          return;
        }
      }
      const result = await finalizeAssessment(
        currentParticipant.id,
        activeJudgeId,
        activeStageName,
        activeQuestionId,
        { confirmFlawless: isFlawlessConfirmed }
      );
      if (!result.success) {
        setFinalizeError(result.message);
      } else {
        setFinalizeError(null);
        setIsFlawlessConfirmed(false);
        setIsConfirmModalOpen(false);
      }
    } finally {
      setIsFinalizing(false);
    }
  };

  if (!currentParticipant) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p className="font-semibold">Belum ada peserta yang terdaftar.</p>
        <button
          onClick={() => setCurrentView('kafilah')}
          className="mt-4 px-4 py-2 bg-emerald-800 text-white rounded-lg text-xs"
        >
          Ke Manajemen Grup & Peserta
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white text-slate-800 select-none overflow-hidden">
      {/* Mobile-only Split Toggle Bar (< md) */}
      <div className="flex md:hidden items-center justify-between bg-slate-50 border-b border-slate-200 px-4 py-2 shrink-0">
        <span className="text-xs font-semibold text-slate-600 truncate">
          {currentParticipant.name}
        </span>
        <div className="flex bg-slate-200/80 border border-slate-200 rounded-md p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setTabletActiveTab('mushaf')}
            className={`px-3 py-1 rounded-sm text-xs font-semibold cursor-pointer transition-colors ${
              tabletActiveTab === 'mushaf' ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mushaf
          </button>
          <button
            type="button"
            onClick={() => setTabletActiveTab('scoring')}
            className={`px-3 py-1 rounded-sm text-xs font-semibold cursor-pointer transition-colors ${
              tabletActiveTab === 'scoring' ? 'bg-emerald-800 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nilai
          </button>
        </div>
      </div>

      {/* Main Dual-Panel Content */}
      <div className="flex-1 flex overflow-hidden bg-white">
        {/* Left Panel: Mushaf Viewer & Annotation Canvas */}
        <div
          className={`flex-1 flex flex-col bg-white border-r border-slate-200 relative min-w-0 ${
            tabletActiveTab === 'scoring' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Mushaf Canvas Toolbar */}
          <div className="h-12 bg-slate-50 border-b border-slate-200 px-3 flex items-center justify-between gap-2 shrink-0 z-20 overflow-x-auto">
            {/* Left Tools Group: Page Navigation & Zoom */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-sm hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                  title="Halaman Sebelumnya"
                  aria-label="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold text-slate-700 font-mono tabular-nums px-2 select-none whitespace-nowrap">
                  Hal. <strong className="text-slate-900 font-bold">{currentPage}</strong> / 604
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(604, p + 1))}
                  disabled={currentPage >= 604}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-sm hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                  title="Halaman Berikutnya"
                  aria-label="Halaman Berikutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 15))}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-sm hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  title="Perkecil Tampilan"
                  aria-label="Perkecil Tampilan"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
                  className="w-8 h-8 inline-flex items-center justify-center rounded-sm hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  title="Perbesar Tampilan"
                  aria-label="Perbesar Tampilan"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Right Tools Group: Drawing Tools, Colors, and Canvas Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {isAdminMode ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1.5 rounded-md shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="truncate max-w-[200px]">Mode Pantau Admin ({activeJudgeName.split(',')[0]})</span>
                </div>
              ) : isFinalized ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-md shadow-sm">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Terkunci (Final)</span>
                </div>
              ) : judgeLockReason ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1.5 rounded-md shadow-sm">
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Hanya Baca</span>
                </div>
              ) : (
                <>
                  <div className="flex items-center bg-white border border-slate-200 rounded-md p-0.5 gap-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={() => setActiveTool('scroll')}
                      className={`w-8 h-8 inline-flex items-center justify-center rounded-sm transition-all cursor-pointer ${
                        activeTool === 'scroll'
                          ? 'bg-emerald-800 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Mode Geser / Scroll Mushaf (Default)"
                      aria-label="Mode Geser / Scroll Mushaf"
                    >
                      <Hand className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((prev) => (prev === 'pen' ? 'scroll' : 'pen'))}
                      className={`w-8 h-8 inline-flex items-center justify-center rounded-sm transition-all cursor-pointer ${
                        activeTool === 'pen'
                          ? 'bg-emerald-800 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Pena Koreksi Anotasi (Klik untuk mulai mencoret)"
                      aria-label="Pena Koreksi Anotasi"
                    >
                      <PenTool className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((prev) => (prev === 'marker' ? 'scroll' : 'marker'))}
                      className={`w-8 h-8 inline-flex items-center justify-center rounded-sm transition-all cursor-pointer ${
                        activeTool === 'marker'
                          ? 'bg-emerald-800 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Stabilo Transparan"
                      aria-label="Stabilo Transparan"
                    >
                      <Highlighter className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTool((prev) => (prev === 'eraser' ? 'scroll' : 'eraser'))}
                      className={`w-8 h-8 inline-flex items-center justify-center rounded-sm transition-all cursor-pointer ${
                        activeTool === 'eraser'
                          ? 'bg-emerald-800 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Penghapus Anotasi"
                      aria-label="Penghapus Anotasi"
                    >
                      <Eraser className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Color Dots */}
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1.5 shadow-sm">
                    {[
                      { color: '#dc2626', label: 'Merah (Tajwid Jali / Kesalahan Berat)' },
                      { color: '#f59e0b', label: 'Kuning (Tajwid Khafi / Kesalahan Sedang)' },
                      { color: '#2563eb', label: 'Biru (Waqf & Ibtida / Nada)' },
                      { color: '#16a34a', label: 'Hijau (Catatan Dewan Hakim)' }
                    ].map((c) => (
                      <button
                        key={c.color}
                        type="button"
                        onClick={() => {
                          setActiveColor(c.color);
                          if (activeTool === 'eraser') setActiveTool('pen');
                        }}
                        style={{ backgroundColor: c.color }}
                        className={`w-5 h-5 rounded-full transition-all cursor-pointer ${
                          activeColor === c.color && activeTool !== 'eraser' && activeTool !== 'scroll'
                            ? 'ring-2 ring-emerald-700 ring-offset-1 scale-110 shadow-sm'
                            : 'opacity-75 hover:opacity-100 hover:scale-105'
                        }`}
                        title={c.label}
                        aria-label={c.label}
                      />
                    ))}
                  </div>

                  {/* History & Page Reset Actions */}
                  <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md p-0.5 shadow-sm">
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={strokes.filter((s) => s.page === currentPage).length === 0}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-sm hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                      title="Undo Goresan Terakhir (Ctrl+Z)"
                      aria-label="Undo Goresan Terakhir"
                    >
                      <Undo2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsClearPageModalOpen(true)}
                      disabled={strokes.filter((s) => s.page === currentPage).length === 0}
                      className="w-8 h-8 inline-flex items-center justify-center rounded-sm hover:bg-rose-50 text-rose-600 hover:text-rose-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                      title="Bersihkan Semua Anotasi Halaman Ini"
                      aria-label="Bersihkan Semua Anotasi Halaman Ini"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mushaf Page Container */}
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto overflow-x-auto p-0 m-0 bg-white relative flex justify-start items-start"
          >
            <div
              style={{
                width: zoomLevel === 100 ? '100%' : `${zoomLevel}%`,
                minWidth: '100%',
                backgroundColor: '#ffffff'
              }}
              className="relative select-none transition-all"
            >
              {participantAssignedQuestions.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white z-30 p-6 text-center min-h-[420px]">
                  <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700 mb-3">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">
                    Maqra Belum Ditetapkan untuk Babak {activeStageName}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    Peserta {currentParticipant?.name} ({currentParticipant?.participantId}) belum memiliki maqra yang ditetapkan pada Babak {activeStageName}. Silakan tetapkan soal di menu Bank Soal & Maqra terlebih dahulu.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentView('bank_soal')}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-md shadow-sm cursor-pointer"
                  >
                    <span>Buka Bank Soal & Maqra</span>
                  </button>
                </div>
              )}

              {!imageLoaded && !imageLoadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 z-20 min-h-[420px]">
                  <RefreshCw className="w-8 h-8 text-emerald-800 animate-spin mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Memuat Halaman Mushaf {currentPage}...
                  </p>
                </div>
              )}

              {imageLoadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-20 p-6 text-center min-h-[420px]">
                  <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 mb-3">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 mb-1">
                    Mushaf Halaman {currentPage} Tidak Dapat Dimuat
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    Gagal memuat berkas gambar mushaf. Silakan periksa koneksi internet Anda atau tekan tombol coba lagi.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setImageLoadError(false);
                      setImageLoaded(false);
                      setImageSourceIndex(0);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-md shadow-sm cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Coba Lagi</span>
                  </button>
                </div>
              )}

              <img
                ref={imgRef}
                src={currentImageUrl}
                alt={`Mushaf Madinah Halaman ${currentPage}`}
                className="w-full h-auto block select-none pointer-events-none"
                loading="eager"
                onLoad={() => {
                  setImageLoaded(true);
                  setImageLoadError(false);
                }}
                onError={() => {
                  if (imageSourceIndex < imageSources.length - 1) {
                    setImageSourceIndex((idx) => idx + 1);
                  } else {
                    setImageLoadError(true);
                    setImageLoaded(false);
                  }
                }}
              />

              <canvas
                ref={canvasRef}
                width={1260}
                height={1780}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: activeTool === 'scroll' ? 'auto' : 'none' }}
                className={`absolute inset-0 w-full h-full ${
                  isEditLocked || isFinalized || activeTool === 'scroll'
                    ? 'cursor-grab pointer-events-none'
                    : 'cursor-crosshair'
                }`}
              />
            </div>
          </div>

          {/* Bottom Bar Info */}
          <div className="h-7 bg-slate-50 border-t border-slate-200 px-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
            <span className="truncate">
              Standar Mushaf Madinah 15 Baris · {activeQuestionObj?.title || currentParticipant.assignedMaqra}
            </span>
            <span className="shrink-0 font-mono tabular-nums">{pageAnnotationCount} goresan anotasi</span>
          </div>
        </div>

        {/* Right Panel: Scoring & Deduction Controls */}
        <div
          className={`w-full md:w-[390px] lg:w-[430px] xl:w-[460px] 2xl:w-[490px] shrink-0 bg-white text-slate-800 border-l border-slate-200 flex flex-col justify-between overflow-y-auto ${
            tabletActiveTab === 'mushaf' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-4 space-y-4">
            {participantAssignedQuestions.length === 0 && (
              <div className="p-3.5 bg-amber-50 rounded-lg border border-amber-200 text-center">
                <AlertTriangle className="w-5 h-5 text-amber-700 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-amber-900">Maqra Belum Ditetapkan</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Peserta belum memiliki maqra yang ditetapkan pada Babak {activeStageName}. Penilaian tidak dapat dilakukan.
                </p>
              </div>
            )}

            {/* Multi-Question Selector Toolbar */}
            {participantAssignedQuestions.length > 1 && (
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Pilih Soal yang Sedang Dinilai:
                </span>
                <div className="bg-slate-100 p-1 rounded-md flex items-center gap-1 border border-slate-200">
                  {participantAssignedQuestions.map((q: AssignedMaqraItem, idx: number) => {
                    const isActive = q.questionId === activeQuestionId;
                    const qLabel = q.code || `Soal ${idx + 1}`;
                    return (
                      <button
                        key={`${q.id || q.questionId}-${idx}`}
                        type="button"
                        onClick={() => handleSelectQuestion(q.questionId)}
                        className={`flex-1 py-1.5 px-2 rounded-sm text-xs font-bold transition-all text-center cursor-pointer truncate ${
                          isActive
                            ? 'bg-emerald-800 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                        }`}
                        title={`${qLabel}: ${q.title}`}
                      >
                        <span>{qLabel}</span>
                        {q.surahName && (
                          <span
                            className={`block text-xs font-normal truncate ${
                              isActive ? 'text-emerald-100' : 'text-slate-500'
                            }`}
                          >
                            {q.surahName}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Participant Quick Info */}
            <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-lg shadow-sm border border-emerald-700/30 p-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-emerald-200 uppercase tracking-wider text-xs">
                  Peserta Sedang Dinilai
                </span>
                <span className="font-mono font-bold text-emerald-900 bg-white/90 px-2 py-0.5 rounded-sm border border-white/40 tabular-nums text-xs">
                  {currentParticipant.participantId}
                </span>
              </div>
              <p className="font-bold text-sm sm:text-base text-white leading-snug">
                {currentParticipant.name}
              </p>
              <p className="text-xs text-emerald-100/90 mt-0.5 font-medium">
                {currentParticipant.kafilahName} · Undian #{currentParticipant.lotteryNumber} · Babak {activeStageName}
              </p>
              <div className="mt-2.5 pt-2 border-t border-emerald-700/50 flex items-center justify-between text-xs">
                <span className="text-emerald-200 font-medium">Paket Maqra:</span>
                <span className="text-white font-semibold truncate max-w-[210px] text-right">
                  {activeQuestionObj?.title || currentParticipant.assignedMaqra}
                </span>
              </div>
            </div>

            {/* Live Score Display — Nilai besar, jelas, tabular-nums anti-shift */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Nilai Akhir Hakim
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-extrabold font-mono tracking-tight tabular-nums text-slate-900 min-w-[110px]">
                  {currentScore.toFixed(2)}
                </span>
                <span className="text-sm text-slate-500 font-mono tabular-nums font-semibold">/ 100</span>
              </div>
              <p className="text-xs text-slate-600 font-mono mt-1 tabular-nums">
                Total Pengurangan: <span className="font-bold text-rose-700">-{totalDeductions.toFixed(2)} poin</span>
              </p>
              {currentAssessment?.fieldScores && Object.keys(currentAssessment.fieldScores).length > 0 && (
                <div className="grid grid-cols-2 gap-1.5 mt-2.5 pt-2 border-t border-slate-200/80">
                  {Object.entries(currentAssessment.fieldScores).map(([field, score]) => (
                    <div key={field} className="flex justify-between items-center text-xs bg-white px-2.5 py-1 rounded-sm border border-slate-200">
                      <span className="text-slate-600 font-medium truncate">{field}</span>
                      <span className="font-mono tabular-nums font-bold text-slate-900">{score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Error Categories Counters — Tombol + / - minimal 48x48px (w-12 h-12), tanpa layout shift */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Rubrik Pengurangan Kesalahan
                </h3>
                <span className="text-xs text-slate-500 font-medium">
                  {isAdminMode
                    ? 'Mode Pantau'
                    : isFinalized
                    ? 'Terkunci'
                    : judgeLockReason
                    ? 'Hanya baca'
                    : 'Ketuk + / - (48px)'}
                </span>
              </div>

              <div className="space-y-2.5">
                {activeErrorCategories.length === 0 ? (
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-500">
                    <p className="font-semibold text-slate-700">Belum Ada Kategori Kesalahan Terhubung</p>
                    <p className="text-xs mt-1 text-slate-500">
                      {assignedFieldName
                        ? `Tidak ada kategori kesalahan untuk bidang "${assignedFieldName}". Hubungkan kategori kesalahan ke bidang ini di Master Data.`
                        : 'Belum ada kategori kesalahan yang dikonfigurasi pada database.'}
                    </p>
                  </div>
                ) : (
                  activeErrorCategories.map((cat) => {
                    const count = errorCounts[cat.id] || 0;
                    const exactDeduction =
                      currentAssessment?.deductions?.[cat.id] ??
                      liveScoreCalc?.deductions?.[cat.id] ??
                      count * cat.defaultDeduction;
                    const pts = exactDeduction.toFixed(2);

                    return (
                      <div
                        key={cat.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-3 hover:border-slate-300 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5">
                            <span className="text-sm font-bold text-slate-900 break-words leading-snug">
                              {cat.name}
                            </span>
                            <span className="text-xs font-mono font-medium text-slate-500 tabular-nums">
                              (-{cat.defaultDeduction.toFixed(2)}/err)
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 leading-normal line-clamp-1 mt-0.5" title={cat.scope}>
                            {cat.scope}
                          </p>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          {/* Fixed-width numeric box so changing 0 -> 10 never shifts buttons */}
                          <div className="text-right w-14 shrink-0">
                            <span className="font-mono font-extrabold text-base text-slate-900 block tabular-nums">
                              {count}
                            </span>
                            <span className="text-xs font-mono font-semibold text-rose-700 block tabular-nums">
                              -{pts}
                            </span>
                          </div>

                          {/* Plus / Minus Buttons >= 48x48px (w-12 h-12) */}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                updateErrorCount(
                                  currentParticipant.id,
                                  activeJudgeId,
                                  cat.id,
                                  -1,
                                  activeStageName,
                                  activeQuestionId || currentParticipant.questionId || undefined
                                )
                              }
                              disabled={count <= 0 || isFinalized || isEditLocked}
                              className="w-12 h-12 rounded-md bg-white border border-slate-300 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-800 flex items-center justify-center font-bold transition-colors shadow-sm cursor-pointer shrink-0"
                              title="Kurangi 1 Kesalahan"
                              aria-label={`Kurangi kesalahan ${cat.name}`}
                            >
                              <Minus className="w-5 h-5" />
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                updateErrorCount(
                                  currentParticipant.id,
                                  activeJudgeId,
                                  cat.id,
                                  1,
                                  activeStageName,
                                  activeQuestionId || currentParticipant.questionId || undefined
                                )
                              }
                              disabled={isFinalized || isEditLocked}
                              className="w-12 h-12 rounded-md bg-emerald-800 hover:bg-emerald-700 active:bg-emerald-900 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center font-bold transition-colors shadow-sm cursor-pointer shrink-0"
                              title="Tambah 1 Kesalahan"
                              aria-label={`Tambah kesalahan ${cat.name}`}
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Bottom Panel Actions */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2.5">
            {isAdminMode ? (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-md text-center">
                <ShieldCheck className="w-4 h-4 text-emerald-800 mx-auto mb-1" />
                <p className="text-xs font-bold text-slate-900">
                  Mode Pemantauan Admin (Hanya Baca)
                </p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  Dewan hakim: {activeJudgeName}
                </p>
              </div>
            ) : isFinalized ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-center">
                <CheckCircle className="w-4 h-4 text-emerald-700 mx-auto mb-1" />
                <p className="text-xs font-bold text-emerald-900">
                  Penilaian Berhasil Dikunci
                </p>
                <p className="text-xs text-emerald-700 mt-0.5 font-mono tabular-nums">
                  Difinalisasi pada: {currentAssessment?.finalizedAt || lastSyncTime}
                </p>
              </div>
            ) : judgeLockReason ? (
              <div
                role="status"
                data-testid="judge-lock-reason"
                className="p-3 bg-amber-50 border border-amber-200 rounded-md text-center"
              >
                <Lock className="w-4 h-4 text-amber-700 mx-auto mb-1" />
                <p className="text-xs font-bold text-amber-900">Lembar Hanya Dapat Dilihat</p>
                <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{judgeLockReason}</p>
              </div>
            ) : participantAssignedQuestions.length === 0 ? (
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-md text-center">
                <p className="text-xs font-bold text-slate-700">
                  Maqra Belum Ditetapkan
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tetapkan soal terlebih dahulu untuk memulai penilaian.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(true)}
                className="w-full h-12 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-sm rounded-md shadow-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Simpan Penilaian</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setCurrentView('rekap_nilai')}
              className="w-full h-10 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-md transition-colors cursor-pointer"
            >
              Lihat Rekap Nilai Babak Ini
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Finalizing Assessment */}
      {isConfirmModalOpen && (
        <div
          className="fixed inset-0 surface-glass-dark flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white text-slate-900 rounded-xl p-6 max-w-md w-full shadow-lg border border-slate-200">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Kunci Penilaian Hakim?
                </h3>
                <p className="text-xs text-slate-500">
                  Peserta #{currentParticipant.lotteryNumber} - {currentParticipant.name}
                </p>
              </div>
            </div>

            {finalizeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-md text-xs font-semibold mb-3">
                <p>{finalizeError}</p>
              </div>
            )}

            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 my-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Nilai Akhir:</span>
                <span className="font-mono tabular-nums font-bold text-slate-900">{currentScore.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Pengurangan:</span>
                <span className="font-mono tabular-nums text-rose-600">-{totalDeductions.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Goresan Anotasi Mushaf:</span>
                <span className="font-mono tabular-nums text-slate-800">{strokes.length} goresan</span>
              </div>
            </div>

            {isZeroErrorSheet && (
              <div className="bg-amber-50 border border-amber-300 rounded-md p-3.5 mb-4 text-xs text-amber-900 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Konfirmasi Nilai Sempurna ({startingScore.toFixed(2)})</p>
                    <p className="mt-0.5 text-xs leading-relaxed">
                      Lembar penilaian ini mencatat 0 pengurangan kesalahan. Silakan centang konfirmasi di bawah ini untuk memfinalisasi nilai sempurna.
                    </p>
                  </div>
                </div>
                <label className="flex items-start gap-2.5 pt-2 border-t border-amber-200/80 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isFlawlessConfirmed}
                    onChange={(e) => {
                      setIsFlawlessConfirmed(e.target.checked);
                      if (e.target.checked) setFinalizeError(null);
                    }}
                    data-testid="confirm-flawless-checkbox"
                    className="mt-0.5 w-4 h-4 rounded-sm border-amber-400 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="text-xs font-bold text-amber-950 leading-snug">
                    Saya mengonfirmasi bahwa peserta tampil sempurna tanpa kesalahan.
                  </span>
                </label>
              </div>
            )}

            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              Setelah dikunci, formulir penilaian dan coretan mushaf Anda untuk peserta ini akan menjadi{' '}
              <strong>read-only (tidak dapat diubah)</strong>.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (isFinalizing) return;
                  setIsConfirmModalOpen(false);
                }}
                disabled={isFinalizing}
                className="h-10 px-4 border border-slate-300 hover:bg-slate-50 disabled:opacity-50 rounded-md text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmFinalize}
                disabled={isFinalizing || (isZeroErrorSheet && !isFlawlessConfirmed)}
                data-testid="confirm-finalize-submit-btn"
                className="h-10 px-4 bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-300 disabled:text-slate-500 text-white rounded-md text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {isFinalizing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Mengunci...
                  </>
                ) : (
                  'Ya, Kunci Penilaian'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clearing Page */}
      {isClearPageModalOpen && (
        <div
          className="fixed inset-0 surface-glass-dark flex items-center justify-center p-4 z-50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white text-slate-900 rounded-xl p-6 max-w-sm w-full shadow-lg border border-slate-200">
            <h3 className="font-extrabold text-base text-slate-900 mb-2">
              Bersihkan Halaman {currentPage}?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Semua goresan anotasi pada halaman ini untuk peserta {currentParticipant.name} akan dihapus. Halaman mushaf lainnya tidak akan terpengaruh.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsClearPageModalOpen(false)}
                className="h-10 px-3.5 border border-slate-300 hover:bg-slate-50 rounded-md text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmClearPage}
                className="h-10 px-3.5 bg-rose-700 hover:bg-rose-800 text-white rounded-md text-xs font-bold cursor-pointer"
              >
                Hapus Anotasi Halaman
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
