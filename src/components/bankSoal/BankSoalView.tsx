import React, { useState } from 'react';
import { Plus, Search, ShieldCheck, Eye, X, BookOpen, ZoomIn, ZoomOut, AlertTriangle } from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Question } from '../../types/mtq';
import { QURAN_PAGES_DATA } from '../../data/mockData';

export const BankSoalView: React.FC = () => {
  const { questions, addQuestion } = useMtq();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('Semua Cabang');
  const [selectedStage, setSelectedStage] = useState('Semua Babak');
  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Preview Mushaf authentic image states
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [previewImageLoaded, setPreviewImageLoaded] = useState<boolean>(false);
  const [previewImageError, setPreviewImageError] = useState<boolean>(false);
  const [previewSourceIndex, setPreviewSourceIndex] = useState<number>(0);

  // Form states
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSurah, setNewSurah] = useState('Maryam');
  const [newSurahNum, setNewSurahNum] = useState(19);
  const [newStartAyah, setNewStartAyah] = useState(1);
  const [newEndAyah, setNewEndAyah] = useState(15);
  const [newPage, setNewPage] = useState(305);
  const [newBranch, setNewBranch] = useState('Tilawah Dewasa Putra Ulya');
  const [newStage, setNewStage] = useState('Penyisihan');
  const [newDesc, setNewDesc] = useState('');

  const filteredQuestions = questions.filter((q) => {
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

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newTitle) return;
    addQuestion({
      code: newCode.toUpperCase(),
      title: newTitle,
      surahName: newSurah,
      surahNumber: Number(newSurahNum),
      startAyah: Number(newStartAyah),
      endAyah: Number(newEndAyah),
      pageNumber: Number(newPage),
      branchAndLevel: newBranch,
      stageName: newStage,
      status: 'Aktif',
      description: newDesc
    });
    setNewCode('');
    setNewTitle('');
    setNewDesc('');
    setIsAddModalOpen(false);
  };

  const previewData = previewQuestion ? QURAN_PAGES_DATA[previewQuestion.pageNumber] : null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header matching screenshot */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-extrabold text-slate-900">
              Bank Soal & Maqra Tilawah
            </h1>
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Aset Mushaf Siap
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola paket maqra, surah, ayat, dan penetapan soal undian bagi peserta musabaqah
          </p>
        </div>

        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>+ Tambah Soal / Maqra</span>
        </button>
      </div>

      {/* Filter and Search Bar matching screenshot */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode soal, surah, atau maqra..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Cabang:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 text-xs outline-none"
            >
              <option value="Semua Cabang">Semua Cabang</option>
              <option value="Tilawah Dewasa Putra">Tilawah Dewasa Putra</option>
              <option value="Tilawah Dewasa Putri">Tilawah Dewasa Putri</option>
            </select>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-600">
            <span>Babak:</span>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 text-xs outline-none"
            >
              <option value="Semua Babak">Semua Babak</option>
              <option value="Penyisihan">Penyisihan</option>
              <option value="Final">Final</option>
            </select>
          </div>

          <span className="text-xs text-slate-500 font-medium ml-2">
            {filteredQuestions.length} Paket Soal
          </span>
        </div>
      </div>

      {/* Info Callout Box matching screenshot */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-start sm:items-center gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5 sm:mt-0" />
          <p className="text-slate-700">
            <span className="font-bold text-slate-900">Status aset Mushaf:</span> Sumber
            target untuk seluruh soal adalah{' '}
            <span className="font-semibold underline text-slate-900">
              Mushaf al-Madinah, Rasm Utsmani, Riwayat Hafs ‘an ‘Asim
            </span>
            . Dilengkapi kanvas interaktif dan pembagian per ayat.
          </p>
        </div>
        <span className="px-3 py-1 bg-white text-emerald-800 border border-emerald-200 rounded-md font-semibold text-[11px] self-start sm:self-center shrink-0">
          King Fahd Glorious Qur'an Printing Complex
        </span>
      </div>

      {/* Question Bank Table matching screenshot */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="py-3.5 px-5">Kode Soal</th>
                <th className="py-3.5 px-5">Judul / Referensi Maqra</th>
                <th className="py-3.5 px-5">Surah & Ayat</th>
                <th className="py-3.5 px-5 text-center">Hal. Mushaf</th>
                <th className="py-3.5 px-5">Cabang & Jenjang</th>
                <th className="py-3.5 px-5 text-center">Babak</th>
                <th className="py-3.5 px-5 text-center">Status</th>
                <th className="py-3.5 px-5 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredQuestions.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-5 font-bold text-emerald-800 tracking-wide font-mono">
                    {q.code}
                  </td>
                  <td className="py-3.5 px-5">
                    <p className="font-bold text-slate-900">{q.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                      {q.description}
                    </p>
                  </td>
                  <td className="py-3.5 px-5">
                    <p className="font-semibold text-emerald-800">
                      {q.surahName} ({q.surahNumber})
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Ayat {q.startAyah} - {q.endAyah}
                    </p>
                  </td>
                  <td className="py-3.5 px-5 text-center font-bold text-slate-800 font-mono">
                    Hal. {q.pageNumber}
                  </td>
                  <td className="py-3.5 px-5">
                    <p className="font-medium text-slate-800">{q.branchAndLevel}</p>
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    <span className="inline-block px-2.5 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700">
                      {q.stageName}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                      {q.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 text-center">
                    <button
                      onClick={() => {
                        setPreviewQuestion(q);
                        setPreviewZoom(100);
                        setPreviewImageLoaded(false);
                        setPreviewImageError(false);
                        setPreviewSourceIndex(0);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 text-slate-500" />
                      <span>Pratinjau</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Pratinjau Maqra Mushaf (Standar Mujamma' Malik Fahd) */}
      {previewQuestion && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[94vh] flex flex-col">
            {/* Header Modal with Zoom Controls */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {previewQuestion.code}
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    Hal. {previewQuestion.pageNumber} · QS. {previewQuestion.surahName} [{previewQuestion.startAyah} - {previewQuestion.endAyah}]
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                  {previewQuestion.title}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                {/* Zoom Controls */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    onClick={() => setPreviewZoom((z) => Math.max(70, z - 15))}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-white cursor-pointer"
                    title="Perkecil"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setPreviewZoom(100)}
                    className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-slate-700 hover:bg-white rounded cursor-pointer"
                    title="Reset Zoom (100%)"
                  >
                    {previewZoom}%
                  </button>
                  <button
                    onClick={() => setPreviewZoom((z) => Math.min(150, z + 15))}
                    className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-white cursor-pointer"
                    title="Perbesar"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => setPreviewQuestion(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
                  title="Tutup Pratinjau"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable White Canvas Viewport for Single Sheet */}
            <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 bg-white flex justify-center items-start">
              <div
                style={{
                  width: `${Math.round((540 * previewZoom) / 100)}px`,
                  height: `${Math.round((770 * previewZoom) / 100)}px`,
                  transition: 'width 0.15s ease-out, height 0.15s ease-out'
                }}
                className="relative bg-white shadow-xl rounded border border-slate-200 shrink-0 my-auto overflow-hidden"
              >
                <img
                  src={[
                    `https://android.quran.com/data/width_1260/page${String(previewQuestion.pageNumber).padStart(3, '0')}.png`,
                    `https://everyayah.com/data/quranpages_hafs_1260/page${String(previewQuestion.pageNumber).padStart(3, '0')}.png`,
                    `https://raw.githubusercontent.com/the-quran/quran-images/master/images/page${String(previewQuestion.pageNumber).padStart(3, '0')}.png`
                  ][previewSourceIndex] || `https://android.quran.com/data/width_1260/page${String(previewQuestion.pageNumber).padStart(3, '0')}.png`}
                  alt={`Lembar Asli Mushaf Madinah Hal ${previewQuestion.pageNumber}`}
                  referrerPolicy="no-referrer"
                  onLoad={() => setPreviewImageLoaded(true)}
                  onError={() => {
                    if (previewSourceIndex < 2) {
                      setPreviewSourceIndex((prev) => prev + 1);
                    } else {
                      setPreviewImageError(true);
                    }
                  }}
                  className={`w-full h-full object-contain pointer-events-none select-none transition-opacity duration-200 ${
                    previewImageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                {!previewImageLoaded && !previewImageError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 text-xs gap-2 bg-white">
                    <div className="w-7 h-7 border-2 border-emerald-700 border-t-transparent rounded-full animate-spin" />
                    <span className="font-medium">Memuat lembar asli Mushaf Madinah...</span>
                  </div>
                )}

                {previewImageError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-slate-500 bg-white">
                    <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                    <p className="text-xs font-semibold text-slate-700">Gambar lembar Mushaf sedang dimuat ulang</p>
                    <button
                      onClick={() => {
                        setPreviewImageError(false);
                        setPreviewSourceIndex(0);
                      }}
                      className="mt-3 px-3 py-1.5 bg-emerald-800 text-white rounded text-xs font-medium hover:bg-emerald-900 cursor-pointer"
                    >
                      Muat Ulang
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Status & Close */}
            <div className="p-3 sm:p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs shrink-0">
              <span className="text-[11px] text-slate-500 truncate">
                Mushaf Madinah Rasm Utsmani — Standar Mujamma' Al-Malik Fahd (15 Baris)
              </span>
              <button
                onClick={() => setPreviewQuestion(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Tutup Pratinjau
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah Soal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveQuestion}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Tambah Maqra / Soal Baru</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Soal
              </label>
              <input
                type="text"
                required
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Misal: MQ-TLW-05"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none uppercase font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Judul / Referensi Maqra
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Misal: Maqra 05: QS. Al-Baqarah [2]: 183 - 187"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Surah & Nomor
                </label>
                <input
                  type="text"
                  value={newSurah}
                  onChange={(e) => setNewSurah(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hal. Mushaf
                </label>
                <input
                  type="number"
                  value={newPage}
                  onChange={(e) => setNewPage(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ayat Awal
                </label>
                <input
                  type="number"
                  value={newStartAyah}
                  onChange={(e) => setNewStartAyah(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ayat Akhir
                </label>
                <input
                  type="number"
                  value={newEndAyah}
                  onChange={(e) => setNewEndAyah(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi / Instruksi Baca
              </label>
              <textarea
                rows={2}
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Misal: Tartil dan riwayat Hafs 'an 'Ashim..."
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs"
              >
                Simpan Maqra
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
