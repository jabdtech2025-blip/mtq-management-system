import React, { useState } from 'react';
import {
  Plus,
  Search,
  ShieldCheck,
  Eye,
  X,
  BookOpen,
  ZoomIn,
  ZoomOut,
  AlertTriangle,
  Dice5,
  CheckCircle2,
  Edit2
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
    stages
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('Semua Cabang');
  const [selectedStage, setSelectedStage] = useState('Semua Babak');

  const [previewQuestion, setPreviewQuestion] = useState<Question | null>(null);
  const [previewZoom, setPreviewZoom] = useState<number>(100);
  const [previewImageError, setPreviewImageError] = useState<boolean>(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [lotteryModalQuestion, setLotteryModalQuestion] = useState<Question | null>(null);
  const [selectedTargetParticipantId, setSelectedTargetParticipantId] = useState('');

  // Form states
  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formSurah, setFormSurah] = useState('Maryam');
  const [formSurahNum, setFormSurahNum] = useState(19);
  const [formStartAyah, setFormStartAyah] = useState(1);
  const [formEndAyah, setFormEndAyah] = useState(15);
  const [formPage, setFormPage] = useState(305);
  const [formBranch, setFormBranch] = useState('Tilawah Dewasa Putra Ulya');
  const [formStage, setFormStage] = useState('Penyisihan');
  const [formDesc, setFormDesc] = useState('');
  const [formError, setFormError] = useState('');

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

  const handleOpenAdd = () => {
    setEditingQuestion(null);
    setFormCode(`MQ-TLW-${String(questions.length + 1).padStart(2, '0')}`);
    setFormTitle('Maqra Baru: QS. Maryam [19]: 1 - 15');
    setFormSurah('Maryam');
    setFormSurahNum(19);
    setFormStartAyah(1);
    setFormEndAyah(15);
    setFormPage(305);
    setFormBranch('Tilawah Dewasa Putra Ulya');
    setFormStage('Penyisihan');
    setFormDesc('');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setFormCode(q.code);
    setFormTitle(q.title);
    setFormSurah(q.surahName);
    setFormSurahNum(q.surahNumber);
    setFormStartAyah(q.startAyah);
    setFormEndAyah(q.endAyah);
    setFormPage(q.pageNumber);
    setFormBranch(q.branchAndLevel);
    setFormStage(q.stageName);
    setFormDesc(q.description || '');
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleSaveQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validations
    if (!formCode || !formTitle) {
      setFormError('Kode dan Judul Maqra wajib diisi.');
      return;
    }
    if (Number(formStartAyah) > Number(formEndAyah)) {
      setFormError('Ayat awal tidak boleh lebih besar dari ayat akhir.');
      return;
    }
    if (Number(formPage) < 1 || Number(formPage) > 604) {
      setFormError('Nomor halaman mushaf harus berada di antara 1 dan 604.');
      return;
    }

    if (editingQuestion) {
      updateQuestion(editingQuestion.id, {
        code: formCode.toUpperCase(),
        title: formTitle,
        surahName: formSurah,
        surahNumber: Number(formSurahNum),
        startAyah: Number(formStartAyah),
        endAyah: Number(formEndAyah),
        pageNumber: Number(formPage),
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
        pageNumber: Number(formPage),
        branchAndLevel: formBranch,
        stageName: formStage,
        status: 'Aktif',
        description: formDesc
      });
    }

    setIsAddModalOpen(false);
  };

  // Open Penetapan/Undian Maqra modal
  const handleOpenLottery = (q: Question) => {
    setLotteryModalQuestion(q);
    const unassigned = participants.find((p) => !p.questionId || p.questionId === q.id);
    setSelectedTargetParticipantId(unassigned ? unassigned.id : participants[0]?.id || '');
  };

  const handleConfirmLottery = () => {
    if (lotteryModalQuestion && selectedTargetParticipantId) {
      assignMaqraToParticipant(selectedTargetParticipantId, lotteryModalQuestion.id);
      setLotteryModalQuestion(null);
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
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {questions.length} Maqra Tersedia
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola paket maqra, surah, ayat, dan penetapan soal undian bagi peserta musabaqah
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Soal / Maqra</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode soal, nama surah, atau judul maqra..."
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

      {/* Questions Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
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
                    Tidak ada soal / maqra yang sesuai.
                  </td>
                </tr>
              ) : (
                filteredQuestions.map((q) => {
                  const assignedParticipant = participants.find((p) => p.questionId === q.id);

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
                        Hal. {q.pageNumber}
                      </td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-800">{q.branchAndLevel}</p>
                        <span className="text-[10px] text-slate-500 font-medium">{q.stageName}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {assignedParticipant ? (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-md text-[11px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{assignedParticipant.participantId}</span>
                          </div>
                        ) : (
                          <span className="inline-block bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[11px] font-medium">
                            Belum Ditetapkan
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1.5">
                        <button
                          onClick={() => handleOpenLottery(q)}
                          className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Tetapkan / Undi ke Peserta"
                        >
                          <Dice5 className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => {
                            setPreviewQuestion(q);
                            setPreviewImageError(false);
                            setPreviewZoom(100);
                          }}
                          className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Pratinjau Mushaf"
                        >
                          <Eye className="w-4 h-4 inline" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(q)}
                          className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg transition-colors"
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

      {/* Pratinjau Mushaf Madinah Modal */}
      {previewQuestion && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">
                  {previewQuestion.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Mushaf Madinah Halaman {previewQuestion.pageNumber} · QS. {previewQuestion.surahName}: {previewQuestion.startAyah} - {previewQuestion.endAyah}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewZoom((z) => Math.max(70, z - 15))}
                  className="p-1 rounded bg-white border border-slate-200 text-slate-600"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[11px] font-mono text-slate-600">{previewZoom}%</span>
                <button
                  onClick={() => setPreviewZoom((z) => Math.min(160, z + 15))}
                  className="p-1 rounded bg-white border border-slate-200 text-slate-600"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => setPreviewQuestion(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg ml-2"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-100 flex justify-center items-start">
              <div
                style={{ width: `${Math.round(520 * (previewZoom / 100))}px` }}
                className="bg-white p-2 shadow-lg rounded-sm border border-slate-300"
              >
                <img
                  src={`https://android.quran.com/data/width_1260/page${String(
                    previewQuestion.pageNumber
                  ).padStart(3, '0')}.png`}
                  alt={`Halaman ${previewQuestion.pageNumber}`}
                  className="w-full h-auto block select-none"
                  onError={() => setPreviewImageError(true)}
                />
              </div>
            </div>

            <div className="p-3 border-t border-slate-200 bg-white flex justify-end">
              <button
                onClick={() => setPreviewQuestion(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Penetapan / Undian Maqra Modal */}
      {lotteryModalQuestion && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 text-emerald-800 mb-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Dice5 className="w-5 h-5 text-emerald-800" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Penetapan Soal / Maqra Undian
                </h3>
                <p className="text-xs text-slate-500">
                  {lotteryModalQuestion.code} · Hal. {lotteryModalQuestion.pageNumber}
                </p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-xs">
              <p className="font-bold text-slate-800">{lotteryModalQuestion.title}</p>
              <p className="text-slate-500 mt-0.5">
                QS. {lotteryModalQuestion.surahName}: {lotteryModalQuestion.startAyah} - {lotteryModalQuestion.endAyah}
              </p>
            </div>

            <div className="space-y-2 mb-6">
              <label className="text-xs font-bold text-slate-700 block">
                Pilih Peserta yang Memperoleh Maqra Ini:
              </label>
              <select
                value={selectedTargetParticipantId}
                onChange={(e) => setSelectedTargetParticipantId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 bg-white"
              >
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.lotteryNumber} - {p.name} ({p.participantId} · {p.kafilahName})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                onClick={() => setLotteryModalQuestion(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmLottery}
                className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                Tetapkan Maqra
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
              <div className="grid grid-cols-2 gap-3">
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
                    Hal. Mushaf (1-604)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={604}
                    value={formPage}
                    onChange={(e) => setFormPage(Number(e.target.value))}
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
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white rounded-lg text-xs font-bold shadow-xs"
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
