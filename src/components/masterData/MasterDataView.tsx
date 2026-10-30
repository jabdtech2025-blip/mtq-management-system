import React, { useState, useMemo } from 'react';
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
  CheckCircle2,
  BookOpen,
  ArrowUpDown,
  Shield,
  FileText,
  Copy,
  Archive,
  Sparkles
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import {
  ErrorCategory,
  CompetitionStage,
  JudgeAssignment,
  RubricVersion,
  RubricField,
  CompetitionRuleConfig
} from '../../types/mtq';

type MasterTab = 'kategori' | 'rubrik' | 'aturan_cabang' | 'babak' | 'jenjang' | 'cabang' | 'hakim';

export const MasterDataView: React.FC = () => {
  const {
    errorCategories,
    addErrorCategory,
    updateErrorCategory,
    stages,
    addStage,
    updateStage,
    deleteStage,
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
    deleteCabang,
    rubricVersions,
    competitionRules,
    addRubricVersion,
    updateRubricVersion,
    activateRubricVersion,
    archiveRubricVersion,
    deleteRubricVersion,
    addCompetitionRule,
    updateCompetitionRule,
    deleteCompetitionRule
  } = useMtq();

  const [activeTab, setActiveTab] = useState<MasterTab>('kategori');

  // Available Rubric Fields cache for relational mapping
  const availableRubricFields = useMemo(() => {
    const fieldsMap = new Map<string, { id: string; name: string; code: string; rubricName: string }>();
    rubricVersions.forEach((r) => {
      r.fields.forEach((f) => {
        if (!fieldsMap.has(f.id)) {
          fieldsMap.set(f.id, { id: f.id, name: f.name, code: f.code, rubricName: r.name });
        }
      });
    });
    return Array.from(fieldsMap.values());
  }, [rubricVersions]);

  // Categories Modal State
  const [editingCategory, setEditingCategory] = useState<ErrorCategory | null>(null);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [catName, setCatName] = useState('');
  const [catCode, setCatCode] = useState('');
  const [catScope, setCatScope] = useState('');
  const [catFieldId, setCatFieldId] = useState('');
  const [catDeduction, setCatDeduction] = useState<number>(0.5);

  // Rubric Modal States
  const [isAddRubricOpen, setIsAddRubricOpen] = useState(false);
  const [newRubricName, setNewRubricName] = useState('');
  const [newRubricCode, setNewRubricCode] = useState('');
  const [newRubricBranch, setNewRubricBranch] = useState('Tilawah');
  const [newRubricVersion, setNewRubricVersion] = useState('2025.2');
  const [newRubricStartingScore, setNewRubricStartingScore] = useState<number>(100);
  const [newRubricOfficialSource, setNewRubricOfficialSource] = useState('Buku Pedoman MTQ 2025 LPTQ');
  const [newRubricDescription, setNewRubricDescription] = useState('');

  // Field Edit / Add Modal State
  const [editingRubric, setEditingRubric] = useState<RubricVersion | null>(null);
  const [editingField, setEditingField] = useState<RubricField | null>(null);
  const [isEditFieldOpen, setIsEditFieldOpen] = useState(false);
  const [fieldName, setFieldName] = useState('');
  const [fieldCode, setFieldCode] = useState('');
  const [fieldMaxScore, setFieldMaxScore] = useState<number>(30);
  const [fieldMinScore, setFieldMinScore] = useState<number>(0);
  const [fieldOrder, setFieldOrder] = useState<number>(1);
  const [fieldDescription, setFieldDescription] = useState('');

  // Rule Config Modal State
  const [editingRule, setEditingRule] = useState<CompetitionRuleConfig | null>(null);
  const [isEditRuleOpen, setIsEditRuleOpen] = useState(false);
  const [ruleBranchName, setRuleBranchName] = useState('Tilawah');
  const [ruleRubricId, setRuleRubricId] = useState('');
  const [ruleTieBreakInput, setRuleTieBreakInput] = useState('total, Tajwid, Lagu, Fashahah');
  const [ruleQuotaPenyisihan, setRuleQuotaPenyisihan] = useState<number>(3);
  const [ruleQuotaFinal, setRuleQuotaFinal] = useState<number>(3);
  const [ruleOfficialSource, setRuleOfficialSource] = useState('Buku Pedoman MTQ 2025');
  const [ruleIsVerified, setRuleIsVerified] = useState(true);

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
  const [rubricToDelete, setRubricToDelete] = useState<RubricVersion | null>(null);
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

  // Feedback notifications
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tabs: { id: MasterTab; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'kategori',
      label: `Kategori & Bobot (${errorCategories.length})`,
      icon: <SlidersHorizontal className="w-3.5 h-3.5" />
    },
    {
      id: 'rubrik',
      label: `Rubrik & Bidang (${rubricVersions.length})`,
      icon: <Layers className="w-3.5 h-3.5" />
    },
    {
      id: 'aturan_cabang',
      label: `Aturan Cabang & Tie-Break (${competitionRules.length})`,
      icon: <Trophy className="w-3.5 h-3.5" />
    },
    {
      id: 'babak',
      label: `Babak Musabaqah (${stages.length})`,
      icon: <BookOpen className="w-3.5 h-3.5" />
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

  // Save Category with explicit fieldId
  const handleSaveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCategory) {
      updateErrorCategory(editingCategory.id, {
        name: catName,
        code: catCode.toUpperCase(),
        scope: catScope,
        fieldId: catFieldId || undefined,
        defaultDeduction: Number(catDeduction)
      });
      setEditingCategory(null);
    } else {
      addErrorCategory({
        name: catName,
        code: catCode.toUpperCase(),
        scope: catScope,
        fieldId: catFieldId || undefined,
        defaultDeduction: Number(catDeduction),
        methodType: 'Pengurangan tetap',
        status: 'Aktif',
        order: errorCategories.length + 1
      });
    }
    setIsAddCategoryOpen(false);
    setCatName('');
    setCatCode('');
    setCatScope('');
    setCatFieldId('');
    setFeedbackMessage({ type: 'success', text: 'Kategori kesalahan berhasil disimpan dengan relasi bidang yang sah.' });
  };

  // Save Rubric Version
  const handleSaveRubricVersion = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRubricName || !newRubricCode) return;

    // Default 4 fields for new rubric template
    const defaultFields: RubricField[] = [
      { id: `fld-${Date.now()}-1`, code: 'TJW', name: 'Tajwid', maxScore: 30, minScore: 0, order: 1 },
      { id: `fld-${Date.now()}-2`, code: 'FSH', name: 'Fashahah', maxScore: 30, minScore: 0, order: 2 },
      { id: `fld-${Date.now()}-3`, code: 'LAG', name: 'Lagu', maxScore: 25, minScore: 0, order: 3 },
      { id: `fld-${Date.now()}-4`, code: 'SUA', name: 'Suara', maxScore: 15, minScore: 0, order: 4 }
    ];

    addRubricVersion({
      code: newRubricCode.toUpperCase(),
      name: newRubricName,
      branchCode: newRubricBranch.substring(0, 3).toUpperCase(),
      branchName: newRubricBranch,
      version: newRubricVersion,
      description: newRubricDescription || 'Konfigurasi rubrik penilaian MTQ.',
      officialSource: newRubricOfficialSource,
      status: 'Draft',
      startingScore: Number(newRubricStartingScore),
      fields: defaultFields
    });

    setIsAddRubricOpen(false);
    setNewRubricName('');
    setNewRubricCode('');
    setFeedbackMessage({ type: 'success', text: `Draft versi rubrik baru "${newRubricName}" berhasil dibuat.` });
  };

  // Save Field Edit or Add New Field
  const handleSaveFieldEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRubric) return;

    let updatedFields: RubricField[];
    if (editingField) {
      updatedFields = editingRubric.fields.map((f) => {
        if (f.id === editingField.id) {
          return {
            ...f,
            name: fieldName,
            code: fieldCode.toUpperCase(),
            maxScore: Number(fieldMaxScore),
            minScore: Number(fieldMinScore),
            order: Number(fieldOrder) || f.order,
            description: fieldDescription
          };
        }
        return f;
      });
    } else {
      const newField: RubricField = {
        id: `fld-${editingRubric.id}-${Date.now()}`,
        code: fieldCode.toUpperCase(),
        name: fieldName,
        maxScore: Number(fieldMaxScore),
        minScore: Number(fieldMinScore),
        order: Number(fieldOrder) || editingRubric.fields.length + 1,
        status: 'Aktif',
        description: fieldDescription,
        criteria: []
      };
      updatedFields = [...editingRubric.fields, newField];
    }

    const res = updateRubricVersion(editingRubric.id, { fields: updatedFields });
    setIsEditFieldOpen(false);
    setEditingRubric(null);
    setEditingField(null);
    setFeedbackMessage({
      type: res.success ? 'success' : 'error',
      text: res.success
        ? editingField
          ? `Bidang "${fieldName}" berhasil diperbarui (Skor: ${fieldMinScore}–${fieldMaxScore}).`
          : `Bidang baru "${fieldName}" (${fieldCode.toUpperCase()}) berhasil ditambahkan ke rubrik.`
        : res.message
    });
  };

  // Toggle or Remove Rubric Field
  const handleToggleOrRemoveField = (rubric: RubricVersion, fld: RubricField, mode: 'toggle' | 'remove') => {
    const updatedFields =
      mode === 'remove'
        ? rubric.fields.filter((f) => f.id !== fld.id)
        : rubric.fields.map((f) =>
            f.id === fld.id
              ? { ...f, status: (f.status === 'Nonaktif' ? 'Aktif' : 'Nonaktif') as 'Aktif' | 'Nonaktif' }
              : f
          );
    const res = updateRubricVersion(rubric.id, { fields: updatedFields });
    setFeedbackMessage({
      type: res.success ? 'success' : 'error',
      text: res.success
        ? mode === 'remove'
          ? `Bidang "${fld.name}" berhasil dihapus dari versi rubrik.`
          : `Status bidang "${fld.name}" berhasil diperbarui.`
        : res.message
    });
  };

  // Save Competition Rule Config
  const handleSaveRuleConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const tieBreakOrder = ruleTieBreakInput.split(',').map((s) => s.trim()).filter(Boolean);
    const quotaPerStage: Record<string, number> = {
      Penyisihan: Number(ruleQuotaPenyisihan) || 3,
      Final: Number(ruleQuotaFinal) || 3
    };

    if (editingRule) {
      updateCompetitionRule(editingRule.id, {
        branchName: ruleBranchName,
        rubricVersionId: ruleRubricId,
        tieBreakOrder,
        quotaPerStage,
        officialSource: ruleOfficialSource,
        isVerifiedOfficial: ruleIsVerified
      });
      setEditingRule(null);
    } else {
      addCompetitionRule({
        branchName: ruleBranchName,
        rubricVersionId: ruleRubricId || (rubricVersions[0]?.id || 'rubric-seni-baca-2025'),
        tieBreakOrder,
        quotaPerStage,
        officialSource: ruleOfficialSource,
        isVerifiedOfficial: ruleIsVerified,
        status: 'Aktif'
      });
    }

    setIsEditRuleOpen(false);
    setFeedbackMessage({ type: 'success', text: `Aturan kompetisi untuk cabang "${ruleBranchName}" berhasil disimpan.` });
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
    setFeedbackMessage({ type: 'success', text: `Babak "${stageName}" berhasil ditambahkan.` });
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
    setFeedbackMessage({ type: 'success', text: 'Data master berhasil disimpan.' });
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
    setFeedbackMessage({ type: 'success', text: `Penugasan hakim ${judgeObj.name} berhasil disimpan.` });
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Master Data & Konfigurasi Kompetisi
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Pengelolaan rubrik dinamis, pemetaan kategori kesalahan, aturan tie-break, babak, dan penugasan dewan hakim.
        </p>
      </div>

      {/* Feedback Banner */}
      {feedbackMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-semibold ${
            feedbackMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-700" />
            )}
            <span>{feedbackMessage.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="p-1 hover:opacity-75 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200/80 pb-3">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
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

      {/* Tab 1: Kategori Kesalahan & Pemetaan Bidang Rubrik */}
      {activeTab === 'kategori' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Daftar Kategori Kesalahan & Pemetaan Relasional ke Bidang Rubrik
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Setiap kategori wajib terhubung ke bidang rubrik yang valid untuk memastikan potongan nilai terisolasi dan tidak salah potong.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingCategory(null);
                setCatName('');
                setCatCode('');
                setCatScope('');
                setCatFieldId(availableRubricFields[0]?.id || '');
                setCatDeduction(0.5);
                setIsAddCategoryOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer shadow-xs"
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
                <th className="px-4 py-3">Bidang Rubrik Terkait (P0)</th>
                <th className="px-4 py-3 text-right">Bobot Pengurangan</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {errorCategories.map((cat) => {
                const mappedField = availableRubricFields.find((f) => f.id === cat.fieldId);
                return (
                  <tr key={cat.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900">{cat.code}</td>
                    <td className="px-5 py-3.5">
                      <p className="font-bold text-slate-900">{cat.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{cat.scope}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      {mappedField ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                          {mappedField.name}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                          ⚠️ Belum Dipetakan
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono font-extrabold text-rose-600">
                      -{cat.defaultDeduction.toFixed(2)} pts
                    </td>
                    <td className="px-4 py-3.5 text-center">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          cat.status === 'Aktif' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {cat.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => {
                          setEditingCategory(cat);
                          setCatName(cat.name);
                          setCatCode(cat.code);
                          setCatScope(cat.scope);
                          setCatFieldId(cat.fieldId || '');
                          setCatDeduction(cat.defaultDeduction);
                          setIsAddCategoryOpen(true);
                        }}
                        className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 2: Rubrik & Bidang Penilaian Dinamis (P0) */}
      {activeTab === 'rubrik' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-extrabold text-slate-800">
                Konfigurasi Versi Rubrik Penilaian (Rubric Lifecycle)
              </h2>
              <p className="text-xs text-slate-500">
                Siklus versi rubrik: Draft ➔ Validasi ➔ Aktif ➔ Diarsipkan. Rubrik yang aktif menentukan batas nilai bidang dan scoring engine secara dinamis.
              </p>
            </div>
            <button
              onClick={() => {
                setNewRubricName('Rubrik Kustom Seni Baca 2026');
                setNewRubricCode('RUBRIC-CUSTOM-2026');
                setNewRubricBranch('Tilawah');
                setNewRubricVersion('2026.1');
                setNewRubricStartingScore(100);
                setNewRubricOfficialSource('Regulasi LPTQ 2026');
                setIsAddRubricOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Buat Versi Rubrik Baru</span>
            </button>
          </div>

          <div className="grid grid-cols-1 gap-5">
            {rubricVersions.map((rubric) => {
              const activeFieldsList = rubric.fields.filter((f) => f.status !== 'Nonaktif' && f.status !== 'Arsip');
              const totalFieldsMax = activeFieldsList.reduce((acc, f) => acc + f.maxScore, 0);
              const isActive = rubric.status === 'Aktif';

              return (
                <div
                  key={rubric.id}
                  className={`bg-white rounded-xl border transition-all ${
                    isActive ? 'border-emerald-300 ring-1 ring-emerald-300 shadow-xs' : 'border-slate-200'
                  } p-5 space-y-4`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-extrabold text-sm text-slate-900">{rubric.name}</h3>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            rubric.status === 'Aktif'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rubric.status === 'Draft'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {rubric.status || 'Aktif'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 font-bold">
                          v{rubric.version}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Cabang: <strong className="text-slate-700">{rubric.branchName}</strong> · Sumber:{' '}
                        <span className="font-mono text-slate-600">{rubric.officialSource || 'Standar LPTQ'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setEditingRubric(rubric);
                          setEditingField(null);
                          setFieldName('Itqan');
                          setFieldCode('ITQ');
                          setFieldMaxScore(20);
                          setFieldMinScore(0);
                          setFieldOrder(rubric.fields.length + 1);
                          setFieldDescription('Ketepatan hafalan dan konsistensi bacaan');
                          setIsEditFieldOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-700 text-emerald-800 hover:bg-emerald-50 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Bidang</span>
                      </button>
                      {!isActive && (
                        <button
                          onClick={() => {
                            const res = activateRubricVersion(rubric.id);
                            setFeedbackMessage({
                              type: res.success ? 'success' : 'error',
                              text: res.message
                            });
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer shadow-xs"
                        >
                          Aktifkan Versi Ini
                        </button>
                      )}
                      {rubric.status !== 'Arsip' && (
                        <button
                          onClick={() => archiveRubricVersion(rubric.id)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                          title="Arsipkan Rubrik"
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setRubricToDelete(rubric)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer inline-flex items-center gap-1"
                        title="Hapus Versi Rubrik"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </div>

                  {/* Fields list in this Rubric */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>Komposisi Bidang Penilaian Dinamis ({activeFieldsList.length} Aktif / {rubric.fields.length} Total):</span>
                      <span className="font-mono text-emerald-800">
                        Total Skor Maks Aktif: {totalFieldsMax} / {rubric.startingScore}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                      {rubric.fields
                        .slice()
                        .sort((a, b) => (a.order || 0) - (b.order || 0))
                        .map((fld) => {
                          const isInactive = fld.status === 'Nonaktif' || fld.status === 'Arsip';
                          return (
                            <div
                              key={fld.id}
                              className={`p-3 rounded-lg border flex flex-col justify-between ${
                                isInactive
                                  ? 'bg-slate-100/70 border-slate-200 opacity-60'
                                  : 'bg-slate-50 border-slate-200/80'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-mono font-bold text-[10px] text-slate-500">
                                  #{fld.order} · {fld.code}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => {
                                      setEditingRubric(rubric);
                                      setEditingField(fld);
                                      setFieldName(fld.name);
                                      setFieldCode(fld.code);
                                      setFieldMaxScore(fld.maxScore);
                                      setFieldMinScore(fld.minScore || 0);
                                      setFieldOrder(fld.order || 1);
                                      setFieldDescription(fld.description || '');
                                      setIsEditFieldOpen(true);
                                    }}
                                    className="text-[11px] font-bold text-emerald-800 hover:text-emerald-900 cursor-pointer"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleToggleOrRemoveField(rubric, fld, 'toggle')}
                                    className="text-[10px] font-semibold text-slate-500 hover:text-amber-700 cursor-pointer"
                                    title={isInactive ? 'Aktifkan kembali bidang ini' : 'Nonaktifkan bidang ini'}
                                  >
                                    {isInactive ? 'Aktifkan' : 'Nonaktif'}
                                  </button>
                                  <button
                                    onClick={() => handleToggleOrRemoveField(rubric, fld, 'remove')}
                                    className="p-0.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                    title="Hapus Bidang Ini"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              <div className="font-extrabold text-sm text-slate-800">{fld.name}</div>
                              <div className="mt-2 pt-2 border-t border-slate-200 text-xs flex items-center justify-between font-mono">
                                <span className="text-slate-500">Rentang:</span>
                                <span className="font-extrabold text-slate-900">
                                  {fld.minScore ?? 0} – {fld.maxScore} pts
                                </span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Aturan Cabang & Tie-Break Dinamis (P0) */}
      {activeTab === 'aturan_cabang' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Konfigurasi Aturan Kompetisi, Prioritas Tie-Break & Kuota per Cabang
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Administrator dapat mengatur urutan pemutus nilai seri (tie-break) dan kuota kelulusan per cabang tanpa mengubah source code.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingRule(null);
                setRuleBranchName('Tahfizh 20 Juz');
                setRuleRubricId(rubricVersions[0]?.id || '');
                setRuleTieBreakInput('total, Tahfizh, Tajwid, Fashahah');
                setRuleQuotaPenyisihan(3);
                setRuleQuotaFinal(3);
                setRuleOfficialSource('Pedoman MTQ 2025');
                setRuleIsVerified(true);
                setIsEditRuleOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Aturan Cabang</span>
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                <th className="px-5 py-3">Cabang Lomba</th>
                <th className="px-5 py-3">Urutan Prioritas Tie-Break Resmi</th>
                <th className="px-4 py-3 text-center">Kuota Babak</th>
                <th className="px-4 py-3">Sumber Regulasi</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {competitionRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{rule.branchName}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      Rubrik ID: {rule.rubricVersionId}
                    </p>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1 flex-wrap">
                      {rule.tieBreakOrder.map((crit, idx) => (
                        <React.Fragment key={crit}>
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-[11px] font-semibold text-slate-700">
                            {idx + 1}. {crit}
                          </span>
                          {idx < rule.tieBreakOrder.length - 1 && (
                            <span className="text-slate-400">➔</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center font-mono">
                    {Object.entries(rule.quotaPerStage || {}).map(([stg, q]) => (
                      <span key={stg} className="inline-block mx-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded font-bold text-[10px]">
                        {stg}: {q}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="text-slate-700 text-[11px]">{rule.officialSource || 'Standar'}</p>
                    {rule.isVerifiedOfficial ? (
                      <span className="inline-flex items-center text-[10px] text-emerald-700 font-bold gap-0.5 mt-0.5">
                        <Check className="w-3 h-3" /> Terverifikasi Resmi
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] text-amber-700 font-bold gap-0.5 mt-0.5">
                        ⚠️ Konfigurasi Penyelenggara
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          setEditingRule(rule);
                          setRuleBranchName(rule.branchName);
                          setRuleRubricId(rule.rubricVersionId);
                          setRuleTieBreakInput(rule.tieBreakOrder.join(', '));
                          setRuleQuotaPenyisihan(rule.quotaPerStage?.['Penyisihan'] || 3);
                          setRuleQuotaFinal(rule.quotaPerStage?.['Final'] || 3);
                          setRuleOfficialSource(rule.officialSource || '');
                          setRuleIsVerified(Boolean(rule.isVerifiedOfficial));
                          setIsEditRuleOpen(true);
                        }}
                        className="p-1.5 text-slate-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => {
                          const res = deleteCompetitionRule(rule.id);
                          setFeedbackMessage({
                            type: res.success ? 'success' : 'error',
                            text: res.message
                          });
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                        title="Hapus Aturan Cabang"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 4: Babak Musabaqah */}
      {activeTab === 'babak' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Konfigurasi Babak & Kuota Kelulusan
            </h3>
            <button
              onClick={() => setIsAddStageOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Babak</span>
            </button>
          </div>

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px]">
                <th className="px-5 py-3 w-16 text-center">Urutan</th>
                <th className="px-5 py-3">Nama Babak</th>
                <th className="px-4 py-3">Cabang Terkait</th>
                <th className="px-4 py-3 text-center">Kuota Lolos</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stages.map((stg) => (
                <tr key={stg.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 text-center font-mono font-bold text-slate-500">
                    {stg.order}
                  </td>
                  <td className="px-5 py-3.5 font-bold text-slate-900">{stg.name}</td>
                  <td className="px-4 py-3.5 text-slate-600">{stg.branchName}</td>
                  <td className="px-4 py-3.5 text-center font-bold text-emerald-800 font-mono">
                    Top {stg.qualificationQuota}
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                        stg.isFinalized
                          ? 'bg-slate-100 text-slate-700'
                          : stg.status === 'Aktif'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {stg.isFinalized ? 'Final' : stg.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateStage(stg.id, {
                            status: stg.status === 'Aktif' ? 'Selesai' : 'Aktif'
                          })
                        }
                        className="text-xs text-slate-600 hover:text-emerald-800 font-semibold cursor-pointer"
                      >
                        Ubah Status
                      </button>
                      <button
                        onClick={() => {
                          const res = deleteStage(stg.id);
                          setFeedbackMessage({
                            type: res.success ? 'success' : 'error',
                            text: res.message
                          });
                        }}
                        disabled={stg.isFinalized}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg inline-flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title={stg.isFinalized ? 'Babak sudah disahkan dan tidak dapat dihapus' : 'Hapus Babak'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab 5: Jenjang Usia */}
      {activeTab === 'jenjang' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Jenjang Usia Musabaqah (Kategori Peserta)
            </h3>
            <button
              onClick={() => setIsAddGenericOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Jenjang</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {jenjangList.map((item) => (
              <div
                key={item.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700">
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

      {/* Tab 6: Cabang / Golongan */}
      {activeTab === 'cabang' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Cabang dan Golongan Musabaqah
            </h3>
            <button
              onClick={() => setIsAddGenericOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Cabang</span>
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {cabangList.map((item) => (
              <div
                key={item.id}
                className="p-4 flex items-center justify-between hover:bg-slate-50/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 rounded text-slate-700">
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

      {/* Tab 7: Penugasan Hakim */}
      {activeTab === 'hakim' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Penugasan Dewan Hakim per Babak & Bidang
            </h3>
            <button
              onClick={() => setIsAssignJudgeOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-800 text-white hover:bg-emerald-900 cursor-pointer shadow-xs"
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
                      className="p-1 text-slate-400 hover:text-rose-700 rounded cursor-pointer"
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

      {/* Add / Edit Category Modal with Relational Field Selector */}
      {isAddCategoryOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">
              {editingCategory ? 'Edit Kategori Kesalahan' : 'Tambah Kategori Kesalahan'}
            </h3>
            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
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
                  <label className="font-bold text-slate-600 block mb-1">
                    Bobot Pengurangan (Poin)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.05"
                    max="10"
                    value={catDeduction}
                    onChange={(e) => setCatDeduction(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
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

              {/* P0 Relational Mapping: FieldId */}
              <div>
                <label className="font-bold text-slate-700 block mb-1 flex items-center gap-1.5">
                  <span>Bidang Rubrik Terkait (P0 Relational ID)</span>
                  <span className="text-rose-500 font-bold">*</span>
                </label>
                <select
                  value={catFieldId}
                  onChange={(e) => setCatFieldId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white"
                >
                  <option value="">-- Pilih Bidang Rubrik Target --</option>
                  {availableRubricFields.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.code}) — {f.rubricName}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-500 mt-1">
                  Pengurangan kesalahan kategori ini akan dipotongkan secara eksplisit ke bidang rubrik yang dipilih.
                </p>
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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddCategoryOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold cursor-pointer hover:bg-emerald-900"
                >
                  Simpan Kategori
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add New Rubric Version Modal */}
      {isAddRubricOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">
              Buat Versi Rubrik Baru (Draft Lifecycle)
            </h3>
            <form onSubmit={handleSaveRubricVersion} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Kode Rubrik</label>
                  <input
                    type="text"
                    value={newRubricCode}
                    onChange={(e) => setNewRubricCode(e.target.value)}
                    required
                    placeholder="e.g. RUBRIC-TLW-2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Nomor Versi</label>
                  <input
                    type="text"
                    value={newRubricVersion}
                    onChange={(e) => setNewRubricVersion(e.target.value)}
                    required
                    placeholder="e.g. 2026.1"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Rubrik</label>
                <input
                  type="text"
                  value={newRubricName}
                  onChange={(e) => setNewRubricName(e.target.value)}
                  required
                  placeholder="e.g. Rubrik Resmi Seni Baca 2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Cabang Lomba</label>
                  <input
                    type="text"
                    value={newRubricBranch}
                    onChange={(e) => setNewRubricBranch(e.target.value)}
                    required
                    placeholder="e.g. Tilawah"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Skor Awal Default</label>
                  <input
                    type="number"
                    value={newRubricStartingScore}
                    onChange={(e) => setNewRubricStartingScore(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Rujukan Dokumen Resmi</label>
                <input
                  type="text"
                  value={newRubricOfficialSource}
                  onChange={(e) => setNewRubricOfficialSource(e.target.value)}
                  placeholder="e.g. Buku Pedoman MTQ 2025 hal. 42-45"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddRubricOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold cursor-pointer hover:bg-emerald-900"
                >
                  Simpan Draft Rubrik
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Add Field Modal */}
      {isEditFieldOpen && editingRubric && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">
              {editingField ? `Edit Batas Nilai Bidang: ${editingField.name}` : `Tambah Bidang ke ${editingRubric.name}`}
            </h3>
            <form onSubmit={handleSaveFieldEdit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Bidang</label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Kode Bidang</label>
                  <input
                    type="text"
                    value={fieldCode}
                    onChange={(e) => setFieldCode(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Urutan Tampil</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={fieldOrder}
                    onChange={(e) => setFieldOrder(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Nilai Minimal</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={fieldMinScore}
                    onChange={(e) => setFieldMinScore(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Nilai Maksimal</label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    max="100"
                    value={fieldMaxScore}
                    onChange={(e) => setFieldMaxScore(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono font-bold text-emerald-800"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Deskripsi & Kriteria</label>
                <textarea
                  value={fieldDescription}
                  onChange={(e) => setFieldDescription(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditFieldOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold cursor-pointer hover:bg-emerald-900"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit / Add Branch Rule Config Modal */}
      {isEditRuleOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-4">
              {editingRule ? `Edit Aturan Cabang: ${editingRule.branchName}` : 'Tambah Aturan Kompetisi Cabang'}
            </h3>
            <form onSubmit={handleSaveRuleConfig} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Cabang</label>
                <input
                  type="text"
                  value={ruleBranchName}
                  onChange={(e) => setRuleBranchName(e.target.value)}
                  required
                  placeholder="e.g. Tilawah Dewasa Putra"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Keterkaitan Versi Rubrik</label>
                <select
                  value={ruleRubricId}
                  onChange={(e) => setRuleRubricId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                >
                  {rubricVersions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.code}) · Status: {r.status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">
                  Urutan Prioritas Tie-Break (Pisahkan koma)
                </label>
                <input
                  type="text"
                  value={ruleTieBreakInput}
                  onChange={(e) => setRuleTieBreakInput(e.target.value)}
                  required
                  placeholder="total, Tajwid, Lagu, Fashahah"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Contoh Seni Baca: <span className="font-mono">total, Tajwid, Lagu, Fashahah</span>. Sistem membandingkan bidang sesuai urutan ini bila skor total kembar.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Kuota Lolos Babak Penyisihan</label>
                  <input
                    type="number"
                    min={1}
                    value={ruleQuotaPenyisihan}
                    onChange={(e) => setRuleQuotaPenyisihan(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Kuota Juara Babak Final</label>
                  <input
                    type="number"
                    min={1}
                    value={ruleQuotaFinal}
                    onChange={(e) => setRuleQuotaFinal(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Sumber Regulasi Resmi</label>
                <input
                  type="text"
                  value={ruleOfficialSource}
                  onChange={(e) => setRuleOfficialSource(e.target.value)}
                  placeholder="e.g. Buku Pedoman Musabaqah 2025 hal. 42-45"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ruleVerifiedCheck"
                  checked={ruleIsVerified}
                  onChange={(e) => setRuleIsVerified(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-800"
                />
                <label htmlFor="ruleVerifiedCheck" className="text-xs font-semibold text-slate-700">
                  Tandai sebagai Regulasi Resmi Terverifikasi LPTQ
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditRuleOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold cursor-pointer hover:bg-emerald-900"
                >
                  Simpan Aturan
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

      {/* Rubric Delete Confirmation Modal */}
      {rubricToDelete && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-rose-700" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Konfirmasi Hapus Versi Rubrik
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  {rubricToDelete.name} (v{rubricToDelete.version})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed mb-5">
              Apakah Anda yakin ingin menghapus versi rubrik <strong>"{rubricToDelete.name}"</strong> secara permanen? Tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRubricToDelete(null)}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  const res = deleteRubricVersion(rubricToDelete.id);
                  setRubricToDelete(null);
                  setFeedbackMessage({
                    type: res.success ? 'success' : 'error',
                    text: res.message
                  });
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow-2xs cursor-pointer"
              >
                Ya, Hapus Permanen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
