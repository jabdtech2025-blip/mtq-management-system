import React, { useState } from 'react';
import {
  ShieldCheck,
  Database,
  RefreshCw,
  LogIn,
  LogOut,
  AlertTriangle,
  Lock,
  FlaskConical,
  ArrowRight,
  UserPlus
} from 'lucide-react';
import { MtqProvider, useMtq } from './context/MtqContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { DemoAccountModal } from './components/layout/DemoAccountModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { KafilahPesertaView } from './components/kafilah/KafilahPesertaView';
import { BankSoalView } from './components/bankSoal/BankSoalView';
import { MasterDataView } from './components/masterData/MasterDataView';
import { PenilaianHakimListView } from './components/penilaian/PenilaianHakimListView';
import { RekapNilaiView } from './components/rekap/RekapNilaiView';
import { PenilaianDualPanelView } from './components/penilaian/PenilaianDualPanelView';
import { UserManagementView } from './components/users/UserManagementView';
import { StageManagementView } from './components/stages/StageManagementView';
import { HasilKelulusanView } from './components/stages/HasilKelulusanView';
import { SuperadminDashboardView } from './components/superadmin/SuperadminDashboardView';
import { SuperadminTenantsView } from './components/superadmin/SuperadminTenantsView';
import { SuperadminUsersView } from './components/superadmin/SuperadminUsersView';
import { SuperadminAuditView } from './components/superadmin/SuperadminAuditView';

