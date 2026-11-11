import React, { useState } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  LogIn,
  LogOut,
  AlertTriangle,
  Lock,
  FlaskConical,
  ArrowLeft
} from 'lucide-react';
import { MtqProvider, useMtq } from './context/MtqContext';
import { Sidebar } from './components/layout/Sidebar';
import { TopHeader } from './components/layout/TopHeader';
import { DemoAccountModal } from './components/layout/DemoAccountModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { Button, Input, Skeleton } from './components/ui';
import { PWAUpdateToast } from './components/pwa/PWAUpdateToast';

// Halaman dimuat sesuai kebutuhan (code-splitting) agar bundel awal kecil
const KafilahPesertaView = React.lazy(() => import('./components/kafilah/KafilahPesertaView').then((m) => ({ default: m.KafilahPesertaView })));
const BankSoalView = React.lazy(() => import('./components/bankSoal/BankSoalView').then((m) => ({ default: m.BankSoalView })));
const MasterDataView = React.lazy(() => import('./components/masterData/MasterDataView').then((m) => ({ default: m.MasterDataView })));
const PenilaianHakimListView = React.lazy(() => import('./components/penilaian/PenilaianHakimListView').then((m) => ({ default: m.PenilaianHakimListView })));
const RekapNilaiView = React.lazy(() => import('./components/rekap/RekapNilaiView').then((m) => ({ default: m.RekapNilaiView })));
const PenilaianDualPanelView = React.lazy(() => import('./components/penilaian/PenilaianDualPanelView').then((m) => ({ default: m.PenilaianDualPanelView })));
const UserManagementView = React.lazy(() => import('./components/users/UserManagementView').then((m) => ({ default: m.UserManagementView })));
const StageManagementView = React.lazy(() => import('./components/stages/StageManagementView').then((m) => ({ default: m.StageManagementView })));
const HasilKelulusanView = React.lazy(() => import('./components/stages/HasilKelulusanView').then((m) => ({ default: m.HasilKelulusanView })));
const SuperadminDashboardView = React.lazy(() => import('./components/superadmin/SuperadminDashboardView').then((m) => ({ default: m.SuperadminDashboardView })));
const SuperadminTenantsView = React.lazy(() => import('./components/superadmin/SuperadminTenantsView').then((m) => ({ default: m.SuperadminTenantsView })));
const SuperadminUsersView = React.lazy(() => import('./components/superadmin/SuperadminUsersView').then((m) => ({ default: m.SuperadminUsersView })));
const SuperadminHealthView = React.lazy(() => import('./components/superadmin/SuperadminHealthView').then((m) => ({ default: m.SuperadminHealthView })));
const SuperadminAuditView = React.lazy(() => import('./components/superadmin/SuperadminAuditView').then((m) => ({ default: m.SuperadminAuditView })));
const SuperadminSettingsView = React.lazy(() => import('./components/superadmin/SuperadminSettingsView').then((m) => ({ default: m.SuperadminSettingsView })));
const ActivityLogView = React.lazy(() => import('./components/activityLog/ActivityLogView').then((m) => ({ default: m.ActivityLogView })));
import { useDocumentMeta } from './hooks/useDocumentMeta';

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
    signOutSupabase,
    requestPasswordReset,
    completePasswordReset,
    bootstrapFirstSuperadmin,
    enterOfflineDemoSimulation
  } = useMtq();

  const [authViewMode, setAuthViewMode] = useState<'login' | 'forgot_password'>('login');
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

  const renderAccessDiagnostic = () => {
    if (
      isSubmitting ||
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
      <div className="p-4 rounded-md bg-rose-50 border border-rose-200 text-rose-950 space-y-3">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-extrabold text-rose-900">{title}</p>
            <p className="text-rose-800 leading-relaxed">{description}</p>
            <p className="text-xs font-mono text-rose-700 pt-1">
              UID: {authenticatedProfile.authUserId} · Email: {authenticatedProfile.email} · Global Role:{' '}
              {authenticatedProfile.globalRole}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(accessGateReason === 'profile_missing' || accessGateReason === 'membership_empty') && (
            <Button
              size="sm"
              variant="primary"
              onClick={() => void handleBootstrapFirstSuperadmin()}
              disabled={isSubmitting}
              leftIcon={<ShieldCheck className="w-4 h-4" />}
            >
              Bootstrap Superadmin Pertama
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefresh}
            disabled={isSubmitting}
            leftIcon={<RefreshCw className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />}
          >
            Periksa Ulang Otorisasi
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => void signOutSupabase()}
            disabled={isSubmitting}
            leftIcon={<LogOut className="w-4 h-4" />}
          >
            Keluar dari Sesi Ini
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="p-6 bg-emerald-950 text-white border-b border-emerald-900">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-md bg-emerald-800/90 border border-emerald-600/40 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm bg-emerald-900/90 border border-emerald-700 text-xs font-bold uppercase tracking-wider text-emerald-200 mb-1">
                <Lock className="w-3 h-3 text-amber-400" />
                Akses Terbatas Panitia & Dewan Hakim
              </span>
              <h1 className="text-lg font-extrabold tracking-tight">
                Sistem Manajemen & Penilaian MTQ
              </h1>
              <p className="text-xs text-emerald-200/80">
                Masuk dengan akun yang diberikan panitia penyelenggara
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* Diagnostic Alert if authenticated but missing profile/membership */}
          {renderAccessDiagnostic()}

          {/* Password Recovery Mode (after user clicks email reset link) */}
          {isPasswordRecoveryMode ? (
            <form onSubmit={handleCompleteRecovery} className="space-y-4 bg-emerald-50/50 border border-emerald-200 p-4 rounded-md">
              <div>
                <h2 className="text-sm font-extrabold text-emerald-950">
                  Pemulihan Kata Sandi Akun MTQ
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Sesi pemulihan terverifikasi. Masukkan kata sandi baru minimal 8 karakter untuk mengamankan akun Anda.
                </p>
              </div>

              <Input
                label="Kata Sandi Baru"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter"
              />

              <Input
                label="Konfirmasi Kata Sandi Baru"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ulangi kata sandi baru"
              />

              {feedback && (
                <div
                  className={`p-3 rounded-md text-xs font-semibold border ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}
                >
                  {feedback.text}
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  loading={isSubmitting}
                  disabled={isSubmitting || !newPassword || !confirmPassword}
                  leftIcon={<Lock className="w-4 h-4" />}
                  className="flex-1"
                >
                  {isSubmitting ? 'Menyimpan Kata Sandi...' : 'Simpan Kata Sandi Baru'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setIsPasswordRecoveryMode(false);
                    setFeedback(null);
                  }}
                >
                  Batal
                </Button>
              </div>
            </form>
          ) : (
            /* Login / Forgot Password Form when unauthenticated and Supabase is configured */
            !authenticatedProfile &&
            connectionInfo.isConfigured && (
              <>
                {authViewMode === 'login' ? (
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-700 leading-relaxed">
                      Akses khusus untuk <strong>Administrator</strong>, <strong>Dewan Hakim</strong>, dan <strong>Superadmin</strong> yang telah diundang secara resmi. Pendaftaran mandiri publik dinonaktifkan.
                    </div>

                    <Input
                      label="Email Akun Resmi (Admin / Dewan Hakim / Superadmin)"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@instansi.mtq.id"
                    />

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="login-password-input" className="block text-xs font-bold text-slate-700">
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
                          Lupa / Atur Kata Sandi?
                        </button>
                      </div>
                      <Input
                        id="login-password-input"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Masukkan kata sandi akun Anda"
                      />
                    </div>

                    {feedback && (
                      <div
                        className={`p-3 rounded-md text-xs font-semibold border ${
                          feedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        {feedback.text}
                      </div>
                    )}

                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      fullWidth
                      loading={isSubmitting}
                      disabled={isSubmitting || !email.trim() || !password}
                      leftIcon={<LogIn className="w-5 h-5" />}
                    >
                      {isSubmitting ? 'Memverifikasi Sesi & Otorisasi...' : 'Masuk ke Sistem'}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div>
                      <h2 className="text-sm font-extrabold text-slate-900">
                        Kirim Tautan Pemulihan Kata Sandi
                      </h2>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Masukkan alamat email akun resmi Anda. Sistem akan mengirim tautan untuk mengatur ulang kata sandi ke email tersebut.
                      </p>
                    </div>

                    <Input
                      label="Email Terdaftar"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@instansi.mtq.id"
                    />

                    {feedback && (
                      <div
                        className={`p-3 rounded-md text-xs font-semibold border ${
                          feedback.type === 'success'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-rose-50 border-rose-200 text-rose-900'
                        }`}
                      >
                        {feedback.text}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        size="md"
                        loading={isSubmitting}
                        disabled={isSubmitting || !email.trim()}
                        className="flex-1"
                      >
                        {isSubmitting ? 'Mengirim Tautan Reset...' : 'Kirim Tautan Reset'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={() => {
                          setAuthViewMode('login');
                          setFeedback(null);
                        }}
                      >
                        Kembali Login
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )
          )}

          {authenticatedProfile && feedback && !isPasswordRecoveryMode && (
            <div
              className={`p-3 rounded-md text-xs font-semibold border ${
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
              className="w-full h-12 px-4 rounded-md bg-emerald-100 hover:bg-emerald-200 active:scale-[0.99] text-emerald-950 font-bold text-sm sm:text-base border border-emerald-300 flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-all"
            >
              <FlaskConical className="w-5 h-5 text-emerald-800" />
              <span>Coba Mode Demo (tanpa menyimpan data)</span>
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
    currentTenant,
    siteSettings,
    isLiveAccessAuthorized,
    isPasswordRecoveryMode,
    isOfflineDemoSimulation,
    exitOfflineDemoSimulation,
    isSuperadminWorkspaceMode,
    exitTenantWorkspace
  } = useMtq();

  useDocumentMeta(currentView, siteSettings);

  // P0 Mandatory Fail-Closed Authentication Gate:
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
      case 'log_aktivitas':
        return <ActivityLogView />;

      // Superadmin Platform
      case 'superadmin_dashboard':
        return <SuperadminDashboardView />;
      case 'superadmin_tenants':
        return <SuperadminTenantsView />;
      case 'superadmin_users':
        return <SuperadminUsersView />;
      case 'superadmin_health':
        return <SuperadminHealthView />;
      case 'superadmin_audit':
        return <SuperadminAuditView />;
      case 'superadmin_settings':
        return <SuperadminSettingsView />;

      default:
        return <DashboardView />;
    }
  };

  const isScoringView = currentView === 'penilaian_dual_panel';

  return (
    <div className="flex h-screen w-screen bg-slate-50 font-sans text-slate-900 overflow-hidden">
      {/* Sidebar: persistent on desktop, off-canvas drawer on tablet & mobile */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Offline Demo Simulation Isolation Banner */}
        {isOfflineDemoSimulation && (
          <div className="bg-amber-900 text-amber-50 px-4 py-1.5 text-xs font-semibold flex flex-row items-center justify-between gap-2 shrink-0 z-40 border-b border-amber-700">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-300 shrink-0" />
              <span>
                <span className="sm:hidden">Mode Demo (data tidak disimpan)</span>
                <span className="hidden sm:inline">
                  Mode Demo — data hanya tersimpan di browser ini, bukan di database lomba.
                </span>
              </span>
            </div>
            <button
              onClick={exitOfflineDemoSimulation}
              className="bg-white hover:bg-amber-50 text-amber-950 px-3 py-1 rounded-sm text-xs font-bold cursor-pointer transition-all shrink-0"
            >
              Keluar dari Demo
            </button>
          </div>
        )}

        {/* Mode Supervisi Workspace Tenant untuk Superadmin */}
        {isSuperadminWorkspaceMode && (
          <div className="bg-purple-950 text-purple-100 px-4 py-2 text-xs font-semibold flex flex-row items-center justify-between gap-3 shrink-0 z-40 border-b border-purple-800 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="px-2 py-0.5 rounded-sm bg-purple-800 text-white font-mono text-[11px] font-bold shrink-0">
                Supervisi Aktif
              </span>
              <span className="truncate">
                Anda sedang membuka workspace operasional:{' '}
                <strong className="text-white font-bold">{currentTenant?.name || 'Tenant'}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={exitTenantWorkspace}
              className="inline-flex items-center gap-1.5 bg-white hover:bg-purple-50 text-purple-950 px-3 py-1.5 rounded-md text-xs font-extrabold cursor-pointer transition-all shrink-0 shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Panel Platform</span>
            </button>
          </div>
        )}

        {/* Render unified TopHeader across all views */}
        <TopHeader />

        <main className={`flex-1 min-w-0 ${isScoringView ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden'}`}>
          <React.Suspense
            fallback={
              <div className="p-6 space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton lines={3} />
              </div>
            }
          >
            {renderCurrentView()}
          </React.Suspense>
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
      <PWAUpdateToast />
    </MtqProvider>
  );
}
