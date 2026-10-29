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
  X,
  AlertCircle
} from 'lucide-react';
import { useMtq } from '../../context/MtqContext';
import { User, UserRole } from '../../types/mtq';

export const UserManagementView: React.FC = () => {
  const {
    users,
    addUser,
    updateUser,
    toggleUserStatus,
    retryUserProvisioning,
    requestPasswordReset,
    currentTenant,
    isLiveSupabaseMode
  } = useMtq();

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
  const [formCategory, setFormCategory] = useState('Hakim 1');
  const [formField, setFormField] = useState('Bidang Tajwid & Makhraj');
  const [formBranch, setFormBranch] = useState('Tilawah Dewasa Putra');
  const [formStage, setFormStage] = useState('Penyisihan');
  const [formMimbar, setFormMimbar] = useState('Mimbar Utama Masjid Al-Jabbar');

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
    setFormCategory('Hakim Baru');
    setFormField('Bidang Fasahah & Waqf');
    setFormBranch('Tilawah Dewasa Putra');
    setFormStage('Penyisihan');
    setFormMimbar('Mimbar Utama');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormUsername(u.username);
    setFormEmail(u.email || '');
    setFormPassword('');
    setFormRole(u.role);
    setFormCategory(u.judgeCategory || '');
    setFormField(u.judgeField || '');
    setFormBranch(u.assignedBranch || 'Tilawah Dewasa Putra');
    setFormStage(u.assignedStage || 'Penyisihan');
    setFormMimbar(u.mimbarLocation || '');
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
          judgeCategory: formRole === 'judge' ? formCategory : undefined,
          judgeField: formRole === 'judge' ? formField : undefined,
          assignedBranch: formRole === 'judge' ? formBranch : undefined,
          assignedStage: formRole === 'judge' ? formStage : undefined,
          mimbarLocation: formRole === 'judge' ? formMimbar : undefined
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
          judgeCategory: formRole === 'judge' ? formCategory : undefined,
          judgeField: formRole === 'judge' ? formField : undefined,
          assignedBranch: formRole === 'judge' ? formBranch : undefined,
          assignedStage: formRole === 'judge' ? formStage : undefined,
          mimbarLocation: formRole === 'judge' ? formMimbar : undefined,
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
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
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

      {/* Provisioning & Security Mode Banner */}
      <div
        className={`rounded-xl p-3.5 flex items-start gap-2.5 text-xs border ${
          isLiveSupabaseMode
            ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
            : 'bg-amber-50 border-amber-200 text-amber-900'
        }`}
      >
        <AlertCircle
          className={`w-4 h-4 shrink-0 mt-0.5 ${
            isLiveSupabaseMode ? 'text-emerald-700' : 'text-amber-700'
          }`}
        />
        <p className="leading-relaxed">
          {isLiveSupabaseMode ? (
            <>
              <strong>Provisioning Supabase Auth & Tenant Membership:</strong> Penambahan atau pembaruan akun dengan alamat email akan menautkan profil pada <code>auth.users</code> melalui RPC <code>upsert_tenant_member_profile</code> atau mengirim undangan resmi melalui Edge Function <code>admin-provision-user</code> tanpa mengekspos <code>service_role</code> di klien.
            </>
          ) : (
            <>
              <strong>Mode Simulasi Lokal Terisolasi:</strong> Anda sedang berada di mode simulasi lokal. Perubahan akun disimpan pada memori sesi lokal.
            </>
          )}
        </p>
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
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama pengguna, username, email, atau bidang..."
            className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-700 text-slate-800 placeholder-slate-400 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-xs outline-none bg-white font-medium text-slate-700"
          >
            <option value="Semua Peran">Semua Peran</option>
            <option value="Admin">Admin MTQ</option>
            <option value="Hakim">Dewan Hakim</option>
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
                filteredUsers.map((u) => {
                  const provStatus =
                    u.provisioningStatus || (u.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif');
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-slate-900">{u.name}</p>
                        {u.mimbarLocation && (
                          <p className="text-[10px] text-slate-400 mt-0.5">{u.mimbarLocation}</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-slate-600">
                        <p>{u.username}</p>
                        <p className="text-[10px] text-slate-400">{u.email || '-'}</p>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
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
                            <p className="text-[10px] text-slate-500">
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
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
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
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 text-slate-500 hover:text-emerald-800 hover:bg-emerald-50 rounded"
                          title="Edit Profil"
                        >
                          <Pencil className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          onClick={() => toggleUserStatus(u.id)}
                          className="p-1.5 text-slate-500 hover:text-amber-800 hover:bg-amber-50 rounded"
                          title={u.status !== 'Nonaktif' ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
                        >
                          <Power className="w-3.5 h-3.5 inline" />
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
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingUser ? 'Edit Pengguna / Hakim' : 'Tambah Pengguna Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
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
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    Jika diisi, sistem akan langsung mendaftarkan akun di <code>auth.users</code> dan <code>public.profiles</code> dengan kata sandi ini tanpa mengeluarkan sesi Anda.
                  </p>
                </div>
              )}

              {formRole === 'judge' && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                  <p className="font-bold text-[11px] uppercase tracking-wider text-emerald-800">
                    Konfigurasi Penugasan Hakim
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Label Hakim</label>
                      <input
                        type="text"
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        placeholder="Hakim 1"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Bidang Penilaian</label>
                      <input
                        type="text"
                        value={formField}
                        onChange={(e) => setFormField(e.target.value)}
                        placeholder="Bidang Tajwid & Makhraj"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Cabang Penugasan</label>
                      <input
                        type="text"
                        value={formBranch}
                        onChange={(e) => setFormBranch(e.target.value)}
                        placeholder="Tilawah Dewasa Putra"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-600 block mb-1">Lokasi Mimbar</label>
                      <input
                        type="text"
                        value={formMimbar}
                        onChange={(e) => setFormMimbar(e.target.value)}
                        placeholder="Mimbar Utama Masjid Al-Jabbar"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
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
