import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Eye,
  X,
  UserPlus,
  Edit3,
  Users,
  AlertTriangle,
  Trash2,
  CheckCircle2,
  Download,
  Upload,
  FileSpreadsheet,
  Filter,
  ArrowUpDown,
  UserCheck
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Kafilah, Participant } from '../../types/mtq';
import { AppModal } from '../common/AppModal';
import {
  downloadParticipantExcelTemplate,
  parseWorkbookToRows,
  validateParticipantImportRows,
  downloadImportErrorReport,
  ImportValidationResult,
  ValidatedParticipantRow
} from '../../utils/excelHelper';

export const KafilahPesertaView: React.FC = () => {
  const {
    kafilahs,
    participants,
    cabangList,
    jenjangList,
    stages,
    addKafilah,
    updateKafilah,
    deleteKafilah,
    addParticipant,
    updateParticipant,
    deleteParticipant,
    importParticipantsBatch
  } = useMtq();

  // Dual View Mode: 'grup' (Per Grup / Kafilah) | 'peserta' (Per Peserta)
  const [viewMode, setViewMode] = useState<'grup' | 'peserta'>('grup');

  // Shared Search & Feedback
  const [searchQuery, setSearchQuery] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Per Peserta Filters & Sorting
  const [filterKafilahId, setFilterKafilahId] = useState<string>('ALL');
  const [filterBranch, setFilterBranch] = useState<string>('ALL');
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterStage, setFilterStage] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'adminSeq' | 'lottery' | 'name' | 'kafilah'>('adminSeq');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 15;

  // Modal states
  const [selectedKafilah, setSelectedKafilah] = useState<Kafilah | null>(null);
  const [detailParticipant, setDetailParticipant] = useState<Participant | null>(null);
  const [isAddKafilahOpen, setIsAddKafilahOpen] = useState(false);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);

  // Excel Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importValidation, setImportValidation] = useState<ImportValidationResult<ValidatedParticipantRow> | null>(null);
  const [importFileName, setImportFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  // Active Master Data lists (exclude Nonaktif for new entries)
  const activeCabangList = useMemo(
    () => cabangList.filter((c) => c.status === 'Aktif'),
    [cabangList]
  );
  const activeJenjangList = useMemo(
    () => jenjangList.filter((j) => j.status === 'Aktif'),
    [jenjangList]
  );
  const activeStages = useMemo(
    () => stages.filter((s) => s.status === 'Aktif' || s.status === 'Menunggu'),
    [stages]
  );
  const activeKafilahs = useMemo(
    () => kafilahs.filter((k) => k.status === 'Aktif'),
    [kafilahs]
  );

  // Edit states for Grup
  const [editingKafilah, setEditingKafilah] = useState<Kafilah | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');

  // Form states for new grup
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newRegion, setNewRegion] = useState('Jawa Barat - Wilayah I');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Complete 15-field form states for Add / Edit Participant
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [partAdminSeq, setPartAdminSeq] = useState<string>('');
  const [partIdCode, setPartIdCode] = useState<string>('');
  const [partName, setPartName] = useState<string>('');
  const [partFatherName, setPartFatherName] = useState<string>('');
  const [partGender, setPartGender] = useState<'Putra' | 'Putri'>('Putra');
  const [partOriginCity, setPartOriginCity] = useState<string>('');
  const [partOriginRegion, setPartOriginRegion] = useState<string>('');
  const [partOriginInstitution, setPartOriginInstitution] = useState<string>('');
  const [partKafilahId, setPartKafilahId] = useState<string>('');
  const [partLevelName, setPartLevelName] = useState<string>('');
  const [partBranchName, setPartBranchName] = useState<string>('');
  const [partStageName, setPartStageName] = useState<string>('');
  const [partStatus, setPartStatus] = useState<'Menunggu' | 'Berlangsung' | 'Lolos' | 'Gugur' | 'Final'>('Menunggu');
  const [partLottery, setPartLottery] = useState<string>('');
  const [partFormError, setPartFormError] = useState<string>('');

  const filteredKafilahs = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return kafilahs.filter(
      (k) =>
        k.name.toLowerCase().includes(q) ||
        k.code.toLowerCase().includes(q) ||
        k.region.toLowerCase().includes(q)
    );
  }, [kafilahs, searchQuery]);

  const filteredParticipants = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return participants
      .filter((p) => {
        if (filterKafilahId !== 'ALL' && p.kafilahId !== filterKafilahId) return false;
        if (filterBranch !== 'ALL' && p.branchName !== filterBranch) return false;
        if (filterLevel !== 'ALL' && p.levelName !== filterLevel) return false;
        if (filterStage !== 'ALL' && p.stageName !== filterStage) return false;
        if (filterStatus !== 'ALL' && p.status !== filterStatus) return false;
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.participantId.toLowerCase().includes(q) ||
          (p.adminSequenceNumber || '').toLowerCase().includes(q) ||
          (p.fatherName || '').toLowerCase().includes(q) ||
          (p.originCity || '').toLowerCase().includes(q) ||
          (p.originRegion || '').toLowerCase().includes(q) ||
          (p.originInstitution || '').toLowerCase().includes(q) ||
          p.kafilahName.toLowerCase().includes(q) ||
          p.branchName.toLowerCase().includes(q) ||
          p.levelName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'adminSeq') {
          return (a.adminSequenceNumber || a.participantId).localeCompare(
            b.adminSequenceNumber || b.participantId,
            undefined,
            { numeric: true }
          );
        }
        if (sortBy === 'lottery') {
          return (a.lotteryNumber || '').localeCompare(b.lotteryNumber || '', undefined, { numeric: true });
        }
        if (sortBy === 'kafilah') {
          return a.kafilahName.localeCompare(b.kafilahName);
        }
        return a.name.localeCompare(b.name);
      });
  }, [participants, searchQuery, filterKafilahId, filterBranch, filterLevel, filterStage, filterStatus, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredParticipants.length / pageSize));
  const paginatedParticipants = useMemo(() => {
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    return filteredParticipants.slice(start, start + pageSize);
  }, [filteredParticipants, currentPage, totalPages]);

  const openAddParticipantModal = (preselectedKafilah?: Kafilah) => {
    const defaultKafilah = preselectedKafilah || selectedKafilah || activeKafilahs[0] || kafilahs[0];
    const defaultCabang = activeCabangList[0]?.name || cabangList[0]?.name || 'Tilawah Dewasa Putra';
    const defaultJenjang = activeJenjangList[0]?.name || jenjangList[0]?.name || 'Dewasa';
    const defaultStage = activeStages[0]?.name || stages[0]?.name || 'Penyisihan';
    const nextSeq = String(participants.length + 1).padStart(3, '0');

    setEditingParticipant(null);
    setPartAdminSeq(`ADM-${nextSeq}`);
    setPartIdCode(`PST-${nextSeq}`);
    setPartName('');
    setPartFatherName('');
    setPartGender(defaultCabang.toLowerCase().includes('putri') ? 'Putri' : 'Putra');
    setPartOriginCity(defaultKafilah?.name.replace(/^Grup\s+/i, '') || '');
    setPartOriginRegion(defaultKafilah?.region || 'Jawa Barat');
    setPartOriginInstitution('');
    setPartKafilahId(defaultKafilah?.id || '');
    setPartLevelName(defaultJenjang);
    setPartBranchName(defaultCabang);
    setPartStageName(defaultStage);
    setPartStatus('Menunggu');
    setPartLottery(String(participants.length + 1).padStart(2, '0'));
    setPartFormError('');
    setIsAddParticipantOpen(true);
  };

  const handleOpenEditParticipant = (p: Participant) => {
    setEditingParticipant(p);
    setPartAdminSeq(p.adminSequenceNumber || '');
    setPartIdCode(p.participantId);
    setPartName(p.name);
    setPartFatherName(p.fatherName || '');
    setPartGender(p.gender);
    setPartOriginCity(p.originCity || '');
    setPartOriginRegion(p.originRegion || '');
    setPartOriginInstitution(p.originInstitution || '');
    setPartKafilahId(p.kafilahId);
    setPartLevelName(p.levelName || activeJenjangList[0]?.name || 'Dewasa');
    setPartBranchName(p.branchName);
    setPartStageName(p.stageName || 'Penyisihan');
    setPartStatus(p.status);
    setPartLottery(p.lotteryNumber);
    setPartFormError('');
    setIsAddParticipantOpen(false);
  };

  const handleSubmitParticipantForm = (e: React.FormEvent) => {
    e.preventDefault();
    setPartFormError('');

    const targetKafilah = kafilahs.find((k) => k.id === partKafilahId);
    if (!targetKafilah) {
      setPartFormError('Pilih Grup / Kafilah peserta terlebih dahulu.');
      return;
    }
    if (!partName.trim()) {
      setPartFormError('Nama lengkap peserta wajib diisi.');
      return;
    }

    const matchedBranch = cabangList.find((c) => c.name === partBranchName);
    const matchedLevel = jenjangList.find((j) => j.name === partLevelName);
    const matchedStage = stages.find((s) => s.name === partStageName);

    if (editingParticipant) {
      const updRes = updateParticipant(editingParticipant.id, {
        adminSequenceNumber: partAdminSeq.trim(),
        participantId: partIdCode.trim(),
        name: partName.trim(),
        fatherName: partFatherName.trim(),
        gender: partGender,
        originCity: partOriginCity.trim(),
        originRegion: partOriginRegion.trim(),
        originInstitution: partOriginInstitution.trim(),
        kafilahId: targetKafilah.id,
        kafilahName: targetKafilah.name,
        levelId: matchedLevel?.id,
        levelName: partLevelName,
        branchId: matchedBranch?.id,
        branchName: partBranchName,
        stageId: matchedStage?.id,
        stageName: partStageName,
        status: partStatus,
        lotteryNumber: partLottery.trim()
      });
      if (!updRes.success) {
        setPartFormError(updRes.message);
        return;
      }
      setEditingParticipant(null);
      setFeedbackMessage({
        type: 'success',
        text: updRes.message
      });
      return;
    }

    const res = addParticipant({
      adminSequenceNumber: partAdminSeq.trim() || `ADM-${String(participants.length + 1).padStart(3, '0')}`,
      participantId: partIdCode.trim() || `PST-${String(participants.length + 1).padStart(3, '0')}`,
      lotteryNumber: partLottery.trim() || String(participants.length + 1).padStart(2, '0'),
      name: partName.trim(),
      fatherName: partFatherName.trim(),
      gender: partGender,
      originCity: partOriginCity.trim(),
      originRegion: partOriginRegion.trim(),
      originInstitution: partOriginInstitution.trim(),
      kafilahId: targetKafilah.id,
      kafilahName: targetKafilah.name,
      levelId: matchedLevel?.id,
      levelName: partLevelName || activeJenjangList[0]?.name || 'Dewasa',
      branchId: matchedBranch?.id,
      branchName: partBranchName || activeCabangList[0]?.name || 'Tilawah Dewasa Putra',
      stageId: matchedStage?.id,
      stageName: partStageName || activeStages[0]?.name || 'Penyisihan',
      questionId: '',
      assignedMaqra: 'Belum Ditetapkan',
      pageNumber: 1,
      assignedQuestions: [],
      status: 'Menunggu'
    });

    if (!res.success) {
      setPartFormError(res.message);
      return;
    }

    setIsAddParticipantOpen(false);
    setFeedbackMessage({
      type: 'success',
      text: res.message
    });
  };

  const handleOpenEditKafilah = (k: Kafilah) => {
    setEditingKafilah(k);
    setEditCode(k.code);
    setEditName(k.name);
    setEditRegion(k.region);
    setEditContact(k.contactPerson);
    setEditPhone(k.contactPhone);
    setEditStatus(k.status);
  };

  const handleSaveEditKafilah = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKafilah || !editName) return;
    updateKafilah(editingKafilah.id, {
      code: editCode.toUpperCase(),
      name: editName,
      region: editRegion,
      contactPerson: editContact,
      contactPhone: editPhone,
      status: editStatus
    });
    if (selectedKafilah && selectedKafilah.id === editingKafilah.id) {
      setSelectedKafilah({
        ...selectedKafilah,
        code: editCode.toUpperCase(),
        name: editName,
        region: editRegion,
        contactPerson: editContact,
        contactPhone: editPhone,
        status: editStatus
      });
    }
    setEditingKafilah(null);
    setFeedbackMessage({ type: 'success', text: `Grup "${editName}" berhasil diperbarui.` });
  };

  const handleSaveKafilah = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode || !newName) return;
    addKafilah({
      code: newCode.toUpperCase(),
      name: newName,
      region: newRegion,
      participantCount: 0,
      contactPerson: newContact || 'Penanggung Jawab',
      contactPhone: newPhone || '0812-0000-0000',
      status: 'Aktif'
    });
    setNewCode('');
    setNewName('');
    setNewContact('');
    setNewPhone('');
    setIsAddKafilahOpen(false);
    setFeedbackMessage({ type: 'success', text: `Grup "${newName}" berhasil ditambahkan.` });
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const rows = parseWorkbookToRows(buffer);
      const validation = validateParticipantImportRows(rows, {
        kafilahs,
        cabangList,
        jenjangList,
        stages,
        existingParticipants: participants
      });
      setImportValidation(validation);
    } catch (err) {
      setFeedbackMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Gagal membaca file Excel.'
      });
    }
  };

  const handleCommitExcelImport = async () => {
    if (!importValidation || importValidation.validRows.length === 0) return;
    setIsImporting(true);
    try {
      const res = await importParticipantsBatch(importValidation.validRows);
      const errDetail = res.errors.length > 0 ? ` (${res.errors.slice(0, 2).join('; ')})` : '';
      setFeedbackMessage({
        type: res.succeeded > 0 && res.failed === 0 ? 'success' : 'error',
        text: `Berhasil mengimpor ${res.succeeded} dari ${res.total} peserta.${res.failed > 0 ? ` Gagal: ${res.failed}${errDetail}` : ''}`
      });
      if (res.succeeded > 0 && res.failed === 0) {
        setIsImportModalOpen(false);
        setImportValidation(null);
        setImportFileName('');
      }
    } finally {
      setIsImporting(false);
    }
  };

  const kafilahParticipants = selectedKafilah
    ? participants.filter((p) => p.kafilahId === selectedKafilah.id)
    : [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Grup & Peserta MTQ</h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola grup kontingen kabupaten/kota dan seluruh atribut administrasi peserta secara terpadu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented View Toggle: Mode Per Grup vs Mode Per Peserta */}
          <div
            className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200"
            role="tablist"
            aria-label="Mode Tampilan Peserta"
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'grup'}
              onClick={() => setViewMode('grup')}
              data-testid="view-mode-grup-btn"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'grup'
                  ? 'bg-white text-emerald-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Mode Per Grup ({kafilahs.length})</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'peserta'}
              onClick={() => setViewMode('peserta')}
              data-testid="view-mode-peserta-btn"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === 'peserta'
                  ? 'bg-white text-emerald-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Mode Per Peserta ({participants.length})</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => downloadParticipantExcelTemplate({ kafilahs, cabangList, jenjangList, stages })}
            data-testid="download-participant-template-btn"
            className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs px-3 py-2 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Template Excel</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setImportValidation(null);
              setImportFileName('');
              setIsImportModalOpen(true);
            }}
            data-testid="open-participant-import-btn"
            className="inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-emerald-800 border border-emerald-200 font-semibold text-xs px-3 py-2 rounded-lg shadow-2xs transition-all cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Excel</span>
          </button>

          {viewMode === 'peserta' ? (
            <button
              type="button"
              onClick={() => openAddParticipantModal()}
              data-testid="add-participant-global-btn"
              className="inline-flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah Peserta</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddKafilahOpen(true)}
              data-testid="add-kafilah-btn"
              className="inline-flex items-center gap-1.5 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Grup</span>
            </button>
          )}
        </div>
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
              <AlertTriangle className="w-4 h-4 text-rose-700" />
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

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={
                viewMode === 'grup'
                  ? 'Cari kode, nama grup, atau wilayah...'
                  : 'Cari No Urut, ID, nama peserta, nama ayah, asal pesantren/kota...'
              }
              className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium">
            {viewMode === 'grup'
              ? `${filteredKafilahs.length} Grup Terdaftar`
              : `Menampilkan ${filteredParticipants.length} dari ${participants.length} Peserta`}
          </div>
        </div>

        {viewMode === 'peserta' && (
          <div className="pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                <Filter className="w-3 h-3 inline mr-1" />
                Grup / Kafilah
              </label>
              <select
                value={filterKafilahId}
                onChange={(e) => {
                  setFilterKafilahId(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/60"
              >
                <option value="ALL">Semua Grup</option>
                {kafilahs.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Cabang Lomba
              </label>
              <select
                value={filterBranch}
                onChange={(e) => {
                  setFilterBranch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/60"
              >
                <option value="ALL">Semua Cabang</option>
                {cabangList.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Jenjang Lomba
              </label>
              <select
                value={filterLevel}
                onChange={(e) => {
                  setFilterLevel(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/60"
              >
                <option value="ALL">Semua Jenjang</option>
                {jenjangList.map((j) => (
                  <option key={j.id} value={j.name}>
                    {j.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Babak Aktif
              </label>
              <select
                value={filterStage}
                onChange={(e) => {
                  setFilterStage(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/60"
              >
                <option value="ALL">Semua Babak</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                Status Peserta
              </label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/60"
              >
                <option value="ALL">Semua Status</option>
                <option value="Menunggu">Menunggu</option>
                <option value="Berlangsung">Berlangsung</option>
                <option value="Lolos">Lolos</option>
                <option value="Gugur">Gugur</option>
                <option value="Final">Final</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                <ArrowUpDown className="w-3 h-3 inline mr-1" />
                Urutkan
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'adminSeq' | 'lottery' | 'name' | 'kafilah')}
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/60"
              >
                <option value="adminSeq">No Urut Administrasi</option>
                <option value="lottery">Nomor Undian Tampil</option>
                <option value="name">Nama Peserta (A-Z)</option>
                <option value="kafilah">Grup / Kafilah</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* MODE 1: Main Grup Table */}
      {viewMode === 'grup' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3.5 px-5">Kode Grup</th>
                  <th className="py-3.5 px-5">Nama Grup</th>
                  <th className="py-3.5 px-5">Wilayah</th>
                  <th className="py-3.5 px-5 text-center">Jumlah Peserta</th>
                  <th className="py-3.5 px-5">Penanggung Jawab</th>
                  <th className="py-3.5 px-5 text-center">Status</th>
                  <th className="py-3.5 px-5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredKafilahs.map((k, idx) => (
                  <tr key={`${k.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-5 font-bold text-emerald-800 tracking-wide font-mono">
                      {k.code}
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-slate-900">{k.name}</td>
                    <td className="py-3.5 px-5 text-slate-500">{k.region}</td>
                    <td className="py-3.5 px-5 text-center font-bold text-slate-800 tabular-nums font-mono">
                      {k.participantCount}
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="font-medium text-slate-800">{k.contactPerson}</p>
                      <p className="text-[11px] text-slate-400 font-mono">{k.contactPhone}</p>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                          k.status === 'Aktif'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {k.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setSelectedKafilah(k)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs font-semibold transition-colors cursor-pointer"
                          title="Lihat daftar peserta grup ini"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Lihat Detail</span>
                        </button>
                        <button
                          onClick={() => handleOpenEditKafilah(k)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-800 hover:bg-slate-50 transition-colors cursor-pointer"
                          title="Edit data grup"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            const res = deleteKafilah(k.id);
                            if (res.success && selectedKafilah?.id === k.id) {
                              setSelectedKafilah(null);
                            }
                            setFeedbackMessage({
                              type: res.success ? 'success' : 'error',
                              text: res.message
                            });
                          }}
                          className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Hapus grup ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODE 2: Main Per Peserta Table */}
      {viewMode === 'peserta' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-600 font-semibold">
                  <th className="py-3.5 px-4">No Urut / ID</th>
                  <th className="py-3.5 px-4">Undian</th>
                  <th className="py-3.5 px-4">Biodata Peserta</th>
                  <th className="py-3.5 px-4">Asal & Instansi</th>
                  <th className="py-3.5 px-4">Grup (Kafilah)</th>
                  <th className="py-3.5 px-4">Cabang · Jenjang · Babak</th>
                  <th className="py-3.5 px-4">Maqra Ditugaskan</th>
                  <th className="py-3.5 px-4 text-center">Status</th>
                  <th className="py-3.5 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {paginatedParticipants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400">
                      Tidak ada data peserta yang sesuai dengan filter pencarian.
                    </td>
                  </tr>
                ) : (
                  paginatedParticipants.map((p, idx) => (
                    <tr key={`${p.id}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-mono">
                        <div className="font-bold text-slate-900">
                          {p.adminSequenceNumber || '-'}
                        </div>
                        <div className="text-[11px] font-semibold text-emerald-700">
                          {p.participantId}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-extrabold text-slate-900">
                        {p.lotteryNumber || '-'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {p.gender} {p.fatherName ? `· Bin/Binti ${p.fatherName}` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800">
                          {p.originInstitution || '-'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {[p.originCity, p.originRegion].filter(Boolean).join(', ') || '-'}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{p.kafilahName}</td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{p.branchName}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                            {p.levelName || 'Umum'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-mono font-semibold">
                            {p.stageName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[11px] text-slate-700 font-medium line-clamp-2">
                          {p.assignedMaqra || 'Belum Ditetapkan'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.status === 'Final' || p.status === 'Lolos'
                              ? 'bg-emerald-50 text-emerald-700'
                              : p.status === 'Berlangsung'
                              ? 'bg-amber-50 text-amber-700'
                              : p.status === 'Gugur'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setDetailParticipant(p)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-800 hover:bg-slate-50 transition-colors cursor-pointer"
                            title="Lihat detail lengkap peserta"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditParticipant(p)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:text-emerald-800 hover:bg-slate-50 transition-colors cursor-pointer"
                            title="Edit data peserta"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const res = deleteParticipant(p.id);
                              setFeedbackMessage({
                                type: res.success ? 'success' : 'error',
                                text: res.message
                              });
                            }}
                            className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Hapus peserta"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                Halaman {currentPage} dari {totalPages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-40 font-semibold"
                >
                  Sebelumnya
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-40 font-semibold"
                >
                  Berikutnya
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Detail Grup & Anggota Peserta */}
      {selectedKafilah && (
        <AppModal
          isOpen={Boolean(selectedKafilah)}
          onClose={() => setSelectedKafilah(null)}
          title={`Grup ${selectedKafilah.name}`}
          subtitle={`${selectedKafilah.region} · PJ: ${selectedKafilah.contactPerson} (${selectedKafilah.contactPhone})`}
          maxWidthClass="max-w-4xl"
          footer={
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAddParticipantModal(selectedKafilah)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Tambah Peserta ke Grup Ini</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenEditKafilah(selectedKafilah)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Grup</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setSelectedKafilah(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Daftar Peserta Terdaftar ({kafilahParticipants.length})
            </h4>

            {kafilahParticipants.length > 0 ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">No Urut / Undian</th>
                      <th className="py-2.5 px-3">ID Peserta</th>
                      <th className="py-2.5 px-3">Nama & Biodata</th>
                      <th className="py-2.5 px-3">Cabang & Jenjang</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                      <th className="py-2.5 px-3 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {kafilahParticipants.map((p, idx) => (
                      <tr key={`${p.id}-${idx}`} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono">
                          <span className="font-bold text-slate-900">{p.adminSequenceNumber || '-'}</span>
                          <span className="text-slate-400 mx-1">/</span>
                          <span className="font-bold text-amber-700">#{p.lotteryNumber}</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">
                          {p.participantId}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          <div>{p.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {[p.fatherName ? `Ayah: ${p.fatherName}` : '', p.originInstitution, p.originCity]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div className="font-semibold text-slate-800">{p.branchName}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold">
                              {p.levelName || 'Umum'}
                            </span>
                            <span className="text-[10px] text-emerald-800 font-semibold font-mono">
                              Babak: {p.stageName}
                            </span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              p.status === 'Final'
                                ? 'bg-emerald-50 text-emerald-700'
                                : p.status === 'Berlangsung'
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => setDetailParticipant(p)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-emerald-700 hover:bg-slate-100 px-2 py-1 rounded transition-colors cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Detail</span>
                            </button>
                            <button
                              onClick={() => handleOpenEditParticipant(p)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-emerald-700 hover:bg-slate-100 px-2 py-1 rounded transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => {
                                const res = deleteParticipant(p.id);
                                setFeedbackMessage({
                                  type: res.success ? 'success' : 'error',
                                  text: res.message
                                });
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Hapus</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 py-6 text-center">
                Belum ada peserta terdaftar untuk grup ini.
              </p>
            )}
          </div>
        </AppModal>
      )}

      {/* Modal Detail Lengkap Peserta (15 Atribut) */}
      {detailParticipant && (
        <AppModal
          isOpen={Boolean(detailParticipant)}
          onClose={() => setDetailParticipant(null)}
          title={`Detail Peserta: ${detailParticipant.name}`}
          subtitle={`ID Peserta: ${detailParticipant.participantId} · No Urut Administrasi: ${detailParticipant.adminSequenceNumber || '-'}`}
          maxWidthClass="max-w-2xl"
          footer={
            <div className="flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  const p = detailParticipant;
                  setDetailParticipant(null);
                  handleOpenEditParticipant(p);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Data Peserta</span>
              </button>
              <button
                type="button"
                onClick={() => setDetailParticipant(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg"
              >
                Tutup
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">1. No Urut Administrasi</span>
              <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                {detailParticipant.adminSequenceNumber || '-'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">2. ID Peserta</span>
              <span className="font-mono font-bold text-emerald-800 mt-0.5 block">
                {detailParticipant.participantId}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">3. Nama Peserta</span>
              <span className="font-bold text-slate-900 mt-0.5 block">{detailParticipant.name}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">4. Nama Ayah</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {detailParticipant.fatherName || '-'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">5. Jenis Kelamin</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">{detailParticipant.gender}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">6. Kota Asal</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {detailParticipant.originCity || '-'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">7. Daerah Asal</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {detailParticipant.originRegion || '-'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">8. Asal Pesantren / Sekolah</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {detailParticipant.originInstitution || '-'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">9. Grup / Kafilah</span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {detailParticipant.kafilahName}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">10. Jenjang Lomba</span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {detailParticipant.levelName || '-'}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">11. Cabang Lomba</span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {detailParticipant.branchName}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">12. Babak Aktif</span>
              <span className="font-mono font-bold text-emerald-800 mt-0.5 block">
                {detailParticipant.stageName}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">13. Status Peserta</span>
              <span className="font-bold text-slate-900 mt-0.5 block">{detailParticipant.status}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[10px] font-bold uppercase text-slate-400 block">14. Nomor Tampil / Undian</span>
              <span className="font-mono font-bold text-slate-900 mt-0.5 block">
                {detailParticipant.lotteryNumber || '-'}
              </span>
            </div>
            <div className="sm:col-span-2 p-3 rounded-xl bg-emerald-50/60 border border-emerald-200">
              <span className="text-[10px] font-bold uppercase text-emerald-800 block">
                15. Soal / Maqra yang Ditugaskan ({detailParticipant.stageName})
              </span>
              <span className="font-semibold text-slate-900 mt-0.5 block">
                {detailParticipant.assignedMaqra || 'Belum Ditetapkan'}
              </span>
            </div>
          </div>
        </AppModal>
      )}

      {/* Modal Tambah / Edit Peserta (15 Atribut Lengkap) */}
      {(isAddParticipantOpen || editingParticipant) && (
        <AppModal
          isOpen={Boolean(isAddParticipantOpen || editingParticipant)}
          onClose={() => {
            setIsAddParticipantOpen(false);
            setEditingParticipant(null);
          }}
          title={editingParticipant ? `Edit Data Peserta: ${editingParticipant.name}` : 'Daftarkan Peserta Baru'}
          subtitle="Seluruh pilihan Cabang, Jenjang, Babak, dan Grup bersumber langsung dari Master Data Kompetisi"
          maxWidthClass="max-w-2xl"
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddParticipantOpen(false);
                  setEditingParticipant(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                form="participant-full-form"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs cursor-pointer"
              >
                {editingParticipant ? 'Simpan Perubahan' : 'Daftarkan Peserta'}
              </button>
            </div>
          }
        >
          <form id="participant-full-form" onSubmit={handleSubmitParticipantForm} className="space-y-4">
            {partFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{partFormError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  1. No Urut Administrasi
                </label>
                <input
                  type="text"
                  value={partAdminSeq}
                  onChange={(e) => setPartAdminSeq(e.target.value)}
                  placeholder="Misal: ADM-001"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  2. ID Peserta *
                </label>
                <input
                  type="text"
                  required
                  value={partIdCode}
                  onChange={(e) => setPartIdCode(e.target.value)}
                  placeholder="Misal: TLW-001"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  14. Nomor Undian Tampil
                </label>
                <input
                  type="text"
                  value={partLottery}
                  onChange={(e) => setPartLottery(e.target.value)}
                  placeholder="Misal: 01"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  3. Nama Lengkap Peserta *
                </label>
                <input
                  type="text"
                  required
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                  placeholder="Nama lengkap sesuai identitas"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  5. Jenis Kelamin *
                </label>
                <select
                  value={partGender}
                  onChange={(e) => setPartGender(e.target.value as 'Putra' | 'Putri')}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  <option value="Putra">Putra</option>
                  <option value="Putri">Putri</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  4. Nama Ayah Kandung
                </label>
                <input
                  type="text"
                  value={partFatherName}
                  onChange={(e) => setPartFatherName(e.target.value)}
                  placeholder="Misal: H. Abdullah"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  8. Asal Pesantren / Sekolah / Instansi
                </label>
                <input
                  type="text"
                  value={partOriginInstitution}
                  onChange={(e) => setPartOriginInstitution(e.target.value)}
                  placeholder="Misal: PP Al-Munawwir"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  6. Kota / Kabupaten Asal
                </label>
                <input
                  type="text"
                  value={partOriginCity}
                  onChange={(e) => setPartOriginCity(e.target.value)}
                  placeholder="Misal: Kota Bandung"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  7. Daerah / Provinsi Asal
                </label>
                <input
                  type="text"
                  value={partOriginRegion}
                  onChange={(e) => setPartOriginRegion(e.target.value)}
                  placeholder="Misal: Jawa Barat"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  9. Grup / Kafilah *
                </label>
                <select
                  value={partKafilahId}
                  onChange={(e) => setPartKafilahId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  {activeKafilahs.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} ({k.code})
                    </option>
                  ))}
                  {editingParticipant &&
                    !activeKafilahs.some((k) => k.id === editingParticipant.kafilahId) && (
                      <option value={editingParticipant.kafilahId}>
                        {editingParticipant.kafilahName} (Historis)
                      </option>
                    )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  10. Jenjang Lomba (Master Data) *
                </label>
                <select
                  value={partLevelName}
                  onChange={(e) => setPartLevelName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  {activeJenjangList.map((j) => (
                    <option key={j.id} value={j.name}>
                      {j.name} {j.description ? `(${j.description})` : ''}
                    </option>
                  ))}
                  {editingParticipant &&
                    editingParticipant.levelName &&
                    !activeJenjangList.some((j) => j.name === editingParticipant.levelName) && (
                      <option value={editingParticipant.levelName}>
                        {editingParticipant.levelName} (Historis)
                      </option>
                    )}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  11. Cabang Musabaqah (Master Data) *
                </label>
                <select
                  value={partBranchName}
                  onChange={(e) => setPartBranchName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  {activeCabangList.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {editingParticipant &&
                    !activeCabangList.some((c) => c.name === editingParticipant.branchName) && (
                      <option value={editingParticipant.branchName}>
                        {editingParticipant.branchName} (Historis)
                      </option>
                    )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  12. Babak Aktif (Master Data) *
                </label>
                <select
                  value={partStageName}
                  onChange={(e) => setPartStageName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  {activeStages.map((stg) => (
                    <option key={stg.id} value={stg.name}>
                      {stg.name}
                    </option>
                  ))}
                  {editingParticipant &&
                    !activeStages.some((s) => s.name === editingParticipant.stageName) && (
                      <option value={editingParticipant.stageName}>
                        {editingParticipant.stageName} (Historis)
                      </option>
                    )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  13. Status Peserta
                </label>
                <select
                  value={partStatus}
                  onChange={(e) =>
                    setPartStatus(
                      e.target.value as 'Menunggu' | 'Berlangsung' | 'Lolos' | 'Gugur' | 'Final'
                    )
                  }
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  <option value="Menunggu">Menunggu</option>
                  <option value="Berlangsung">Berlangsung</option>
                  <option value="Lolos">Lolos</option>
                  <option value="Gugur">Gugur</option>
                  <option value="Final">Final</option>
                </select>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600">
              <span className="font-bold text-slate-800">15. Soal / Maqra Ditugaskan: </span>
              {editingParticipant
                ? editingParticipant.assignedMaqra || 'Belum Ditetapkan'
                : 'Penetapan maqra dilakukan melalui modul Bank Soal (undian acak Fisher-Yates atau penetapan manual per babak).'}
            </div>
          </form>
        </AppModal>
      )}

      {/* Modal Import Excel Peserta */}
      {isImportModalOpen && (
        <AppModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          isBusy={isImporting}
          title="Import Data Peserta dari Excel (.xlsx)"
          subtitle="Validasi otomatis terhadap Master Data Grup/Kafilah, Cabang, Jenjang, dan Babak sebelum disimpan"
          maxWidthClass="max-w-3xl"
          footer={
            <div className="flex items-center justify-between">
              <div>
                {importValidation && importValidation.errors.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadImportErrorReport(importValidation.errors, 'Error_Import_Peserta_MTQ.xlsx')
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Unduh Laporan Baris Error ({importValidation.errors.length})</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={!importValidation || importValidation.validRows.length === 0 || isImporting}
                  onClick={handleCommitExcelImport}
                  data-testid="commit-participant-import-btn"
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 disabled:bg-slate-300 rounded-lg"
                >
                  {isImporting
                    ? 'Mengimpor...'
                    : `Impor ${importValidation?.validRows.length || 0} Peserta Valid`}
                </button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {importFileName || 'Pilih file Excel (.xlsx / .xls) sesuai Template Peserta'}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Pastikan nama Grup/Kafilah, Cabang, Jenjang, dan Babak sesuai dengan sheet Referensi Master Data.
                  </p>
                </div>
              </div>
              <label className="px-3.5 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg cursor-pointer shrink-0">
                Pilih File Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelFileChange}
                  data-testid="participant-excel-file-input"
                  className="hidden"
                />
              </label>
            </div>

            {importValidation && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block">Total Baris Dibaca</span>
                    <span className="text-base font-extrabold text-slate-900 font-mono">
                      {importValidation.totalRows}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-emerald-700 block">Baris Valid (Siap Impor)</span>
                    <span className="text-base font-extrabold text-emerald-900 font-mono">
                      {importValidation.validRows.length}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                    <span className="text-rose-700 block">Baris Ditolak / Error</span>
                    <span className="text-base font-extrabold text-rose-900 font-mono">
                      {importValidation.errors.length}
                    </span>
                  </div>
                </div>

                {importValidation.errors.length > 0 && (
                  <div className="border border-rose-200 rounded-xl overflow-hidden">
                    <div className="bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900 border-b border-rose-200">
                      Detail Baris Ditolak ({importValidation.errors.length})
                    </div>
                    <div className="max-h-40 overflow-y-auto divide-y divide-rose-100 text-xs">
                      {importValidation.errors.map((err, i) => (
                        <div key={i} className="px-3 py-2 flex items-start gap-2 text-rose-800">
                          <span className="font-mono font-bold shrink-0">Baris #{err.rowNumber}:</span>
                          <span>
                            <strong>{err.identifier}</strong> — {err.reasons.join(' ')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {importValidation.validRows.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 border-b border-slate-200">
                      Pratinjau Peserta Valid ({importValidation.validRows.length})
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                          <tr>
                            <th className="py-1.5 px-3">ID</th>
                            <th className="py-1.5 px-3">Nama Peserta</th>
                            <th className="py-1.5 px-3">Grup</th>
                            <th className="py-1.5 px-3">Cabang & Jenjang</th>
                            <th className="py-1.5 px-3">Babak</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {importValidation.validRows.slice(0, 20).map((r, i) => (
                            <tr key={i}>
                              <td className="py-1.5 px-3 font-mono font-bold text-emerald-700">
                                {r.participantId}
                              </td>
                              <td className="py-1.5 px-3 font-semibold text-slate-900">{r.name}</td>
                              <td className="py-1.5 px-3">{r.kafilahName}</td>
                              <td className="py-1.5 px-3">
                                {r.branchName} ({r.levelName})
                              </td>
                              <td className="py-1.5 px-3 font-mono">{r.stageName}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </AppModal>
      )}

      {/* Modal Edit Grup */}
      {editingKafilah && (
        <AppModal
          isOpen={Boolean(editingKafilah)}
          onClose={() => setEditingKafilah(null)}
          title="Edit Data Grup"
          maxWidthClass="max-w-md"
        >
          <form onSubmit={handleSaveEditKafilah} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Grup</label>
              <input
                type="text"
                required
                value={editCode}
                onChange={(e) => setEditCode(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none uppercase font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Grup (Kabupaten/Kota)
              </label>
              <input
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Wilayah Koordinasi
              </label>
              <input
                type="text"
                value={editRegion}
                onChange={(e) => setEditRegion(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Penanggung Jawab (Nama & Telepon)
              </label>
              <input
                type="text"
                value={editContact}
                onChange={(e) => setEditContact(e.target.value)}
                placeholder="Nama Ketua Delegasi"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none mb-2"
              />
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status Grup</label>
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as 'Aktif' | 'Nonaktif')}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
              >
                <option value="Aktif">Aktif</option>
                <option value="Nonaktif">Nonaktif</option>
              </select>
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingKafilah(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs cursor-pointer"
              >
                Simpan Perubahan
              </button>
            </div>
          </form>
        </AppModal>
      )}

      {/* Modal Tambah Grup */}
      {isAddKafilahOpen && (
        <AppModal
          isOpen={isAddKafilahOpen}
          onClose={() => setIsAddKafilahOpen(false)}
          title="Tambah Grup Baru"
          maxWidthClass="max-w-md"
        >
          <form onSubmit={handleSaveKafilah} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kode Grup</label>
              <input
                type="text"
                required
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="Misal: GRP-SMD"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none uppercase font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Kabupaten/Kota
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Misal: Kabupaten Sumedang"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Wilayah Koordinasi
              </label>
              <input
                type="text"
                value={newRegion}
                onChange={(e) => setNewRegion(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Penanggung Jawab (Nama & Telepon)
              </label>
              <input
                type="text"
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                placeholder="Nama Ketua Delegasi"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none mb-2"
              />
              <input
                type="text"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="0812-xxxx-xxxx"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none font-mono"
              />
            </div>
            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddKafilahOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs cursor-pointer"
              >
                Simpan Grup
              </button>
            </div>
          </form>
        </AppModal>
      )}
    </div>
  );
};
