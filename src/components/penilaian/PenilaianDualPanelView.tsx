import React, { useState, useRef, useEffect } from 'react';
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
  Menu
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { CanvasStroke } from '../../types/mtq';

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

  // Find current participant
  const currentParticipant =
    participants.find((p) => p.id === selectedParticipantId) || participants[0];

  // Active judge ID
  const activeJudgeId = currentUser.role === 'judge' ? currentUser.id : 'judge-1';
  const activeJudgeName =
    currentUser.role === 'judge' ? currentUser.name : 'KH. Ahmad Dahlan, M.Ag';

  // Find active assessment
  const currentAssessment = assessments.find(
    (a) =>
      a.participantId === currentParticipant?.id &&
      a.judgeId === activeJudgeId
  );

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
  const [strokes, setStrokes] = useState<CanvasStroke[]>(
    currentAssessment?.annotations || []
  );
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<{ x: number; y: number }[]>([]);

  // Tabloid portrait view mode ('mushaf' vs 'scoring') for narrow/portrait tablets
  const [tabletActiveTab, setTabletActiveTab] = useState<'mushaf' | 'scoring'>('mushaf');

  // Modal confirmation state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
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

  // Sync participant's page on participant change
  useEffect(() => {
    if (currentParticipant) {
      setCurrentPage(currentParticipant.pageNumber);
      setImageLoaded(false);
      setImageLoadError(false);
      setImageSourceIndex(0);
      if (currentAssessment) {
        setStrokes(currentAssessment.annotations || []);
      }
    }
  }, [currentParticipant?.id, currentAssessment]);

  // Update image state on page change
  useEffect(() => {
    setImageLoaded(false);
    setImageLoadError(false);
    setImageSourceIndex(0);
  }, [currentPage]);

  // Redraw canvas whenever strokes or page change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    strokes
      .filter((s) => s.page === currentPage)
      .forEach((stroke) => {
        if (stroke.points.length < 2) return;
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length; i++) {
          ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
        }
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size;
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
  }, [strokes, currentPage]);

  // Canvas drawing handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isFinalized) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // Scale calculation to map client coordinates to internal 590x840 canvas
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setIsDrawing(true);
    setCurrentStroke([{ x, y }]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || isFinalized) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const newPoints = [...currentStroke, { x, y }];
    setCurrentStroke(newPoints);

    // Live preview
    const ctx = canvas.getContext('2d');
    if (!ctx || currentStroke.length === 0) return;
    const lastPoint = currentStroke[currentStroke.length - 1];

    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = activeTool === 'eraser' ? '#ffffff' : activeColor;
    ctx.lineWidth = activeTool === 'eraser' ? 20 : strokeSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = activeTool === 'marker' ? 0.45 : 0.95;
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  };

  const handlePointerUp = () => {
    if (!isDrawing || isFinalized) return;
    setIsDrawing(false);
    if (currentStroke.length > 1) {
      const newStroke: CanvasStroke = {
        id: 'stroke-' + Date.now(),
        page: currentPage,
        tool: activeTool === 'eraser' ? 'eraser' : activeTool === 'marker' ? 'marker' : 'pen',
        color: activeTool === 'eraser' ? '#ffffff' : activeColor,
        size: activeTool === 'eraser' ? 20 : strokeSize,
        points: currentStroke
      };
      const updated = [...strokes, newStroke];
      setStrokes(updated);
      saveAnnotations(currentParticipant.id, activeJudgeId, updated);
    }
    setCurrentStroke([]);
  };

  const handleUndo = () => {
    if (isFinalized) return;
    const pageStrokes = strokes.filter((s) => s.page === currentPage);
    if (pageStrokes.length === 0) return;
    const lastPageStrokeId = pageStrokes[pageStrokes.length - 1].id;
    const updated = strokes.filter((s) => s.id !== lastPageStrokeId);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated);
  };

  const handleClearPage = () => {
    if (isFinalized) return;
    const updated = strokes.filter((s) => s.page !== currentPage);
    setStrokes(updated);
    saveAnnotations(currentParticipant.id, activeJudgeId, updated);
  };

  const handleResetZoom = () => {
    setZoomLevel(100);
  };

  // Error counting values
  const errorCounts = currentAssessment?.errorCounts || {};
  const totalErrors = Object.values(errorCounts).reduce((a, b) => a + b, 0);
  const totalDeductions = currentAssessment?.totalDeductions || 0;
  const currentScore = currentAssessment ? currentAssessment.finalScore : 100.0;

  // Finalize action
  const handleConfirmFinalize = () => {
    finalizeAssessment(currentParticipant.id, activeJudgeId);
    setIsConfirmModalOpen(false);
  };

  const activeAnnotationsCount = strokes.filter((s) => s.page === currentPage).length;

  return (
    <div className="flex flex-col h-screen bg-slate-100 overflow-hidden select-none font-sans">
      {/* 
        HEADER BERSIH & TIDAK RAMAI
        Dedicated uncluttered judge top bar
      */}
      <header className="h-14 bg-white border-b border-slate-200 px-3 sm:px-5 flex items-center justify-between shrink-0 z-30">
        {/* Left Zone: MTQ Logo + Back Button + Participant Info */}
        <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
          {/* Tombol Hamburger untuk Buka Sidebar di Tablet/Layar */}
          <button
            onClick={toggleSidebar}
            aria-label="Buka Menu Sidebar"
            className="p-2 rounded-lg text-slate-700 hover:text-emerald-800 hover:bg-emerald-50 active:scale-95 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-600 shrink-0"
            title="Buka Menu Sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Back Button */}
          <button
            onClick={() => setCurrentView('penilaian_hakim')}
            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors shrink-0 cursor-pointer"
            title="Kembali ke Daftar Penugasan"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="h-5 w-px bg-slate-200 hidden sm:block shrink-0" />

          {/* Clean Participant Selector Dropdown */}
          <div className="relative min-w-0">
            <button
              onClick={() => setIsParticipantDropdownOpen(!isParticipantDropdownOpen)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 text-xs font-bold text-slate-900 transition-colors cursor-pointer"
            >
              <span className="font-mono text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                {currentParticipant.participantId}
              </span>
              <span className="truncate max-w-[130px] sm:max-w-[200px] md:max-w-xs">
                {currentParticipant.name}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>

            {isParticipantDropdownOpen && (
              <div className="absolute left-0 mt-1 w-80 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 max-h-72 overflow-y-auto">
                <p className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                  Pilih Peserta Penilaian
                </p>
                {participants.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedParticipantId(p.id);
                      setIsParticipantDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between cursor-pointer ${
                      p.id === currentParticipant.id
                        ? 'bg-emerald-50 text-emerald-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <p className="font-medium">
                        <span className="font-mono text-emerald-700 font-semibold">{p.participantId}</span> · {p.name}
                      </p>
                      <p className="text-[10px] text-slate-400">{p.kafilahName}</p>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        p.status === 'Final'
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.status === 'Berlangsung'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {p.status}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Maqra quiet info */}
          <span className="text-[11px] text-slate-500 hidden md:inline truncate">
            {currentParticipant.kafilahName} · Hal. {currentParticipant.pageNumber}
          </span>
        </div>

        {/* Tabloid Portrait Mode Switcher (< md) */}
        <div className="flex md:hidden items-center bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setTabletActiveTab('mushaf')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              tabletActiveTab === 'mushaf'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            Mushaf
          </button>
          <button
            onClick={() => setTabletActiveTab('scoring')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              tabletActiveTab === 'scoring'
                ? 'bg-white text-emerald-800 shadow-xs'
                : 'text-slate-500'
            }`}
          >
            Nilai
          </button>
        </div>

        {/* Right Zone: Clean Judge Info, Status, and Sync */}
        <div className="flex items-center gap-3 text-xs">
          <span className="font-medium text-slate-600 hidden lg:inline">
            {activeJudgeName.split(',')[0]}
          </span>

          {isFinalized ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <Lock className="w-3 h-3 text-emerald-700" />
              Final
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              Berlangsung
            </span>
          )}

          <div className="flex items-center gap-1.5 text-xs text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span className="hidden sm:inline text-[11px] font-medium">{syncStatus}</span>
          </div>
        </div>
      </header>

      {/* MAIN DUAL-PANEL WORKSPACE */}
      <div className="flex-1 flex overflow-hidden">
        {/* PANEL KIRI: LEMBAR MUSHAF MADINAH RESMI MUJAMMA' MALIK FAHD */}
        <div
          className={`flex-1 md:w-[56%] lg:w-[57%] flex flex-col border-r border-slate-200 bg-slate-50 ${
            tabletActiveTab === 'mushaf' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Mushaf Canvas Toolbar */}
          <div className="h-11 bg-white border-b border-slate-200 px-3 sm:px-4 flex items-center justify-between text-xs shrink-0 z-20">
            {/* Page Navigation */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setCurrentPage((p) => Math.max(1, p - 1));
                }}
                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                title="Halaman Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-1.5 font-mono font-bold text-slate-800 text-xs">
                Hal. {currentPage}
              </span>
              <button
                onClick={() => {
                  setCurrentPage((p) => Math.min(604, p + 1));
                }}
                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                title="Halaman Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Precision Zoom Controls */}
            <div className="flex items-center gap-1 px-2 border-l border-slate-200">
              <button
                onClick={() => setZoomLevel((z) => Math.max(70, z - 15))}
                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                title="Perkecil Zoom"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                className="font-mono text-[11px] font-semibold text-slate-700 px-1 py-0.5 rounded hover:bg-slate-100 cursor-pointer"
                title="Reset Zoom (100%)"
              >
                {zoomLevel}%
              </button>
              <button
                onClick={() => setZoomLevel((z) => Math.min(160, z + 15))}
                className="p-1 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer"
                title="Perbesar Zoom"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Drawing Tools (Pen, Highlighter, Eraser, Undo, Clear) */}
            <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
              {/* Pen Merah */}
              <button
                disabled={isFinalized}
                onClick={() => {
                  setActiveTool('pen');
                  setActiveColor('#dc2626');
                  setStrokeSize(3);
                }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'pen' && activeColor === '#dc2626'
                    ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-400'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title="Pen Merah: Kesalahan Tajwid Jali / Makhraj"
              >
                <PenTool className="w-3.5 h-3.5" />
              </button>

              {/* Marker Stabilo Kuning */}
              <button
                disabled={isFinalized}
                onClick={() => {
                  setActiveTool('marker');
                  setActiveColor('#eab308');
                  setStrokeSize(15);
                }}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'marker'
                    ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-400'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title="Stabilo Kuning: Tanda Waqaf / Ibtida"
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>

              {/* Penghapus / Eraser */}
              <button
                disabled={isFinalized}
                onClick={() => setActiveTool('eraser')}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  activeTool === 'eraser'
                    ? 'bg-slate-200 text-slate-900 ring-1 ring-slate-400'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
                title="Penghapus Coretan"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>

              {/* Undo */}
              <button
                disabled={isFinalized}
                onClick={handleUndo}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                title="Urungkan Coretan (Undo)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>

              {/* Clear */}
              <button
                disabled={isFinalized}
                onClick={handleClearPage}
                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 disabled:opacity-30 cursor-pointer"
                title="Bersihkan Semua Coretan"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Annotation count */}
            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
              {activeAnnotationsCount} anotasi
            </span>
          </div>

          {/* 
            AUTHENTIC LEMBAR MUSHAF MADINAH MUJAMMA' MALIK FAHD
            Single Page with White Background and Natural Vertical Scroll
          */}
          <div
            ref={containerRef}
            className="flex-1 overflow-y-auto overflow-x-auto relative flex justify-center items-start bg-white p-3 sm:p-6 select-none"
          >
            {/* Single Sheet Viewport (Standard 15 Lines Mujamma' Malik Fahd) */}
            <div
              style={{
                width: `${Math.round((590 * zoomLevel) / 100)}px`,
                height: `${Math.round((840 * zoomLevel) / 100)}px`,
                transition: 'width 0.15s ease-out, height 0.15s ease-out'
              }}
              className="relative bg-white shadow-lg rounded border border-slate-200 shrink-0 my-auto overflow-hidden"
            >
              {/* GAMBAR ASLI LEMBAR MUSHAF MADINAH MUJAMMA' MALIK FAHD */}
              <div className="absolute inset-0 z-0 flex items-center justify-center bg-white">
                <img
                  src={currentImageUrl}
                  alt={`Mushaf Madinah Cetakan Asli Halaman ${currentPage}`}
                  referrerPolicy="no-referrer"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => {
                    if (imageSourceIndex < imageSources.length - 1) {
                      setImageSourceIndex((prev) => prev + 1);
                    } else {
                      setImageLoadError(true);
                    }
                  }}
                  className={`w-full h-full object-contain pointer-events-none select-none transition-opacity duration-200 ${
                    imageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />
                {!imageLoaded && !imageLoadError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs gap-2 bg-white">
                    <div className="w-7 h-7 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                    <span className="font-medium">Memuat lembar asli Mushaf Madinah...</span>
                  </div>
                )}
                {imageLoadError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-500 bg-white">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                    <p className="text-xs font-semibold text-slate-700">Gambar Lembar Mushaf Sedang Dimuat Ulang</p>
                    <p className="text-[11px] text-slate-400 mt-1">Gunakan tombol muat ulang untuk mencoba server mirror.</p>
                    <button
                      onClick={() => {
                        setImageLoadError(false);
                        setImageSourceIndex(0);
                      }}
                      className="mt-3 px-3 py-1.5 bg-emerald-800 text-white rounded text-xs font-medium hover:bg-emerald-900 cursor-pointer"
                    >
                      Muat Ulang Gambar
                    </button>
                  </div>
                )}
              </div>

              {/* CALIBRATED DRAWING CANVAS (Overlaying the original sheet perfectly) */}
              <canvas
                ref={canvasRef}
                width={590}
                height={840}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={`absolute inset-0 w-full h-full z-10 touch-none ${
                  isFinalized ? 'cursor-not-allowed' : 'cursor-crosshair'
                }`}
              />
            </div>
          </div>

          {/* Mushaf Footer Status */}
          <div className="h-7 bg-white border-t border-slate-200 px-4 flex items-center justify-between text-[10px] text-slate-500 shrink-0">
            <span className="font-medium truncate">
              Lembar Asli Cetakan Mushaf Madinah — Standar Mujamma' Al-Malik Fahd (15 Baris)
            </span>
            <span className="hidden sm:inline text-slate-400">
              Scroll ke atas/bawah untuk meninjau seluruh lembaran
            </span>
          </div>
        </div>

        {/* PANEL KANAN: KONTROL PENILAIAN */}
        <div
          className={`flex-1 md:w-[44%] lg:w-[43%] flex flex-col bg-white overflow-y-auto p-4 sm:p-5 space-y-4 ${
            tabletActiveTab === 'scoring' ? 'flex' : 'hidden md:flex'
          }`}
        >
          {/* Top 3 KPI Summary Card */}
          <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 grid grid-cols-3 gap-3">
            <div>
              <p className="text-[11px] font-medium text-slate-500">Kesalahan</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-0.5 tabular-nums font-mono">
                {totalErrors}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Pengurangan</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-rose-600 mt-0.5 tabular-nums font-mono">
                -{totalDeductions.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-medium text-slate-500">Nilai sementara</p>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 mt-0.5 tabular-nums font-mono">
                {currentScore.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Category Header */}
          <div className="flex items-center justify-between pt-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Kategori kesalahan
            </h3>
            <span className="text-[10px] font-mono text-slate-400">v2.4 - LPTQ 2024</span>
          </div>

          {/* Stepper Cards for each Error Category */}
          <div className="space-y-2.5 flex-1 overflow-y-auto">
            {errorCategories.map((cat) => {
              const count = errorCounts[cat.id] || 0;
              const subtotal = count * cat.defaultDeduction;

              return (
                <div
                  key={cat.id}
                  className="p-3 sm:p-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-slate-300 transition-all flex items-center justify-between"
                >
                  <div className="space-y-0.5 max-w-[200px] sm:max-w-[240px]">
                    <span className="font-bold text-xs text-slate-900 block">{cat.name}</span>
                    <p className="text-[10px] text-slate-500">
                      {cat.methodType} (-{cat.defaultDeduction.toFixed(2)} per kejadian)
                    </p>
                    {count > 0 && (
                      <p className="text-[10px] font-mono text-slate-400">
                        {count} × {cat.defaultDeduction.toFixed(2)}
                      </p>
                    )}
                  </div>

                  {/* Stepper buttons (Touch target friendly >= 40px) */}
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {/* Minus Button */}
                      <button
                        disabled={count <= 0 || isFinalized}
                        onClick={() =>
                          updateErrorCount(
                            currentParticipant.id,
                            activeJudgeId,
                            cat.id,
                            -1
                          )
                        }
                        className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-100 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                        title="Kurangi Kesalahan"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>

                      {/* Number Display */}
                      <span className="w-7 text-center font-mono font-bold text-base text-slate-900">
                        {count}
                      </span>

                      {/* Plus Button */}
                      <button
                        disabled={isFinalized}
                        onClick={() =>
                          updateErrorCount(
                            currentParticipant.id,
                            activeJudgeId,
                            cat.id,
                            1
                          )
                        }
                        className="w-9 h-9 rounded-lg bg-emerald-800 hover:bg-emerald-900 active:scale-95 text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all cursor-pointer"
                        title="Tambah Kesalahan"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Red Deduction Display */}
                    {subtotal > 0 && (
                      <span className="text-[10px] font-mono font-bold text-rose-600">
                        -{subtotal.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Actions and Status */}
          <div className="pt-3 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-1.5 text-[11px]">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="font-mono">{lastSyncTime}</span>
              </div>
              <span className="font-medium text-emerald-700 text-[11px]">Tersinkronisasi</span>
            </div>

            {/* Simpan Penilaian Button */}
            {isFinalized ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-1">
                <p className="text-xs font-bold text-emerald-900 flex items-center justify-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-700" />
                  Penilaian Telah Dikunci (Final)
                </p>
                <p className="text-[10px] text-slate-500">
                  Snapshot nilai dan coretan mushaf telah diarsipkan secara permanen.
                </p>
              </div>
            ) : (
              <button
                onClick={() => setIsConfirmModalOpen(true)}
                className="w-full py-3 bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Penilaian</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Konfirmasi Finalisasi Penilaian */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Kunci Penilaian Peserta?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aksi ini akan memfinalisasi dan mengunci nilai serta snapshot anotasi mushaf.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Peserta:</span>
                <span className="font-bold text-slate-900">
                  {currentParticipant.name} ({currentParticipant.participantId})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Kafilah:</span>
                <span className="font-medium text-slate-800">
                  {currentParticipant.kafilahName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Kesalahan:</span>
                <span className="font-bold font-mono text-slate-800">{totalErrors}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Pengurangan:</span>
                <span className="font-bold font-mono text-rose-600">
                  -{totalDeductions.toFixed(2)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold">
                <span className="text-slate-900">SKOR AKHIR BIDANG:</span>
                <span className="text-emerald-700 font-mono text-base">
                  {currentScore.toFixed(2)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Setelah dikunci, nilai tidak dapat diubah kembali kecuali dengan persetujuan ketua
              dewan hakim atau administrator MTQ.
            </p>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Periksa Kembali
              </button>
              <button
                onClick={handleConfirmFinalize}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Ya, Kunci Penilaian</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
