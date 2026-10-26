import React, { useState } from 'react';
import {
  Layers,
  Plus,
  CheckCircle2,
  Clock,
  ArrowRight,
  Pencil,
  X,
  AlertCircle
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { CompetitionStage } from '../../types/mtq';

export const StageManagementView: React.FC = () => {
  const { stages, addStage, updateStage, participants, assessments, setCurrentView, currentTenant } = useMtq();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<CompetitionStage | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formOrder, setFormOrder] = useState<number>(stages.length + 1);
  const [formBranch, setFormBranch] = useState('Tilawah Dewasa Putra');
  const [formQuota, setFormQuota] = useState<number>(3);
  const [formStatus, setFormStatus] = useState<'Menunggu' | 'Aktif' | 'Selesai'>('Menunggu');

  const handleOpenAdd = () => {
    setEditingStage(null);
    setFormName('');
    setFormOrder(stages.length + 1);
    setFormBranch('Tilawah Dewasa Putra');
    setFormQuota(3);
    setFormStatus('Menunggu');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (s: CompetitionStage) => {
    setEditingStage(s);
    setFormName(s.name);
    setFormOrder(s.order);
    setFormBranch(s.branchName);
    setFormQuota(s.qualificationQuota);
    setFormStatus(s.status);
    setIsModalOpen(true);
  };

  const handleSaveStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName) return;

    if (editingStage) {
      updateStage(editingStage.id, {
        name: formName,
        order: Number(formOrder),
        branchName: formBranch,
        qualificationQuota: Number(formQuota),
        status: formStatus
      });
    } else {
      addStage({
        name: formName,
        order: Number(formOrder),
        branchName: formBranch,
        status: formStatus,
        qualificationQuota: Number(formQuota),
        qualificationMethod: 'top_n',
        isFinalized: false
      });
    }

    setIsModalOpen(false);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Manajemen Babak Musabaqah
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.name} · Kelola struktur tahapan babak (Penyisihan, Semifinal, Final) dan kuota kelulusan
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Babak</span>
          </button>
        </div>
      </div>

      {/* Stage Progression Flow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stages
          .sort((a, b) => a.order - b.order)
          .map((stg) => {
            const stageParticipants = participants.filter((p) => p.stageName === stg.name);
            const totalStage = stageParticipants.length;
            const finalizedStage = stageParticipants.filter((p) => p.status === 'Final').length;

            return (
              <div
                key={stg.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all ${
                  stg.status === 'Aktif'
                    ? 'border-emerald-600 ring-2 ring-emerald-500/10'
                    : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-400">
                      TAHAP 0{stg.order}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        stg.status === 'Aktif'
                          ? 'bg-emerald-100 text-emerald-800'
                          : stg.status === 'Selesai'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {stg.status === 'Aktif' ? 'Sedang Berjalan' : stg.status}
                    </span>
                  </div>

                  <h3 className="text-lg font-extrabold text-slate-900 mt-2">
                    Babak {stg.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">{stg.branchName}</p>

                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Jumlah Peserta:</span>
                      <span className="font-mono font-bold text-slate-900">{totalStage} Peserta</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Penilaian Lengkap:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {finalizedStage} / {totalStage}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Kuota Melaju:</span>
                      <span className="font-mono font-bold text-slate-800">
                        Top {stg.qualificationQuota} Peserta
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end">
                  <button
                    onClick={() => handleOpenEdit(stg)}
                    className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-slate-50 rounded text-xs inline-flex items-center gap-1 cursor-pointer font-medium"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Konfigurasi</span>
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {/* Operational Explanation */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-600">
        <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          <strong>Alur Musabaqah Bertingkat:</strong> Peserta yang berhak maju ke babak berikutnya diseleksi berdasarkan pemeringkatan agregat nilai dewan hakim setelah babak aktif difinalisasi pada menu <em>Hasil & Kelulusan</em>. Peserta yang lolos akan dibuatkan rekam jejak babak baru dengan paket maqra dan penugasan juri yang independen.
        </p>
      </div>

      {/* Add / Edit Stage Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingStage ? 'Edit Konfigurasi Babak' : 'Tambah Babak Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStage} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Babak</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  placeholder="e.g. Penyisihan, Semifinal, Final"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Nomor Urutan Babak</label>
                  <input
                    type="number"
                    min={1}
                    value={formOrder}
                    onChange={(e) => setFormOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">
                    Kuota Lolos (Top-N)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formQuota}
                    onChange={(e) => setFormQuota(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Cabang Musabaqah</label>
                <input
                  type="text"
                  value={formBranch}
                  onChange={(e) => setFormBranch(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Status Tahapan</label>
                <select
                  value={formStatus}
                  onChange={(e) =>
                    setFormStatus(e.target.value as 'Menunggu' | 'Aktif' | 'Selesai')
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  <option value="Menunggu">Menunggu</option>
                  <option value="Aktif">Aktif (Sedang Berjalan)</option>
                  <option value="Selesai">Selesai</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold shadow-xs"
                >
                  Simpan Konfigurasi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
