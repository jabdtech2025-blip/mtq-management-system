import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  Check
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { CanvasStroke, NormalizedPoint } from '../../types/mtq';

export const PenilaianDualPanelView: React.FC = () => {
  const {
    participants,
    selectedParticipantId,
    setSelectedParticipantId,
    setCurrentView,
    currentUser,
    errorCategories,
    assessments,
    updateErrorCount,
    saveAnnotations,
    finalizeAssessment,
    syncStatus,
    lastSyncTime,
    toggleSidebar
  } = useMtq();

  // Find current participant (handle empty state gracefully)
  const currentParticipant =
    participants.find((p) => p.id === selectedParticipantId) || participants[0] || null;

  // Active judge ID & Name
  const activeJudgeId = currentUser.role === 'judge' ? currentUser.id : 'judge-1';
  const activeJudgeName =
    currentUser.role === 'judge' ? currentUser.name : 'KH. Ahmad Dahlan, M.Ag';

  // Find active assessment for this participant & judge
  const currentAssessment = currentParticipant
    ? assessments.find(
        (a) => a.participantId === currentParticipant.id && a.judgeId === activeJudgeId
      )
    : undefined;

  const isFinalized = currentAssessment?.status === 'finalized';

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(
    currentParticipant?.pageNumber || 305
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
  const [isParticipantDropdownOpen, setIsParticipantDropdownOpen] = useState(false);

  // Mushaf page image URL builder (High-resolution scan from Mujamma' Malik Fahd)
  const pagePad = String(currentPage).padStart(3, '0');
  const imageSources = [
    `https://android.quran.com/data/width_1260/page${pagePad}.png`,
    `https://everyayah.com/data/quranpages_hafs_1260/page${pagePad}.png`,
    `https://raw.githubusercontent.com/the-quran/quran-images/master/images/page${pagePad}.png`
  ];
  const [imageSourceIndex, setImageSourceIndex] = useState<number>(0);
  const currentImageUrl = imageSources[imageSourceIndex] || imageSources[0];

  // Load participant's assessment and page when switching participants
  useEffect(() => {
    if (currentParticipant) {
      setCurrentPage(currentParticipant.pageNumber);
      setImageLoaded(false);
      setImageLoadError(false);
      setImageSourceIndex(0);
      setIsDrawing(false);
      setCurrentStroke([]);

      // Load participant's strokes for active judge
      const asm = assessments.find(
        (a) => a.participantId === currentParticipant.id && a.judgeId === activeJudgeId
      );
      setStrokes(asm?.annotations || []);
    } else {
      setStrokes([]);
    }
  }, [currentParticipant?.id, activeJudgeId]);

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
    if (!currentParticipant || isFinalized) return;
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
      saveAnnotations(currentParticipant.id, activeJudgeId, remainingStrokes);
    }
  };

  // Pointer event handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentParticipant || isFinalized) return;
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
    if (!isDrawing || !currentParticipant || isFinalized) return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;

    if (activeTool === 'eraser') {
      eraseStrokesNear(pt);
      return;
    }

    setCurrentStroke((prev) => [...prev, pt]);
  };

  const handlePointerUp = () => {
    if (!isDrawing || !currentParticipant || isFinalized) {
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
      saveAnnotations(currentParticipant.id, activeJudgeId, updated);
    }
    setCurrentStroke([]);
  };

  // Undo stroke on current page
  const handleUndo = () => {
    if (!currentParticipant || isFinalized) return;
    const pageStrokes = strokes.filter((s) => s.page === currentPage);
    if (pageStrokes.length === 0) return;

    const lastStroke = pageStrokes[pageStrokes.length - 1];
    const updated = strokes.filter((s) => s.id !== lastStroke.id);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated);
  };

  // Clear current page strokes only
  const handleConfirmClearPage = () => {
    if (!currentParticipant || isFinalized) return;
    const updated = strokes.filter((s) => s.page !== currentPage);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated);
    setIsClearPageModalOpen(false);
  };

  // Finalize action
  const handleConfirmFinalize = () => {
    if (!currentParticipant) return;
    finalizeAssessment(currentParticipant.id, activeJudgeId);
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
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 select-none overflow-hidden">
      {/* Top Bar matching design constitution */}
      <header className="h-14 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentView('dashboard')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Kembali ke Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <button
            onClick={toggleSidebar}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors xl:hidden"
            title="Buka Menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          {/* Participant Selector */}
          <div className="relative">
            <button
              onClick={() => setIsParticipantDropdownOpen(!isParticipantDropdownOpen)}
              className="flex items-center gap-2.5 bg-slate-900 border border-slate-700/80 hover:border-slate-600 px-3 py-1.5 rounded-lg text-xs transition-all text-left"
            >
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 font-mono leading-none">
                  UNDIAN #{currentParticipant.lotteryNumber} · {currentParticipant.participantId}
                </span>
                <span className="font-bold text-white leading-tight mt-0.5 truncate max-w-[180px] sm:max-w-[240px]">
                  {currentParticipant.name}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {isParticipantDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 max-h-80 overflow-y-auto">
                <p className="text-[10px] font-semibold text-slate-400 px-2 py-1 uppercase tracking-wider">
                  Daftar Peserta
                </p>
                <div className="space-y-1 mt-1">
                  {participants.map((p) => {
                    const isSelected = p.id === currentParticipant.id;
                    const pAsm = assessments.find(
                      (a) => a.participantId === p.id && a.judgeId === activeJudgeId
                    );
                    const isPartFinal = pAsm?.status === 'finalized';

                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelectedParticipantId(p.id);
                          setIsParticipantDropdownOpen(false);
                        }}
                        className={`w-full text-left px-2.5 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                          isSelected
                            ? 'bg-emerald-900/60 text-emerald-200 border border-emerald-700/50'
                            : 'hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold truncate">
                            #{p.lotteryNumber} - {p.name}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {p.kafilahName} · Hal. {p.pageNumber}
                          </p>
                        </div>
                        {isPartFinal && (
                          <span className="shrink-0 text-[10px] font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">
                            Final
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-slate-800 text-xs">
            <span className="text-slate-400">Grup:</span>
            <span className="font-semibold text-slate-200">{currentParticipant.kafilahName}</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-400">{currentParticipant.branchName}</span>
          </div>
        </div>

        {/* Right Status & Save/Finalize */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          <div className="hidden sm:flex items-center gap-2 text-right">
            <div>
              <p className="text-[11px] font-semibold text-slate-200">{activeJudgeName}</p>
              <div className="flex items-center justify-end gap-1.5 text-[10px] text-slate-400">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>{syncStatus} ({lastSyncTime})</span>
              </div>
            </div>
          </div>

          {isFinalized ? (
            <div className="inline-flex items-center gap-1.5 bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-bold px-3 py-1.5 rounded-lg">
              <Lock className="w-3.5 h-3.5" />
              <span>Nilai Dikunci</span>
            </div>
          ) : (
            <button
              onClick={() => setIsConfirmModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Kunci Nilai</span>
            </button>
          )}

          {/* Toggle Tab for narrow tablets */}
          <div className="flex xl:hidden bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setTabletActiveTab('mushaf')}
              className={`px-2.5 py-1 rounded text-xs font-semibold ${
                tabletActiveTab === 'mushaf' ? 'bg-emerald-700 text-white' : 'text-slate-400'
              }`}
            >
              Mushaf
            </button>
            <button
              onClick={() => setTabletActiveTab('scoring')}
              className={`px-2.5 py-1 rounded text-xs font-semibold ${
                tabletActiveTab === 'scoring' ? 'bg-emerald-700 text-white' : 'text-slate-400'
              }`}
            >
              Nilai
            </button>
          </div>
        </div>
      </header>

      {/* Main Dual-Panel Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Mushaf Viewer & Annotation Canvas */}
        <div
          className={`flex-1 flex flex-col bg-slate-900 relative ${
            tabletActiveTab === 'scoring' ? 'hidden xl:flex' : 'flex'
          }`}
        >
          {/* Mushaf Canvas Toolbar */}
          <div className="h-12 bg-slate-950 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-20">
            {/* Page Navigation */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition-colors"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-200 tabular-nums">
                Halaman {currentPage} / 604
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(604, p + 1))}
                disabled={currentPage >= 604}
                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-40 transition-colors"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <span className="text-slate-700 mx-1">|</span>

              {/* Zoom Controls */}
              <button
                onClick={() => setZoomLevel((z) => Math.max(70, z - 15))}
                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-[11px] font-mono text-slate-400 w-10 text-center">
                {zoomLevel}%
              </span>
              <button
                onClick={() => setZoomLevel((z) => Math.min(180, z + 15))}
                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 transition-colors"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoomLevel(100)}
                className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[10px] font-bold"
                title="Reset Zoom"
              >
                100%
              </button>
            </div>

            {/* Drawing Tools (Disabled if finalized) */}
            <div className="flex items-center gap-1 sm:gap-2">
              {isFinalized ? (
                <div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/70 border border-amber-900/60 px-3 py-1 rounded-lg">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Mode Baca Saja (Terkunci)</span>
                </div>
              ) : (
                <>
                  {/* Tool selection */}
                  <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
                    <button
                      onClick={() => setActiveTool('pen')}
                      className={`p-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                        activeTool === 'pen'
                          ? 'bg-emerald-700 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Pena Koreksi"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Pena</span>
                    </button>
                    <button
                      onClick={() => setActiveTool('marker')}
                      className={`p-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                        activeTool === 'marker'
                          ? 'bg-emerald-700 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Stabilo Transparan"
                    >
                      <Highlighter className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Stabilo</span>
                    </button>
                    <button
                      onClick={() => setActiveTool('eraser')}
                      className={`p-1.5 rounded text-xs flex items-center gap-1 transition-colors ${
                        activeTool === 'eraser'
                          ? 'bg-emerald-700 text-white font-bold'
                          : 'text-slate-400 hover:text-white'
                      }`}
                      title="Penghapus Coretan (Hapus goresan tanpa merusak teks mushaf)"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      <span className="hidden md:inline">Hapus Goresan</span>
                    </button>
                  </div>

                  {/* Color presets */}
                  <div className="hidden sm:flex items-center gap-1 pl-2">
                    {[
                      { color: '#dc2626', label: 'Merah (Tajwid Jali)' },
                      { color: '#f59e0b', label: 'Kuning (Khafi)' },
                      { color: '#2563eb', label: 'Biru (Waqf/Lagu)' },
                      { color: '#16a34a', label: 'Hijau (Catatan)' }
                    ].map((c) => (
                      <button
                        key={c.color}
                        onClick={() => {
                          setActiveColor(c.color);
                          if (activeTool === 'eraser') setActiveTool('pen');
                        }}
                        style={{ backgroundColor: c.color }}
                        className={`w-5 h-5 rounded-full transition-transform ${
                          activeColor === c.color && activeTool !== 'eraser'
                            ? 'ring-2 ring-white scale-110'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                        title={c.label}
                      />
                    ))}
                  </div>

                  <span className="text-slate-700 mx-1">|</span>

                  {/* Undo & Clear */}
                  <button
                    onClick={handleUndo}
                    disabled={strokes.filter((s) => s.page === currentPage).length === 0}
                    className="p-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 disabled:opacity-30 transition-colors"
                    title="Undo Goresan Terakhir"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setIsClearPageModalOpen(true)}
                    disabled={strokes.filter((s) => s.page === currentPage).length === 0}
                    className="p-1.5 rounded bg-slate-900 hover:bg-rose-950 text-rose-300 hover:text-rose-200 disabled:opacity-30 transition-colors"
                    title="Bersihkan Semua Anotasi Halaman Ini"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Mushaf Page Container (Pure White Background, 15-line scan, vertical scroll) */}
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 flex justify-center items-start bg-slate-800"
          >
            <div
              style={{
                width: `${Math.round(620 * (zoomLevel / 100))}px`,
                maxWidth: '100%',
                backgroundColor: '#ffffff'
              }}
              className="relative shadow-2xl rounded-sm border border-slate-300 select-none transition-all"
            >
              {/* Authentic High-Res Mushaf Scan */}
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
                  }
                }}
              />

              {/* Transparent Canvas Overlay for Annotations */}
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
                  isFinalized
                    ? 'cursor-default pointer-events-none'
                    : activeTool === 'eraser'
                    ? 'cursor-crosshair'
                    : 'cursor-crosshair'
                }`}
              />
            </div>
          </div>

          {/* Bottom Bar Info */}
          <div className="h-8 bg-slate-950 border-t border-slate-800 px-4 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              Standar Mushaf Madinah 15 Baris (Mujamma' Malik Fahd) · {currentParticipant.assignedMaqra}
            </span>
            <span>{pageAnnotationCount} goresan anotasi di halaman ini</span>
          </div>
        </div>

        {/* Right Panel: Scoring & Deduction Controls */}
        <div
          className={`w-full xl:w-96 bg-white text-slate-900 border-l border-slate-200 flex flex-col justify-between overflow-y-auto ${
            tabletActiveTab === 'mushaf' ? 'hidden xl:flex' : 'flex'
          }`}
        >
          <div className="p-5 space-y-5">
            {/* Participant Quick Info */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wide">
                  Peserta Sedang Dinilai
                </span>
                <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {currentParticipant.participantId}
                </span>
              </div>
              <p className="font-extrabold text-sm text-slate-900 mt-1">
                {currentParticipant.name}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {currentParticipant.kafilahName} · Undian #{currentParticipant.lotteryNumber}
              </p>
              <p className="text-[11px] text-emerald-700 font-medium mt-1">
                {currentParticipant.assignedMaqra}
              </p>
            </div>

            {/* Live Score Display */}
            <div className="bg-gradient-to-br from-emerald-800 to-emerald-950 text-white p-5 rounded-2xl shadow-md flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-emerald-200 uppercase tracking-wider">
                  Nilai Akhir Hakim
                </p>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-4xl font-extrabold font-mono tracking-tight tabular-nums">
                    {currentScore.toFixed(2)}
                  </span>
                  <span className="text-xs text-emerald-300">/ 100</span>
                </div>
                <p className="text-[11px] text-emerald-300/80 mt-1">
                  Total Pengurangan: -{totalDeductions.toFixed(2)} poin
                </p>
              </div>

              <div className="text-right">
                <span className="inline-block text-[11px] font-bold px-2.5 py-1 rounded-md bg-white/10 border border-white/20">
                  {activeJudgeName.split(',')[0]}
                </span>
                <p className="text-[10px] text-emerald-200/70 mt-1">
                  {isFinalized ? 'Terkunci (Final)' : 'Sedang Berlangsung'}
                </p>
              </div>
            </div>

            {/* Error Categories Counters */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Rubrik Pengurangan Kesalahan
                </h3>
                <span className="text-[10px] text-slate-400 font-medium">
                  {isFinalized ? 'Read-only' : 'Klik + / -'}
                </span>
              </div>

              <div className="space-y-2.5">
                {errorCategories.map((cat) => {
                  const count = errorCounts[cat.id] || 0;
                  const pts = (count * cat.defaultDeduction).toFixed(2);

                  return (
                    <div
                      key={cat.id}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between hover:border-slate-300 transition-colors"
                    >
                      <div className="pr-2 min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-800 truncate">
                            {cat.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            (-{cat.defaultDeduction.toFixed(2)}/err)
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate mt-0.5" title={cat.scope}>
                          {cat.scope}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <span className="font-mono font-bold text-sm text-slate-900 block tabular-nums">
                            {count}
                          </span>
                          <span className="text-[10px] font-mono text-rose-600 block">
                            -{pts}
                          </span>
                        </div>

                        {/* Plus / Minus Buttons (Strictly disabled if finalized) */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() =>
                              updateErrorCount(currentParticipant.id, activeJudgeId, cat.id, -1)
                            }
                            disabled={count <= 0 || isFinalized}
                            className="w-7 h-7 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-white text-slate-700 flex items-center justify-center font-bold text-xs transition-colors"
                            title="Kurangi 1 Kesalahan"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() =>
                              updateErrorCount(currentParticipant.id, activeJudgeId, cat.id, 1)
                            }
                            disabled={isFinalized}
                            className="w-7 h-7 rounded-lg bg-emerald-800 hover:bg-emerald-700 disabled:opacity-30 disabled:hover:bg-emerald-800 text-white flex items-center justify-center font-bold text-xs transition-colors"
                            title="Tambah 1 Kesalahan"
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
          <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-2">
            {isFinalized ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                <CheckCircle className="w-5 h-5 text-emerald-700 mx-auto mb-1" />
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
                className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 active:scale-[0.98] text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>Kunci Penilaian Peserta Ini</span>
              </button>
            )}

            <button
              onClick={() => setCurrentView('rekap_nilai')}
              className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-all"
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
