import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Layers,
  GraduationCap,
  Trophy,
  Users,
  AlertCircle,
  Pencil,
  X,
  Check
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { ErrorCategory } from '../../types/mtq';

type MasterTab = 'kategori' | 'babak' | 'jenjang' | 'cabang' | 'hakim';

export const MasterDataView: React.FC = () => {
  const { errorCategories, updateCategoryDeduction, users } = useMtq();
  const [activeTab, setActiveTab] = useState<MasterTab>('kategori');
  const [editingCategory, setEditingCategory] = useState<ErrorCategory | null>(null);
  const [newDeductionValue, setNewDeductionValue] = useState<number>(0.5);

  const handleOpenEdit = (cat: ErrorCategory) => {
    setEditingCategory(cat);
    setNewDeductionValue(cat.defaultDeduction);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      updateCategoryDeduction(editingCategory.id, Number(newDeductionValue));
      setEditingCategory(null);
    }
  };

  const tabs: { id: MasterTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'kategori',
      label: 'Kategori Kesalahan & Bobot',
      icon: <SlidersHorizontal className="w-3.5 h-3.5" />
    },
    {
      id: 'babak',
      label: 'Babak Kompetisi (4)',
      icon: <Layers className="w-3.5 h-3.5" />
    },
    {
      id: 'jenjang',
      label: 'Jenjang Usia (4)',
      icon: <GraduationCap className="w-3.5 h-3.5" />
    },
    {
      id: 'cabang',
      label: 'Cabang / Golongan (6)',
      icon: <Trophy className="w-3.5 h-3.5" />
    },
    {
      id: 'hakim',
      label: 'Pengguna & Penugasan Hakim',
      icon: <Users className="w-3.5 h-3.5" />
    }
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header matching screenshot */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-slate-900">
            Master Data & Konfigurasi Rubrik
          </h1>
          <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
            Rubrik Versi: v2.4 (LPTQ 2024)
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Kelola babak, jenjang usia, cabang musabaqah, bobot pengurangan kesalahan, serta penugasan hakim
        </p>
      </div>

      {/* Tab Navigation matching screenshot */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                isActive
                  ? 'bg-emerald-800 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Yellow Alert Box matching screenshot */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3 text-xs">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-slate-700 leading-relaxed">
          <span className="font-bold text-slate-900">Ketentuan Konfigurasi Rubrik Dinamis:</span>{' '}
          Bobot pengurangan, batas nilai, dan formula penilaian bersifat fleksibel sesuai ketetapan
          dewan hakim cabang masing-masing. Nilai bobot di bawah ini dapat disesuaikan dan disimpan
          oleh administrator sebelum sesi perlombaan dimulai.
        </p>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'kategori' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Daftar Kategori Kesalahan, Bobot & Metode Pengurangan
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              {errorCategories.length} Kategori Terdaftar
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3.5 px-5">Kode</th>
                  <th className="py-3.5 px-5">Nama Kategori Kesalahan</th>
                  <th className="py-3.5 px-5">Deskripsi / Ruang Lingkup</th>
                  <th className="py-3.5 px-5 text-center">Bobot Default</th>
                  <th className="py-3.5 px-5">Metode Pengurangan</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                  <th className="py-3.5 px-5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {errorCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-5 font-bold text-emerald-800 tracking-wide font-mono">
                      {c.code}
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="font-bold text-slate-900">{c.name}</p>
                      <p className="text-[11px] text-slate-400">Semua Cabang Tilawah & Tahfiz</p>
                    </td>
                    <td className="py-3.5 px-5 text-slate-600 max-w-sm">{c.scope}</td>
                    <td className="py-3.5 px-5 text-center font-bold text-rose-600 tabular-nums font-mono text-sm">
                      -{c.defaultDeduction.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-5 text-slate-700 font-medium">
                      {c.methodType} (-{c.defaultDeduction.toFixed(2)} per kejadian)
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                        {c.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <button
                        onClick={() => handleOpenEdit(c)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-slate-500" />
                        <span>Ubah Bobot</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab Babak */}
      {activeTab === 'babak' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Babak Kompetisi MTQ</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {['Penyisihan', 'Perempat Final', 'Semi Final', 'Final'].map((b, i) => (
              <div key={b} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <span className="text-[10px] font-bold text-slate-400 font-mono">
                  URUTAN 0{i + 1}
                </span>
                <p className="text-sm font-bold text-slate-900 mt-1">{b}</p>
                <p className="text-xs text-emerald-700 mt-1">Status: Aktif</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Jenjang */}
      {activeTab === 'jenjang' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Jenjang Usia Peserta</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { name: 'Ula (Kanak-kanak)', age: 'Maks. 12 Tahun' },
              { name: 'Wustha (Remaja)', age: 'Maks. 17 Tahun' },
              { name: 'Ulya (Dewasa)', age: 'Maks. 40 Tahun' },
              { name: 'Jami\'ah (Mahasiswa)', age: 'Maks. 25 Tahun' }
            ].map((j) => (
              <div key={j.name} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <p className="text-sm font-bold text-slate-900">{j.name}</p>
                <p className="text-xs text-slate-500 mt-1">Batas Usia: {j.age}</p>
                <p className="text-xs text-emerald-700 mt-2">Terdaftar 12 Peserta</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Cabang */}
      {activeTab === 'cabang' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">Cabang & Golongan Musabaqah</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {[
              'Tilawah Al-Qur\'an Dewasa Putra',
              'Tilawah Al-Qur\'an Dewasa Putri',
              'Hifzhil Qur\'an 10 Juz',
              'Hifzhil Qur\'an 20 Juz',
              'Hifzhil Qur\'an 30 Juz',
              'Tafsir Al-Qur\'an Bahasa Arab'
            ].map((c) => (
              <div key={c} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <p className="font-bold text-slate-900">{c}</p>
                <p className="text-slate-500 mt-1">Rubrik: Standar LPTQ 2024</p>
                <p className="text-emerald-700 mt-2 font-semibold">Aktif pada Event Ini</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab Hakim */}
      {activeTab === 'hakim' && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Daftar Dewan Hakim & Penugasan</h3>
          <div className="space-y-3">
            {users
              .filter((u) => u.role === 'judge')
              .map((j) => (
                <div
                  key={j.id}
                  className="p-4 rounded-xl border border-slate-200 flex items-center justify-between"
                >
                  <div>
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                      {j.judgeCategory}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">{j.name}</h4>
                    <p className="text-xs text-slate-500">
                      {j.judgeField} · {j.mimbarLocation}
                    </p>
                  </div>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
                    Otoritas Penilaian Aktif
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Modal Ubah Bobot Pengurangan */}
      {editingCategory && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveEdit}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div>
                <span className="text-xs font-mono font-bold text-emerald-700">
                  {editingCategory.code}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  Ubah Bobot: {editingCategory.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Besaran Pengurangan per Kejadian (Poin)
              </label>
              <input
                type="number"
                step="0.25"
                min="0.25"
                max="10.00"
                required
                value={newDeductionValue}
                onChange={(e) => setNewDeductionValue(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none font-mono font-bold text-rose-600"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Misal: 0.50 poin (kesalahan ringan/sedang) atau 1.00 poin (kesalahan jali).
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs"
              >
                Simpan Perubahan Bobot
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
