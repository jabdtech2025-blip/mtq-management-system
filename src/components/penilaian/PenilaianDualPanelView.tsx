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
  RefreshCw
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { CanvasStroke, NormalizedPoint, AssignedMaqraItem } from '../../types/mtq';

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
    updateErrorCount,
    saveAnnotations,
    finalizeAssessment,
    getJudgeAssessment,
    syncStatus,
    lastSyncTime,
    toggleSidebar
  } = useMtq();

  // Find current participant (handle empty state gracefully)
  const currentParticipant =
    participants.find((p) => p.id === selectedParticipantId) || participants[0] || null;

  const activeStageName = currentParticipant?.stageName || 'Penyisihan';

  // Multi-Question support: list of questions assigned to this participant in active stage
  const participantAssignedQuestions = useMemo<AssignedMaqraItem[]>(() => {
    if (!currentParticipant) return [];
    if (currentParticipant.assignedQuestions && currentParticipant.assignedQuestions.length > 0) {
      const stageSpecific = currentParticipant.assignedQuestions.filter(
        (aq: AssignedMaqraItem) => !aq.stageName || aq.stageName === activeStageName
      );
      return stageSpecific.length > 0 ? stageSpecific : currentParticipant.assignedQuestions;
    }
    if (currentParticipant.questionId) {
      return [{
        questionId: currentParticipant.questionId,
        code: 'MQ-01',
        title: currentParticipant.assignedMaqra || 'Maqra Tilawah',
        pageNumber: currentParticipant.pageNumber || 305,
        stageName: activeStageName
      }];
    }
    return [];
  }, [currentParticipant, activeStageName]);

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

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(
    activeQuestionObj?.pageStart || activeQuestionObj?.pageNumber || currentParticipant?.pageNumber || 305
  );
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // High-Res Scanned Mushaf Madinah state
  const [imageLoaded, setImageLoaded] = useState<boolean>(false);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);

  const [activeTool, setActiveTool] = useState<'pen' | 'marker' | 'eraser'>('pen');
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

  // Mushaf page image URL builder (High-resolution scan from Mujamma' Malik Fahd)
  const pagePad = String(currentPage).padStart(3, '0');
  const imageSources = [
    `https://android.quran.com/data/width_1260/page${pagePad}.png`,
    `https://everyayah.com/data/quranpages_hafs_1260/page${pagePad}.png`,
    `https://raw.githubusercontent.com/the-quran/quran-images/master/images/page${pagePad}.png`
  ];
  const [imageSourceIndex, setImageSourceIndex] = useState<number>(0);
  const currentImageUrl = imageSources[imageSourceIndex] || imageSources[0];

  // Load participant's assessment and page when switching participants, questions, or judges
  useEffect(() => {
    if (currentParticipant) {
      setImageLoaded(false);
      setImageLoadError(false);
      setImageSourceIndex(0);
      setIsDrawing(false);
      setCurrentStroke([]);

      // Load strokes strictly for active question, judge, and stage
      const asm = getJudgeAssessment(
        currentParticipant.id,
        activeJudgeId,
        activeStageName,
        activeQuestionId
      );
      setStrokes(asm?.annotations || []);
    } else {
      setStrokes([]);
    }
  }, [currentParticipant?.id, activeJudgeId, activeStageName, activeQuestionId, assessments]);

  // Handler to switch question
  const handleSelectQuestion = (qId: string) => {
    setActiveQuestionId(qId);
    const q = participantAssignedQuestions.find((item: AssignedMaqraItem) => item.questionId === qId);
    if (q) {
      const targetPage = q.pageStart || q.pageNumber || 305;
      setCurrentPage(targetPage);
    }
  };

  // Reset image state on page change
  useEffect(() => {
    setImageLoaded(false);
    setImageLoadError(false);
    setImageSourceIndex(0);
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
    if (currentStroke.length > 1 && activeTool !== 'eraser') {
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
    if (!currentParticipant || isFinalized || isAdminMode) return;
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
    if (!currentParticipant || isFinalized || isAdminMode) return;
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
    if (!isDrawing || !currentParticipant || isFinalized || isAdminMode) return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (activeTool === 'eraser') {
      eraseStrokesNear(pt);
      return;
    }

    setCurrentStroke((prev) => [...prev, pt]);
  };

  const handlePointerUp = () => {
    if (!isDrawing || !currentParticipant || isFinalized || isAdminMode) {
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
    if (!currentParticipant || isFinalized || isAdminMode) return;
    const pageStrokes = strokes.filter((s) => s.page === currentPage);
    if (pageStrokes.length === 0) return;

    const lastStroke = pageStrokes[pageStrokes.length - 1];
    const updated = strokes.filter((s) => s.id !== lastStroke.id);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated, activeStageName, activeQuestionId);
  };

  // Clear current page strokes only
  const handleConfirmClearPage = () => {
    if (!currentParticipant || isFinalized || isAdminMode) return;
    const updated = strokes.filter((s) => s.page !== currentPage);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated, activeStageName, activeQuestionId);
    setIsClearPageModalOpen(false);
  };

  // Finalize action
  const handleConfirmFinalize = () => {
    if (!currentParticipant) return;
    finalizeAssessment(currentParticipant.id, activeJudgeId, activeStageName, activeQuestionId);
    setIsConfirmModalOpen(false);
  };

  // Error counting values from active assessment
  const errorCounts = currentAssessment?.errorCounts || {};
  const totalDeductions = currentAssessment?.totalDeductions || 0;
  const currentScore = currentAssessment ? currentAssessment.finalScore : 100.0;
  const pageAnnotationCount = strokes.filter((s) => s.page === currentPage).length;

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
    <div className="flex flex-col h-screen bg-white text-slate-800 select-none overflow-hidden">
      {/* Top Header - Standard clean layout matching the app */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setCurrentView(currentUser.role === 'judge' ? 'penilaian_hakim' : 'dashboard')}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="Kembali ke Dashboard / Daftar Penilaian"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors md:hidden cursor-pointer shrink-0"
            title="Buka Menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {isAdminMode ? 'Pemantauan Penilaian Hakim' : 'Lembar Penilaian Dewan Hakim'}
              </h1>
              {isAdminMode && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                  <ShieldCheck className="w-3 h-3 text-emerald-700" />
                  Mode Pantau
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 truncate hidden sm:block">
              {currentTenant.name} · {currentTenant.eventName}
            </p>
          </div>
        </div>

        {/* Right Status & Mobile Split Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">{syncStatus}</span>
            <span>({lastSyncTime})</span>
          </div>

          {/* Toggle Tab ONLY for mobile screens (<768px). Tablets and laptops show split-screen directly */}
          <div className="flex md:hidden bg-slate-100 border border-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => setTabletActiveTab('mushaf')}
              className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                tabletActiveTab === 'mushaf' ? 'bg-emerald-800 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mushaf
            </button>
            <button
              onClick={() => setTabletActiveTab('scoring')}
              className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                tabletActiveTab === 'scoring' ? 'bg-emerald-800 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Nilai
            </button>
          </div>
        </div>
      </header>

      {/* Main Dual-Panel Content */}
      <div className="flex-1 flex overflow-hidden bg-white">
        {/* Left Panel: Mushaf Viewer & Annotation Canvas */}
        <div
          className={`flex-1 flex flex-col bg-white border-r border-slate-200 relative min-w-0 ${
            tabletActiveTab === 'scoring' ? 'hidden md:flex' : 'flex'
          }`}
        >
          {/* Mushaf Canvas Toolbar (Header Kedua) - Compact, Efficient, Icons Only */}
          <div className="h-11 bg-slate-50 border-b border-slate-200 px-3 flex items-center justify-between gap-2 shrink-0 z-20 overflow-x-auto">
            {/* Left Tools Group: Page Navigation & Zoom */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Group 1: Page Navigation */}
              <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                  title="Halaman Sebelumnya"
                  aria-label="Halaman Sebelumnya"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-semibold text-slate-700 tabular-nums px-1.5 select-none whitespace-nowrap">
                  Hal. <strong className="text-slate-900 font-bold">{currentPage}</strong> / 604
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(604, p + 1))}
                  disabled={currentPage >= 604}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                  title="Halaman Berikutnya"
                  aria-label="Halaman Berikutnya"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Group 2: Zoom Controls (Small buttons only, NO percentage number) */}
              <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  onClick={() => setZoomLevel((z) => Math.max(70, z - 15))}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  title="Perkecil Tampilan"
                  aria-label="Perkecil Tampilan"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
                  className="p-1 rounded hover:bg-slate-100 text-slate-600 transition-colors cursor-pointer"
                  title="Perbesar Tampilan"
                  aria-label="Perbesar Tampilan"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Right Tools Group: Drawing Tools, Colors, and Canvas Actions */}
            <div className="flex items-center gap-2 shrink-0">
              {isAdminMode ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2.5 py-1 rounded-lg shadow-2xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="truncate max-w-[200px]">Mode Pantau Admin ({activeJudgeName.split(',')[0]})</span>
                </div>
              ) : isFinalized ? (
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg shadow-2xs">
                  <Lock className="w-3.5 h-3.5 text-amber-600" />
                  <span>Terkunci (Final)</span>
                </div>
              ) : (
                <>
                  {/* Group 3: Tool selection - Icons only, no text labels */}
                  <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 gap-0.5 shadow-2xs">
                    <button
                      onClick={() => setActiveTool('pen')}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${
                        activeTool === 'pen'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Pena Koreksi Anotasi"
                      aria-label="Pena Koreksi Anotasi"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setActiveTool('marker')}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${
                        activeTool === 'marker'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Stabilo Transparan"
                      aria-label="Stabilo Transparan"
                    >
                      <Highlighter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setActiveTool('eraser')}
                      className={`p-1.5 rounded-md transition-all cursor-pointer ${
                        activeTool === 'eraser'
                          ? 'bg-emerald-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      title="Penghapus Anotasi"
                      aria-label="Penghapus Anotasi"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Group 4: Smaller Color Dots */}
                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs">
                    {[
                      { color: '#dc2626', label: 'Merah (Tajwid Jali / Kesalahan Berat)' },
                      { color: '#f59e0b', label: 'Kuning (Tajwid Khafi / Kesalahan Sedang)' },
                      { color: '#2563eb', label: 'Biru (Waqf & Ibtida / Nada)' },
                      { color: '#16a34a', label: 'Hijau (Catatan Dewan Hakim)' }
                    ].map((c) => (
                      <button
                        key={c.color}
                        onClick={() => {
                          setActiveColor(c.color);
                          if (activeTool === 'eraser') setActiveTool('pen');
                        }}
                        style={{ backgroundColor: c.color }}
                        className={`w-4 h-4 rounded-full transition-all cursor-pointer ${
                          activeColor === c.color && activeTool !== 'eraser'
                            ? 'ring-2 ring-emerald-700 ring-offset-1 scale-110 shadow-2xs'
                            : 'opacity-75 hover:opacity-100 hover:scale-105'
                        }`}
                        title={c.label}
                        aria-label={c.label}
                      />
                    ))}
                  </div>

                  {/* Group 5: History & Page Reset Actions */}
                  <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                    <button
                      onClick={handleUndo}
                      disabled={strokes.filter((s) => s.page === currentPage).length === 0}
                      className="p-1 rounded-md hover:bg-slate-100 text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                      title="Undo Goresan Terakhir (Ctrl+Z)"
                      aria-label="Undo Goresan Terakhir"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setIsClearPageModalOpen(true)}
                      disabled={strokes.filter((s) => s.page === currentPage).length === 0}
                      className="p-1 rounded-md hover:bg-rose-50 text-rose-600 hover:text-rose-700 disabled:opacity-30 disabled:hover:bg-transparent transition-colors cursor-pointer"
                      title="Bersihkan Semua Anotasi Halaman Ini"
                      aria-label="Bersihkan Semua Anotasi Halaman Ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Mushaf Page Container (Pure White, Zero Lateral/Top Margins - Directly touches borders) */}
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
              {/* 1. Loading State */}
              {!imageLoaded && !imageLoadError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/95 z-20 min-h-[420px]">
                  <RefreshCw className="w-8 h-8 text-emerald-800 animate-spin mb-2" />
                  <p className="text-xs font-semibold text-slate-700">
                    Memuat Halaman Mushaf {currentPage}...
                  </p>
                </div>
              )}

              {/* 2. Error & Retry State */}
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
                    onClick={() => {
                      setImageLoadError(false);
                      setImageLoaded(false);
                      setImageSourceIndex(0);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-lg shadow-2xs cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Coba Lagi</span>
                  </button>
                </div>
              )}

              {/* 3. Authentic High-Res Mushaf Scan */}
              <img
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

              {/* 4. Transparent Canvas Overlay for Annotations */}
              <canvas
                ref={canvasRef}
                width={1260}
                height={1780}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                style={{ touchAction: 'none' }}
                className={`absolute inset-0 w-full h-full ${
                  isAdminMode || isFinalized
                    ? 'cursor-default pointer-events-none'
                    : 'cursor-crosshair'
                }`}
              />
            </div>
          </div>

          {/* Bottom Bar Info */}
          <div className="h-7 bg-slate-50 border-t border-slate-200 px-3 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
            <span className="truncate">
              Standar Mushaf Madinah 15 Baris · {activeQuestionObj?.title || currentParticipant.assignedMaqra}
            </span>
            <span className="shrink-0">{pageAnnotationCount} goresan anotasi</span>
          </div>
        </div>

        {/* Right Panel: Scoring & Deduction Controls (Split-screen on tablet & desktop from md: breakpoint) */}
        <div
          className={`w-full md:w-[380px] lg:w-[420px] xl:w-[450px] 2xl:w-[480px] shrink-0 bg-white text-slate-800 border-l border-slate-200 flex flex-col justify-between overflow-y-auto ${
            tabletActiveTab === 'mushaf' ? 'hidden md:flex' : 'flex'
          }`}
        >
          <div className="p-3.5 sm:p-4 space-y-3.5 sm:space-y-4">
            {/* Multi-Question Selector Toolbar (when participant has >1 assigned maqra in this stage) */}
            {participantAssignedQuestions.length > 1 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Pilih Soal yang Sedang Dinilai:
                </span>
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200">
                  {participantAssignedQuestions.map((q: AssignedMaqraItem, idx: number) => {
                    const isActive = q.questionId === activeQuestionId;
                    const qLabel = q.code || `Soal ${idx + 1}`;
                    return (
                      <button
                        key={q.questionId}
                        type="button"
                        onClick={() => handleSelectQuestion(q.questionId)}
                        className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all text-center cursor-pointer truncate ${
                          isActive
                            ? 'bg-emerald-800 text-white shadow-xs'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                        }`}
                        title={`${qLabel}: ${q.title}`}
                      >
                        <span>{qLabel}</span>
                        {q.surahName && (
                          <span
                            className={`block text-[10px] font-normal truncate ${
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

            {/* Participant Quick Info (Green styling) */}
            <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white rounded-xl shadow-xs border border-emerald-700/30 p-3.5 sm:p-4">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-emerald-200 uppercase tracking-wider text-[10px]">
                  Peserta Sedang Dinilai
                </span>
                <span className="font-mono font-bold text-emerald-900 bg-white/90 px-2 py-0.5 rounded border border-white/40 tabular-nums text-xs">
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

            {/* Live Score Display (Gray styling, without judge name and lock status) */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-xl p-3.5 sm:p-4 shadow-2xs">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Nilai Akhir Hakim
              </p>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums text-slate-900">
                  {currentScore.toFixed(2)}
                </span>
                <span className="text-xs sm:text-sm text-slate-500 font-medium">/ 100</span>
              </div>
              <p className="text-[11px] text-slate-500 font-mono mt-0.5 tabular-nums">
                Total Pengurangan: -{totalDeductions.toFixed(2)} poin
              </p>
            </div>

            {/* Error Categories Counters */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Rubrik Pengurangan Kesalahan
                </h3>
                <span className="text-[10px] text-slate-500 font-medium">
                  {isAdminMode
                    ? 'Mode Pantau'
                    : isFinalized
                    ? 'Terkunci'
                    : 'Klik + / - untuk koreksi'}
                </span>
              </div>

              <div className="space-y-2.5">
                {errorCategories.map((cat) => {
                  const count = errorCounts[cat.id] || 0;
                  const pts = (count * cat.defaultDeduction).toFixed(2);

                  return (
                    <div
                      key={cat.id}
                      className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl flex items-center justify-between gap-2.5 hover:border-slate-300 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5">
                          <span className="text-xs font-bold text-slate-900 break-words leading-tight">
                            {cat.name}
                          </span>
                          <span className="text-[10px] font-mono font-medium text-slate-500 tabular-nums">
                            (-{cat.defaultDeduction.toFixed(2)}/err)
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 leading-normal line-clamp-1 mt-0.5" title={cat.scope}>
                          {cat.scope}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right w-11">
                          <span className="font-mono font-bold text-sm text-slate-900 block tabular-nums">
                            {count}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-rose-600 block tabular-nums">
                            -{pts}
                          </span>
                        </div>

                        {/* Plus / Minus Buttons (Disabled if admin mode or finalized) */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              updateErrorCount(
                                currentParticipant.id,
                                activeJudgeId,
                                cat.id,
                                -1,
                                activeStageName,
                                activeQuestionId
                              )
                            }
                            disabled={count <= 0 || isFinalized || isAdminMode}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 active:bg-slate-200 disabled:opacity-30 disabled:pointer-events-none text-slate-700 flex items-center justify-center font-bold text-xs transition-all shadow-2xs cursor-pointer"
                            title="Kurangi 1 Kesalahan"
                            aria-label={`Kurangi kesalahan ${cat.name}`}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() =>
                              updateErrorCount(
                                currentParticipant.id,
                                activeJudgeId,
                                cat.id,
                                1,
                                activeStageName,
                                activeQuestionId
                              )
                            }
                            disabled={isFinalized || isAdminMode}
                            className="w-7 h-7 rounded-lg bg-emerald-800 hover:bg-emerald-700 active:bg-emerald-900 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center font-bold text-xs transition-all shadow-2xs cursor-pointer"
                            title="Tambah 1 Kesalahan"
                            aria-label={`Tambah kesalahan ${cat.name}`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Panel Actions */}
          <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-slate-50 space-y-2">
            {isAdminMode ? (
              <div className="p-2.5 bg-slate-100 border border-slate-200 rounded-xl text-center">
                <ShieldCheck className="w-4 h-4 text-emerald-800 mx-auto mb-1" />
                <p className="text-xs font-bold text-slate-900">
                  Mode Pemantauan Admin (Hanya Baca)
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                  Dewan hakim: {activeJudgeName}
                </p>
              </div>
            ) : isFinalized ? (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <CheckCircle className="w-4 h-4 text-emerald-700 mx-auto mb-1" />
                <p className="text-xs font-bold text-emerald-900">
                  Penilaian Berhasil Dikunci
                </p>
                <p className="text-[10px] text-emerald-700 mt-0.5">
                  Difinalisasi pada: {currentAssessment?.finalizedAt || lastSyncTime}
                </p>
              </div>
            ) : (
              <button
                onClick={() => setIsConfirmModalOpen(true)}
                className="w-full py-2 bg-emerald-800 hover:bg-emerald-900 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Simpan Penilaian</span>
              </button>
            )}

            <button
              onClick={() => setCurrentView('rekap_nilai')}
              className="w-full py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Lihat Rekap Nilai Babak Ini
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Finalizing Assessment */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
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

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 my-4 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Nilai Akhir:</span>
                <span className="font-mono font-bold text-slate-900">{currentScore.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Pengurangan:</span>
                <span className="font-mono text-rose-600">-{totalDeductions.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Goresan Anotasi Mushaf:</span>
                <span className="font-mono text-slate-800">{strokes.length} goresan</span>
              </div>
            </div>

            {totalDeductions === 0 && strokes.length === 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 mb-4 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Konfirmasi Nilai Sempurna (100.00)</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed">
                    Belum ada pengurangan kesalahan atau anotasi mushaf yang dicatat. Apakah Anda yakin peserta tampil sempurna tanpa kesalahan sebelum mengunci nilai?
                  </p>
                </div>
              </div>
            )}

            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              Setelah dikunci, formulir penilaian dan coretan mushaf Anda untuk peserta ini akan menjadi{' '}
              <strong>read-only (tidak dapat diubah)</strong>.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmFinalize}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
              >
                Ya, Kunci Penilaian
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Clearing Page */}
      {isClearPageModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white text-slate-900 rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200">
            <h3 className="font-extrabold text-base text-slate-900 mb-2">
              Bersihkan Halaman {currentPage}?
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Semua goresan anotasi pada halaman ini untuk peserta {currentParticipant.name} akan dihapus. Halaman mushaf lainnya tidak akan terpengaruh.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setIsClearPageModalOpen(false)}
                className="px-3.5 py-1.5 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmClearPage}
                className="px-3.5 py-1.5 bg-rose-700 hover:bg-rose-800 text-white rounded-lg text-xs font-bold"
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
