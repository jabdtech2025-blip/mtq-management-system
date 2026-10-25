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
    users,
    jenjangList,
    cabangList,
    addJenjang,
    updateJenjang,
    deleteJenjang,
    addCabang,
    updateCabang,
    deleteCabang
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

  // Generic add state
  const [isAddGenericOpen, setIsAddGenericOpen] = useState(false);
  const [genericName, setGenericName] = useState('');
  const [genericCode, setGenericCode] = useState('');

  // Delete Guard Warning State
  const [deleteWarningItem, setDeleteWarningItem] = useState<{
    type: 'jenjang' | 'cabang';
    id: string;
    name: string;
    activeCount: number;
    message: string;
  } | null>(null);

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
    if (activeTab === 'jenjang') {
      addJenjang({
        name: genericName,
        code: genericCode.toUpperCase(),
        status: 'Aktif'
      });
    } else {
      addCabang({
        name: genericName,
        code: genericCode.toUpperCase(),
        status: 'Aktif'
      });
    }
    setGenericName('');
    setGenericCode('');
    setIsAddGenericOpen(false);
  };

  // Delete Guard handler
  const handleDeleteMasterItem = (type: 'jenjang' | 'cabang', item: { id: string; name: string }) => {
    if (type === 'jenjang') {
      const res = deleteJenjang(item.id);
      if (!res.success && res.activeCount && res.activeCount > 0) {
        setDeleteWarningItem({
          type,
          id: item.id,
          name: item.name,
          activeCount: res.activeCount,
          message: res.message
        });
      }
    } else {
      const res = deleteCabang(item.id);
      if (!res.success && res.activeCount && res.activeCount > 0) {
        setDeleteWarningItem({
          type,
          id: item.id,
          name: item.name,
          activeCount: res.activeCount,
          message: res.message
        });
      }
    }
  };

  // Deactivate instead of delete
  const handleDeactivateWarningItem = () => {
    if (!deleteWarningItem) return;
    if (deleteWarningItem.type === 'jenjang') {
      updateJenjang(deleteWarningItem.id, { status: 'Nonaktif' });
    } else {
      updateCabang(deleteWarningItem.id, { status: 'Nonaktif' });
    }
    setDeleteWarningItem(null);
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
                  ? 'bg-emerald-800 text-white shadow-2xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
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
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Tingkat & Jenjang Usia Musabaqah
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pengelompokan usia peserta musabaqah
              </p>
            </div>
            <button
              onClick={() => setIsAddGenericOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Jenjang</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {jenjangList.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {item.code}
                  </span>
                  <span className="font-bold text-slate-900">{item.name}</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() =>
                      updateJenjang(item.id, {
                        status: item.status === 'Aktif' ? 'Nonaktif' : 'Aktif'
                      })
                    }
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full cursor-pointer transition-colors ${
                      item.status === 'Aktif'
                        ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                    }`}
                    title="Klik untuk ubah status"
                  >
                    {item.status}
                  </button>

                  <button
                    onClick={() => handleDeleteMasterItem('jenjang', item)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Hapus Jenjang"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Cabang / Golongan */}
      {activeTab === 'cabang' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Daftar Cabang & Golongan Musabaqah
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Kategori cabang tilawah, hifzhil quran, dan golongan perlombaan
              </p>
            </div>
            <button
              onClick={() => setIsAddGenericOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Cabang</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {cabangList.map((item) => (
              <div key={item.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {item.code}
                  </span>
                  <span className="font-bold text-slate-900">{item.name}</span>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() =>
                      updateCabang(item.id, {
                        status: item.status === 'Aktif' ? 'Nonaktif' : 'Aktif'
                      })
                    }
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full cursor-pointer transition-colors ${
                      item.status === 'Aktif'
                        ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                        : 'text-slate-500 bg-slate-100 hover:bg-slate-200'
                    }`}
                    title="Klik untuk ubah status"
                  >
                    {item.status}
                  </button>

                  <button
                    onClick={() => handleDeleteMasterItem('cabang', item)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Hapus Cabang"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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

      {/* Delete Guard Warning Modal with Deactivate Option */}
      {deleteWarningItem && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-amber-600 mb-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Data Tidak Dapat Dihapus Permanen
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {deleteWarningItem.type === 'jenjang' ? 'Jenjang Usia' : 'Cabang'}: {deleteWarningItem.name}
                </p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5 mb-5 text-xs text-slate-700 leading-relaxed">
              <p>
                Item ini terhubung aktif dengan <strong className="text-amber-900 font-bold">{deleteWarningItem.activeCount} data musabaqah</strong> (peserta, babak kompetisi, atau paket soal).
              </p>
              <p className="mt-1.5 text-slate-600">
                Menghapusnya secara permanen akan merusak referensi data nilai yang sudah berjalan. Anda disarankan untuk <strong>menonaktifkannya</strong> agar tidak muncul di pilihan baru tanpa menghapus data terkait.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeleteWarningItem(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeactivateWarningItem}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
              >
                Nonaktifkan Saja
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
