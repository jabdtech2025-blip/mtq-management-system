import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Layers,
  GraduationCap,
  Trophy,
  Users,
  AlertCircle,
  Pencil,
  Plus,
  Trash2,
  X,
  Check,
  CheckCircle2
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { ErrorCategory, CompetitionStage, JudgeAssignment } from '../../types/mtq';

type MasterTab = 'kategori' | 'babak' | 'jenjang' | 'cabang' | 'hakim';

interface GenericItem {
  id: string;
  name: string;
  code: string;
  description?: string;
  status: 'Aktif' | 'Nonaktif';
}

export const MasterDataView: React.FC = () => {
  const {
    errorCategories,
    updateCategoryDeduction,
    addErrorCategory,
    updateErrorCategory,
    stages,
    addStage,
    updateStage,
    judgeAssignments,
    addJudgeAssignment,
    removeJudgeAssignment,
    users
  } = useMtq();

  const [activeTab, setActiveTab] = useState<MasterTab>('kategori');

  // Categories Modal State
  const [editingCategory, setEditingCategory] = useState<ErrorCategory | null>(null);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [catScope, setCatScope] = useState('');
  const [catDeduction, setCatDeduction] = useState<number>(0.5);

  // Babak Modal State
  const [isAddStageOpen, setIsAddStageOpen] = useState(false);
  const [stageName, setStageName] = useState('');
  const [stageOrder, setStageOrder] = useState<number>(stages.length + 1);
  const [stageQuota, setStageQuota] = useState<number>(3);
  const [stageBranch, setStageBranch] = useState('Tilawah Dewasa Putra');

  // Jenjang & Cabang local prototypes
  const [jenjangList, setJenjangList] = useState<GenericItem[]>([
    { id: 'j-1', name: 'Mutawassit (Tingkat Dasar)', code: 'MTW', status: 'Aktif' },
    { id: 'j-2', name: 'Ulya (Tingkat Lanjutan/Dewasa)', code: 'ULY', status: 'Aktif' },
    { id: 'j-3', name: 'Jami’ah (Tingkat Perguruan Tinggi)', code: 'JAM', status: 'Aktif' }
  ]);

  const [cabangList, setCabangList] = useState<GenericItem[]>([
    { id: 'cb-1', name: 'Tilawah Dewasa Putra', code: 'TLW-PA', status: 'Aktif' },
    { id: 'cb-2', name: 'Tilawah Dewasa Putri', code: 'TLW-PI', status: 'Aktif' },
    { id: 'cb-3', name: 'Hifzhil Qur’an 10 Juz', code: 'HQ-10', status: 'Aktif' },
    { id: 'cb-4', name: 'Hifzhil Qur’an 30 Juz', code: 'HQ-30', status: 'Aktif' }
  ]);

  // Generic add state
  const [isAddGenericOpen, setIsAddGenericOpen] = useState(false);
  const [genericName, setGenericName] = useState('');
  const [genericCode, setGenericCode] = useState('');

  // Penugasan Hakim Modal
  const [isAssignJudgeOpen, setIsAssignJudgeOpen] = useState(false);
  const [selectedJudgeId, setSelectedJudgeId] = useState(users.find((u) => u.role === 'judge')?.id || '');
  const [assignStageName, setAssignStageName] = useState('Penyisihan');
  const [assignBranchName, setAssignBranchName] = useState('Tilawah Dewasa Putra');
  const [assignField, setAssignField] = useState('Bidang Tajwid & Makhraj');

  const tabs: { id: MasterTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'kategori',
      label: `Kategori & Bobot (${errorCategories.length})`,
      icon: <SlidersHorizontal className="w-3.5 h-3.5" />
    },
    {
      id: 'babak',
      label: `Babak Musabaqah (${stages.length})`,
      icon: <Layers className="w-3.5 h-3.5" />
    },
    {
      id: 'jenjang',
      label: `Jenjang Usia (${jenjangList.length})`,
      icon: <GraduationCap className="w-3.5 h-3.5" />
    },
    {
      id: 'cabang',
      label: `Cabang / Golongan (${cabangList.length})`,
      icon: <Trophy className="w-3.5 h-3.5" />
    },
    {
      id: 'hakim',
      label: `Penugasan Hakim (${judgeAssignments.length})`,
      icon: <Users className="w-3.5 h-3.5" />
    }
  ];

  // Save Category
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      updateErrorCategory(editingCategory.id, {
        name: catName,
        code: catCode.toUpperCase(),
        scope: catScope,
        defaultDeduction: Number(catDeduction)
      });
      setEditingCategory(null);
    } else {
      addErrorCategory({
        name: catName,
        code: catCode.toUpperCase(),
        scope: catScope,
        defaultDeduction: Number(catDeduction),
        methodType: 'Pengurangan tetap',
        status: 'Aktif',
        order: errorCategories.length + 1
      });
      setIsAddCategoryOpen(false);
    }
    setCatName('');
    setCatCode('');
    setCatScope('');
  };

  // Save Stage
  const handleSaveStage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stageName) return;
    addStage({
      name: stageName,
      order: Number(stageOrder),
      branchName: stageBranch,
      status: 'Menunggu',
      qualificationQuota: Number(stageQuota),
      qualificationMethod: 'top_n',
      isFinalized: false
    });
    setStageName('');
    setIsAddStageOpen(false);
  };

  // Save Generic Item (Jenjang/Cabang)
  const handleSaveGeneric = (e: React.FormEvent) => {
    e.preventDefault();
    if (!genericName || !genericCode) return;
    const newItem: GenericItem = {
      id: 'item-' + Date.now(),
      name: genericName,
      code: genericCode.toUpperCase(),
      status: 'Aktif'
    };
    if (activeTab === 'jenjang') {
      setJenjangList((prev) => [...prev, newItem]);
    } else {
      setCabangList((prev) => [...prev, newItem]);
    }
    setGenericName('');
    setGenericCode('');
    setIsAddGenericOpen(false);
  };

  // Save Judge Assignment
  const handleSaveJudgeAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    const judgeObj = users.find((u) => u.id === selectedJudgeId);
    if (!judgeObj) return;

    addJudgeAssignment({
      judgeId: judgeObj.id,
      judgeName: judgeObj.name,
      stageName: assignStageName,
      branchName: assignBranchName,
      judgeField: assignField
    });
    setIsAssignJudgeOpen(false);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
            Master Data & Konfigurasi Rubrik
          </h1>
          <span className="text-[11px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
            Rubrik: v2.4 (Standar LPTQ)
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Konfigurasi bobot pengurangan kesalahan, struktur babak perlombaan, jenjang, cabang, serta dewan juri penilai
        </p>
      </div>

      {/* Tab Navigation */}
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

      {/* Explanatory Alert Box */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 flex items-start gap-3 text-xs">
        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-slate-700 leading-relaxed">
          <span className="font-bold text-slate-900">Ketentuan Versi Rubrik:</span> Penyesuaian bobot pengurangan atau formula penilaian pada tabel di bawah ini akan diterapkan pada penilaian baru atau versi rubrik yang diperbarui. Penilaian yang telah difinalisasi tetap terlindungi dan tersimpan sesuai bobot saat difinalisasi.
        </p>
      </div>

      {/* Tab 1: Kategori Kesalahan & Bobot */}
      {activeTab === 'kategori' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Daftar Kategori Kesalahan, Bobot & Metode Pengurangan
            </h3>
            <button
              onClick={() => {
                setEditingCategory(null);
                setCatName('');
                setCatCode('');
                setCatScope('');
                setCatDeduction(0.5);
                setIsAddCategoryOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Kategori</span>
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                <th className="px-5 py-3 w-16">Kode</th>
                <th className="px-5 py-3">Nama Kategori & Cakupan Kesalahan</th>
                <th className="px-4 py-3 text-right">Bobot Pengurangan</th>
                <th className="px-4 py-3">Metode</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {errorCategories.map((cat) => (
                <tr key={cat.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-mono font-bold text-slate-900">{cat.code}</td>
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{cat.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{cat.scope}</p>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono font-extrabold text-rose-600">
                    -{cat.defaultDeduction.toFixed(2)} pts
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{cat.methodType}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setEditingCategory(cat);
                        setCatName(cat.name);
                        setCatCode(cat.code);
                        setCatScope(cat.scope);
                        setCatDeduction(cat.defaultDeduction);
                        setIsAddCategoryOpen(true);
                      }}
                      className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg inline-flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Babak Musabaqah */}
      {activeTab === 'babak' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Konfigurasi Babak & Kuota Kelulusan
            </h3>
            <button
              onClick={() => setIsAddStageOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Babak</span>
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                <th className="px-5 py-3 w-16">Urutan</th>
                <th className="px-5 py-3">Nama Babak</th>
                <th className="px-4 py-3">Cabang</th>
                <th className="px-4 py-3 text-center">Kuota Lolos</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stages.map((stg) => (
                <tr key={stg.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-mono font-bold text-slate-900">#{stg.order}</td>
                  <td className="px-5 py-3.5 font-bold text-slate-900">{stg.name}</td>
                  <td className="px-4 py-3.5 text-slate-600">{stg.branchName}</td>
                  <td className="px-4 py-3.5 text-center font-mono font-bold text-emerald-800">
                    Top {stg.qualificationQuota} Peserta
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        stg.status === 'Aktif'
                          ? 'bg-emerald-100 text-emerald-800'
                          : stg.status === 'Selesai'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {stg.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() =>
                        updateStage(stg.id, {
                          status: stg.status === 'Aktif' ? 'Menunggu' : 'Aktif'
                        })
                      }
                      className="text-xs text-emerald-800 font-bold hover:underline"
                    >
                      {stg.status === 'Aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 3: Jenjang Usia */}
      {activeTab === 'jenjang' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Tingkat & Jenjang Usia Musabaqah
            </h3>
            <button
              onClick={() => setIsAddGenericOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Jenjang</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {jenjangList.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded mr-2">
                    {item.code}
                  </span>
                  <span className="font-bold text-slate-900">{item.name}</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Cabang / Golongan */}
      {activeTab === 'cabang' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Daftar Cabang & Golongan Musabaqah
            </h3>
            <button
              onClick={() => setIsAddGenericOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Cabang</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {cabangList.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded mr-2">
                    {item.code}
                  </span>
                  <span className="font-bold text-slate-900">{item.name}</span>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Penugasan Hakim */}
      {activeTab === 'hakim' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Penugasan Dewan Hakim per Babak & Bidang
            </h3>
            <button
              onClick={() => setIsAssignJudgeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Penugasan Hakim</span>
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                <th className="px-5 py-3">Nama Dewan Hakim</th>
                <th className="px-5 py-3">Babak</th>
                <th className="px-4 py-3">Cabang</th>
                <th className="px-4 py-3">Bidang Penilaian</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {judgeAssignments.map((ja) => (
                <tr key={ja.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-bold text-slate-900">{ja.judgeName}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-800">{ja.stageName}</td>
                  <td className="px-4 py-3.5 text-slate-600">{ja.branchName}</td>
                  <td className="px-4 py-3.5 font-medium text-emerald-800">{ja.judgeField}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => removeJudgeAssignment(ja.id)}
                      className="p-1 text-slate-400 hover:text-rose-700 rounded"
                      title="Hapus Penugasan"
                    >
                      <Trash2 className="w-4 h-4 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Category Modal */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">
              {editingCategory ? 'Edit Kategori Kesalahan' : 'Tambah Kategori Kesalahan'}
            </h3>
            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Kode Kategori</label>
                <input
                  type="text"
                  value={catCode}
                  onChange={(e) => setCatCode(e.target.value)}
                  required
                  placeholder="e.g. MKH"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Kategori</label>
                <input
                  type="text"
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  required
                  placeholder="e.g. Makharijul Huruf"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Bobot Pengurangan Default (Poin)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0.1"
                  max="10"
                  value={catDeduction}
                  onChange={(e) => setCatDeduction(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Cakupan Penilaian</label>
                <textarea
                  value={catScope}
                  onChange={(e) => setCatScope(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  placeholder="Rincian kesalahan tajwid, waqf, dll..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold"
                >
                  Simpan Kategori
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Stage Modal */}
      {isAddStageOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">Tambah Babak Baru</h3>
            <form onSubmit={handleSaveStage} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Babak</label>
                <input
                  type="text"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  required
                  placeholder="e.g. Semifinal"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Nomor Urutan</label>
                  <input
                    type="number"
                    min={1}
                    value={stageOrder}
                    onChange={(e) => setStageOrder(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Kuota Lolos (Top-N)</label>
                  <input
                    type="number"
                    min={1}
                    value={stageQuota}
                    onChange={(e) => setStageQuota(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddStageOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold"
                >
                  Simpan Babak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Generic (Jenjang/Cabang) Modal */}
      {isAddGenericOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">
              Tambah {activeTab === 'jenjang' ? 'Jenjang Usia' : 'Cabang'}
            </h3>
            <form onSubmit={handleSaveGeneric} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Kode</label>
                <input
                  type="text"
                  value={genericCode}
                  onChange={(e) => setGenericCode(e.target.value)}
                  required
                  placeholder="e.g. TLW-PI"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                />
              </div>
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama</label>
                <input
                  type="text"
                  value={genericName}
                  onChange={(e) => setGenericName(e.target.value)}
                  required
                  placeholder="e.g. Tilawah Dewasa Putri"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAddGenericOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold"
                >
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Judge Modal */}
      {isAssignJudgeOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">Penugasan Hakim</h3>
            <form onSubmit={handleSaveJudgeAssignment} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Pilih Dewan Hakim</label>
                <select
                  value={selectedJudgeId}
                  onChange={(e) => setSelectedJudgeId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {users
                    .filter((u) => u.role === 'judge')
                    .map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name} ({j.judgeCategory || 'Hakim'})
                      </option>
                    ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Babak</label>
                  <select
                    value={assignStageName}
                    onChange={(e) => setAssignStageName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Bidang Penilaian</label>
                  <input
                    type="text"
                    value={assignField}
                    onChange={(e) => setAssignField(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsAssignJudgeOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold"
                >
                  Simpan Penugasan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
