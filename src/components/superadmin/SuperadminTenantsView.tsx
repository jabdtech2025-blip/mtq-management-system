import React, { useState } from 'react';
import {
  Building,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Pencil,
  Power,
  Trash2,
  Users,
  X,
  ExternalLink,
  AlertCircle,
  ShieldAlert
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Tenant } from '../../types/mtq';
import {
  canSuperviseTenant,
  filterTenantsForManagement,
  TenantStatusFilter
} from '../../utils/superadminGuard';
import { SupervisionModal } from './SupervisionModal';
import { TenantLogoField } from './TenantLogoField';

export const SuperadminTenantsView: React.FC = () => {
  const {
    tenants,
    addTenant,
    updateTenant,
    toggleTenantStatus,
    deleteTenant,
    enterTenantWorkspace
  } = useMtq();

  const [superviseModalTenant, setSuperviseModalTenant] = useState<Tenant | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TenantStatusFilter>('Aktif');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [deleteModalTenant, setDeleteModalTenant] = useState<Tenant | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [operationBanner, setOperationBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formEventName, setFormEventName] = useState('');
  const [formRegion, setFormRegion] = useState('');
  const [formEdition, setFormEdition] = useState('');
  const [formPeriod, setFormPeriod] = useState('2025 - 2026');
  const [formLogoUrl, setFormLogoUrl] = useState('');
  const [logoLinkError, setLogoLinkError] = useState<string | null>(null);

  const activeTenantsCount = tenants.filter((t) => t.status === 'Aktif').length;
  const inactiveTenantsCount = tenants.length - activeTenantsCount;

  const filteredTenants = filterTenantsForManagement(tenants, {
    statusFilter,
    searchQuery
  });

  const handleOpenAdd = () => {
    setEditingTenant(null);
    setModalError(null);
    setFormName('');
    setFormCode('LPTQ-');
    setFormEventName('MTQ Tingkat Provinsi 2025');
    setFormRegion('Provinsi Jawa Timur');
    setFormEdition('Edisi XXXI - 2025');
    setFormPeriod('2025 - 2026');
    setFormLogoUrl('');
    setLogoLinkError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: Tenant) => {
    setEditingTenant(t);
    setModalError(null);
    setFormName(t.name);
    setFormCode(t.code);
    setFormEventName(t.eventName);
    setFormRegion(t.region);
    setFormEdition(t.edition || '');
    setFormPeriod(t.period || '2025 - 2026');
    setFormLogoUrl(t.logoUrl || '');
    setLogoLinkError(null);
    setIsModalOpen(true);
  };

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formCode.trim()) return;
    if (logoLinkError) {
      setModalError(logoLinkError);
      return;
    }
    setModalError(null);
    setIsSaving(true);

    try {
      let res: { success: boolean; message: string };
      if (editingTenant) {
        res = await updateTenant(editingTenant.id, {
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          eventName: formEventName.trim(),
          region: formRegion.trim(),
          edition: formEdition.trim(),
          period: formPeriod.trim(),
          logoUrl: formLogoUrl.trim()
        });
      } else {
        res = await addTenant({
          name: formName.trim(),
          code: formCode.trim().toUpperCase(),
          eventName: formEventName.trim(),
          region: formRegion.trim(),
          edition: formEdition.trim(),
          period: formPeriod.trim(),
          logoUrl: formLogoUrl.trim(),
          status: 'Aktif',
          userCount: 1
        });
      }

      if (!res.success) {
        setModalError(res.message);
        return;
      }

      setOperationBanner({
        type: 'success',
        message: res.message
      });
      setIsModalOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenSupervise = (t: Tenant) => {
    const guard = canSuperviseTenant(t);
    if (!guard.allowed) {
      setOperationBanner({
        type: 'error',
        message: guard.message || 'Penyelenggara nonaktif tidak dapat dibuka.'
      });
      return;
    }
    setSuperviseModalTenant(t);
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Manajemen Penyelenggara MTQ (Tenants)
            </h1>
            <span className="text-xs font-semibold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
              Superadmin Platform
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola instansi LPTQ wilayah, gelaran acara musabaqah, dan penugasan administrator wilayah
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-purple-800 hover:bg-purple-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Penyelenggara (Tenant)</span>
        </button>
      </div>

      {operationBanner && (
        <div
          className={`rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs border ${
            operationBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{operationBanner.message}</span>
          <button
            onClick={() => setOperationBanner(null)}
            className="text-slate-500 hover:text-slate-800 font-bold px-2 py-0.5 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama lembaga LPTQ, kode wilayah, atau nama acara..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TenantStatusFilter)}
          aria-label="Filter Status Penyelenggara"
          className="px-3 py-2 text-xs font-semibold border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 text-slate-700 bg-white cursor-pointer sm:min-w-[200px]"
        >
          <option value="Aktif">Aktif ({activeTenantsCount})</option>
          <option value="Nonaktif">Nonaktif / Arsip ({inactiveTenantsCount})</option>
          <option value="Semua">Semua Status ({tenants.length})</option>
        </select>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-xs tracking-wider">
                <th className="px-5 py-3 w-28">Kode</th>
                <th className="px-5 py-3">Nama Penyelenggara MTQ</th>
                <th className="px-4 py-3">Wilayah & Periode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
                    {searchQuery.trim()
                      ? 'Tidak ada penyelenggara MTQ yang cocok dengan pencarian dan filter status ini.'
                      : statusFilter === 'Nonaktif'
                      ? 'Belum ada penyelenggara MTQ berstatus Nonaktif / Arsip.'
                      : 'Belum ada penyelenggara MTQ yang aktif.'}
                  </td>
                </tr>
              ) : (
              filteredTenants.map((t, idx) => (
                <tr key={`${t.id}-${idx}`} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-mono font-bold text-purple-900">
                    {t.code}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{t.eventName}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-800">{t.region}</p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      {t.edition} · {t.period}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        t.status === 'Aktif'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {t.status === 'Aktif' ? (
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <XCircle className="w-3 h-3 text-slate-400" />
                      )}
                      <span>{t.status}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={t.status !== 'Aktif'}
                      onClick={() => handleOpenSupervise(t)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg inline-flex items-center gap-1 ${
                        t.status === 'Aktif'
                          ? 'bg-purple-50 text-purple-800 hover:bg-purple-100 cursor-pointer'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                      title={
                        t.status === 'Aktif'
                          ? 'Buka Workspace MTQ dalam Mode Supervisi'
                          : 'Aktifkan penyelenggara terlebih dahulu untuk membuka workspace'
                      }
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka Workspace</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(t)}
                      className="p-1.5 text-slate-500 hover:text-purple-800 hover:bg-purple-50 rounded cursor-pointer"
                      title="Edit MTQ"
                    >
                      <Pencil className="w-3.5 h-3.5 inline" />
                    </button>
                    <button
                      onClick={async () => {
                        const res = await toggleTenantStatus(t.id);
                        setOperationBanner({
                          type: res.success ? 'success' : 'error',
                          message: res.message
                        });
                      }}
                      className={`p-1.5 rounded cursor-pointer transition-colors ${
                        t.status === 'Aktif'
                          ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-50'
                          : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'
                      }`}
                      title={t.status === 'Aktif' ? 'Nonaktifkan Penyelenggara MTQ' : 'Aktifkan Penyelenggara MTQ'}
                    >
                      <Power className="w-3.5 h-3.5 inline" />
                    </button>
                    {t.id !== 'platform' && t.id !== '00000000-0000-0000-0000-000000000000' && (
                      <button
                        onClick={() => setDeleteModalTenant(t)}
                        className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                        title="Hapus Penyelenggara MTQ"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    )}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Tenant Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingTenant ? 'Edit Data Penyelenggara MTQ' : 'Tambah Penyelenggara Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Tutup modal penyelenggara"
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={(e) => void handleSaveTenant(e)} className="space-y-4 text-xs">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold leading-relaxed">{modalError}</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="font-bold text-slate-600 block mb-1">
                    Nama Lembaga Penyelenggara
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    placeholder="LPTQ Provinsi Jawa Barat"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Kode Singkat</label>
                  <input
                    type="text"
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    required
                    placeholder="LPTQ-JBR"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Gelaran Acara MTQ</label>
                <input
                  type="text"
                  value={formEventName}
                  onChange={(e) => setFormEventName(e.target.value)}
                  required
                  placeholder="MTQ Nasional Tingkat Provinsi Jawa Barat XXXI 2025"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Wilayah / Daerah</label>
                  <input
                    type="text"
                    value={formRegion}
                    onChange={(e) => setFormRegion(e.target.value)}
                    required
                    placeholder="Jawa Barat"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Edisi</label>
                  <input
                    type="text"
                    value={formEdition}
                    onChange={(e) => setFormEdition(e.target.value)}
                    placeholder="XXXI - 2025"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Periode</label>
                  <input
                    type="text"
                    value={formPeriod}
                    onChange={(e) => setFormPeriod(e.target.value)}
                    placeholder="2025 - 2026"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <TenantLogoField
                key={editingTenant?.id || 'new'}
                value={formLogoUrl}
                onChange={setFormLogoUrl}
                onLinkError={setLogoLinkError}
                disabled={isSaving}
              />

              <div className="flex justify-end gap-2 pt-3 border-t">
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border rounded-lg font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 bg-purple-800 hover:bg-purple-900 disabled:opacity-60 text-white rounded-lg font-bold cursor-pointer"
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Penyelenggara'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Tenant Confirmation Modal */}
      {deleteModalTenant && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full shadow-lg border border-slate-200 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-900">
                  Hapus Penyelenggara MTQ?
                </h3>
                <p className="text-xs text-slate-500">
                  Tindakan ini permanen dan menghapus seluruh data terkait.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200 leading-relaxed">
              Apakah Anda yakin ingin menghapus <strong>{deleteModalTenant.name}</strong> ({deleteModalTenant.code})? Seluruh data musabaqah dan keanggotaan tenant ini akan dihapus dari sistem.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteModalTenant(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  const res = await deleteTenant(deleteModalTenant.id);
                  setIsDeleting(false);
                  setDeleteModalTenant(null);
                  setOperationBanner({
                    type: res.success ? 'success' : 'error',
                    message: res.message
                  });
                }}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus Penyelenggara'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supervise Mode Confirmation Modal */}
      <SupervisionModal
        tenant={superviseModalTenant}
        onClose={() => setSuperviseModalTenant(null)}
        onConfirm={(tenantId, reason) => enterTenantWorkspace(tenantId, reason)}
      />
    </div>
  );
};
