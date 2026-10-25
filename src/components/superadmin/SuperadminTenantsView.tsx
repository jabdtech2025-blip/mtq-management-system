import React, { useState } from 'react';
import {
  Building,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Pencil,
  Power,
  Users,
  X,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { Tenant } from '../../types/mtq';

export const SuperadminTenantsView: React.FC = () => {
  const { tenants, addTenant, updateTenant, setTenantId, setCurrentView } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formEventName, setFormEventName] = useState('');
  const [formRegion, setFormRegion] = useState('');
  const [formEdition, setFormEdition] = useState('');
  const [formPeriod, setFormPeriod] = useState('2025 - 2026');

  const filteredTenants = tenants.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.region.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingTenant(null);
    setFormName('');
    setFormCode('LPTQ-');
    setFormEventName('MTQ Tingkat Provinsi 2025');
    setFormRegion('Provinsi Jawa Timur');
    setFormEdition('Edisi XXXI - 2025');
    setFormPeriod('2025 - 2026');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t: Tenant) => {
    setEditingTenant(t);
    setFormName(t.name);
    setFormCode(t.code);
    setFormEventName(t.eventName);
    setFormRegion(t.region);
    setFormEdition(t.edition || '');
    setFormPeriod(t.period || '2025 - 2026');
    setIsModalOpen(true);
  };

  const handleSaveTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formCode) return;

    if (editingTenant) {
      updateTenant(editingTenant.id, {
        name: formName,
        code: formCode.toUpperCase(),
        eventName: formEventName,
        region: formRegion,
        edition: formEdition,
        period: formPeriod
      });
    } else {
      addTenant({
        name: formName,
        code: formCode.toUpperCase(),
        eventName: formEventName,
        region: formRegion,
        edition: formEdition,
        period: formPeriod,
        status: 'Aktif',
        userCount: 1
      });
    }

    setIsModalOpen(false);
  };

  const handleEnterTenant = (tenantId: string) => {
    setTenantId(tenantId);
    setCurrentView('dashboard');
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
            <span className="text-[11px] font-semibold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
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

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama lembaga LPTQ, kode wilayah, atau nama acara..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px] text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                <th className="px-5 py-3 w-28">Kode</th>
                <th className="px-5 py-3">Nama Penyelenggara MTQ</th>
                <th className="px-4 py-3">Wilayah & Periode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/70">
                  <td className="px-5 py-3.5 font-mono font-bold text-purple-900">
                    {t.code}
                  </td>
                  <td className="px-5 py-3.5">
                    <p className="font-bold text-slate-900">{t.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{t.eventName}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-800">{t.region}</p>
                    <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                      {t.edition} · {t.period}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        t.status === 'Aktif'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>{t.status}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-2">
                    <button
                      onClick={() => handleEnterTenant(t.id)}
                      className="px-2.5 py-1 text-xs font-semibold bg-purple-50 text-purple-800 hover:bg-purple-100 rounded-lg inline-flex items-center gap-1"
                      title="Buka Workspace MTQ"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka Workspace</span>
                    </button>
                    <button
                      onClick={() => handleOpenEdit(t)}
                      className="p-1.5 text-slate-500 hover:text-purple-800 hover:bg-purple-50 rounded"
                      title="Edit MTQ"
                    >
                      <Pencil className="w-3.5 h-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Tenant Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingTenant ? 'Edit Data Penyelenggara MTQ' : 'Tambah Penyelenggara Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTenant} className="space-y-4 text-xs">
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
                  className="px-4 py-2 bg-purple-800 text-white rounded-lg font-bold"
                >
                  Simpan Penyelenggara
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
