import React, { useState } from 'react';
import {
  UserCheck,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Pencil,
  Power,
  Building,
  X,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { User, UserRole } from '../../types/mtq';

export const SuperadminUsersView: React.FC = () => {
  const {
    users,
    addUser,
    updateUser,
    retryUserProvisioning,
    requestPasswordReset,
    tenants,
    isLiveSupabaseMode
  } = useMtq();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('Semua Peran');
  const [selectedTenantFilter, setSelectedTenantFilter] = useState('Semua Tenant');
  const [operationBanner, setOperationBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Tenant reassignment confirmation modal
  const [reassignModalUser, setReassignModalUser] = useState<User | null>(null);
  const [targetTenantId, setTargetTenantId] = useState('');

  // Form states
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('admin');
  const [formTenantId, setFormTenantId] = useState('tenant-jabar');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesRole =
      selectedRoleFilter === 'Semua Peran' ||
      (selectedRoleFilter === 'Superadmin' && u.role === 'superadmin') ||
      (selectedRoleFilter === 'Admin' && u.role === 'admin') ||
      (selectedRoleFilter === 'Hakim' && u.role === 'judge');

    const matchesTenant =
      selectedTenantFilter === 'Semua Tenant' ||
      (selectedTenantFilter === 'Platform' && u.tenantId === 'platform') ||
      (selectedTenantFilter === 'unassigned' && u.tenantId === 'unassigned') ||
      u.tenantId === selectedTenantFilter;

    return matchesSearch && matchesRole && matchesTenant;
  });

  const getTenantName = (tId: string) => {
    if (tId === 'platform') return 'Platform Superadmin';
    if (tId === 'unassigned') return 'Belum Ditugaskan ke Tenant';
    const t = tenants.find((item) => item.id === tId);
    return t ? t.name : tId;
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormName('');
    setFormUsername('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('admin');
    setFormTenantId(tenants[0]?.id || 'tenant-jabar');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormUsername(u.username);
    setFormEmail(u.email || '');
    setFormPassword('');
    setFormRole(u.role);
    setFormTenantId(u.tenantId === 'unassigned' ? tenants[0]?.id || 'tenant-jabar' : u.tenantId);
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formUsername) return;
    if (!editingUser && formPassword && formPassword.length < 8) {
      setOperationBanner({
        type: 'warning',
        message: 'Kata sandi awal untuk akun baru wajib minimal 8 karakter.'
      });
      return;
    }
    setIsSubmitting(true);
    setOperationBanner(null);

    try {
      if (editingUser) {
        const res = await updateUser(editingUser.id, {
          name: formName,
          username: formUsername,
          email: formEmail,
          role: formRole,
          tenantId: formRole === 'superadmin' ? 'platform' : formTenantId
        });
        setOperationBanner({
          type: res.success ? 'success' : 'warning',
          message: res.message
        });
      } else {
        const res = await addUser({
          name: formName,
          username: formUsername,
          email: formEmail,
          role: formRole,
          tenantId: formRole === 'superadmin' ? 'platform' : formTenantId,
          status: 'Aktif',
          initialPassword: formPassword.trim() || undefined
        });
        setOperationBanner({
          type: res.success ? 'success' : 'warning',
          message: res.message
        });
      }

      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenReassign = (u: User) => {
    setReassignModalUser(u);
    const otherTenant = tenants.find((t) => t.id !== u.tenantId);
    setTargetTenantId(otherTenant ? otherTenant.id : tenants[0]?.id || '');
  };

  const handleConfirmReassign = async () => {
    if (reassignModalUser && targetTenantId) {
      const res = await updateUser(reassignModalUser.id, { tenantId: targetTenantId });
      setOperationBanner({
        type: res.success ? 'success' : 'warning',
        message: res.message
      });
      setReassignModalUser(null);
    }
  };

  const handleRetryProvisioning = async (userId: string) => {
    setOperationBanner(null);
    const res = await retryUserProvisioning(userId);
    setOperationBanner({
      type: res.success ? 'success' : 'error',
      message: res.message
    });
  };

  const handleSendPasswordReset = async (email?: string) => {
    if (!email) return;
    setOperationBanner(null);
    const res = await requestPasswordReset(email);
    setOperationBanner({
      type: res.success ? 'success' : 'error',
      message: res.message
    });
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900">
              Manajemen Akun Global
            </h1>
            <span className="text-[11px] font-semibold text-purple-800 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
              Superadmin Platform
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Kelola seluruh akun platform dan tetapkan hak akses lintas tenant MTQ
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-purple-800 hover:bg-purple-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Akun Baru</span>
        </button>
      </div>

      {operationBanner && (
        <div
          className={`rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs border ${
            operationBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : operationBanner.type === 'warning'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <span>{operationBanner.message}</span>
          <button
            onClick={() => setOperationBanner(null)}
            className="text-slate-500 hover:text-slate-800 font-bold px-2 py-0.5"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, username, atau email..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-purple-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700"
          >
            <option value="Semua Peran">Semua Peran</option>
            <option value="Superadmin">Superadmin</option>
            <option value="Admin">Admin MTQ</option>
            <option value="Hakim">Dewan Hakim</option>
          </select>

          <select
            value={selectedTenantFilter}
            onChange={(e) => setSelectedTenantFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700"
          >
            <option value="Semua Tenant">Semua Tenant MTQ</option>
            <option value="Platform">Platform Inti</option>
            <option value="unassigned">Belum Ditugaskan (Tabel Profiles)</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px] text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-[10px] tracking-wider">
                <th className="px-5 py-3">Nama Pengguna</th>
                <th className="px-4 py-3">Username & Email</th>
                <th className="px-4 py-3">Peran</th>
                <th className="px-4 py-3">Penyelenggara MTQ (Tenant)</th>
                <th className="px-4 py-3">Status & Provisioning</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                    Belum ada akun pada tabel <code className="font-mono bg-slate-100 px-1 rounded">public.profiles</code> yang sesuai filter. Gunakan tombol <strong>Tambah Akun Baru</strong> atau fitur <strong>Daftar Akun Baru</strong> pada halaman login.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const provStatus =
                    u.provisioningStatus || (u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif');
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-900">{u.name}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{u.judgeCategory || ''}</p>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        <p>{u.username}</p>
                        <p className="text-[10px] text-slate-400">{u.email || '-'}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'superadmin'
                              ? 'bg-purple-100 text-purple-800'
                              : u.role === 'admin'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {u.role === 'superadmin'
                            ? 'Superadmin'
                            : u.role === 'admin'
                            ? 'Admin MTQ'
                            : 'Dewan Hakim'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <p
                          className={`font-semibold ${
                            u.tenantId === 'unassigned' ? 'text-amber-700 italic' : 'text-slate-800'
                          }`}
                        >
                          {getTenantName(u.tenantId)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              provStatus === 'Aktif'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : provStatus === 'Menunggu Verifikasi' || provStatus === 'Mengundang...'
                                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                : provStatus === 'Gagal / Perlu Tindakan Admin'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {provStatus === 'Aktif' ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <XCircle className="w-3 h-3 text-current" />
                            )}
                            <span>{provStatus}</span>
                          </span>
                          {u.provisioningMessage && (
                            <p className="text-[10px] text-slate-500 max-w-xs leading-snug">
                              {u.provisioningMessage}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {provStatus === 'Gagal / Perlu Tindakan Admin' && (
                          <button
                            onClick={() => handleRetryProvisioning(u.id)}
                            className="px-2 py-1 text-[10px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 rounded"
                            title="Coba Ulang Provisioning"
                          >
                            Coba Ulang
                          </button>
                        )}
                        {u.email && isLiveSupabaseMode && (
                          <button
                            onClick={() => handleSendPasswordReset(u.email)}
                            className="px-2 py-1 text-[10px] font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded"
                            title="Kirim Email Reset Kata Sandi"
                          >
                            Reset Sandi
                          </button>
                        )}
                        {u.role !== 'superadmin' && (
                          <button
                            onClick={() => handleOpenReassign(u)}
                            className="px-2 py-1 text-xs text-purple-800 hover:bg-purple-50 font-semibold rounded"
                            title="Tetapkan atau Pindahkan Tenant"
                          >
                            {u.tenantId === 'unassigned' ? 'Tetapkan MTQ' : 'Pindah MTQ'}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 text-slate-500 hover:text-purple-800 hover:bg-purple-50 rounded"
                          title="Edit Akun"
                        >
                          <Pencil className="w-3.5 h-3.5 inline" />
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

      {/* Reassign Tenant Confirmation Modal */}
      {reassignModalUser && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="font-extrabold text-base text-slate-900 mb-2">
              {reassignModalUser.tenantId === 'unassigned'
                ? 'Tetapkan Penyelenggara MTQ (Tenant)'
                : 'Konfirmasi Pemindahan Tenant'}
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed mb-4">
              Anda akan menetapkan hak akses akun <strong>{reassignModalUser.name}</strong> ke penyelenggara MTQ tujuan.
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Status Saat Ini:</span>
                <span className="font-semibold text-slate-800">
                  {getTenantName(reassignModalUser.tenantId)}
                </span>
              </div>
              <div className="flex items-center justify-between text-purple-800">
                <span className="font-bold">Tujuan:</span>
                <select
                  value={targetTenantId}
                  onChange={(e) => setTargetTenantId(e.target.value)}
                  className="px-2 py-1 border border-slate-300 rounded font-semibold text-slate-900 bg-white"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReassignModalUser(null)}
                className="px-4 py-2 border rounded-lg text-xs font-semibold"
              >
                Batal
              </button>
              <button
                onClick={handleConfirmReassign}
                className="px-4 py-2 bg-purple-800 text-white rounded-lg text-xs font-bold"
              >
                Simpan Penugasan MTQ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingUser ? 'Edit Akun Pengguna' : 'Tambah Akun Global'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-600 block mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Username</label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">
                    Email {!editingUser && formPassword ? '(Wajib)' : ''}
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required={!editingUser && Boolean(formPassword)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {!editingUser && (
                <div>
                  <label className="font-bold text-slate-600 block mb-1">
                    Kata Sandi Awal (Minimal 8 Karakter)
                  </label>
                  <input
                    type="password"
                    minLength={8}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="Isi kata sandi untuk langsung membuat akun login"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Jika diisi, sistem akan langsung mendaftarkan akun di <code>auth.users</code> dan <code>public.profiles</code> dengan kata sandi ini tanpa mengeluarkan sesi Superadmin Anda.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Peran</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="admin">Admin MTQ</option>
                    <option value="judge">Dewan Hakim</option>
                    <option value="superadmin">Superadmin Platform</option>
                  </select>
                </div>

                {formRole !== 'superadmin' && (
                  <div>
                    <label className="font-bold text-slate-600 block mb-1">Penyelenggara (Tenant)</label>
                    <select
                      value={formTenantId}
                      onChange={(e) => setFormTenantId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      {tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
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
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-purple-800 disabled:opacity-50 text-white rounded-lg font-bold"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
