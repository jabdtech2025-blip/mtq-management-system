import React, { useState } from 'react';
import { Plus, Search, Eye, X, UserPlus, Edit3, Check, Users, AlertTriangle } from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Kafilah, Participant } from '../../types/mtq';

export const KafilahPesertaView: React.FC = () => {
  const { kafilahs, participants, stages, addKafilah, updateKafilah, addParticipant, updateParticipant } = useMtq();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKafilah, setSelectedKafilah] = useState<Kafilah | null>(null);
  const [isAddKafilahOpen, setIsAddKafilahOpen] = useState(false);
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false);

  // Edit states for Grup
  const [editingKafilah, setEditingKafilah] = useState<Kafilah | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editName, setEditName] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<'Aktif' | 'Nonaktif'>('Aktif');

  // Edit states for Participant
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [editPartName, setEditPartName] = useState('');
  const [editPartId, setEditPartId] = useState('');
  const [editPartLottery, setEditPartLottery] = useState('');
  const [editPartGender, setEditPartGender] = useState<'Putra' | 'Putri'>('Putra');
  const [editPartBranch, setEditPartBranch] = useState('Tilawah Dewasa Putra');
  const [editPartStatus, setEditPartStatus] = useState<'Menunggu' | 'Berlangsung' | 'Final'>('Menunggu');

  // Form states for new grup
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newRegion, setNewRegion] = useState('Jawa Barat - Wilayah I');
  const [newContact, setNewContact] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Form states for new participant
  const [newPartName, setNewPartName] = useState('');
  const [newPartId, setNewPartId] = useState('');
  const [newPartLottery, setNewPartLottery] = useState('');
  const [newPartGender, setNewPartGender] = useState<'Putra' | 'Putri'>('Putra');
  const [newPartBranch, setNewPartBranch] = useState('Tilawah Dewasa Putra');
  const [newPartStage, setNewPartStage] = useState('Penyisihan');
  const [addPartError, setAddPartError] = useState('');

  const filteredKafilahs = kafilahs.filter(
    (k) =>
      k.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      k.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
  };

  const handleOpenEditParticipant = (p: Participant) => {
    setEditingParticipant(p);
    setEditPartName(p.name);
    setEditPartId(p.participantId);
    setEditPartLottery(p.lotteryNumber);
    setEditPartGender(p.gender);
    setEditPartBranch(p.branchName);
    setEditPartStatus(p.status);
  };

  const handleSaveEditParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParticipant || !editPartName) return;
    updateParticipant(editingParticipant.id, {
      name: editPartName,
      participantId: editPartId,
      lotteryNumber: editPartLottery,
      gender: editPartGender,
      branchName: editPartBranch,
      status: editPartStatus
    });
    setEditingParticipant(null);
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
  };

  const handleSaveParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    setAddPartError('');
    if (!selectedKafilah || !newPartName.trim()) return;

    const res = addParticipant({
      participantId: newPartId.trim() || `TLW-${String(participants.length + 1).padStart(3, '0')}`,
      lotteryNumber: newPartLottery.trim() || String(participants.length + 1).padStart(2, '0'),
      name: newPartName.trim(),
      gender: newPartGender,
      kafilahId: selectedKafilah.id,
      kafilahName: selectedKafilah.name,
      branchName: newPartBranch,
      levelName: 'Ulya',
      stageName: newPartStage || 'Penyisihan',
      questionId: '',
      assignedMaqra: 'Belum Ditetapkan',
      pageNumber: 1,
      assignedQuestions: [],
      status: 'Menunggu'
    });

    if (!res.success) {
      setAddPartError(res.message);
      return;
    }

    setNewPartName('');
    setNewPartId('');
    setNewPartLottery('');
    setAddPartError('');
    setIsAddParticipantOpen(false);
  };

  const kafilahParticipants = selectedKafilah
    ? participants.filter((p) => p.kafilahId === selectedKafilah.id)
    : [];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Grup & Peserta MTQ</h1>
          <p className="text-xs text-slate-500 mt-1">
            Kelola grup kontingen kabupaten/kota dan daftar peserta dalam naungan tenant
          </p>
        </div>

        <button
          onClick={() => setIsAddKafilahOpen(true)}
          className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Grup</span>
        </button>
      </div>

      {/* Search and Count Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kode, nama grup, atau wilayah..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          {filteredKafilahs.length} Grup Terdaftar
        </div>
      </div>

      {/* Main Grup Table */}
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
              {filteredKafilahs.map((k) => (
                <tr key={k.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="py-3.5 px-5 font-bold text-emerald-800 tracking-wide font-mono">
                    {k.code}
                  </td>
                  <td className="py-3.5 px-5 font-semibold text-slate-900">
                    {k.name}
                  </td>
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail Grup & Anggota Peserta */}
      {selectedKafilah && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Grup {selectedKafilah.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedKafilah.region} · PJ: {selectedKafilah.contactPerson} ({selectedKafilah.contactPhone})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAddParticipantOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                  title="Tambah peserta baru ke grup ini"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Tambah Peserta</span>
                </button>
                <button
                  onClick={() => handleOpenEditKafilah(selectedKafilah)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                  title="Edit data grup ini"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Grup</span>
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Daftar Peserta Terdaftar ({kafilahParticipants.length})
                </h4>
              </div>

              {kafilahParticipants.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="py-2.5 px-4">Undian</th>
                        <th className="py-2.5 px-4">ID Peserta</th>
                        <th className="py-2.5 px-4">Nama Lengkap</th>
                        <th className="py-2.5 px-4">Cabang</th>
                        <th className="py-2.5 px-4 text-center">Status</th>
                        <th className="py-2.5 px-4 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kafilahParticipants.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="py-2.5 px-4 font-mono font-bold text-slate-800">
                            {p.lotteryNumber}
                          </td>
                          <td className="py-2.5 px-4 font-mono font-bold text-emerald-700">
                            {p.participantId}
                          </td>
                          <td className="py-2.5 px-4 font-medium text-slate-900">
                            <div>{p.name}</div>
                            {p.stageHistory && p.stageHistory.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {p.stageHistory.map((sh, idx) => (
                                  <span
                                    key={idx}
                                    className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600"
                                  >
                                    {sh.stageName}: {sh.status}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">
                            <div>{p.branchName}</div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-emerald-800 font-semibold font-mono">
                                Babak: {p.stageName}
                              </span>
                              {(!p.questionId || p.assignedMaqra === 'Belum Ditetapkan') && (!p.assignedQuestions || p.assignedQuestions.length === 0) ? (
                                <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 rounded font-medium">
                                  Maqra Belum Ditetapkan
                                </span>
                              ) : (
                                <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 rounded font-medium">
                                  {p.assignedQuestions && p.assignedQuestions.length > 1 ? `${p.assignedQuestions.length} Maqra` : 'Maqra Ditetapkan'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center">
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
                          <td className="py-2.5 px-4 text-center">
                            <button
                              onClick={() => handleOpenEditParticipant(p)}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-emerald-700 hover:bg-slate-100 px-2 py-1 rounded transition-colors cursor-pointer"
                              title="Edit data peserta ini"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-4 text-center">
                  Belum ada peserta terdaftar untuk grup ini.
                </p>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedKafilah(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Grup */}
      {editingKafilah && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveEditKafilah}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Edit Data Grup</h3>
              <button
                type="button"
                onClick={() => setEditingKafilah(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Grup
              </label>
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Status Grup
              </label>
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
        </div>
      )}

      {/* Modal Edit Peserta */}
      {editingParticipant && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveEditParticipant}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Edit Data Peserta</h3>
              <button
                type="button"
                onClick={() => setEditingParticipant(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap Peserta
              </label>
              <input
                type="text"
                required
                value={editPartName}
                onChange={(e) => setEditPartName(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Undian
                </label>
                <input
                  type="text"
                  value={editPartLottery}
                  onChange={(e) => setEditPartLottery(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ID Peserta
                </label>
                <input
                  type="text"
                  value={editPartId}
                  onChange={(e) => setEditPartId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Kelamin
                </label>
                <select
                  value={editPartGender}
                  onChange={(e) => setEditPartGender(e.target.value as 'Putra' | 'Putri')}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  <option value="Putra">Putra</option>
                  <option value="Putri">Putri</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Status Penilaian
                </label>
                <select
                  value={editPartStatus}
                  onChange={(e) => setEditPartStatus(e.target.value as 'Menunggu' | 'Berlangsung' | 'Final')}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  <option value="Menunggu">Menunggu</option>
                  <option value="Berlangsung">Berlangsung</option>
                  <option value="Final">Final</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Cabang Musabaqah
              </label>
              <select
                value={editPartBranch}
                onChange={(e) => setEditPartBranch(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
              >
                <option value="Tilawah Dewasa Putra">Tilawah Dewasa Putra</option>
                <option value="Tilawah Dewasa Putri">Tilawah Dewasa Putri</option>
                <option value="Tahfidz 30 Juz Putra">Tahfidz 30 Juz Putra</option>
              </select>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingParticipant(null)}
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
        </div>
      )}

      {/* Modal Tambah Grup */}
      {isAddKafilahOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveKafilah}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Tambah Grup Baru</h3>
              <button
                type="button"
                onClick={() => setIsAddKafilahOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Kode Grup
              </label>
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
        </div>
      )}

      {/* Modal Tambah Peserta */}
      {isAddParticipantOpen && selectedKafilah && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleSaveParticipant}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                Daftarkan Peserta - {selectedKafilah.name}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddParticipantOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addPartError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{addPartError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nama Lengkap Peserta
              </label>
              <input
                type="text"
                required
                value={newPartName}
                onChange={(e) => setNewPartName(e.target.value)}
                placeholder="Nama peserta qari/qariah"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-700 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Undian
                </label>
                <input
                  type="text"
                  value={newPartLottery}
                  onChange={(e) => setNewPartLottery(e.target.value)}
                  placeholder="Misal: 07"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ID Peserta
                </label>
                <input
                  type="text"
                  value={newPartId}
                  onChange={(e) => setNewPartId(e.target.value)}
                  placeholder="Misal: TLW-007"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Jenis Kelamin
                </label>
                <select
                  value={newPartGender}
                  onChange={(e) => setNewPartGender(e.target.value as 'Putra' | 'Putri')}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  <option value="Putra">Putra</option>
                  <option value="Putri">Putri</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Cabang Musabaqah
                </label>
                <select
                  value={newPartBranch}
                  onChange={(e) => setNewPartBranch(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  <option value="Tilawah Dewasa Putra">Tilawah Dewasa Putra</option>
                  <option value="Tilawah Dewasa Putri">Tilawah Dewasa Putri</option>
                  <option value="Tahfidz 30 Juz Putra">Tahfidz 30 Juz Putra</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Babak Awal
                </label>
                <select
                  value={newPartStage}
                  onChange={(e) => setNewPartStage(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg outline-none"
                >
                  {stages.map((stg) => (
                    <option key={stg.id} value={stg.name}>
                      {stg.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500">
              <span className="font-semibold text-slate-700">Catatan Soal & Maqra:</span> Peserta baru belum memiliki maqra saat pendaftaran. Penetapan maqra dilakukan secara terpisah melalui modul Bank Soal (undian otomatis atau penetapan manual).
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddParticipantOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg shadow-xs cursor-pointer"
              >
                Daftarkan Peserta
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
