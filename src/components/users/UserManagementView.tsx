import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Gavel,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Pencil,
  Power,
  Trash2,
  X,
  AlertCircle
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { User, UserRole } from '../../types/mtq';

export const UserManagementView: React.FC = () => {
  const {
    users,
    currentUser,
    authenticatedProfile,
    addUser,
    updateUser,
    toggleUserStatus,
    deleteUser,
    retryUserProvisioning,
    requestPasswordReset,
    currentTenant,
    isLiveSupabaseMode,
    cabangList,
    rubricVersions
  } = useMtq();

  // Active branches from Master Data
  const activeBranches = React.useMemo(() => {
    const active = cabangList.filter((c) => c.status === 'Aktif');
    return active.length > 0 ? active : cabangList;
  }, [cabangList]);

  // Active rubric fields from Master Data
  const activeRubricFields = React.useMemo(() => {
    const fieldNames = new Set<string>();
    rubricVersions
      .filter((rv) => rv.status === 'Aktif')
      .forEach((rv) => {
        rv.fields.forEach((f) => {
          if (f.name) fieldNames.add(f.name);
        });
      });
    if (fieldNames.size === 0) {
      rubricVersions.forEach((rv) => {
        rv.fields.forEach((f) => {
          if (f.name) fieldNames.add(f.name);
        });
      });
    }
    const list = Array.from(fieldNames);
    return list.length > 0
      ? list
      : ['Bidang Tajwid', 'Bidang Fashohah', 'Bidang Suara', 'Bidang Lagu'];
  }, [rubricVersions]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('Semua Peran');
  const [operationBanner, setOperationBanner] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('judge');
  const [formField, setFormField] = useState('');
  const [formBranch, setFormBranch] = useState('');
  const [formStage, setFormStage] = useState('Penyisihan');

  // Filter users by current tenant (or platform for superadmin viewing)
  const tenantUsers = users.filter(
    (u) => u.tenantId === currentTenant.id || u.tenantId === 'platform'
  );

  const filteredUsers = tenantUsers.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (u.judgeField && u.judgeField.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRole =
      selectedRoleFilter === 'Semua Peran' ||
      (selectedRoleFilter === 'Admin' && u.role === 'admin') ||
      (selectedRoleFilter === 'Hakim' && u.role === 'judge') ||
      (selectedRoleFilter === 'Superadmin' && u.role === 'superadmin');

    return matchesSearch && matchesRole;
  });

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormName('');
    setFormUsername('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('judge');
    setFormField(activeRubricFields[0] || 'Bidang Tajwid');
    setFormBranch(activeBranches[0]?.name || '');
    setFormStage('Penyisihan');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormUsername(u.username);
    setFormEmail(u.email || '');
    setFormPassword('');
    setFormRole(u.role);
    setFormField(u.judgeField || activeRubricFields[0] || '');
    setFormBranch(u.assignedBranch || activeBranches[0]?.name || '');
    setFormStage(u.assignedStage || 'Penyisihan');
    setIsModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formUsername) return;
    if (!editingUser && formPassword && formPassword.length < 8) {
      setOperationBanner({
        type: 'warning',
        message: 'Kata sandi awal wajib minimal 8 karakter.'
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
          judgeField: formRole === 'judge' ? formField : undefined,
          assignedBranch: formRole === 'judge' ? formBranch : undefined,
          assignedStage: formRole === 'judge' ? formStage : undefined
        });
        setOperationBanner({
          type: res.success ? 'success' : 'warning',
          message: res.message
        });
      } else {
        const res = await addUser({
          tenantId: currentTenant.id,
          name: formName,
          username: formUsername,
          email: formEmail,
          role: formRole,
          status: 'Aktif',
          judgeCategory: formRole === 'judge' ? 'Dewan Hakim' : undefined,
          judgeField: formRole === 'judge' ? formField : undefined,
          assignedBranch: formRole === 'judge' ? formBranch : undefined,
          assignedStage: formRole === 'judge' ? formStage : undefined,
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
              Manajemen Pengguna & Dewan Hakim
            </h1>
            <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {tenantUsers.length} Akun Terdaftar
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {currentTenant.name} · Kelola dewan hakim, admin cabang, dan penugasan mimbar perlombaan
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="inline-flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white font-semibold text-xs px-4 py-2.5 rounded-lg shadow-sm transition-all self-start sm:self-auto cursor-pointer"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tambah Pengguna / Hakim</span>
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
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-3">
        <div className="relative flex-[2] min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama pengguna, username, email, atau bidang..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        <select
          value={selectedRoleFilter}
          onChange={(e) => setSelectedRoleFilter(e.target.value)}
          className="flex-1 sm:max-w-xs min-w-[180px] px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700"
        >
          <option value="Semua Peran">Semua Peran</option>
          <option value="Admin">Admin MTQ</option>
          <option value="Hakim">Dewan Hakim</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[780px] text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 font-bold uppercase text-xs tracking-wider">
                <th className="px-5 py-3">Nama Pengguna</th>
                <th className="px-4 py-3">Username / Email</th>
                <th className="px-4 py-3">Peran</th>
                <th className="px-4 py-3">Penugasan Bidang & Cabang</th>
                <th className="px-4 py-3">Status & Provisioning</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Tidak ada akun yang sesuai.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u, idx) => {
                  const provStatus =
                    u.provisioningStatus || (u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif');
                  return (
                    <tr key={`${u.id}-${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-900">{u.name}</p>
                        {u.mimbarLocation && (
                          <p className="text-xs text-slate-400 mt-0.5">{u.mimbarLocation}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        <p>{u.username}</p>
                        <p className="text-xs text-slate-400">{u.email || '-'}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
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
                            : u.judgeCategory || 'Hakim'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {u.role === 'judge' ? (
                          <div>
                            <p className="font-semibold text-slate-800">{u.judgeField}</p>
                            <p className="text-xs text-slate-500">
                              {u.assignedBranch || 'Tilawah Dewasa'} ({u.assignedStage || 'Penyisihan'})
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
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
                            <p className="text-xs text-slate-500 max-w-xs leading-snug">
                              {u.provisioningMessage}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                        {provStatus === 'Gagal / Perlu Tindakan Admin' && (
                          <button
                            onClick={() => handleRetryProvisioning(u.id)}
                            className="px-2 py-1 text-xs font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 rounded"
                            title="Coba Ulang Provisioning"
                          >
                            Coba Ulang
                          </button>
                        )}
                        {u.email && isLiveSupabaseMode && (
                          <button
                            onClick={() => handleSendPasswordReset(u.email)}
                            className="px-2 py-1 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded"
                            title="Kirim Email Reset Kata Sandi"
                          >
                            Reset Sandi
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 text-slate-500 hover:text-emerald-800 hover:bg-emerald-50 rounded"
                          title="Edit Profil"
                        >
                          <Pencil className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          onClick={async () => {
                            const res = await toggleUserStatus(u.id);
                            setOperationBanner({
                              type: res.success ? 'success' : 'error',
                              message: res.message
                            });
                          }}
                          disabled={
                            u.id === currentUser.id ||
                            Boolean(authenticatedProfile && u.id === authenticatedProfile.authUserId)
                          }
                          className="p-1.5 text-slate-500 hover:text-amber-800 hover:bg-amber-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            u.id === currentUser.id ||
                            Boolean(authenticatedProfile && u.id === authenticatedProfile.authUserId)
                              ? 'Tidak dapat menonaktifkan akun yang sedang Anda gunakan sendiri'
                              : u.status !== 'Nonaktif'
                              ? 'Nonaktifkan Akun'
                              : 'Aktifkan Akun'
                          }
                        >
                          <Power className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          onClick={async () => {
                            const res = await deleteUser(u.id);
                            setOperationBanner({
                              type: res.success ? 'success' : 'error',
                              message: res.message
                            });
                          }}
                          disabled={
                            u.id === currentUser.id ||
                            Boolean(authenticatedProfile && u.id === authenticatedProfile.authUserId)
                          }
                          className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            u.id === currentUser.id ||
                            Boolean(authenticatedProfile && u.id === authenticatedProfile.authUserId)
                              ? 'Tidak dapat menghapus akun yang sedang Anda gunakan sendiri'
                              : 'Hapus Akun'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5 inline" />
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

      {/* Add / Edit User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full shadow-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingUser ? 'Edit Pengguna / Hakim' : 'Tambah Pengguna Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                aria-label="Tutup modal pengguna"
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Nama Lengkap & Gelar</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                    placeholder="KH. Ahmad Dahlan, M.Ag"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Peran Akun</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="judge">Dewan Hakim</option>
                    <option value="admin">Admin MTQ</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-600 block mb-1">Username</label>
                  <input
                    type="text"
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    required
                    placeholder="hakim_dahlan"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-600 block mb-1">
                    Email {!editingUser && formPassword ? '(Wajib)' : '(Opsional)'}
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    required={!editingUser && Boolean(formPassword)}
                    placeholder="hakim@mtq.id"
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
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Jika diisi, sistem akan langsung mendaftarkan akun di auth.users dan public.profiles dengan kata sandi ini tanpa mengeluarkan sesi aktif Anda.
                  </p>
                </div>
              )}

              {formRole === 'judge' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                  <p className="font-bold text-xs uppercase tracking-wider text-emerald-800">
                    Konfigurasi Penugasan Hakim
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Bidang Penilaian</label>
                      <select
                        value={formField}
                        onChange={(e) => setFormField(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                      >
                        {activeRubricFields.map((fieldName) => (
                          <option key={fieldName} value={fieldName}>
                            {fieldName}
                          </option>
                        ))}
                        {formField && !activeRubricFields.includes(formField) && (
                          <option value={formField}>{formField}</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Cabang Penugasan</label>
                      <select
                        value={formBranch}
                        onChange={(e) => setFormBranch(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-800"
                      >
                        {activeBranches.map((cab) => (
                          <option key={cab.id} value={cab.name}>
                            {cab.name}
                          </option>
                        ))}
                        {formBranch && !activeBranches.some((c) => c.name === formBranch) && (
                          <option value={formBranch}>{formBranch}</option>
                        )}
                      </select>
                    </div>
                  </div>
                </div>
              )}

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
                  className="px-4 py-2 bg-emerald-800 text-white rounded-lg font-bold"
                >
                  {editingUser ? 'Simpan Perubahan' : 'Tambah Pengguna'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