const AuthenticationGateView: React.FC = () => {
  const {
    connectionInfo,
    authenticatedProfile,
    accessGateReason,
    workspaceError,
    isPasswordRecoveryMode,
    setIsPasswordRecoveryMode,
    refreshSupabaseConnection,
    signInWithSupabase,
    signUpWithSupabase,
    signOutSupabase,
    requestPasswordReset,
    completePasswordReset,
    bootstrapFirstSuperadmin,
    enterOfflineDemoSimulation
  } = useMtq();

  const [authViewMode, setAuthViewMode] = useState<'login' | 'signup' | 'forgot_password'>('login');
  const [signUpName, setSignUpName] = useState('');
  const [signUpUsername, setSignUpUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await signInWithSupabase(email, password);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
      if (res.success) {
        setPassword('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUpName.trim() || !email.trim() || !password) return;
    if (password.length < 8) {
      setFeedback({
        type: 'error',
        text: 'Kata sandi wajib minimal 8 karakter.'
      });
      return;
    }
    if (password !== confirmPassword) {
      setFeedback({
        type: 'error',
        text: 'Konfirmasi kata sandi tidak cocok.'
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);
    try {
      const derivedUsername =
        signUpUsername.trim() ||
        email
          .trim()
          .split('@')[0]
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .toLowerCase();

      const res = await signUpWithSupabase({
        name: signUpName.trim(),
        username: derivedUsername,
        email: email.trim(),
        password
      });
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
      if (res.success) {
        setPassword('');
        setConfirmPassword('');
        if (res.requiresEmailConfirmation) {
          setAuthViewMode('login');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await requestPasswordReset(email);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setFeedback({
        type: 'error',
        text: 'Kata sandi baru wajib minimal 8 karakter.'
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({
        type: 'error',
        text: 'Konfirmasi kata sandi baru tidak cocok.'
      });
      return;
    }
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await completePasswordReset(newPassword);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
      if (res.success) {
        setNewPassword('');
        setConfirmPassword('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBootstrapFirstSuperadmin = async () => {
    if (!authenticatedProfile?.email) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const res = await bootstrapFirstSuperadmin(authenticatedProfile.email);
      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefresh = async () => {
    setIsSubmitting(true);
    setFeedback(null);
    try {
      await refreshSupabaseConnection();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderConnectionBlockBanner = () => {
    if (accessGateReason === 'supabase_unconfigured') {
      return (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-extrabold text-rose-900">
                Konfigurasi Produksi Supabase Belum Ditemukan (Fail-Closed)
              </p>
              <p className="text-rose-800 leading-relaxed">
                Variabel lingkungan <code className="font-mono bg-rose-100 px-1 rounded">VITE_SUPABASE_URL</code> atau{' '}
                <code className="font-mono bg-rose-100 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> belum diatur atau
                tidak valid. Demi keamanan, workspace operasional diblokir dan tidak dibuka secara otomatis tanpa
                autentikasi.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (accessGateReason === 'connection_checking') {
      return (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 flex items-center gap-3 text-xs font-semibold">
          <RefreshCw className="w-4 h-4 text-emerald-700 animate-spin shrink-0" />
          <span>Memverifikasi koneksi database, skema tabel, dan sesi autentikasi Supabase...</span>
        </div>
      );
    }

    if (accessGateReason === 'connection_error' || accessGateReason === 'workspace_hydration_error') {
      return (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-2">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-extrabold text-rose-900">
                {accessGateReason === 'workspace_hydration_error'
                  ? 'Gagal Memuat Data Workspace dari Database'
                  : 'Gangguan Koneksi ke Database Supabase'}
              </p>
              <p className="text-rose-800 leading-relaxed">
                {workspaceError ||
                  connectionInfo.lastError ||
                  'Koneksi ke proyek Supabase gagal diverifikasi. Akses operasional ditahan hingga koneksi pulih.'}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderAccessDiagnostic = () => {
    if (
      !authenticatedProfile ||
      accessGateReason === 'unauthenticated' ||
      accessGateReason === 'supabase_unconfigured' ||
      accessGateReason === 'connection_checking'
    ) {
      return null;
    }

    let title = 'Otorisasi Workspace Ditolak (Fail-Closed)';
    let description =
      authenticatedProfile.verificationError ||
      workspaceError ||
      'Akun Anda belum memiliki hak akses aktif ke workspace tenant MTQ.';

    if (accessGateReason === 'profile_missing') {
      title = 'Profil Pengguna Belum Terdaftar (Tabel public.profiles)';
      description =
        authenticatedProfile.verificationError ||
        `Akun Auth (${authenticatedProfile.email}) berhasil login, tetapi baris profil pada tabel public.profiles belum dipetakan. Jika ini adalah akun Superadmin pertama sistem, tekan tombol Bootstrap Superadmin Pertama di bawah atau jalankan SELECT public.bootstrap_first_superadmin('${authenticatedProfile.email}'); di SQL Editor Supabase.`;
    } else if (accessGateReason === 'membership_empty') {
      title = 'Belum Terdaftar pada Tenant MTQ (tenant_memberships Kosong)';
      description =
        `Akun ${authenticatedProfile.email} telah terdaftar di tabel public.profiles, namun belum ditugaskan ke penyelenggara/tenant MTQ mana pun. Jika ini adalah akun Superadmin pertama sistem, tekan tombol "Bootstrap Superadmin Pertama" di bawah. Jika Anda adalah Admin/Hakim, hubungi Superadmin untuk menetapkan penugasan MTQ Anda.`;
    } else if (accessGateReason === 'membership_inactive') {
      title = 'Keanggotaan Tenant Nonaktif';
      description =
        authenticatedProfile.verificationError ||
        `Seluruh keanggotaan tenant untuk akun ${authenticatedProfile.email} saat ini berstatus Nonaktif.`;
    } else if (accessGateReason === 'query_error') {
      title = 'Gagal Memverifikasi Profil & Keanggotaan dari Database';
      description =
        authenticatedProfile.verificationError ||
        'Terjadi kesalahan saat membaca tabel profiles atau tenant_memberships pada Supabase.';
    } else if (accessGateReason === 'workspace_hydration_error') {
      title = 'Gagal Memuat Data Operasional Tenant';
      description =
        workspaceError ||
        'Sesi Anda terautentikasi, namun sebagian tabel workspace gagal dimuat dari Supabase.';
    }

    return (
      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-extrabold text-rose-900">{title}</p>
            <p className="text-rose-800 leading-relaxed">{description}</p>
            <p className="text-[11px] font-mono text-rose-700 pt-1">
              UID: {authenticatedProfile.authUserId} · Email: {authenticatedProfile.email} · Global Role:{' '}
              {authenticatedProfile.globalRole}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(accessGateReason === 'profile_missing' || accessGateReason === 'membership_empty') && (
            <button
              type="button"
              onClick={() => void handleBootstrapFirstSuperadmin()}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Bootstrap Superadmin Pertama
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-900 text-xs font-bold cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
            Periksa Ulang Otorisasi
          </button>
          <button
            type="button"
            onClick={() => void signOutSupabase()}
            disabled={isSubmitting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-900 text-white text-xs font-bold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar dari Sesi Ini
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-emerald-950 text-white border-b border-emerald-900">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-800/90 border border-emerald-600/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-900/90 border border-emerald-700 text-[10px] font-bold uppercase tracking-wider text-emerald-200 mb-1">
                <Lock className="w-3 h-3 text-amber-400" />
                Gerbang Keamanan Produksi MTQ (Fail-Closed)
              </span>
              <h1 className="text-lg font-extrabold tracking-tight">
                Sistem Manajemen & Penilaian MTQ
              </h1>
              <p className="text-xs text-emerald-200/80">
                Wajib autentikasi Supabase Auth & verifikasi keanggotaan tenant aktif
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Diagnostic Alert if authenticated but missing profile/membership */}
          {renderAccessDiagnostic()}

          {/* Password Recovery Mode (after user clicks email reset link) */}
          {isPasswordRecoveryMode ? (
            <form onSubmit={handleCompleteRecovery} className="space-y-4 bg-emerald-50/50 border border-emerald-200 p-4 rounded-xl">
              <div>
                <h2 className="text-sm font-extrabold text-emerald-950">
                  Pemulihan Kata Sandi Akun MTQ
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Sesi pemulihan terverifikasi. Masukkan kata sandi baru minimal 8 karakter untuk mengamankan akun Anda.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Kata Sandi Baru
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimal 8 karakter"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Konfirmasi Kata Sandi Baru
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ulangi kata sandi baru"
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              {feedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold border ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !newPassword || !confirmPassword}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                >
                  <Lock className="w-4 h-4" />
                  {isSubmitting ? 'Menyimpan Kata Sandi...' : 'Simpan Kata Sandi Baru'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsPasswordRecoveryMode(false);
                    setFeedback(null);
                  }}
                  className="px-3 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                >
                  Batal
                </button>
              </div>
            </form>
          ) : (
            /* Login / Sign Up / Forgot Password Form when unauthenticated and Supabase is configured */
            !authenticatedProfile &&
            connectionInfo.isConfigured && (
              <>
                {authViewMode !== 'forgot_password' && (
                  <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthViewMode('login');
                        setFeedback(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        authViewMode === 'login'
                          ? 'bg-emerald-900 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Masuk (Login)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthViewMode('signup');
                        setFeedback(null);
                      }}
                      className={`py-2 px-3 rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        authViewMode === 'signup'
                          ? 'bg-emerald-900 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Daftar Akun Baru
                    </button>
                  </div>
                )}

                {authViewMode === 'login' ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Email Akun Resmi (Admin / Dewan Hakim / Superadmin)
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@instansi.mtq.id"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-slate-700">
                          Kata Sandi
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setAuthViewMode('forgot_password');
                            setFeedback(null);
                          }}
                          className="text-xs font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                        >
                          Lupa Kata Sandi?
                        </button>
                      </div>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan kata sandi Supabase Auth"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>

                    {feedback && (
                      <div
                        className={`p-3 rounded-xl text-xs font-semibold border ${
                          feedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        {feedback.text}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting || !email.trim() || !password}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                    >
                      <LogIn className="w-4 h-4" />
                      {isSubmitting ? 'Memverifikasi Sesi & Otorisasi...' : 'Masuk ke Workspace Produksi'}
                    </button>
                  </form>
                ) : authViewMode === 'signup' ? (
                  <form onSubmit={handleSignUp} className="space-y-3.5">
                    <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-emerald-950 leading-relaxed">
                      Pendaftaran akan membuat akun autentikasi resmi di <strong>Supabase Auth</strong> dan otomatis mencatat profil Anda pada tabel <code className="font-mono bg-emerald-100 px-1 rounded">public.profiles</code>.
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nama Lengkap & Gelar
                        </label>
                        <input
                          type="text"
                          required
                          value={signUpName}
                          onChange={(e) => setSignUpName(e.target.value)}
                          placeholder="Contoh: H. Ahmad Fauzi, M.Ag"
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Username
                        </label>
                        <input
                          type="text"
                          value={signUpUsername}
                          onChange={(e) => setSignUpUsername(e.target.value)}
                          placeholder="Contoh: ahmad_fauzi"
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Email Resmi
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@instansi.mtq.id"
                        className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Kata Sandi Baru (Min. 8 Karakter)
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Minimal 8 karakter"
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Konfirmasi Kata Sandi
                        </label>
                        <input
                          type="password"
                          required
                          minLength={8}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Ulangi kata sandi"
                          className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                        />
                      </div>
                    </div>

                    {feedback && (
                      <div
                        className={`p-3 rounded-xl text-xs font-semibold border ${
                          feedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        {feedback.text}
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmitting || !signUpName.trim() || !email.trim() || !password || !confirmPassword}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                    >
                      <UserPlus className="w-4 h-4" />
                      {isSubmitting ? 'Mendaftarkan Akun ke Supabase...' : 'Daftarkan Akun Baru'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">
                        Kirim Tautan Pemulihan Kata Sandi
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Masukkan alamat email akun resmi Anda. Sistem akan mengirim tautan reset kata sandi melalui Supabase Auth.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Email Terdaftar
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="nama@instansi.mtq.id"
                        className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>

                    {feedback && (
                      <div
                        className={`p-3 rounded-xl text-xs font-semibold border ${
                          feedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        {feedback.text}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={isSubmitting || !email.trim()}
                        className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
                      >
                        {isSubmitting ? 'Mengirim Tautan Reset...' : 'Kirim Tautan Reset'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAuthViewMode('login');
                          setFeedback(null);
                        }}
                        className="px-3.5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer"
                      >
                        Kembali Login
                      </button>
                    </div>
                  </form>
                )}
              </>
            )
          )}

          {authenticatedProfile && feedback && !isPasswordRecoveryMode && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold border ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              {feedback.text}
            </div>
          )}

          {/* Mode Simulasi Lokal Button */}
          <div className="pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={enterOfflineDemoSimulation}
              className="w-full py-3.5 px-4 rounded-xl bg-emerald-100 hover:bg-emerald-200 active:scale-[0.99] text-emerald-950 font-bold text-sm sm:text-base border border-emerald-300 flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
            >
              <FlaskConical className="w-5 h-5 text-emerald-800" />
              <span>Mode Simulasi Lokal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const MainLayout: React.FC = () => {
  const {
    currentView,
    isSuperadminWorkspaceMode,
    currentTenant,
    exitTenantWorkspace,
    isLiveAccessAuthorized,
    isPasswordRecoveryMode,
    isOfflineDemoSimulation,
    exitOfflineDemoSimulation
  } = useMtq();

  // P0 Mandatory Fail-Closed Authentication Gate:
  // Block operational workspace unless explicitly in isolated offline demo simulation
  // OR fully authorized with active Supabase connection, verified session, profile, and tenant membership.
  if (!isLiveAccessAuthorized || isPasswordRecoveryMode) {
    return <AuthenticationGateView />;
  }

  const renderCurrentView = () => {
    switch (currentView) {
      // Admin MTQ
      case 'dashboard':
        return <DashboardView />;
      case 'kafilah':
        return <KafilahPesertaView />;
      case 'bank_soal':
        return <BankSoalView />;
      case 'master_data':
        return <MasterDataView />;
      case 'user_management':
        return <UserManagementView />;
      case 'penilaian_hakim':
        return <PenilaianHakimListView />;
      case 'rekap_nilai':
        return <RekapNilaiView />;
      case 'stage_management':
        return <StageManagementView />;
      case 'hasil_kelulusan':
        return <HasilKelulusanView />;
      case 'penilaian_dual_panel':
        return <PenilaianDualPanelView />;

      // Superadmin Platform
      case 'superadmin_dashboard':
        return <SuperadminDashboardView />;
      case 'superadmin_tenants':
        return <SuperadminTenantsView />;
      case 'superadmin_users':
        return <SuperadminUsersView />;
      case 'superadmin_audit':
        return <SuperadminAuditView />;

      default:
        return <DashboardView />;
    }
  };

  const isScoringView = currentView === 'penilaian_dual_panel';

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
      {/* Sidebar: persistent on desktop, off-canvas drawer on tablet & mobile */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Offline Demo Simulation Isolation Banner */}
        {isOfflineDemoSimulation && (
          <div className="bg-amber-900 text-amber-50 px-4 py-2 text-xs font-semibold flex flex-col sm:flex-row sm:items-center justify-between gap-2 sticky top-0 z-40 border-b border-amber-700">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                MODE SIMULASI DEMO LOKAL — Seluruh perubahan disimpan di memori lokal browser dan
                tidak menyentuh database produksi Supabase.
              </span>
            </div>
            <button
              onClick={exitOfflineDemoSimulation}
              className="bg-white hover:bg-amber-50 text-amber-950 px-3 py-1 rounded-lg text-xs font-bold cursor-pointer transition-all self-start sm:self-auto shrink-0"
            >
              Kembali ke Mode Produksi Supabase
            </button>
          </div>
        )}

        {/* Superadmin Workspace Mode Banner */}
        {isSuperadminWorkspaceMode && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 text-xs font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-950 animate-ping"></span>
              <span>Mode Superadmin: Memantau & Mengelola Workspace [{currentTenant.name}]</span>
            </div>
            <button
              onClick={exitTenantWorkspace}
              className="bg-slate-950 hover:bg-slate-900 text-white px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all self-start sm:self-auto"
            >
              Kembali ke Dashboard Superadmin
            </button>
          </div>
        )}

        {/* On standard views, show the TopHeader; on scoring view, PenilaianDualPanelView provides its own specialized header */}
        {!isScoringView && <TopHeader />}

        <main className={`flex-1 ${isScoringView ? 'overflow-hidden' : 'overflow-y-auto'}`}>
          {renderCurrentView()}
        </main>
      </div>

      {/* Auth & Persona Modal */}
      <DemoAccountModal />
    </div>
  );
};

export default function App() {
  return (
    <MtqProvider>
      <MainLayout />
    </MtqProvider>
  );
}
